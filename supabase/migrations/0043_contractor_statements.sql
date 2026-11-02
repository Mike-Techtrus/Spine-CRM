-- Contractor costs: what we owe each contractor, from their approved days.
--
-- contractor_statements — one per contractor per run (usually one a month):
--   CS-00001, the month, days, amount, status recorded → paid.
-- create_contractor_statement(person, month) gathers that contractor's
-- approved, not-yet-stated timesheet days in the month, prices each day at
-- the allocation's cost rate (0041) or, for non-project time, the person's
-- Day rate, stamps the rate on the day (timesheet_entries.contractor_rate) and
-- links it (contractor_statement_id). Those days are then locked, like
-- invoiced days (0025), so they can't be changed or paid twice. Days approved
-- later go on a further statement.
--
-- Needs the Invoices area (finance). Deleting a statement that isn't paid yet
-- frees its days again. Contractors only — staff are paid through payroll.

begin;

create sequence public.contractor_statement_number_seq;

create table public.contractor_statements (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('CS-' || lpad(nextval('public.contractor_statement_number_seq')::text, 5, '0')),
  field_engineer_id uuid not null references public.field_engineers (id) on delete restrict,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  days numeric(6, 1) not null,
  amount numeric(12, 2) not null,
  status text not null default 'recorded' check (status in ('recorded', 'paid')),
  paid_on date,
  payment_reference text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contractor_statements_person_idx on public.contractor_statements (field_engineer_id, period_month);
create index contractor_statements_month_idx on public.contractor_statements (period_month);
create index contractor_statements_created_by_idx on public.contractor_statements (created_by);

create trigger contractor_statements_set_updated_at
  before update on public.contractor_statements
  for each row execute function public.set_updated_at();

create trigger audit_contractor_statements after insert or update or delete on public.contractor_statements
  for each row execute function public.audit_row_change();

alter table public.contractor_statements enable row level security;

create policy contractor_statements_select_staff on public.contractor_statements
  for select using ((select public.is_staff()));
create policy contractor_statements_update on public.contractor_statements
  for update using ((select public.can_write('invoices'))) with check ((select public.can_write('invoices')));
create policy contractor_statements_delete_unpaid on public.contractor_statements
  for delete using ((select public.can_write('invoices')) and status = 'recorded');
-- No insert policy: statements are only made by create_contractor_statement().

alter table public.timesheet_entries
  add column contractor_statement_id uuid references public.contractor_statements (id) on delete set null,
  add column contractor_rate numeric(10, 2);

create index timesheet_entries_contractor_statement_idx on public.timesheet_entries (contractor_statement_id);

comment on column public.timesheet_entries.contractor_rate is
  'Cost per day this day was paid at, stamped when it went on a contractor statement (0043).';

-- Days on an invoice OR a contractor statement are locked.
create or replace function public.timesheet_entries_lock_invoiced()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_id is not null then
      raise exception '% has been invoiced, so it can''t be deleted.', old.reference;
    end if;
    if old.contractor_statement_id is not null then
      raise exception '% is on a contractor statement, so it can''t be deleted.', old.reference;
    end if;
    return old;
  end if;
  if (new.status is distinct from old.status or new.day_type is distinct from old.day_type
      or new.work_date is distinct from old.work_date
      or new.project_assignment_id is distinct from old.project_assignment_id) then
    -- Changing the links themselves (billing / stating a day, or the invoice/statement being deleted) is fine.
    if old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id then
      raise exception '% has been invoiced, so it can''t be changed.', old.reference;
    end if;
    if old.contractor_statement_id is not null and new.contractor_statement_id is not distinct from old.contractor_statement_id then
      raise exception '% is on a contractor statement, so it can''t be changed.', old.reference;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.create_contractor_statement(p_field_engineer_id uuid, p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_kind text;
  v_days numeric;
  v_amount numeric;
  v_missing numeric;
  v_id uuid;
begin
  if not public.can_write('invoices') then
    raise exception 'You need the Invoices area to record contractor statements.';
  end if;

  select kind into v_kind from public.field_engineers where id = p_field_engineer_id;
  if v_kind is distinct from 'contractor' then
    raise exception 'Statements are for contractors only.';
  end if;

  -- The days to add: approved, not on a statement yet, in the month, with their rate.
  select coalesce(sum(public.day_type_days(t.day_type)), 0),
         coalesce(sum(public.day_type_days(t.day_type)) filter (where coalesce(pa.cost_rate, fe.day_rate) is null), 0),
         round(sum(public.day_type_days(t.day_type) * coalesce(pa.cost_rate, fe.day_rate)), 2)
    into v_days, v_missing, v_amount
  from public.timesheet_entries t
  join public.field_engineers fe on fe.id = t.field_engineer_id
  left join public.project_assignments pa on pa.id = t.project_assignment_id
  where t.field_engineer_id = p_field_engineer_id
    and t.status = 'approved'
    and t.contractor_statement_id is null
    and t.work_date between v_start and v_end;

  if v_days = 0 then
    raise exception 'No approved days to add for % — they may already be on a statement.', to_char(v_start, 'FMMonth YYYY');
  end if;
  if v_missing > 0 then
    raise exception '% day(s) have no cost rate. Set the rate on the project allocation, or the person''s Day rate, first.', trim_scale(v_missing);
  end if;

  insert into public.contractor_statements (field_engineer_id, period_month, days, amount, created_by)
  values (p_field_engineer_id, v_start, v_days, v_amount, auth.uid())
  returning id into v_id;

  update public.timesheet_entries t
  set contractor_statement_id = v_id,
      contractor_rate = coalesce(
        (select pa.cost_rate from public.project_assignments pa where pa.id = t.project_assignment_id),
        (select fe.day_rate from public.field_engineers fe where fe.id = t.field_engineer_id))
  where t.field_engineer_id = p_field_engineer_id
    and t.status = 'approved'
    and t.contractor_statement_id is null
    and t.work_date between v_start and v_end;

  return v_id;
end;
$$;

commit;
