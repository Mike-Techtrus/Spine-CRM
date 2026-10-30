-- Payment terms per account. Run after 0031_account_rebate_rate.sql.
--
--   accounts.payment_terms_days — days to pay, from the invoice date.
--                                 Standard is 30; change per client on
--                                 Admin → Customer Accounts → Edit.
--
-- The invoice form fills in Due date = invoice date + the client's terms
-- (still editable), and the printed invoice's "Terms" shows them
-- ("30 Days"). Existing invoices' due dates are left as they are.
-- create_invoice_from_timesheets now sets the due date the same way.

begin;

alter table public.accounts
  add column payment_terms_days int not null default 30
  check (payment_terms_days between 0 and 365);

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
  v_terms int;
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
  v_rebate := round(v_eligible * public.account_rebate_rate(so.client_id), 2);
  v_terms := coalesce((select a.payment_terms_days from public.accounts a where a.id = so.client_id), 30);

  insert into public.invoices (
    sales_order_id, quote_id, client_id, end_client_id, po_number,
    invoice_date, due_date, invoice_period_from, invoice_period_to,
    value, vat, total, rebate, net_value, status
  ) values (
    so.id, so.quote_id, so.client_id, so.end_client_id, so.po_number,
    current_date, current_date + v_terms, p_from, p_to,
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
