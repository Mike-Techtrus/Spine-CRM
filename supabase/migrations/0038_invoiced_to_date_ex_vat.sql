-- Invoiced to date in Value ex VAT (was net value: total inc VAT − rebate, 0017).
--
-- sales_orders.invoiced_to_date = sum of linked invoices' Value (ex VAT),
-- still excluding draft and cancelled invoices. The app compares it with the
-- order's value ex VAT (Total − VAT; salesOrderValueExVat() in types.ts) for
-- the Balance to invoice and invoicing status.
--
-- Recalculates every sales order once. Preview on the live data (Nov 2026):
-- 4 orders move to Fully invoiced (2 from Part, 2 from Over); all others keep
-- their status.

begin;

create or replace function public.recalc_invoiced_to_date(so_id uuid)
returns void
language sql
as $$
  update public.sales_orders so
  set invoiced_to_date = t.invoiced
  from (
    select sum(value) as invoiced
    from public.invoices
    where sales_order_id = so_id and status not in ('cancelled', 'draft')
  ) t
  where so.id = so_id
    and so.invoiced_to_date is distinct from t.invoiced;
$$;

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
          or new.value is distinct from old.value or new.status is distinct from old.status) then
    perform public.recalc_invoiced_to_date(new.sales_order_id);
  end if;
  return null;
end;
$$;

select public.recalc_invoiced_to_date(id) from public.sales_orders;

comment on column public.sales_orders.invoiced_to_date is
  'Sum of linked invoices'' Value (ex VAT), excluding draft and cancelled. Kept up to date by a trigger on invoices (0017, 0038).';

commit;
