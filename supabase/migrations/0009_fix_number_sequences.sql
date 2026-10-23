-- The quote/sales-order/invoice number generators were never updated after
-- the real historical records were imported, so they were minting
-- "Q-000001", "SO-000001", "INV-000001" style numbers from a sequence that
-- had no relationship to the imported "T11443", "SO10593", "INV12366"
-- style numbers already in use. New quotes should continue the existing
-- "T#####" series (etc), not start a parallel, differently-formatted one.
--
-- (Opportunities already went through this same fix in
-- 0003/0004/0005_*.sql, so they're untouched here.)

-- Quotes: T#####, continuing from the highest imported T-number.
alter table public.quotes
  alter column quote_number set default ('T' || nextval('quote_number_seq'));

select setval(
  'quote_number_seq',
  (select coalesce(max(substring(quote_number from '[0-9]+')::bigint), 0)
   from public.quotes
   where quote_number ~ '^T[0-9]+$')
);

-- Sales orders: SO#####, continuing from the highest imported SO-number.
alter table public.sales_orders
  alter column reference set default ('SO' || nextval('sales_order_reference_seq'));

select setval(
  'sales_order_reference_seq',
  (select coalesce(max(substring(reference from '[0-9]+')::bigint), 0)
   from public.sales_orders
   where reference ~ '^SO[0-9]+$')
);

-- Invoices: INV#####, continuing from the highest imported INV-number.
alter table public.invoices
  alter column invoice_number set default ('INV' || nextval('invoice_number_seq'));

select setval(
  'invoice_number_seq',
  (select coalesce(max(substring(invoice_number from '[0-9]+')::bigint), 0)
   from public.invoices
   where invoice_number ~ '^INV[0-9]+$')
);
