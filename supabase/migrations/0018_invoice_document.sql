-- What the printed invoice (Invoice → Print / Export PDF) needs, matching
-- Techtrus's existing invoice layout:
--
--   invoice_lines     — Product Description / Quantity / Price per invoice
--                       (like quote_lines); when present they drive the
--                       invoice's Value, VAT and Total.
--   company_settings  — one row of company details printed on every invoice
--                       (VAT reg, company number, registered address,
--                       payment terms, bank details). Edited at Admin →
--                       Invoice settings. Kept in the database rather than
--                       the code so bank details never sit in the public
--                       GitHub repo. Bank details are left blank here on
--                       purpose — enter them on that page.
--   accounts.*        — billing name and address for the "Invoice To" block.

-- ── Invoice lines ───────────────────────────────────────────────────────────
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  sort_order int not null default 0,
  description text,
  qty numeric(12, 2) not null default 0,
  unit_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

alter table public.invoice_lines enable row level security;

create policy "invoice_lines_staff" on public.invoice_lines
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Company settings (single row) ───────────────────────────────────────────
create table public.company_settings (
  id boolean primary key default true check (id), -- only ever one row
  company_name text not null default '',
  vat_reg text not null default '',
  company_number text not null default '',
  registered_address text not null default '',
  payment_terms text not null default '',        -- short, e.g. "40 Days"
  payment_terms_text text not null default '',   -- the longer paragraph
  bank_account_name text not null default '',
  bank_account_number text not null default '',
  bank_sort_code text not null default '',
  updated_at timestamptz not null default now()
);

create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;

create policy "company_settings_select_staff" on public.company_settings
  for select using (public.is_staff());
create policy "company_settings_write_admin" on public.company_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Public company details (Companies House / VAT register), from the
-- September 2026 invoice. Bank details intentionally not included.
insert into public.company_settings (
  company_name, vat_reg, company_number, registered_address, payment_terms, payment_terms_text
) values (
  'Techtrus Ltd',
  'GB232530935',
  '09472508',
  '88 North Street, Hornchurch, Essex, RM11 1SR',
  '40 Days',
  'Payment Terms: The Client shall pay each invoice properly due, issued and submitted by Supplier within 40 days of the end of month in which the invoice is received.'
);

-- ── Billing address on accounts ─────────────────────────────────────────────
alter table public.accounts
  add column billing_name text,         -- legal name for invoices, e.g. "CDW Limited" (falls back to name)
  add column address_line_1 text,
  add column address_line_2 text;
-- city and postcode already exist on accounts (0002) and complete the address.
