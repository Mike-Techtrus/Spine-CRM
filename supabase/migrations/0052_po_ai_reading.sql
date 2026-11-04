-- 0052: keep what the AI read from an attached PO (read-po Edge Function),
-- so the result shows again on the sales order without paying to re-read it.

begin;

alter table public.sales_order_files
  add column ai_reading jsonb,
  add column ai_read_at timestamptz,
  add column ai_model text;

comment on column public.sales_order_files.ai_reading is
  'What the read-po Edge Function read from the file: PO number, date, values, lines. A suggestion only — never applied without someone pressing "Use these figures".';

commit;
