-- Bundled expenses: part of a day rate that is really expenses.
--
-- Some jobs (often BHFT, sometimes others) are quoted to CDW at an inflated
-- day rate = the CDW rate-card rate + travel/subsistence expenses. The
-- customer only ever sees the one rate, but rebate is only given on the
-- labour part. expenses_included (per unit/day) records the expenses part on
-- quote, project and invoice lines; labour part = unit price − expenses.
--
--  • quote_lines / project_lines / invoice_lines.expenses_included
--  • carried quote → project (create_project_from_sales_order) → invoice
--    (create_invoice_from_timesheets, whose stored rebate now excludes it)
--  • Default rate card: Team Lead corrected to £535 (it held a bundled BHFT
--    price, £716.16) and the missing roles from CDW's rate card added
--    (L5–L7, PM2, PM3, Technical Delivery Manager, Programme Manager).
--  • One-off backfill for 2026 quotes agreed with Mike (Nov 2026): each adds
--    the same amount per day to every resource line —
--      T11448, T11427, T11423, T11421 (BHFT) £181.16; T11436 (BHFT) £123.82;
--      T11433 (Gloucestershire) £224.00; T11415 (ARM) £72.00;
--      T11417 (CPFT) line price − rate card (£155.60 / £155.62).
--      T11451 (BHFT) £20.00 (confirmed by Mike).
--    Invoice lines on those quotes' invoices get the amount of the quote line
--    with the same price.

begin;

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.quote_lines add column expenses_included numeric(10, 2) check (expenses_included is null or expenses_included >= 0);
alter table public.project_lines add column expenses_included numeric(10, 2) check (expenses_included is null or expenses_included >= 0);
alter table public.invoice_lines add column expenses_included numeric(10, 2) check (expenses_included is null or expenses_included >= 0);

comment on column public.quote_lines.expenses_included is 'Per unit: how much of unit_cost is bundled expenses (no rebate on it). Not shown to the customer (0047).';
comment on column public.project_lines.expenses_included is 'Per day: how much of day_rate is bundled expenses, copied from the quote line (0047).';
comment on column public.invoice_lines.expenses_included is 'Per unit: how much of unit_price is bundled expenses (no rebate on it) (0047).';

-- ── Rate card ───────────────────────────────────────────────────────────────

update public.rate_card_prices p
set unit_cost = 535
from public.line_items li, public.rate_cards rc
where li.id = p.line_item_id and rc.id = p.rate_card_id and rc.is_default
  and li.part_code = 'Team Lead' and p.unit_cost = 716.16;

update public.line_items set description = 'Associate Project Manager (PM1)'
where part_code = 'Project Manager' and description is null;

with new_items(part_code, description, price) as (values
  ('L5 Technical Consultant', 'Technical Consultant (L5)', 710.00),
  ('L6 Senior Technical Consultant', 'Senior Technical Consultant (L6)', 930.00),
  ('L7 Principal Consultant', 'Principal Consultant (L7)', 1050.00),
  ('Project Manager PM2', 'Project Manager (PM2)', 710.00),
  ('Senior Project Manager PM3', 'Senior Project Manager (PM3)', 930.00),
  ('Technical Delivery Manager', 'Technical Delivery Manager', 1250.00),
  ('Programme Manager', 'Programme Manager', 1250.00)
), inserted as (
  insert into public.line_items (line_type, part_code, description)
  select 'Outsource Resource', n.part_code, n.description from new_items n
  where not exists (select 1 from public.line_items li where lower(li.part_code) = lower(n.part_code))
  returning id, part_code
)
insert into public.rate_card_prices (rate_card_id, line_item_id, unit_cost)
select (select id from public.rate_cards where is_default), i.id, n.price
from inserted i join new_items n on n.part_code = i.part_code;

-- ── Carry through quote → project → invoice ─────────────────────────────────

create or replace function public.create_project_from_sales_order(p_sales_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  v_name text;
  v_project_id uuid;
begin
  if not (public.can_write('sales_orders') or public.can_write('projects')) then
    raise exception 'You need the Sales Orders or Projects area to create a project.';
  end if;

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
    (project_id, quote_line_id, line_item_id, line_type, part_code, description, quoted_days, day_rate, expenses_included, sort_order)
  select
    v_project_id, ql.id, ql.line_item_id, coalesce(li.line_type, ql.line_type), ql.part_code,
    nullif(concat_ws(' — ', nullif(trim(ql.description), ''), nullif(trim(ql.description_2), '')), ''),
    ql.qty, ql.unit_cost, ql.expenses_included, ql.sort_order
  from public.quote_lines ql
  left join public.line_items li on li.id = ql.line_item_id
  join public.line_types lt on lower(lt.name) = lower(coalesce(li.line_type, ql.line_type))
  where ql.quote_id = so.quote_id
    and lt.billing = 'timesheet';

  return v_project_id;
end;
$$;

drop function public.billable_timesheet_days(uuid, date, date);

create function public.billable_timesheet_days(p_project_id uuid, p_from date, p_to date)
returns table (entry_id uuid, line_id uuid, part_code text, line_type text, day_rate numeric, expenses_included numeric, sort_order int, days numeric)
language sql
stable
set search_path = public
as $$
  select t.id, pl.id, pl.part_code, pl.line_type, pl.day_rate, pl.expenses_included, pl.sort_order, public.day_type_days(t.day_type)
  from public.timesheet_entries t
  join public.project_assignments pa on pa.id = t.project_assignment_id
  join public.project_lines pl on pl.id = pa.project_line_id
  where pl.project_id = p_project_id
    and t.status = 'approved'
    and t.invoice_id is null
    and t.work_date between p_from and p_to;
$$;

create or replace function public.create_invoice_from_timesheets(p_project_id uuid, p_from date, p_to date)
returns uuid
language plpgsql
security definer
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
  v_terms int;
begin
  if not (public.can_write('projects') or public.can_write('invoices')) then
    raise exception 'You need the Projects or Invoices area to invoice timesheets.';
  end if;

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

  -- Rebate is on the labour part only (day rate less any bundled expenses, 0047).
  select round(sum(b.days * b.day_rate), 2),
         round(coalesce(sum(b.days * (b.day_rate - coalesce(b.expenses_included, 0)))
                          filter (where public.rebate_eligible_type(b.line_type)), 0), 2)
    into v_value, v_eligible
  from public.billable_timesheet_days(p_project_id, p_from, p_to) b;

  if v_value is null then
    raise exception 'There are no approved, uninvoiced timesheets on this project between % and %.',
      to_char(p_from, 'DD/MM/YYYY'), to_char(p_to, 'DD/MM/YYYY');
  end if;

  v_vat := round(v_value * 0.2, 2);
  v_total := v_value + v_vat;
  v_rebate := round(v_eligible * public.account_rebate_rate(so.client_id), 2);
  v_terms := coalesce((select a.payment_terms_days from public.accounts a where a.id = so.client_id), 30);

  insert into public.invoices (
    sales_order_id, quote_id, client_id, end_client_id, po_number,
    invoice_date, due_date, invoice_period_from, invoice_period_to,
    value, vat, total, rebate, net_value, status
  ) values (
    so.id, so.quote_id, so.client_id, so.end_client_id, so.po_number,
    current_date, current_date + v_terms, p_from, p_to,
    v_value, v_vat, v_total, v_rebate, v_total - v_rebate, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, sort_order, description, line_type, qty, unit_price, expenses_included)
  select v_invoice_id,
         row_number() over (order by min(sort_order), line_id) - 1,
         coalesce(nullif(trim(part_code), ''), line_type),
         line_type,
         sum(days), day_rate, expenses_included
  from public.billable_timesheet_days(p_project_id, p_from, p_to)
  group by line_id, part_code, line_type, day_rate, expenses_included;

  update public.timesheet_entries
  set invoice_id = v_invoice_id
  where id in (select entry_id from public.billable_timesheet_days(p_project_id, p_from, p_to));

  return v_invoice_id;
end;
$$;

-- ── One-off backfill (2026 quotes, agreed Nov 2026) ─────────────────────────

set local spine.skip_audit = 'on';

with agreed(quote_number, per_day) as (values
  ('T11448', 181.16), ('T11427', 181.16), ('T11423', 181.16), ('T11421', 181.16),
  ('T11436', 123.82), ('T11433', 224.00), ('T11415', 72.00), ('T11451', 20.00)
)
update public.quote_lines ql
set expenses_included = a.per_day
from public.quotes q
join agreed a on a.quote_number = q.quote_number
where ql.quote_id = q.id
  and ql.line_type in ('Resource', 'Outsource Resource')
  and ql.unit_cost > a.per_day;

-- T11417 (CPFT): price over the rate card, line by line.
update public.quote_lines ql
set expenses_included = round(ql.unit_cost - p.unit_cost, 2)
from public.quotes q, public.rate_card_prices p, public.rate_cards rc
where q.quote_number = 'T11417' and ql.quote_id = q.id
  and p.line_item_id = ql.line_item_id and rc.id = p.rate_card_id and rc.is_default
  and ql.line_type in ('Resource', 'Outsource Resource')
  and ql.unit_cost > p.unit_cost;

-- Invoice lines on those quotes' invoices: same price as a bundled quote line → same expenses.
update public.invoice_lines il
set expenses_included = m.per_day
from (
  select il2.id, max(ql.expenses_included) as per_day
  from public.invoice_lines il2
  join public.invoices i on i.id = il2.invoice_id
  join public.quote_lines ql on ql.quote_id = i.quote_id and ql.expenses_included is not null
    and abs(ql.unit_cost - il2.unit_price) < 0.005
  group by il2.id
) m
where m.id = il.id;

commit;
