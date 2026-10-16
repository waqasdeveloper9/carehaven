begin;
create function public.bootstrap_first_admin(p_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server access is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carehaven:first-admin',0));
  if exists(select 1 from public.profiles where role='admin') then
    raise exception 'An administrator already exists; first-time setup is closed';
  end if;
  if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then
    raise exception 'A confirmed authentication account is required';
  end if;
  update public.profiles set role='admin',status='approved' where id=p_user;
  if not found then raise exception 'The authentication account has no profile';end if;
  insert into public.audit_logs(action_type,details)
  values('FIRST_ADMIN_BOOTSTRAPPED',jsonb_build_object('user_id',p_user,'source','trusted_local_setup'));
  return p_user;
end $$;
revoke all on function public.bootstrap_first_admin(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;
commit;
