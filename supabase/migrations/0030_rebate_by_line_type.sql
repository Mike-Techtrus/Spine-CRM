-- Rebate by line type.
--
-- The 7.5% rebate only applies to day-rate resource work (Resource,
-- Outsource Resource) — not Expenses, Logistics, Licensing or Hardware.
-- Until now it was worked out as 7.5% of the whole Value.
--
--   line_types.rebate_eligible — tick box per line type (Admin → Rate cards).
--   invoice_lines.line_type    — so invoices can follow the same rule.
--   rebate_eligible_type(t)    — true if that line type earns rebate. Blank or
--                                unknown types keep the old rule (they earn it),
--                                so records without line detail don't change.
--
-- One-off recalculation of existing records. Old figures are kept in
-- rebate_recalc_backup so this can be undone (see the end of this file).
--   1. Quote lines take the line type of their categorised part code
--      (Admin → Rate cards), matched by line item, else by part code.
--   2. Each quote with lines gets an eligible share = eligible lines ÷ all
--      lines. Its rebate is scaled by that share, and Net value moves by the
--      same amount the rebate does (net = total − rebate).
--   3. Sales orders use their quote's share.
--   4. Invoices made from timesheets get line types on their lines. Invoices
--      with typed lines use their own share; others use their quote's share
--      (directly, or through their sales order), so a sales order and its
--      invoices stay in step and "Invoiced to date" (trigger from 0017)
--      follows automatically.
-- From now on the quote and invoice forms work the rebate out per line.
-- Ticking or unticking a line type later only affects new or re-saved records.
--
-- Runs as one transaction: it all applies, or (on any error) none of it does.

begin;

-- ── Line types: which earn rebate ───────────────────────────────────────────
alter table public.line_types
  add column rebate_eligible boolean not null default false;

update public.line_types set rebate_eligible = true
  where name in ('Resource', 'Outsource Resource');

create or replace function public.rebate_eligible_type(p_line_type text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select lt.rebate_eligible from public.line_types lt where lower(lt.name) = lower(trim(p_line_type))),
    true
  );
$$;

-- ── Invoice lines get a line type ───────────────────────────────────────────
alter table public.invoice_lines
  add column line_type text; -- free text like quote_lines; null = not given (earns rebate, old rule)

-- ── Backup of everything this migration changes ─────────────────────────────
create table public.rebate_recalc_backup (
  record_type text not null, -- 'quote_line' | 'quote' | 'sales_order' | 'invoice'
  record_id uuid not null,
  line_type text,            -- quote lines
  rebate numeric(12, 2),     -- quotes, sales orders, invoices
  net_value numeric(12, 2),
  saved_at timestamptz not null default now(),
  primary key (record_type, record_id)
);

alter table public.rebate_recalc_backup enable row level security;
create policy "rebate_recalc_backup_select_admin" on public.rebate_recalc_backup
  for select using (public.is_admin());

-- ── 1. Quote lines take their categorised line type ─────────────────────────
create temp table tmp_line_master on commit drop as
select ql.id, coalesce(li_by_id.id, li_by_code.id) as line_item_id,
       coalesce(li_by_id.line_type, li_by_code.line_type) as line_type
from public.quote_lines ql
left join public.line_items li_by_id on li_by_id.id = ql.line_item_id
left join public.line_items li_by_code
  on ql.line_item_id is null and lower(li_by_code.part_code) = lower(trim(ql.part_code));

insert into public.rebate_recalc_backup (record_type, record_id, line_type)
select 'quote_line', ql.id, ql.line_type
from public.quote_lines ql
join tmp_line_master m on m.id = ql.id
where m.line_type is not null and m.line_type is distinct from ql.line_type;

update public.quote_lines ql
set line_type = coalesce(m.line_type, ql.line_type),
    line_item_id = coalesce(ql.line_item_id, m.line_item_id)
from tmp_line_master m
where m.id = ql.id
  and ((m.line_type is not null and m.line_type is distinct from ql.line_type)
       or (ql.line_item_id is null and m.line_item_id is not null));

-- ── 2. Quotes ───────────────────────────────────────────────────────────────
create temp table tmp_quote_share on commit drop as
select quote_id,
       greatest(least(
         coalesce(sum(line_total) filter (where public.rebate_eligible_type(line_type)), 0) / sum(line_total),
       1), 0) as share
from public.quote_lines
group by quote_id
having sum(line_total) > 0;

insert into public.rebate_recalc_backup (record_type, record_id, rebate, net_value)
select 'quote', q.id, q.rebate, q.net_value
from public.quotes q
join tmp_quote_share s on s.quote_id = q.id
where q.rebate is not null and s.share < 1;

update public.quotes q
set rebate = round(q.rebate * s.share, 2),
    net_value = q.net_value + q.rebate - round(q.rebate * s.share, 2)
from tmp_quote_share s
where s.quote_id = q.id and q.rebate is not null and s.share < 1;

-- ── 3. Sales orders ─────────────────────────────────────────────────────────
insert into public.rebate_recalc_backup (record_type, record_id, rebate, net_value)
select 'sales_order', so.id, so.rebate, so.net_value
from public.sales_orders so
join tmp_quote_share s on s.quote_id = so.quote_id
where so.rebate is not null and s.share < 1;

update public.sales_orders so
set rebate = round(so.rebate * s.share, 2),
    net_value = so.net_value + so.rebate - round(so.rebate * s.share, 2)
from tmp_quote_share s
where s.quote_id = so.quote_id and so.rebate is not null and s.share < 1;

-- ── 4. Invoices ─────────────────────────────────────────────────────────────
-- Lines on invoices made from timesheets: same description and rate as the
-- project line they were built from (see create_invoice_from_timesheets).
update public.invoice_lines il
set line_type = pl.line_type
from public.timesheet_entries t
join public.project_assignments pa on pa.id = t.project_assignment_id
join public.project_lines pl on pl.id = pa.project_line_id
where t.invoice_id = il.invoice_id
  and il.line_type is null
  and il.description = coalesce(nullif(trim(pl.part_code), ''), pl.line_type)
  and il.unit_price = pl.day_rate;

create temp table tmp_invoice_share on commit drop as
select i.id, coalesce(own.share, qs.share) as share
from public.invoices i
left join (
  select invoice_id,
         greatest(least(
           coalesce(sum(qty * unit_price) filter (where public.rebate_eligible_type(line_type)), 0) / sum(qty * unit_price),
         1), 0) as share
  from public.invoice_lines
  group by invoice_id
  having bool_or(coalesce(trim(line_type), '') <> '') and sum(qty * unit_price) > 0
) own on own.invoice_id = i.id
left join public.sales_orders so on so.id = i.sales_order_id
left join tmp_quote_share qs on qs.quote_id = coalesce(i.quote_id, so.quote_id);

insert into public.rebate_recalc_backup (record_type, record_id, rebate, net_value)
select 'invoice', i.id, i.rebate, i.net_value
from public.invoices i
join tmp_invoice_share s on s.id = i.id
where i.rebate is not null and s.share < 1;

update public.invoices i
set rebate = round(i.rebate * s.share, 2),
    net_value = i.net_value + i.rebate - round(i.rebate * s.share, 2)
from tmp_invoice_share s
where s.id = i.id and i.rebate is not null and s.share < 1;

-- ── Invoices from timesheets: line types + rebate on eligible lines only ────
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
  v_rebate := round(v_eligible * 0.075, 2);

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
-- update public.quote_lines x set line_type = b.line_type from public.rebate_recalc_backup b
--   where b.record_type = 'quote_line' and b.record_id = x.id;
-- update public.quotes x set rebate = b.rebate, net_value = b.net_value from public.rebate_recalc_backup b
--   where b.record_type = 'quote' and b.record_id = x.id;
-- update public.sales_orders x set rebate = b.rebate, net_value = b.net_value from public.rebate_recalc_backup b
--   where b.record_type = 'sales_order' and b.record_id = x.id;
-- update public.invoices x set rebate = b.rebate, net_value = b.net_value from public.rebate_recalc_backup b
--   where b.record_type = 'invoice' and b.record_id = x.id;
