-- Projects (phase 1 of timesheet-driven invoicing).
--
--   projects            — one per sales order, created from it. Has an owner
--                         (staff) and a status.
--   project_lines       — the quote's lines whose line type is billed "From
--                         timesheets" (0021), copied when the project is
--                         created: quoted days and the quoted day rate are the
--                         agreed basis and don't follow later rate-card or
--                         quote edits.
--   project_assignments — a person (contractor or staff profile,
--                         field_engineers) on a project line with an allocation
--                         of days, in half-day steps.
--   timesheet_entries.project_assignment_id — which allocation a timesheet
--                         day draws down (used from phase 2; burn-down reads it
--                         now).
--
-- create_project_from_sales_order() does the copy in one step.

-- ── Projects ────────────────────────────────────────────────────────────────
create sequence public.project_reference_seq;

create type public.project_status as enum ('active', 'complete');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PRJ-' || lpad(nextval('public.project_reference_seq')::text, 5, '0')),
  sales_order_id uuid not null unique references public.sales_orders (id) on delete restrict,
  name text not null,
  owner_id uuid references public.profiles (id) on delete set null,
  status public.project_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  quote_line_id uuid references public.quote_lines (id) on delete set null,
  line_item_id uuid references public.line_items (id) on delete set null,
  line_type text not null,
  part_code text,
  description text,
  quoted_days numeric(8, 1) not null default 0,
  day_rate numeric(12, 2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index project_lines_project_id_idx on public.project_lines (project_id);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_line_id uuid not null references public.project_lines (id) on delete cascade,
  field_engineer_id uuid not null references public.field_engineers (id) on delete restrict,
  allocated_days numeric(6, 1) not null check (allocated_days > 0 and allocated_days * 2 = round(allocated_days * 2)),
  created_at timestamptz not null default now(),
  unique (project_line_id, field_engineer_id)
);

create index project_assignments_person_idx on public.project_assignments (field_engineer_id);

alter table public.timesheet_entries
  add column project_assignment_id uuid references public.project_assignments (id) on delete restrict;

create index timesheet_entries_assignment_idx on public.timesheet_entries (project_assignment_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Staff manage everything. People assigned to a project can read their own
-- assignments and the lines/projects they're on (needed for timesheets).
alter table public.projects enable row level security;
alter table public.project_lines enable row level security;
alter table public.project_assignments enable row level security;

create or replace function public.my_assignment_line_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select pa.project_line_id
  from public.project_assignments pa
  join public.field_engineers fe on fe.id = pa.field_engineer_id
  where fe.user_id = auth.uid();
$$;

create policy "projects_staff" on public.projects
  for all using (public.is_staff()) with check (public.is_staff());
create policy "projects_select_assigned" on public.projects for select using (
  id in (select project_id from public.project_lines where id in (select public.my_assignment_line_ids()))
);

create policy "project_lines_staff" on public.project_lines
  for all using (public.is_staff()) with check (public.is_staff());
create policy "project_lines_select_assigned" on public.project_lines
  for select using (id in (select public.my_assignment_line_ids()));

create policy "project_assignments_staff" on public.project_assignments
  for all using (public.is_staff()) with check (public.is_staff());
create policy "project_assignments_select_own" on public.project_assignments for select using (
  field_engineer_id in (select id from public.field_engineers where user_id = auth.uid())
);

-- ── Create a project from a sales order ─────────────────────────────────────
-- Copies the source quote's lines whose line type is billed from timesheets
-- (by the rate-card line item's type where linked, else the line's own
-- type). Runs as the caller, so RLS applies.
create or replace function public.create_project_from_sales_order(p_sales_order_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  v_name text;
  v_project_id uuid;
begin
  select * into so from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Sales order not found';
  end if;

  select coalesce(nullif(trim(o.name), ''), so.reference) into v_name
  from public.quotes q
  left join public.opportunities o on o.id = q.opportunity_id
  where q.id = so.quote_id;

  insert into public.projects (sales_order_id, name, owner_id)
  values (p_sales_order_id, coalesce(v_name, so.reference), auth.uid())
  returning id into v_project_id;

  insert into public.project_lines
    (project_id, quote_line_id, line_item_id, line_type, part_code, description, quoted_days, day_rate, sort_order)
  select
    v_project_id, ql.id, ql.line_item_id, coalesce(li.line_type, ql.line_type), ql.part_code,
    nullif(concat_ws(' — ', nullif(trim(ql.description), ''), nullif(trim(ql.description_2), '')), ''),
    ql.qty, ql.unit_cost, ql.sort_order
  from public.quote_lines ql
  left join public.line_items li on li.id = ql.line_item_id
  join public.line_types lt on lower(lt.name) = lower(coalesce(li.line_type, ql.line_type))
  where ql.quote_id = so.quote_id
    and lt.billing = 'timesheet';

  return v_project_id;
end;
$$;

-- ── "projects" area permission ──────────────────────────────────────────────
-- Staff who can see Sales Orders get the new Projects area too.
update public.profiles
set permissions = array_append(permissions, 'projects')
where role = 'staff' and 'sales_orders' = any (permissions) and not ('projects' = any (permissions));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role user_role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'field_engineer');
begin
  insert into public.profiles (id, full_name, role, permissions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new_role,
    case when new_role = 'staff' then array[
      'dashboard', 'opportunities', 'quotes', 'sales_orders', 'projects', 'invoices',
      'timesheets', 'accounts', 'engineers'
    ] else '{}' end
  );
  return new;
end;
$$;
