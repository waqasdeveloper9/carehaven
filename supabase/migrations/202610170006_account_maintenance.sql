begin;
alter table public.profiles add column must_change_password boolean not null default false,
 add column password_reset_request_id uuid,add column password_auth_after bigint not null default 0;
insert into public.app_settings(key,value) values('password_reset_cooldown_seconds','60'),('password_reset_claim_seconds','120') on conflict(key) do nothing;
create table public.account_password_resets(
 request_id uuid primary key,user_id uuid not null references public.profiles,created_by uuid not null references public.profiles,
 fingerprint text not null,password_marker text not null,
 phase text not null default 'claimed' check(phase in ('claimed','password_set','completed','failed','superseded')),
 email_status text not null default 'queued' check(email_status in ('queued','accepted_by_provider','failed')),
 created_at timestamptz not null default now(),completed_at timestamptz
);
create index account_password_resets_user on public.account_password_resets(user_id,created_at desc);
alter table public.account_password_resets enable row level security;
revoke all on public.account_password_resets from public,anon,authenticated;
grant all on public.account_password_resets to service_role;

create function public.edit_account(p_user uuid,p_full_name text,p_phone text) returns public.profiles language plpgsql security definer set search_path='' as $$
declare result public.profiles;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_full_name is null or length(trim(p_full_name)) not between 2 and 100 or length(coalesce(p_phone,''))>40 then raise exception 'Invalid account details';end if;
 update public.profiles set full_name=trim(p_full_name),phone=nullif(trim(p_phone),'') where id=p_user and role in ('staff_user','donor') returning * into result;
 if not found then raise exception 'Staff or sponsor account required';end if;return result;
end $$;
revoke all on function public.edit_account(uuid,text,text) from public,anon;
grant execute on function public.edit_account(uuid,text,text) to authenticated;

create function public.begin_admin_password_reset(p_actor uuid,p_user uuid,p_request uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.account_password_resets;previous public.account_password_resets;marker text;
begin
 perform public.assert_provisioning_admin(p_actor);
 if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid reset request';end if;
 perform 1 from public.profiles where id=p_user and role in ('staff_user','donor') and status='approved' for update;
 if not found then raise exception 'Approved staff or sponsor account required';end if;
 select * into existing from public.account_password_resets where request_id=p_request;
 if found then
  if existing.user_id<>p_user or existing.created_by<>p_actor or existing.fingerprint<>p_fingerprint then raise exception 'Reset request reused with different details';end if;
  if existing.phase='claimed' then raise exception 'Password reset is already in progress';end if;
  return jsonb_build_object('phase',existing.phase,'email_status',existing.email_status);
 end if;
 select * into previous from public.account_password_resets where user_id=p_user order by created_at desc limit 1;
 if found and previous.phase='claimed' and previous.created_at>now()-make_interval(secs=>(select (value #>> '{}')::int from public.app_settings where key='password_reset_claim_seconds')) then raise exception 'Password reset is already in progress';end if;
 if found and previous.phase<>'failed' and previous.created_at>now()-make_interval(secs=>(select (value #>> '{}')::int from public.app_settings where key='password_reset_cooldown_seconds')) then raise exception 'Wait before requesting another password reset';end if;
 select md5(encrypted_password) into marker from auth.users where id=p_user;
 update public.account_password_resets set phase='superseded' where user_id=p_user and phase in ('claimed','password_set');
 insert into public.account_password_resets(request_id,user_id,created_by,fingerprint,password_marker) values(p_request,p_user,p_actor,p_fingerprint,marker);
 update public.profiles set password_reset_request_id=p_request where id=p_user;
 return jsonb_build_object('phase','claimed','email_status','queued');
end $$;

-- Auth's password update and the mandatory-change gate commit together.
create or replace function public.track_account_auth() returns trigger language plpgsql security definer set search_path='' as $$
declare reset_id uuid;
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  if new.raw_app_meta_data->>'admin_password_reset_request' is distinct from old.raw_app_meta_data->>'admin_password_reset_request' and new.raw_app_meta_data ? 'admin_password_reset_request' then
   reset_id:=(new.raw_app_meta_data->>'admin_password_reset_request')::uuid;
   perform 1 from public.profiles p join public.account_password_resets r on r.request_id=p.password_reset_request_id where p.id=new.id and r.request_id=reset_id and r.user_id=new.id and r.phase='claimed';
   if not found then raise exception 'Outdated administrator password reset';end if;
   update public.profiles set must_change_password=true,requires_password_setup=true,password_auth_after=ceil(extract(epoch from clock_timestamp()))::bigint where id=new.id;
   update public.account_password_resets set phase='password_set',password_marker=md5(new.encrypted_password) where request_id=reset_id;
   insert into public.audit_logs(performed_by,action_type,details) select created_by,'ADMIN_PASSWORD_RESET',jsonb_build_object('user_id',new.id,'request_id',reset_id) from public.account_password_resets where request_id=reset_id;
  elsif not exists(select 1 from public.profiles where id=new.id and must_change_password) then
   update public.profiles set requires_password_setup=false,password_set_at=now() where id=new.id;
  end if;
 end if;
 if new.encrypted_password is not distinct from old.encrypted_password and new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
  update public.profiles set last_login_at=new.last_sign_in_at,first_login_at=coalesce(first_login_at,new.last_sign_in_at) where id=new.id and not requires_password_setup and not must_change_password;
 end if;return new;
end $$;

create function public.finish_admin_password_reset(p_actor uuid,p_user uuid,p_request uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_provisioning_admin(p_actor);
 update public.account_password_resets set email_status=case when p_success then 'accepted_by_provider' else 'failed' end
 where request_id=p_request and user_id=p_user and created_by=p_actor and phase='password_set';
end $$;
create function public.fail_admin_password_reset(p_actor uuid,p_user uuid,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_provisioning_admin(p_actor);
 update public.account_password_resets set phase='failed' where request_id=p_request and user_id=p_user and created_by=p_actor and phase='claimed';
end $$;
create function public.complete_required_password_change(p_user uuid,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare reset public.account_password_resets;marker text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server access required';end if;
 perform 1 from public.profiles where id=p_user and password_reset_request_id=p_request and must_change_password for update;
 if not found then raise exception 'Password reset changed; sign in again';end if;
 select * into reset from public.account_password_resets where request_id=p_request and user_id=p_user for update;
 if not found or reset.phase not in ('password_set','failed') then raise exception 'Password reset is not ready';end if;
 select md5(encrypted_password) into marker from auth.users where id=p_user;
 if marker is not distinct from reset.password_marker then raise exception 'Choose a different password from your temporary password';end if;
 update public.profiles set must_change_password=false,requires_password_setup=false,password_set_at=now() where id=p_user;
 update public.account_password_resets set phase='completed',completed_at=now() where request_id=p_request;
 insert into public.audit_logs(performed_by,action_type,details) values(p_user,'REQUIRED_PASSWORD_CHANGE_COMPLETED',jsonb_build_object('request_id',p_request));
end $$;
revoke all on function public.begin_admin_password_reset(uuid,uuid,uuid,text),public.finish_admin_password_reset(uuid,uuid,uuid,boolean),public.fail_admin_password_reset(uuid,uuid,uuid),public.complete_required_password_change(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_admin_password_reset(uuid,uuid,uuid,text),public.finish_admin_password_reset(uuid,uuid,uuid,boolean),public.fail_admin_password_reset(uuid,uuid,uuid),public.complete_required_password_change(uuid,uuid) to service_role;

-- Refreshing an older session cannot bypass a completed administrator reset.
create function public.account_session_current(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and (p.password_auth_after=0 or exists(
  select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
  where jsonb_typeof(method->'timestamp')='number' and (method->>'timestamp')::numeric>=p.password_auth_after
  and method->>'method' in ('password','otp','magiclink','recovery','totp')
 )))
$$;
revoke all on function public.account_session_current(uuid) from public,anon,authenticated;
create or replace function public.has_permission(p_user uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join public.user_permissions u on u.user_id=p.id where p.id=p_user and p.status='approved' and not p.requires_password_setup and not p.must_change_password and public.account_session_current(p_user) and (p.role='admin' or (p.role in ('staff_user','donor') and case p_permission when 'manage_orphans' then u.manage_orphans when 'assign_donors' then u.assign_donors when 'view_financials' then u.view_financials when 'manage_financials' then u.manage_financials when 'approve_donors' then u.approve_donors when 'run_audits' then u.run_audits else false end)))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved' and not requires_password_setup and not must_change_password and public.account_session_current(id))$$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and status='approved' and not requires_password_setup and not must_change_password and public.account_session_current(id))$$;
commit;
