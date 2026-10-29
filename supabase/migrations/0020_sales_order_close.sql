-- Lets a sales order be closed before it's fully invoiced (e.g. the client
-- cut the work short). Closed orders show as "Closed" instead of
-- part-invoiced, and can be reopened. The invoicing status and the balance
-- still to invoice (net_value − invoiced_to_date, see 0017) are worked out in
-- the app — see invoicingStatus() in src/lib/types.ts.

alter table public.sales_orders
  add column closed_at timestamptz,
  add column closed_reason text;

comment on column public.sales_orders.closed_at is
  'Set when the order was closed without (or regardless of) being fully invoiced; null = open.';
