-- READ-ONLY preview of migration 0031_account_rebate_rate.sql.
-- Nothing here changes any data — both queries only SELECT.
-- Highlight one query at a time in the Supabase SQL Editor and click Run.
-- Run before 0031 (it works either side of 0030).


-- ═══ Query 1: accounts that will be given CDW's 7.5% ════════════════════════
-- Every other account gets 0%. If one here shouldn't be CDW (or a CDW account
-- is missing), set it by hand afterwards in Admin → Customer Accounts → Edit.
select name as "Account", billing_name as "Name on invoices", is_active as "Active"
from public.accounts
where name ilike 'cdw%' or billing_name ilike 'cdw%'
order by name;


-- ═══ Query 2: rebate that goes to £0, by client ════════════════════════════
-- Every client not in Query 1 loses its rebate (Net value goes up by the same).
with
cdw as (
  select id from public.accounts where name ilike 'cdw%' or billing_name ilike 'cdw%'
),
affected as (
  select 'Quotes' as kind, client_id, rebate from public.quotes
  union all
  select 'Sales orders', client_id, rebate from public.sales_orders
  union all
  select 'Invoices', client_id, rebate from public.invoices
)
select coalesce(a.name, '(no client)') as "Client",
       count(*) filter (where x.kind = 'Quotes') as "Quotes",
       count(*) filter (where x.kind = 'Sales orders') as "Sales orders",
       count(*) filter (where x.kind = 'Invoices') as "Invoices",
       sum(x.rebate) filter (where x.kind = 'Invoices') as "Invoice rebate removed (£)"
from affected x
left join public.accounts a on a.id = x.client_id
where x.rebate is not null and x.rebate <> 0
  and (x.client_id is null or x.client_id not in (select id from cdw))
group by a.name
order by 5 desc nulls last;
