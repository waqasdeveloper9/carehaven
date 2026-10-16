begin;

alter table public.profiles
  add column requires_password_setup boolean not null default false,
  add column invited_at timestamptz,
  add column password_set_at timestamptz,
  add column first_login_at timestamptz,
  add column last_login_at timestamptz;
create unique index profiles_email_normalized on public.profiles(lower(email));
create index profiles_onboarding_follow_up on public.profiles(role,invited_at) where invited_at is not null and first_login_at is null;

insert into public.app_settings(key,value) values
 ('staff_default_permissions','["manage_orphans","assign_donors"]'),
 ('invitation_cooldown_seconds','60'),('invitation_lease_seconds','120')
 on conflict(key) do nothing;

create table public.account_invitations(
 user_id uuid primary key references public.profiles,
 request_id uuid not null unique,
 created_by uuid not null references public.profiles,
 payload jsonb not null,
 delivery_status text not null default 'queued' check(delivery_status in ('queued','sending','accepted_by_provider','failed')),
 send_attempts integer not null default 0,
 last_attempt_at timestamptz,
 last_sent_at timestamptz,
 last_error text,
 lease_id uuid,
 created_at timestamptz not null default now()
);
alter table public.account_invitations enable row level security;
revoke all on public.account_invitations from public,anon,authenticated;
grant select(user_id,delivery_status,send_attempts,last_sent_at,last_error) on public.account_invitations to authenticated;
grant all on public.account_invitations to service_role;

-- Setup requirements are database-owned. User-editable Auth metadata cannot grant access.
create or replace function public.has_permission(p_user uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join public.user_permissions u on u.user_id=p.id
 where p.id=p_user and p.status='approved' and not p.requires_password_setup and
 (p.role='admin' or (p.role='staff_user' and case p_permission
 when 'manage_orphans' then u.manage_orphans when 'assign_donors' then u.assign_donors
 when 'view_financials' then u.view_financials when 'manage_financials' then u.manage_financials
 when 'approve_donors' then u.approve_donors when 'run_audits' then u.run_audits else false end)))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved' and not requires_password_setup)
$$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and status='approved' and not requires_password_setup)
$$;
create policy invitation_admin_read on public.account_invitations for select to authenticated using(public.is_admin());

-- A real Auth password change completes setup. Accepting an email alone does not.
create function public.track_account_auth() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
   update public.profiles set requires_password_setup=false,password_set_at=now() where id=new.id;
 end if;
 if new.encrypted_password is not distinct from old.encrypted_password
  and new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
   update public.profiles set last_login_at=new.last_sign_in_at,
    first_login_at=coalesce(first_login_at,new.last_sign_in_at)
   where id=new.id and not requires_password_setup;
 end if;
 return new;
end $$;
create trigger track_account_auth after update of encrypted_password,last_sign_in_at on auth.users for each row execute function public.track_account_auth();

create or replace function public.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,email,requires_password_setup,invited_at)
 values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'New sponsor'),new.email,
  new.raw_app_meta_data ? 'provisioning_request',case when new.raw_app_meta_data ? 'provisioning_request' then now() end);
 return new;
end $$;

create function public.assert_provisioning_admin(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or not exists(
   select 1 from public.profiles where id=p_actor and role='admin' and status='approved' and not requires_password_setup
 ) then raise exception 'Approved administrator access required';end if;
end $$;

-- Locate only accounts created by this exact trusted request; never adopt another user's email.
create function public.provisioning_context(p_actor uuid,p_request uuid,p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
 perform public.assert_provisioning_admin(p_actor);
 select id into account_id from auth.users where lower(email)=lower(p_email) for update;
 if account_id is not null and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=account_id and u.raw_app_meta_data ? 'provisioning_request'
   and u.raw_app_meta_data->>'provisioned_by'=p_actor::text and p.status='pending' and p.requires_password_setup
   and not exists(select 1 from public.account_invitations i where i.user_id=u.id)) then
   -- A previous request created Auth but failed before the database transaction committed.
   -- The same administrator can safely resume from a reopened form without adopting another account.
   update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{provisioning_request}',to_jsonb(p_request::text)) where id=account_id;
 end if;
 if account_id is not null and not exists(select 1 from auth.users where id=account_id
   and raw_app_meta_data->>'provisioning_request'=p_request::text
   and raw_app_meta_data->>'provisioned_by'=p_actor::text) then
   raise exception 'An account already exists for this email. Use its existing account rather than creating another one';
 end if;
 return account_id;
end $$;

-- Profile, default grants, optional donation, invitation queue and audit commit together.
create function public.provision_account(p_actor uuid,p_user uuid,p_request uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.account_invitations; account_email text; requested_role public.user_role; default_grants jsonb; initial_amount numeric;
begin
 perform public.assert_provisioning_admin(p_actor);
 perform 1 from auth.users where id=p_user and raw_app_meta_data->>'provisioning_request'=p_request::text
   and raw_app_meta_data->>'provisioned_by'=p_actor::text for update;
 if not found then raise exception 'Account does not belong to this provisioning request';end if;
 select * into existing from public.account_invitations where request_id=p_request;
 if found then
   if existing.user_id=p_user and existing.created_by=p_actor and existing.payload=p_payload then return p_user;end if;
   raise exception 'Request ID reused with different account details';
 end if;
 requested_role:=(p_payload->>'role')::public.user_role;
 if requested_role not in ('staff_user','donor') or length(trim(p_payload->>'full_name')) not between 2 and 100 then raise exception 'Invalid account details';end if;
 select email into account_email from auth.users where id=p_user;
 if lower(account_email) is distinct from lower(p_payload->>'email') then raise exception 'Email mismatch';end if;
 update public.profiles set full_name=trim(p_payload->>'full_name'),phone=nullif(p_payload->>'phone',''),role=requested_role,
  status='approved',requires_password_setup=true,invited_at=now(),password_set_at=null,first_login_at=null,last_login_at=null where id=p_user;
 if not found then raise exception 'Account profile is missing';end if;
 if requested_role='staff_user' then
   select value into default_grants from public.app_settings where key='staff_default_permissions';
   insert into public.user_permissions(user_id,manage_orphans,assign_donors,view_financials,manage_financials,approve_donors,run_audits)
   values(p_user,default_grants ? 'manage_orphans',default_grants ? 'assign_donors',default_grants ? 'view_financials',
     default_grants ? 'manage_financials',default_grants ? 'approve_donors',default_grants ? 'run_audits');
 end if;
 if p_payload ? 'donation' then
   initial_amount:=(p_payload->'donation'->>'amount')::numeric;
   if requested_role<>'donor' or initial_amount is null or initial_amount<=0 or initial_amount>9999999999.99
     or round(initial_amount,2)<>initial_amount or length(trim(p_payload->'donation'->>'description')) not between 2 and 500 then raise exception 'Invalid initial donation';end if;
   insert into public.financial_ledger(request_id,donor_id,type,category,amount_in,verification_status,description)
   values(p_request,p_user,'DONATION_RECEIVED','General',initial_amount,'verified',p_payload->'donation'->>'description');
 end if;
 insert into public.account_invitations(user_id,request_id,created_by,payload) values(p_user,p_request,p_actor,p_payload);
 insert into public.audit_logs(performed_by,action_type,details) values(p_actor,'ACCOUNT_PROVISIONED',jsonb_build_object('user_id',p_user,'role',requested_role,'initial_donation',initial_amount));
 return p_user;
end $$;

create function public.claim_account_invitation(p_actor uuid,p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare lease uuid:=gen_random_uuid(); cooldown integer; lease_duration integer;
begin
 perform public.assert_provisioning_admin(p_actor);
 select (value #>> '{}')::integer into cooldown from public.app_settings where key='invitation_cooldown_seconds';
 select (value #>> '{}')::integer into lease_duration from public.app_settings where key='invitation_lease_seconds';
 update public.account_invitations i set delivery_status='sending',send_attempts=send_attempts+1,last_attempt_at=now(),lease_id=lease,last_error=null
 where i.user_id=p_user and exists(select 1 from public.profiles p where p.id=p_user and p.requires_password_setup)
 and (last_attempt_at is null or last_attempt_at<now()-make_interval(secs=>case when delivery_status='sending' then lease_duration else cooldown end));
 if not found then return null;end if;
 return lease;
end $$;
create function public.finish_account_invitation(p_actor uuid,p_user uuid,p_lease uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_provisioning_admin(p_actor);
 update public.account_invitations set delivery_status=case when p_success then 'accepted_by_provider' else 'failed' end,
 last_sent_at=case when p_success then now() else last_sent_at end,
 last_error=case when p_success then null else 'Email provider did not accept the request. Check email configuration and retry.' end,lease_id=null
 where user_id=p_user and lease_id=p_lease;
 insert into public.audit_logs(performed_by,action_type,details) values(p_actor,'ACCOUNT_INVITATION_ATTEMPT',jsonb_build_object('user_id',p_user,'accepted_by_provider',p_success));
end $$;

-- Validate photo references at the database boundary, including direct SDK writes.
create function public.validate_child_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.picture_url is not null and (tg_op='INSERT' or new.picture_url is distinct from old.picture_url) then
   if not exists(select 1 from storage.objects where name=new.picture_url
    and bucket_id=(select value #>> '{}' from public.app_settings where key='photo_bucket')
    and owner_id=auth.uid()::text and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')) then
    raise exception 'Upload a child photo owned by your account first';
   end if;
 end if;
 return new;
end $$;
create trigger validate_child_photo before insert or update of picture_url on public.orphans for each row execute function public.validate_child_photo();

revoke all on function public.track_account_auth(),public.assert_provisioning_admin(uuid),public.provisioning_context(uuid,uuid,text),public.provision_account(uuid,uuid,uuid,jsonb),public.claim_account_invitation(uuid,uuid),public.finish_account_invitation(uuid,uuid,uuid,boolean),public.validate_child_photo() from public,anon,authenticated;
grant execute on function public.provisioning_context(uuid,uuid,text),public.provision_account(uuid,uuid,uuid,jsonb),public.claim_account_invitation(uuid,uuid),public.finish_account_invitation(uuid,uuid,uuid,boolean) to service_role;

commit;
