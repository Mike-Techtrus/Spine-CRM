-- READ-ONLY preview of migration 0030_rebate_by_line_type.sql.
-- Nothing here changes any data — both queries only SELECT.
-- Run BEFORE the migration (afterwards the figures have already changed).
--
-- In the Supabase SQL Editor, highlight one query at a time and click Run
-- (the editor only shows the result of the last query it runs).
--
-- Mirrors the migration's rules: Resource and Outsource Resource earn rebate,
-- other known line types don't, blank/unknown types do. Quote lines take
-- their part code's line type from Rate cards. Invoices made from timesheets
-- are all resource lines, so they don't change.


-- ═══ Query 1: summary ═══════════════════════════════════════════════════════
with
eligible_types as (
  select lower(name) as name, name in ('Resource', 'Outsource Resource') as eligible
  from public.line_types
),
lines as (
  select ql.quote_id, ql.line_total, ql.line_type as old_type,
         coalesce(li_by_id.line_type, li_by_code.line_type, ql.line_type) as new_type
  from public.quote_lines ql
  left join public.line_items li_by_id on li_by_id.id = ql.line_item_id
  left join public.line_items li_by_code
    on ql.line_item_id is null and lower(li_by_code.part_code) = lower(trim(ql.part_code))
),
lines_e as (
  select l.*, coalesce(et.eligible, true) as eligible
  from lines l
  left join eligible_types et on et.name = lower(trim(l.new_type))
),
quote_share as (
  select quote_id,
         greatest(least(coalesce(sum(line_total) filter (where eligible), 0) / sum(line_total), 1), 0) as share
  from lines_e
  group by quote_id
  having sum(line_total) > 0
),
changes as (
  select 'Quotes' as kind, q.rebate as old_rebate, round(q.rebate * s.share, 2) as new_rebate
  from public.quotes q
  join quote_share s on s.quote_id = q.id
  where q.rebate is not null and s.share < 1
  union all
  select 'Sales orders', so.rebate, round(so.rebate * s.share, 2)
  from public.sales_orders so
  join quote_share s on s.quote_id = so.quote_id
  where so.rebate is not null and s.share < 1
  union all
  select 'Invoices', i.rebate, round(i.rebate * s.share, 2)
  from public.invoices i
  left join public.sales_orders so on so.id = i.sales_order_id
  join quote_share s on s.quote_id = coalesce(i.quote_id, so.quote_id)
  where i.rebate is not null and s.share < 1
    and not exists (select 1 from public.timesheet_entries t where t.invoice_id = i.id)
)
select kind as "What",
       count(*) as "Records changing",
       sum(old_rebate) as "Rebate now (£)",
       sum(new_rebate) as "Rebate after (£)",
       sum(old_rebate - new_rebate) as "Net value goes up by (£)"
from changes
group by kind
union all
select 'Quote lines getting a new line type', count(*), null, null, null
from lines
where new_type is distinct from old_type
order by 1;


-- ═══ Query 2: every record that changes, biggest first ══════════════════════
with
eligible_types as (
  select lower(name) as name, name in ('Resource', 'Outsource Resource') as eligible
  from public.line_types
),
lines as (
  select ql.quote_id, ql.line_total,
         coalesce(li_by_id.line_type, li_by_code.line_type, ql.line_type) as new_type
  from public.quote_lines ql
  left join public.line_items li_by_id on li_by_id.id = ql.line_item_id
  left join public.line_items li_by_code
    on ql.line_item_id is null and lower(li_by_code.part_code) = lower(trim(ql.part_code))
),
lines_e as (
  select l.*, coalesce(et.eligible, true) as eligible
  from lines l
  left join eligible_types et on et.name = lower(trim(l.new_type))
),
quote_share as (
  select quote_id,
         greatest(least(coalesce(sum(line_total) filter (where eligible), 0) / sum(line_total), 1), 0) as share
  from lines_e
  group by quote_id
  having sum(line_total) > 0
)
select 'Quote' as "Type", q.quote_number as "Number", a.name as "Client",
       round(s.share * 100, 1) as "Resource share %",
       q.rebate as "Rebate now (£)", round(q.rebate * s.share, 2) as "Rebate after (£)",
       q.rebate - round(q.rebate * s.share, 2) as "Difference (£)"
from public.quotes q
join quote_share s on s.quote_id = q.id
left join public.accounts a on a.id = q.client_id
where q.rebate is not null and s.share < 1
union all
select 'Sales order', so.reference, a.name, round(s.share * 100, 1),
       so.rebate, round(so.rebate * s.share, 2), so.rebate - round(so.rebate * s.share, 2)
from public.sales_orders so
join quote_share s on s.quote_id = so.quote_id
left join public.accounts a on a.id = so.client_id
where so.rebate is not null and s.share < 1
union all
select 'Invoice', i.invoice_number, a.name, round(s.share * 100, 1),
       i.rebate, round(i.rebate * s.share, 2), i.rebate - round(i.rebate * s.share, 2)
from public.invoices i
left join public.sales_orders so on so.id = i.sales_order_id
join quote_share s on s.quote_id = coalesce(i.quote_id, so.quote_id)
left join public.accounts a on a.id = i.client_id
where i.rebate is not null and s.share < 1
  and not exists (select 1 from public.timesheet_entries t where t.invoice_id = i.id)
order by 7 desc;
