-- 0051: a copy of the customer's PO (or several — e.g. an amended PO) on a sales order.
--
--   • sales_order_files — one row per uploaded file; the file itself is in the
--     private "sales-order-files" bucket under {sales order id}/…
--   • Same pattern as the other pipeline tables (0039): any staff can read,
--     changes need the Sales Orders area.

begin;

create table public.sales_order_files (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now()
);

comment on table public.sales_order_files is
  'Copies of the customer PO attached to a sales order. Files are in the private "sales-order-files" bucket.';

create index sales_order_files_sales_order_id_idx on public.sales_order_files (sales_order_id);
create index sales_order_files_uploaded_by_idx on public.sales_order_files (uploaded_by);

alter table public.sales_order_files enable row level security;

create policy sales_order_files_select_staff on public.sales_order_files
  for select using ((select public.is_staff()));
create policy sales_order_files_write on public.sales_order_files
  for all using ((select public.can_write('sales_orders'))) with check ((select public.can_write('sales_orders')));

-- ── Storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sales-order-files', 'sales-order-files', false, 10485760, -- 10 MB
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy sales_order_files_storage_select on storage.objects
  for select using (bucket_id = 'sales-order-files' and (select public.is_staff()));
create policy sales_order_files_storage_insert on storage.objects
  for insert with check (bucket_id = 'sales-order-files' and (select public.can_write('sales_orders')));
create policy sales_order_files_storage_delete on storage.objects
  for delete using (bucket_id = 'sales-order-files' and (select public.can_write('sales_orders')));

commit;
