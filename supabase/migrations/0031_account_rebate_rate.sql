-- Rebate % per account. Run after 0030_rebate_by_line_type.sql.
--
-- The rebate is an agreement with a particular client, not a flat 7.5%:
-- today only CDW has one (7.5%); every other account is 0%.
--
--   accounts.rebate_rate      — percent, e.g. 7.5 (Customer Accounts → Edit).
--   account_rebate_rate(id)   — that account's rate as a fraction (7.5 → 0.075);
--                               0 for no account.
-- The rebate on a quote / sales order / invoice = its client's rate × the
-- value of its rebate-eligible lines (line types from 0030).
--
-- One-off recalculation: every existing rebate was worked out at 7.5%, so
-- each is scaled by (client's rate ÷ 7.5) — CDW's stay as they are, everyone
-- else's go to 0 — and Net value moves by the same amount (net = total −
-- rebate). Old figures are kept in rebate_rate_backup (undo SQL at the end).
-- Changing an account's rate later only affects quotes and invoices when
-- they're next edited.
--
-- Runs as one transaction: it all applies, or (on any error) none of it does.

begin;

alter table public.accounts
  add column rebate_rate numeric(5, 2) not null default 0
  check (rebate_rate >= 0 and rebate_rate <= 100);

update public.accounts set rebate_rate = 7.5
  where name ilike 'cdw%' or billing_name ilike 'cdw%';

create or replace function public.account_rebate_rate(p_account_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce((select a.rebate_rate from public.accounts a where a.id = p_account_id), 0) / 100;
$$;

-- ── Backup ──────────────────────────────────────────────────────────────────
create table public.rebate_rate_backup (
  record_type text not null, -- 'quote' | 'sales_order' | 'invoice'
  record_id uuid not null,
  rebate numeric(12, 2),
  net_value numeric(12, 2),
  saved_at timestamptz not null default now(),
  primary key (record_type, record_id)
);

alter table public.rebate_rate_backup enable row level security;
create policy "rebate_rate_backup_select_admin" on public.rebate_rate_backup
  for select using (public.is_admin());

-- ── Recalculate: scale each rebate by (client's rate ÷ 7.5) ─────────────────
insert into public.rebate_rate_backup (record_type, record_id, rebate, net_value)
select 'quote', q.id, q.rebate, q.net_value
from public.quotes q
where q.rebate is not null
  and round(q.rebate * public.account_rebate_rate(q.client_id) / 0.075, 2) <> q.rebate;

update public.quotes q
set rebate = round(q.rebate * public.account_rebate_rate(q.client_id) / 0.075, 2),
    net_value = q.net_value + q.rebate - round(q.rebate * public.account_rebate_rate(q.client_id) / 0.075, 2)
where q.rebate is not null
  and round(q.rebate * public.account_rebate_rate(q.client_id) / 0.075, 2) <> q.rebate;

insert into public.rebate_rate_backup (record_type, record_id, rebate, net_value)
select 'sales_order', so.id, so.rebate, so.net_value
from public.sales_orders so
where so.rebate is not null
  and round(so.rebate * public.account_rebate_rate(so.client_id) / 0.075, 2) <> so.rebate;

update public.sales_orders so
set rebate = round(so.rebate * public.account_rebate_rate(so.client_id) / 0.075, 2),
    net_value = so.net_value + so.rebate - round(so.rebate * public.account_rebate_rate(so.client_id) / 0.075, 2)
where so.rebate is not null
  and round(so.rebate * public.account_rebate_rate(so.client_id) / 0.075, 2) <> so.rebate;

insert into public.rebate_rate_backup (record_type, record_id, rebate, net_value)
select 'invoice', i.id, i.rebate, i.net_value
from public.invoices i
where i.rebate is not null
  and round(i.rebate * public.account_rebate_rate(i.client_id) / 0.075, 2) <> i.rebate;

-- "Invoiced to date" on sales orders follows via the trigger from 0017.
update public.invoices i
set rebate = round(i.rebate * public.account_rebate_rate(i.client_id) / 0.075, 2),
    net_value = i.net_value + i.rebate - round(i.rebate * public.account_rebate_rate(i.client_id) / 0.075, 2)
where i.rebate is not null
  and round(i.rebate * public.account_rebate_rate(i.client_id) / 0.075, 2) <> i.rebate;

-- ── Invoices from timesheets: the client's rate on eligible lines ───────────
create or replace function public.create_invoice_from_timesheets(
  p_project_id uuid,
  p_from date,
  p_to date
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  v_invoice_id uuid;
  v_value numeric;
  v_eligible numeric;
  v_vat numeric;
  v_total numeric;
  v_rebate numeric;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid period (from must be on or before to).';
  end if;

  select s.* into so
  from public.projects p
  join public.sales_orders s on s.id = p.sales_order_id
  where p.id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;

  select round(sum(b.days * b.day_rate), 2),
         round(coalesce(sum(b.days * b.day_rate) filter (where public.rebate_eligible_type(b.line_type)), 0), 2)
    into v_value, v_eligible
  from public.billable_timesheet_days(p_project_id, p_from, p_to) b;

  if v_value is null then
    raise exception 'There are no approved, uninvoiced timesheets on this project between % and %.',
      to_char(p_from, 'DD/MM/YYYY'), to_char(p_to, 'DD/MM/YYYY');
  end if;

  v_vat := round(v_value * 0.2, 2);
  v_total := v_value + v_vat;
  v_rebate := round(v_eligible * public.account_rebate_rate(so.client_id), 2);

  insert into public.invoices (
    sales_order_id, quote_id, client_id, end_client_id, po_number,
    invoice_date, invoice_period_from, invoice_period_to,
    value, vat, total, rebate, net_value, status
  ) values (
    so.id, so.quote_id, so.client_id, so.end_client_id, so.po_number,
    current_date, p_from, p_to,
    v_value, v_vat, v_total, v_rebate, v_total - v_rebate, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, sort_order, description, line_type, qty, unit_price)
  select v_invoice_id,
         row_number() over (order by min(sort_order), line_id) - 1,
         coalesce(nullif(trim(part_code), ''), line_type),
         line_type,
         sum(days), day_rate
  from public.billable_timesheet_days(p_project_id, p_from, p_to)
  group by line_id, part_code, line_type, day_rate;

  update public.timesheet_entries
  set invoice_id = v_invoice_id
  where id in (select entry_id from public.billable_timesheet_days(p_project_id, p_from, p_to));

  return v_invoice_id;
end;
$$;

commit;

-- ── To undo the recalculation (run by hand if ever needed) ──────────────────
-- update public.quotes x set rebate = b.rebate, net_value = b.net_value from public.rebate_rate_backup b
--   where b.record_type = 'quote' and b.record_id = x.id;
-- update public.sales_orders x set rebate = b.rebate, net_value = b.net_value from public.rebate_rate_backup b
--   where b.record_type = 'sales_order' and b.record_id = x.id;
-- update public.invoices x set rebate = b.rebate, net_value = b.net_value from public.rebate_rate_backup b
--   where b.record_type = 'invoice' and b.record_id = x.id;
