begin;
create type public.user_role as enum ('admin','staff_user','donor');
create type public.donor_status as enum ('pending','approved','rejected');
create type public.child_status as enum ('active','inactive','graduated','left');
create type public.assignment_status as enum ('active','completed');
create type public.transaction_type as enum ('DONATION_RECEIVED','EXPENSE_SPENT');
create table public.app_settings(key text primary key, value jsonb not null);
insert into public.app_settings values ('expense_categories','["Education","Healthcare","Nutrition","Clothing","Housing","General"]'),('financial_timezone','"Asia/Karachi"');
create table public.profiles(id uuid primary key references auth.users on delete restrict,full_name text not null check(length(full_name) between 2 and 100),email text unique not null,phone text,role public.user_role not null default 'donor',status public.donor_status not null default 'pending',created_at timestamptz not null default now());
create table public.user_permissions(user_id uuid primary key references public.profiles,manage_orphans boolean not null default false,assign_donors boolean not null default false,view_financials boolean not null default false,manage_financials boolean not null default false,approve_donors boolean not null default false,run_audits boolean not null default false,updated_at timestamptz not null default now());
create table public.orphans(id uuid primary key default gen_random_uuid(),full_name text not null check(length(full_name) between 2 and 100),gender text not null check(gender in ('Male','Female','Other')),date_of_birth date not null check(date_of_birth <= current_date),picture_url text,admission_date date not null default current_date,status public.child_status not null default 'active',created_at timestamptz not null default now());
create table public.donor_child_assignments(id uuid primary key default gen_random_uuid(),donor_id uuid not null references public.profiles,orphan_id uuid not null references public.orphans,monthly_spending_limit numeric(12,2) not null check(monthly_spending_limit>0),allocated_balance numeric(12,2) not null default 0 check(allocated_balance>=0),start_date date not null default current_date,end_date date,status public.assignment_status not null default 'active',created_at timestamptz not null default now(),check((status='active' and end_date is null) or (status='completed' and end_date is not null)));
create unique index one_active_sponsorship on public.donor_child_assignments(donor_id,orphan_id) where status='active';
create table public.financial_ledger(id uuid primary key default gen_random_uuid(),request_id uuid not null unique,donor_id uuid not null references public.profiles,orphan_id uuid references public.orphans,type public.transaction_type not null,category text not null,amount_in numeric(12,2) not null default 0,amount_out numeric(12,2) not null default 0,receipt_url text,verification_status text not null check(verification_status in ('verified','pending','forced')),audit_notes text,description text not null,created_at timestamptz not null default now(),check((type='DONATION_RECEIVED' and amount_in>0 and amount_out=0 and orphan_id is null) or (type='EXPENSE_SPENT' and amount_out>0 and amount_in=0 and orphan_id is not null)),check(type<>'EXPENSE_SPENT' or verification_status<>'verified' or receipt_url is not null),check(verification_status<>'forced' or length(trim(audit_notes))>=10));
create table public.audit_logs(id uuid primary key default gen_random_uuid(),performed_by uuid references public.profiles,action_type text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create index ledger_donor_date on public.financial_ledger(donor_id,created_at);
create index ledger_child_date on public.financial_ledger(orphan_id,created_at);
create index assignment_child on public.donor_child_assignments(orphan_id);
create index audit_actor on public.audit_logs(performed_by);

-- Fixed search paths and explicit permission allowlists protect definer functions.
create function public.has_permission(p_user uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join public.user_permissions u on u.user_id=p.id where p.id=p_user and p.status='approved' and (p.role='admin' or (p.role='staff_user' and case p_permission when 'manage_orphans' then u.manage_orphans when 'assign_donors' then u.assign_donors when 'view_financials' then u.view_financials when 'manage_financials' then u.manage_financials when 'approve_donors' then u.approve_donors when 'run_audits' then u.run_audits else false end)))
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') $$;
create function public.is_approved() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='approved') $$;
create function public.new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,full_name,email) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'New sponsor'),new.email);return new;end $$;
create trigger create_profile after insert on auth.users for each row execute function public.new_user();
create function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.audit_logs(performed_by,action_type,details) values(auth.uid(),tg_table_name||'_'||tg_op,jsonb_build_object('old',case when tg_op='INSERT' then null else to_jsonb(old) end,'new',to_jsonb(new)));return new;end $$;
create trigger child_audit after insert or update on public.orphans for each row execute function public.audit_change();
create trigger profile_audit after update on public.profiles for each row execute function public.audit_change();
create trigger permission_audit after insert or update on public.user_permissions for each row execute function public.audit_change();
create trigger assignment_audit after insert or update on public.donor_child_assignments for each row execute function public.audit_change();
create trigger ledger_audit after insert on public.financial_ledger for each row execute function public.audit_change();
create function public.complete_child_sponsorships() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.status<>'active' and old.status='active' then update public.donor_child_assignments set status='completed',end_date=current_date where orphan_id=new.id and status='active';end if;return new;end $$;
create trigger child_status_transition after update of status on public.orphans for each row execute function public.complete_child_sponsorships();

-- RPC calls execute within one PostgreSQL transaction; exceptions roll back all legs.
-- Lock order is child then donor then assignment, including status transitions.
create function public.post_donation(p_donor uuid,p_amount numeric,p_description text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;existing public.financial_ledger;
begin
 if not public.has_permission(auth.uid(),'manage_financials') then raise exception 'Permission denied';end if;
 if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount or length(trim(p_description))<2 then raise exception 'Invalid donation';end if;
 perform 1 from public.profiles where id=p_donor and role='donor' and status='approved' for update;if not found then raise exception 'Approved donor required';end if;
 select * into existing from public.financial_ledger where request_id=p_request;
 if found then if existing.donor_id=p_donor and existing.type='DONATION_RECEIVED' and existing.amount_in=p_amount and existing.description=p_description then return existing.id;else raise exception 'Idempotency key reused with different data';end if;end if;
 insert into public.financial_ledger(request_id,donor_id,type,category,amount_in,verification_status,description) values(p_request,p_donor,'DONATION_RECEIVED','General',p_amount,'verified',p_description) returning id into result;return result;
end $$;
create function public.allocate_sponsorship(p_donor uuid,p_child uuid,p_limit numeric,p_amount numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare balance numeric;reserved numeric;result uuid;
begin
 if not public.has_permission(auth.uid(),'assign_donors') then raise exception 'Permission denied';end if;
 if p_amount is null or p_limit is null or p_amount<=0 or p_limit<=0 or round(p_amount,2)<>p_amount or round(p_limit,2)<>p_limit then raise exception 'Invalid allocation';end if;
 perform 1 from public.orphans where id=p_child and status='active' for update;if not found then raise exception 'Active child required';end if;
 perform 1 from public.profiles where id=p_donor and role='donor' and status='approved' for update;if not found then raise exception 'Approved donor required';end if;
 select coalesce(sum(amount_in-amount_out),0) into balance from public.financial_ledger where donor_id=p_donor;
 select coalesce(sum(allocated_balance),0) into reserved from public.donor_child_assignments where donor_id=p_donor;
 if balance-reserved<p_amount then raise exception 'Insufficient unallocated donor funds';end if;
 insert into public.donor_child_assignments(donor_id,orphan_id,monthly_spending_limit,allocated_balance) values(p_donor,p_child,p_limit,p_amount) on conflict(donor_id,orphan_id) where status='active' do update set allocated_balance=public.donor_child_assignments.allocated_balance+excluded.allocated_balance,monthly_spending_limit=excluded.monthly_spending_limit returning id into result;return result;
end $$;
create function public.post_expense(p_donor uuid,p_child uuid,p_amount numeric,p_category text,p_description text,p_verification text,p_notes text,p_receipt text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.donor_child_assignments;spent numeric;result uuid;existing public.financial_ledger;zone text;month_start timestamptz;
begin
 if not public.has_permission(auth.uid(),'manage_financials') then raise exception 'Permission denied';end if;
 if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount or length(trim(p_description))<2 then raise exception 'Invalid expense';end if;
 if not exists(select 1 from public.app_settings s where s.key='expense_categories' and s.value ? p_category) then raise exception 'Invalid category';end if;
 if p_verification not in ('verified','pending','forced') or p_verification is null then raise exception 'Invalid verification status';end if;
 if p_verification='forced' and (p_notes is null or length(trim(p_notes))<10) then raise exception 'Audit justification required';end if;
 if p_verification='verified' and (p_receipt is null or not exists(select 1 from storage.objects where name=p_receipt and bucket_id=(select value #>> '{}' from public.app_settings where key='receipt_bucket') and owner_id=auth.uid()::text)) then raise exception 'An uploaded receipt owned by the submitting user is required';end if;
 perform 1 from public.orphans where id=p_child and status='active' for update;if not found then raise exception 'Child is not active';end if;
 perform 1 from public.profiles where id=p_donor and role='donor' and status='approved' for update;if not found then raise exception 'Approved donor required';end if;
 select * into existing from public.financial_ledger where request_id=p_request;
 if found then if existing.donor_id=p_donor and existing.orphan_id=p_child and existing.amount_out=p_amount and existing.category=p_category and existing.description=p_description and existing.verification_status=p_verification and existing.receipt_url is not distinct from p_receipt and existing.audit_notes is not distinct from p_notes then return existing.id;else raise exception 'Idempotency key reused with different data';end if;end if;
 select * into a from public.donor_child_assignments where donor_id=p_donor and orphan_id=p_child and status='active' for update;if not found then raise exception 'Active sponsorship required';end if;
 select value #>> '{}' into zone from public.app_settings where key='financial_timezone';
 month_start:=date_trunc('month',now() at time zone zone) at time zone zone;
 select coalesce(sum(amount_out),0) into spent from public.financial_ledger where donor_id=p_donor and orphan_id=p_child and created_at>=month_start;
 if spent+p_amount>a.monthly_spending_limit then raise exception 'Monthly cap exceeded';end if;
 if a.allocated_balance<p_amount then raise exception 'Insufficient allocated funds';end if;
 update public.donor_child_assignments set allocated_balance=allocated_balance-p_amount where id=a.id;
 insert into public.financial_ledger(request_id,donor_id,orphan_id,type,category,amount_out,receipt_url,verification_status,audit_notes,description) values(p_request,p_donor,p_child,'EXPENSE_SPENT',p_category,p_amount,p_receipt,p_verification,p_notes,p_description) returning id into result;return result;
end $$;
create function public.set_permission(p_user uuid,p_permission text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_permission not in ('manage_orphans','assign_donors','view_financials','manage_financials','approve_donors','run_audits') then raise exception 'Invalid permission';end if;
 if not exists(select 1 from public.profiles where id=p_user and role='staff_user') then raise exception 'Staff user required';end if;
 insert into public.user_permissions(user_id) values(p_user) on conflict do nothing;
 execute format('update public.user_permissions set %I=$1,updated_at=now() where user_id=$2',p_permission) using p_enabled,p_user;
end $$;
create function public.set_donor_status(p_id uuid,p_status public.donor_status) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.has_permission(auth.uid(),'approve_donors') then raise exception 'Permission denied';end if;
 if p_status='pending' then raise exception 'Choose approved or rejected';end if;
 update public.profiles set status=p_status where id=p_id and role='donor';if not found then raise exception 'Donor not found';end if;
end $$;

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.orphans enable row level security;
alter table public.donor_child_assignments enable row level security;
alter table public.financial_ledger enable row level security;
alter table public.audit_logs enable row level security;
create policy settings_read on public.app_settings for select to authenticated using(public.is_approved());
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin() or (role='donor' and (public.has_permission(auth.uid(),'assign_donors') or public.has_permission(auth.uid(),'approve_donors') or public.has_permission(auth.uid(),'manage_financials') or public.has_permission(auth.uid(),'view_financials') or public.has_permission(auth.uid(),'run_audits'))));
create policy permission_read on public.user_permissions for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy child_read on public.orphans for select to authenticated using(public.has_permission(auth.uid(),'manage_orphans') or public.has_permission(auth.uid(),'assign_donors') or public.has_permission(auth.uid(),'manage_financials') or public.has_permission(auth.uid(),'view_financials') or public.has_permission(auth.uid(),'run_audits') or (public.is_approved() and exists(select 1 from public.donor_child_assignments a where a.orphan_id=orphans.id and a.donor_id=auth.uid())));
create policy child_insert on public.orphans for insert to authenticated with check(public.has_permission(auth.uid(),'manage_orphans'));
create policy child_update on public.orphans for update to authenticated using(public.has_permission(auth.uid(),'manage_orphans')) with check(public.has_permission(auth.uid(),'manage_orphans'));
create policy assignments_read on public.donor_child_assignments for select to authenticated using((donor_id=auth.uid() and public.is_approved()) or public.has_permission(auth.uid(),'assign_donors') or public.has_permission(auth.uid(),'manage_financials') or public.has_permission(auth.uid(),'view_financials') or public.has_permission(auth.uid(),'run_audits'));
create policy ledger_read on public.financial_ledger for select to authenticated using((donor_id=auth.uid() and public.is_approved()) or public.has_permission(auth.uid(),'view_financials') or public.has_permission(auth.uid(),'manage_financials') or public.has_permission(auth.uid(),'run_audits'));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_permission(auth.uid(),'run_audits'));
revoke all on public.profiles,public.user_permissions,public.donor_child_assignments,public.financial_ledger,public.audit_logs,public.app_settings from anon,authenticated;
grant select on public.profiles,public.user_permissions,public.donor_child_assignments,public.financial_ledger,public.audit_logs,public.app_settings to authenticated;
revoke all on public.orphans from anon,authenticated;
grant select,insert,update on public.orphans to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.has_permission(uuid,text),public.is_admin(),public.is_approved(),public.post_donation(uuid,numeric,text,uuid),public.allocate_sponsorship(uuid,uuid,numeric,numeric),public.post_expense(uuid,uuid,numeric,text,text,text,text,text,uuid),public.set_permission(uuid,text,boolean),public.set_donor_status(uuid,public.donor_status) to authenticated;
commit;
