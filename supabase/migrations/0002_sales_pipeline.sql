-- Spine CRM — Sales pipeline module
-- Opportunities -> Quotes -> Sales Orders -> Invoices -> Payments, plus a
-- proper Accounts (and lightweight Contacts) table behind them all. Mirrors
-- the Dataverse schema (spine_opportunity, spine_quote, spine_salesorder2,
-- spine_invoice, spine_payment) field-for-field, including the Client vs
-- End Client / Billing Account naming already settled on there.
--
-- `clients` (from 0001) was always a stand-in for this; it's promoted to a
-- full `accounts` table here rather than living alongside it.

-- ─────────────────────────────────────────────────────────────────────────
-- accounts — promote `clients` (0001) to a full account record
-- ─────────────────────────────────────────────────────────────────────────
alter table public.clients rename to accounts;

alter table public.accounts
  add column website text,
  add column phone text,
  add column email text,
  add column city text,
  add column postcode text;

-- Policies move with the table on rename; just tidying their names.
alter policy "clients_select_all" on public.accounts rename to "accounts_select_all";
alter policy "clients_write_staff" on public.accounts rename to "accounts_write_staff";

-- ─────────────────────────────────────────────────────────────────────────
-- contacts — minimal for now; a person at an account. No dedicated UI yet,
-- but Opportunities/Quotes can already point at one once you add it direct
-- to the table or a future Contacts page.
-- ─────────────────────────────────────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- opportunities
-- ─────────────────────────────────────────────────────────────────────────
create type opportunity_source as enum ('email', 'web_form', 'phone', 'referral', 'other');
create type opportunity_stage as enum ('qualifying', 'quoting', 'quote_accepted', 'po_received');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_account_id uuid references public.accounts (id) on delete set null,
  client_id uuid references public.accounts (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  description text,
  estimated_value numeric(12, 2),
  po_number text,
  po_received boolean not null default false,
  advanced_without_po boolean not null default false,
  exception_approval_notes text,
  exception_approved_by uuid references public.profiles (id) on delete set null,
  expected_close_date date,
  source opportunity_source,
  stage opportunity_stage not null default 'qualifying',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunities_client_idx on public.opportunities (client_id);
create index opportunities_stage_idx on public.opportunities (stage);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- quotes
-- ─────────────────────────────────────────────────────────────────────────
create type quote_status as enum ('draft', 'sent', 'accepted', 'declined');
create sequence public.quote_number_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique default ('Q-' || lpad(nextval('public.quote_number_seq')::text, 6, '0')),
  opportunity_id uuid references public.opportunities (id) on delete set null,
  client_id uuid references public.accounts (id) on delete set null,
  end_client_id uuid references public.accounts (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  quote_date date,
  start_date date,
  end_date date,
  value numeric(12, 2),
  vat numeric(12, 2),
  total numeric(12, 2),
  rebate numeric(12, 2),
  net_value numeric(12, 2),
  status quote_status not null default 'draft',
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_opportunity_idx on public.quotes (opportunity_id);
create index quotes_client_idx on public.quotes (client_id);
create index quotes_status_idx on public.quotes (status);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- sales_orders — one Quote typically becomes one Sales Order; one Sales
-- Order is often invoiced multiple times as work is delivered.
-- ─────────────────────────────────────────────────────────────────────────
create sequence public.sales_order_reference_seq;

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SO-' || lpad(nextval('public.sales_order_reference_seq')::text, 6, '0')),
  quote_id uuid references public.quotes (id) on delete set null,
  client_id uuid references public.accounts (id) on delete set null,
  end_client_id uuid references public.accounts (id) on delete set null,
  po_number text,
  po_received_date date,
  start_date date,
  end_date date,
  quote_value numeric(12, 2),
  po_value numeric(12, 2),
  difference numeric(12, 2),
  quote_match boolean not null default false,
  vat numeric(12, 2),
  total numeric(12, 2),
  rebate numeric(12, 2),
  net_value numeric(12, 2),
  invoiced_to_date numeric(12, 2),
  timesheet_sent timestamptz,
  outstanding_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_orders_quote_idx on public.sales_orders (quote_id);
create index sales_orders_client_idx on public.sales_orders (client_id);

create trigger sales_orders_set_updated_at
  before update on public.sales_orders
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────────────────────────────────
create type invoice_status as enum ('draft', 'sent', 'paid', 'cancelled');
create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  quote_id uuid references public.quotes (id) on delete set null,
  sales_order_id uuid references public.sales_orders (id) on delete set null,
  client_id uuid references public.accounts (id) on delete set null,
  end_client_id uuid references public.accounts (id) on delete set null,
  po_number text,
  invoice_date date,
  due_date date,
  invoice_period_from date,
  invoice_period_to date,
  value numeric(12, 2),
  vat numeric(12, 2),
  total numeric(12, 2),
  rebate numeric(12, 2),
  net_value numeric(12, 2),
  status invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_sales_order_idx on public.invoices (sales_order_id);
create index invoices_client_idx on public.invoices (client_id);
create index invoices_status_idx on public.invoices (status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- payments — partial or full, against an invoice
-- ─────────────────────────────────────────────────────────────────────────
create sequence public.payment_reference_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PAY-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0')),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_date date,
  original_amount numeric(12, 2),
  remaining_amount numeric(12, 2),
  payment_amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — sales pipeline is a staff-only area (field engineers
-- never see it; they only ever touch their own timesheet entries).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.quotes enable row level security;
alter table public.sales_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

create policy "contacts_staff_full_access" on public.contacts
  for all using (public.is_staff()) with check (public.is_staff());

create policy "opportunities_staff_full_access" on public.opportunities
  for all using (public.is_staff()) with check (public.is_staff());

create policy "quotes_staff_full_access" on public.quotes
  for all using (public.is_staff()) with check (public.is_staff());

create policy "sales_orders_staff_full_access" on public.sales_orders
  for all using (public.is_staff()) with check (public.is_staff());

create policy "invoices_staff_full_access" on public.invoices
  for all using (public.is_staff()) with check (public.is_staff());

create policy "payments_staff_full_access" on public.payments
  for all using (public.is_staff()) with check (public.is_staff());
