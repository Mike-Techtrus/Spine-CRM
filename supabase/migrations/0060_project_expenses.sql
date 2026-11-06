-- 0060: expenses logged against a project (hotels, mileage, parking, kit…),
-- so actual spend can be compared with what was quoted.
--
-- project_expenses (EXP-00001…): who spent it (a contractor or staff member,
-- or nobody = Techtrus paid directly), date, category, amount inc VAT + the
-- VAT part, optional receipt (private "expense-receipts" bucket), status
-- submitted → approved / rejected — like timesheets:
--   * contractors log their own, on projects they're allocated to; they're
--     always "paid by me" and always go in as Submitted; they can change or
--     delete them until approved;
--   * staff logging their own, or an expense Techtrus paid directly, are
--     approved straight away (as with staff timesheets, 0033);
--   * approve / reject: the project owner or an admin, never your own;
--     rejecting needs a reason;
--   * nothing new on a cancelled project.
-- Approved expenses a contractor paid for go on that month's contractor
-- statement (create_contractor_statement, now days + expenses) and are then
-- locked, like days. contractor_statements.expenses holds that part.
-- my_action_counts gains expenses_to_approve and my_rejected_expenses.

begin;

create sequence if not exists public.project_expense_number_seq;

create table public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EXP-' || lpad(nextval('public.project_expense_number_seq')::text, 5, '0')),
  project_id uuid not null references public.projects (id) on delete restrict,
  field_engineer_id uuid references public.field_engineers (id) on delete restrict, -- who spent it; null = Techtrus paid directly
  paid_by text not null default 'person' check (paid_by in ('person', 'company')),
  expense_date date not null,
  category text not null,
  description text,
  amount numeric(10, 2) not null check (amount > 0), -- total paid, inc VAT
  vat numeric(10, 2) not null default 0 check (vat >= 0 and vat <= amount),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  rejection_notes text,
  submitted_on timestamptz not null default now(),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_on timestamptz,
  receipt_path text,
  receipt_file_name text,
  contractor_statement_id uuid references public.contractor_statements (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_by = 'company' or field_engineer_id is not null)
);

comment on table public.project_expenses is 'Expenses logged against a project (0060). Cost for comparisons = amount − vat.';

create index project_expenses_project_idx on public.project_expenses (project_id, expense_date);
create index project_expenses_person_idx on public.project_expenses (field_engineer_id, expense_date);
create index project_expenses_statement_idx on public.project_expenses (contractor_statement_id);
create index project_expenses_approved_by_idx on public.project_expenses (approved_by);
create index project_expenses_created_by_idx on public.project_expenses (created_by);

create trigger project_expenses_set_updated_at
  before update on public.project_expenses
  for each row execute function public.set_updated_at();

create trigger audit_project_expenses after insert or update or delete on public.project_expenses
  for each row execute function public.audit_row_change();

-- ── Rules ───────────────────────────────────────────────────────────────────

create or replace function public.project_expenses_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_staff boolean := public.is_staff();
  v_project record;
  v_kind text;
  v_user uuid;
  v_own boolean;
  v_may_approve boolean;
begin
  -- Going on / coming off a contractor statement (create_contractor_statement,
  -- or the statement being deleted): nothing else changes, so let it through.
  if tg_op = 'UPDATE' and new.contractor_statement_id is distinct from old.contractor_statement_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.contractor_statement_id is not null and (
       new.amount, new.vat, new.status, new.project_id, new.field_engineer_id, new.expense_date, new.paid_by
     ) is distinct from (
       old.amount, old.vat, old.status, old.project_id, old.field_engineer_id, old.expense_date, old.paid_by
     ) then
    raise exception '% is on a contractor statement, so it can''t be changed.', old.reference;
  end if;

  select id, reference, status::text as status, owner_id into v_project from public.projects where id = new.project_id;
  if v_project.status = 'cancelled' and (tg_op = 'INSERT' or new.status = 'submitted') then
    raise exception 'Project % has been cancelled, so expenses can''t be logged against it.', v_project.reference;
  end if;

  if new.field_engineer_id is not null then
    select kind, user_id into v_kind, v_user from public.field_engineers where id = new.field_engineer_id;
  end if;
  v_own := new.field_engineer_id is not null and v_user is not distinct from v_me;

  -- Contractors (and anyone not staff): their own, on their projects, always submitted.
  if not coalesce(v_staff, false) then
    if new.field_engineer_id is distinct from public.my_field_engineer_id() then
      raise exception 'You can only log your own expenses.';
    end if;
    if not exists (
      select 1 from public.project_assignments a
      join public.project_lines l on l.id = a.project_line_id
      where a.field_engineer_id = new.field_engineer_id and l.project_id = new.project_id
    ) then
      raise exception 'You''re not on project %, so you can''t log expenses against it.', v_project.reference;
    end if;
    if tg_op = 'UPDATE' and old.status = 'approved' then
      raise exception '% has been approved, so it can''t be changed — ask the project owner.', old.reference;
    end if;
    new.paid_by := 'person';
    new.status := 'submitted';
    new.submitted_on := now();
    new.rejection_notes := null;
    new.approved_by := null;
    new.approved_on := null;
    new.contractor_statement_id := case when tg_op = 'UPDATE' then old.contractor_statement_id end;
    return new;
  end if;

  -- Staff. Their own expenses and Techtrus-paid ones are approved straight away.
  if tg_op = 'INSERT' and new.status = 'submitted' and (new.field_engineer_id is null or (v_own and v_kind = 'staff')) then
    new.status := 'approved';
    new.approved_on := now();
    new.approved_by := null; -- automatic
    return new;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      v_may_approve := (v_project.owner_id = v_me or public.is_admin()) and not v_own;
      if not v_may_approve and not (new.status = 'approved' and (new.field_engineer_id is null or (v_own and v_kind = 'staff'))) then
        raise exception 'Only the project owner or an admin can approve or reject expenses, and never their own.';
      end if;
      if new.status = 'rejected' and coalesce(trim(new.rejection_notes), '') = '' then
        raise exception 'Please give a reason for rejecting %.', coalesce(new.reference, 'the expense');
      end if;
      new.approved_by := v_me;
      new.approved_on := now();
      if new.status = 'approved' then
        new.rejection_notes := null;
      end if;
    else
      new.submitted_on := now();
      new.approved_by := null;
      new.approved_on := null;
      new.rejection_notes := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger project_expenses_check
  before insert or update on public.project_expenses
  for each row execute function public.project_expenses_check();

-- ── Who can see and change them ─────────────────────────────────────────────

alter table public.project_expenses enable row level security;

create policy project_expenses_select on public.project_expenses
  for select using ((select public.is_staff()) or field_engineer_id = (select public.my_field_engineer_id()));

create policy project_expenses_insert on public.project_expenses
  for insert with check (
    (select public.can_write('projects')) or (select public.can_write('timesheets'))
    or field_engineer_id = (select public.my_field_engineer_id())
  );

create policy project_expenses_update on public.project_expenses
  for update
  using (
    (select public.can_write('projects')) or (select public.can_write('timesheets'))
    or (field_engineer_id = (select public.my_field_engineer_id()) and status <> 'approved')
  )
  with check (
    (select public.can_write('projects')) or (select public.can_write('timesheets'))
    or field_engineer_id = (select public.my_field_engineer_id())
  );

create policy project_expenses_delete on public.project_expenses
  for delete using (
    contractor_statement_id is null and (
      (select public.can_write('projects')) or (select public.can_write('timesheets'))
      or (field_engineer_id = (select public.my_field_engineer_id()) and status <> 'approved')
    )
  );

-- ── Receipts ────────────────────────────────────────────────────────────────
-- Path: {field_engineer id, or "company"}/{time}-{file name}. People manage
-- their own folder; any staff can see and add.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy expense_receipts_select on storage.objects
  for select using (
    bucket_id = 'expense-receipts'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy expense_receipts_insert on storage.objects
  for insert with check (
    bucket_id = 'expense-receipts'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy expense_receipts_delete on storage.objects
  for delete using (
    bucket_id = 'expense-receipts'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );

-- ── Contractor statements: days + expenses ──────────────────────────────────

alter table public.contractor_statements
  add column if not exists expenses numeric(12, 2) not null default 0;
comment on column public.contractor_statements.expenses is
  'Approved expenses the contractor paid, included in amount (0060).';

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
  v_expenses numeric;
  v_id uuid;
begin
  if not public.can_write('invoices') then
    raise exception 'You need the Invoices area to record contractor statements.';
  end if;

  select kind into v_kind from public.field_engineers where id = p_field_engineer_id;
  if v_kind is distinct from 'contractor' then
    raise exception 'Statements are for contractors only.';
  end if;

  select coalesce(sum(public.day_type_days(t.day_type)), 0),
         coalesce(sum(public.day_type_days(t.day_type)) filter (where coalesce(pa.cost_rate, fe.day_rate) is null), 0),
         coalesce(round(sum(public.day_type_days(t.day_type) * coalesce(pa.cost_rate, fe.day_rate)), 2), 0)
    into v_days, v_missing, v_amount
  from public.timesheet_entries t
  join public.field_engineers fe on fe.id = t.field_engineer_id
  left join public.project_assignments pa on pa.id = t.project_assignment_id
  where t.field_engineer_id = p_field_engineer_id
    and t.status = 'approved'
    and t.contractor_statement_id is null
    and t.work_date between v_start and v_end;

  select coalesce(sum(e.amount), 0) into v_expenses
  from public.project_expenses e
  where e.field_engineer_id = p_field_engineer_id
    and e.status = 'approved'
    and e.paid_by = 'person'
    and e.contractor_statement_id is null
    and e.expense_date between v_start and v_end;

  if v_days = 0 and v_expenses = 0 then
    raise exception 'No approved days or expenses to add for % — they may already be on a statement.', to_char(v_start, 'FMMonth YYYY');
  end if;
  if v_missing > 0 then
    raise exception '% day(s) have no cost rate. Set the rate on the project allocation, or the person''s Day rate, first.', trim_scale(v_missing);
  end if;

  insert into public.contractor_statements (field_engineer_id, period_month, days, amount, expenses, created_by)
  values (p_field_engineer_id, v_start, v_days, v_amount + v_expenses, v_expenses, auth.uid())
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

  update public.project_expenses e
  set contractor_statement_id = v_id
  where e.field_engineer_id = p_field_engineer_id
    and e.status = 'approved'
    and e.paid_by = 'person'
    and e.contractor_statement_id is null
    and e.expense_date between v_start and v_end;

  return v_id;
end;
$$;

-- ── Badges ──────────────────────────────────────────────────────────────────

create or replace function public.my_action_counts()
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select json_build_object(
    'timesheets_to_approve',
      case when public.has_area('timesheets') then (
        select count(*)
        from public.timesheet_entries t
        join public.field_engineers fe on fe.id = t.field_engineer_id
        left join public.project_assignments pa on pa.id = t.project_assignment_id
        left join public.project_lines pl on pl.id = pa.project_line_id
        left join public.projects p on p.id = pl.project_id
        where t.status = 'submitted'
          and fe.user_id is distinct from auth.uid()
          and (t.project_assignment_id is null or p.owner_id = auth.uid() or public.is_admin())
      ) else 0 end,
    'my_rejected_timesheets', (
      select count(*)
      from public.timesheet_entries t
      join public.field_engineers fe on fe.id = t.field_engineer_id
      where t.status = 'rejected' and fe.user_id = auth.uid()
    ),
    'my_unsubmitted', (
      select count(*)
      from public.timesheet_entries t
      join public.field_engineers fe on fe.id = t.field_engineer_id
      where t.status = 'draft' and fe.user_id = auth.uid()
        and t.work_date < date_trunc('week', current_date)::date
    ),
    'expenses_to_approve',
      case when public.is_staff() then (
        select count(*)
        from public.project_expenses e
        join public.projects p on p.id = e.project_id
        left join public.field_engineers fe on fe.id = e.field_engineer_id
        where e.status = 'submitted'
          and fe.user_id is distinct from auth.uid()
          and (p.owner_id = auth.uid() or public.is_admin())
      ) else 0 end,
    'my_rejected_expenses', (
      select count(*) from public.project_expenses e
      where e.status = 'rejected' and e.field_engineer_id = public.my_field_engineer_id()
    ),
    'skill_requests',
      case when public.is_admin() then (
        select count(*) from public.skill_requests where status = 'pending'
      ) else 0 end,
    'expiring',
      (case when public.can_write('engineers') then (
        select count(*)
        from public.contractor_skills cs
        join public.field_engineers fe on fe.id = cs.field_engineer_id
        where fe.is_active and cs.expires_on is not null and cs.expires_on <= current_date + 60
      ) else 0 end)
      + (case when public.is_admin() then (
        select count(*)
        from public.person_documents d
        join public.field_engineers fe on fe.id = d.field_engineer_id
        where fe.is_active and d.expires_on is not null and d.expires_on <= current_date + 60
      ) else 0 end),
    'my_expiring', (
      select count(*) from public.contractor_skills cs
      where cs.field_engineer_id = public.my_field_engineer_id()
        and cs.expires_on is not null and cs.expires_on <= current_date + 60
    ) + (
      select count(*) from public.person_documents d
      where d.field_engineer_id = public.my_field_engineer_id()
        and d.expires_on is not null and d.expires_on <= current_date + 60
    )
  );
$function$;

commit;
