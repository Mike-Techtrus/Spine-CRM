-- Sales Orders → "Invoiced to date" is now worked out from the order's
-- invoices instead of being typed in (it was a plain column that nothing
-- filled, so every imported order showed blank).
--
-- invoiced_to_date = sum of net_value over invoices linked by
-- sales_order_id, excluding cancelled (and draft, i.e. not yet issued).
-- Net value is what lines up with the sales order's own Net value column.
-- No counted invoices → null (shown as "—").

create or replace function public.recalc_invoiced_to_date(so_id uuid)
returns void
language sql
as $$
  update public.sales_orders so
  set invoiced_to_date = t.invoiced
  from (
    select sum(net_value) as invoiced
    from public.invoices
    where sales_order_id = so_id and status not in ('cancelled', 'draft')
  ) t
  where so.id = so_id
    and so.invoiced_to_date is distinct from t.invoiced; -- skip no-op updates (keeps updated_at honest)
$$;

-- Recalculate whenever an invoice is added, changed (amount, status or the
-- sales order it belongs to) or deleted — for both the old and new order.
create or replace function public.invoices_recalc_invoiced_to_date()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.sales_order_id is not null then
    perform public.recalc_invoiced_to_date(old.sales_order_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.sales_order_id is not null
     and (tg_op = 'INSERT' or new.sales_order_id is distinct from old.sales_order_id
          or new.net_value is distinct from old.net_value or new.status is distinct from old.status) then
    perform public.recalc_invoiced_to_date(new.sales_order_id);
  end if;
  return null;
end;
$$;

create trigger invoices_recalc_invoiced_to_date
  after insert or update or delete on public.invoices
  for each row execute function public.invoices_recalc_invoiced_to_date();

-- Backfill every existing order.
update public.sales_orders so
set invoiced_to_date = t.invoiced
from (
  select so2.id, sum(i.net_value) filter (where i.status not in ('cancelled', 'draft')) as invoiced
  from public.sales_orders so2
  left join public.invoices i on i.sales_order_id = so2.id
  group by so2.id
) t
where so.id = t.id
  and so.invoiced_to_date is distinct from t.invoiced;
