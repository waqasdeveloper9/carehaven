begin;

create index audit_logs_recent on public.audit_logs(created_at desc);
create index ledger_sponsorship_month on public.financial_ledger(donor_id,orphan_id,created_at) include(amount_out);

create function public.set_permissions_batch(p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Invalid permission changes';end if;
 if jsonb_array_length(p_changes) not between 1 and 256 then raise exception 'Choose between 1 and 256 permission changes';end if;
 if exists(select 1 from jsonb_array_elements(p_changes) item where jsonb_typeof(item) is distinct from 'object') then raise exception 'Invalid permission changes';end if;
 if exists(select 1 from jsonb_array_elements(p_changes) item where
  not(item ?& array['user_id','permission','expected','enabled']) or
  jsonb_typeof(item->'user_id') is distinct from 'string' or
  jsonb_typeof(item->'permission') is distinct from 'string' or
  jsonb_typeof(item->'expected') is distinct from 'boolean' or
  jsonb_typeof(item->'enabled') is distinct from 'boolean' or
  item->'expected'=item->'enabled' or
  item->>'permission' not in ('manage_orphans','assign_donors','view_financials','manage_financials','approve_donors','run_audits') or
  exists(select 1 from jsonb_object_keys(item) key where key not in ('user_id','permission','expected','enabled'))
 ) then raise exception 'Invalid permission changes';end if;
 if exists(select 1 from jsonb_to_recordset(p_changes) as change(user_id uuid,permission text) group by user_id,permission having count(*)>1) then raise exception 'Duplicate permission changes';end if;

 -- Consistent lock ordering serializes updates to the same accounts without locking unrelated accounts.
 perform 1 from public.profiles where id in(select user_id from jsonb_to_recordset(p_changes) as change(user_id uuid)) order by id for update;
 if exists(select 1 from jsonb_to_recordset(p_changes) as change(user_id uuid) left join public.profiles p on p.id=change.user_id where p.id is null or p.role not in ('staff_user','donor')) then raise exception 'Staff or sponsor account required';end if;
 insert into public.user_permissions(user_id) select distinct user_id from jsonb_to_recordset(p_changes) as change(user_id uuid) on conflict do nothing;
 perform 1 from public.user_permissions where user_id in(select user_id from jsonb_to_recordset(p_changes) as change(user_id uuid)) order by user_id for update;
 if exists(select 1 from jsonb_to_recordset(p_changes) as change(user_id uuid,permission text,expected boolean) join public.user_permissions u on u.user_id=change.user_id where (to_jsonb(u)->>change.permission)::boolean is distinct from change.expected) then raise exception 'Permissions changed since you opened this editor';end if;

 -- One update per account produces one audited change, regardless of how many switches changed.
 with patches as (
  select user_id,jsonb_object_agg(permission,enabled) patch from jsonb_to_recordset(p_changes) as change(user_id uuid,permission text,enabled boolean) group by user_id
 ), updated as (
  update public.user_permissions u set
   manage_orphans=coalesce((patch->>'manage_orphans')::boolean,u.manage_orphans),
   assign_donors=coalesce((patch->>'assign_donors')::boolean,u.assign_donors),
   view_financials=coalesce((patch->>'view_financials')::boolean,u.view_financials),
   manage_financials=coalesce((patch->>'manage_financials')::boolean,u.manage_financials),
   approve_donors=coalesce((patch->>'approve_donors')::boolean,u.approve_donors),
   run_audits=coalesce((patch->>'run_audits')::boolean,u.run_audits),updated_at=now()
  from patches where u.user_id=patches.user_id returning u.*
 ) select jsonb_object_agg(user_id,to_jsonb(updated)) into result from updated;
 return result;
end $$;
revoke all on function public.set_permissions_batch(jsonb) from public,anon;
grant execute on function public.set_permissions_batch(jsonb) to authenticated;
commit;
