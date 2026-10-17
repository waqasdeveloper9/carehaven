begin;

alter table public.profiles add column avatar_path text;
insert into public.app_settings(key,value) values('avatar_bucket','"profile-photos"') on conflict(key) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
select value #>> '{}',value #>> '{}',false,10485760,array['image/jpeg','image/png','image/webp']
from public.app_settings where key='avatar_bucket'
on conflict(id) do nothing;

create policy avatar_upload on storage.objects for insert to authenticated with check(
 public.is_approved() and bucket_id=(select value #>> '{}' from public.app_settings where key='avatar_bucket')
 and (storage.foldername(name))[1]=auth.uid()::text
);
create policy avatar_read on storage.objects for select to authenticated using(
 public.is_approved() and bucket_id=(select value #>> '{}' from public.app_settings where key='avatar_bucket')
 and owner_id=auth.uid()::text
);

create function public.set_profile_avatar(p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() then raise exception 'Approved account required';end if;
 if p_path is not null and not exists(
  select 1 from storage.objects where name=p_path and bucket_id=(select value #>> '{}' from public.app_settings where key='avatar_bucket')
  and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
 ) then raise exception 'Upload a profile photo owned by your account';end if;
 update public.profiles set avatar_path=p_path where id=auth.uid();
end $$;
revoke all on function public.set_profile_avatar(text) from public,anon;
grant execute on function public.set_profile_avatar(text) to authenticated;

-- Sponsors retain their own-record access and receive no organization grants by default.
create or replace function public.has_permission(p_user uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join public.user_permissions u on u.user_id=p.id
 where p.id=p_user and p.status='approved' and not p.requires_password_setup and
 (p.role='admin' or (p.role in ('staff_user','donor') and case p_permission
 when 'manage_orphans' then u.manage_orphans when 'assign_donors' then u.assign_donors
 when 'view_financials' then u.view_financials when 'manage_financials' then u.manage_financials
 when 'approve_donors' then u.approve_donors when 'run_audits' then u.run_audits else false end)))
$$;
create or replace function public.set_permission(p_user uuid,p_permission text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_permission not in ('manage_orphans','assign_donors','view_financials','manage_financials','approve_donors','run_audits') or p_permission is null or p_enabled is null then raise exception 'Invalid permission';end if;
 if not exists(select 1 from public.profiles where id=p_user and role in ('staff_user','donor')) then raise exception 'Staff or sponsor account required';end if;
 insert into public.user_permissions(user_id) values(p_user) on conflict do nothing;
 execute format('update public.user_permissions set %I=$1,updated_at=now() where user_id=$2',p_permission) using p_enabled,p_user;
end $$;
commit;
