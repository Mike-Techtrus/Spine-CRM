-- Granular line-item breakdown for quotes (engineer levels, logistics,
-- expenses, etc.) — mirrors the "Quote" sheet layout used in the
-- SharePoint quote workbooks (Line Type / Engineering Level / Description /
-- Description 2 / Vendor / Qty / Expected Cost / Total), so quotes can hold
-- the same detail in the CRM instead of only a rolled-up Value.

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  sort_order integer not null default 0,

  -- Free text rather than enums: both lists are maintained ad hoc in the
  -- source spreadsheets (new engineer levels / part codes get added
  -- without notice), so the app offers suggestions but doesn't restrict.
  line_type text not null default 'Outsource Resource',
  part_code text,        -- "Engineering Level" column — e.g. L2 Engineer, Team Lead, LOGISTICS
  description text,
  description_2 text,
  vendor text,            -- outsourcing/supplier code, e.g. TEC410

  qty numeric not null default 1,
  unit_cost numeric not null default 0,
  line_total numeric generated always as (qty * unit_cost) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_lines_quote_idx on public.quote_lines (quote_id);

create trigger quote_lines_set_updated_at
  before update on public.quote_lines
  for each row execute function public.set_updated_at();

alter table public.quote_lines enable row level security;

create policy "quote_lines_staff_full_access" on public.quote_lines
  for all using (public.is_staff()) with check (public.is_staff());
