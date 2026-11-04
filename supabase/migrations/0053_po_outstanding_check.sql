-- 0053: chasing POs for sales orders that went ahead without one.
--
-- "Proceeding without a PO" now stays ticked once the PO arrives (with the
-- note of who approved it), so the order's record shows it went ahead early;
-- the PO number + received date show it has since arrived. This adds a Data
-- checks group, so_po_outstanding: open orders that went ahead without a PO
-- and still have no PO number. Same view as 0045 plus that one branch.

begin;

create or replace view public.data_checks
with (security_invoker = true)
as
with so as (
  select s.*,
    case when s.total is not null then s.total - coalesce(s.vat, 0) else coalesce(s.po_value, s.quote_value) end as ex_vat
  from public.sales_orders s
),
problems as (
  -- Sales orders
  select 'so_over_invoiced'::text as check_key, 'sales_order'::text as record_type, so.id as record_id, so.reference,
    'Ordered £' || to_char(coalesce(so.ex_vat, 0), 'FM999,999,990.00') || ' ex VAT, invoiced £' || to_char(so.invoiced_to_date, 'FM999,999,990.00') as detail,
    round(so.invoiced_to_date - coalesce(so.ex_vat, 0), 2) as amount, so.created_at::date as since
  from so where so.closed_at is null and so.invoiced_to_date - coalesce(so.ex_vat, 0) > 0.05

  union all
  select 'so_no_value', 'sales_order', so.id, so.reference,
    'Quote value £' || to_char(so.quote_value, 'FM999,999,990.00') || ' but no Total / PO value on the order',
    so.quote_value, so.created_at::date
  from so where coalesce(so.total, 0) = 0 and coalesce(so.po_value, 0) = 0 and coalesce(so.quote_value, 0) > 0 and so.closed_at is null

  union all
  select 'so_not_invoiced_old', 'sales_order', so.id, so.reference,
    'Open for over a year with nothing invoiced', so.ex_vat, so.created_at::date
  from so where so.closed_at is null and coalesce(so.invoiced_to_date, 0) = 0 and so.created_at < now() - interval '12 months'

  union all
  select 'so_part_invoiced_stalled', 'sales_order', so.id, so.reference,
    '£' || to_char(so.ex_vat - so.invoiced_to_date, 'FM999,999,990.00') || ' still to invoice; no invoice in the last 12 months',
    round(so.ex_vat - so.invoiced_to_date, 2), so.created_at::date
  from so where so.closed_at is null and so.invoiced_to_date > 0 and so.ex_vat - so.invoiced_to_date > 0.05
    and not exists (select 1 from public.invoices i where i.sales_order_id = so.id and i.invoice_date > current_date - 365)

  union all
  select 'so_no_quote', 'sales_order', so.id, so.reference, 'Not linked to a quote', so.ex_vat, so.created_at::date
  from so where so.quote_id is null

  union all
  select 'so_po_outstanding', 'sales_order', so.id, so.reference,
    'Went ahead without a PO' || coalesce(' — ' || nullif(trim(so.exception_notes), ''), '') ||
      case when so.invoiced_to_date > 0 then ' (£' || to_char(so.invoiced_to_date, 'FM999,999,990.00') || ' already invoiced)' else '' end,
    so.ex_vat, so.created_at::date
  from so where so.closed_at is null and so.advanced_without_po and coalesce(trim(so.po_number), '') = ''

  -- Invoices
  union all
  select 'inv_no_sales_order', 'invoice', i.id, i.invoice_number, 'Not linked to a sales order', i.value, i.invoice_date
  from public.invoices i where i.sales_order_id is null and i.status <> 'cancelled'

  union all
  select 'inv_no_value', 'invoice', i.id, i.invoice_number, 'No value (£0) — status ' || i.status, null, i.invoice_date
  from public.invoices i where coalesce(i.value, 0) = 0 and i.status <> 'cancelled'

  union all
  select 'inv_overdue_90', 'invoice', i.id, i.invoice_number,
    'Sent, due ' || to_char(i.due_date, 'DD/MM/YYYY') || ' — over 90 days overdue (or the payment isn''t recorded)', i.total, i.due_date
  from public.invoices i where i.status = 'sent' and i.due_date < current_date - 90

  union all
  select 'inv_client_mismatch', 'invoice', i.id, i.invoice_number,
    case when i.client_id is null then 'No client (the sales order''s client is ' || coalesce(sc.name, '—') || ')'
         else 'Client ' || coalesce(ic.name, '—') || ' but the sales order''s client is ' || coalesce(sc.name, '—') end,
    i.value, i.invoice_date
  from public.invoices i
  join public.sales_orders s on s.id = i.sales_order_id
  left join public.accounts ic on ic.id = i.client_id
  left join public.accounts sc on sc.id = s.client_id
  where i.client_id is distinct from s.client_id

  -- Quotes
  union all
  select 'quote_accepted_no_so', 'quote', q.id, q.quote_number, 'Accepted but no sales order', q.value, q.quote_date
  from public.quotes q where q.status = 'accepted' and not exists (select 1 from public.sales_orders s where s.quote_id = q.id)

  union all
  select 'quote_no_value', 'quote', q.id, q.quote_number, 'No value (£0) — status ' || q.status, null, q.quote_date
  from public.quotes q where coalesce(q.value, 0) = 0 and q.status in ('draft', 'sent', 'accepted')
)
select p.*
from problems p
where not exists (
  select 1 from public.data_check_dismissals d where d.check_key = p.check_key and d.record_id = p.record_id
);

comment on view public.data_checks is 'Records that look wrong or stuck, for Admin → Data checks (0045, 0053). Dismissed ones are left out.';

commit;
