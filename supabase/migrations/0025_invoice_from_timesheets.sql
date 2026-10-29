-- Projects phase 3: build an invoice from approved project timesheets.
--
-- timesheet_entries.invoice_id records which invoice a timesheet day was
-- billed on, so nothing is invoiced twice. Deleting that invoice frees its
-- days again (on delete set null).
--
-- create_invoice_from_timesheets(project, from, to) makes a DRAFT invoice for
-- the project's sales order from approved, not-yet-invoiced days in that
-- period: one invoice line per project line (days × the quoted day rate),
-- Value/VAT/Total/Rebate/Net worked out the usual way (VAT 20%, rebate 7.5%,
-- net = total − rebate). Manual lines (expenses etc.) are added on the invoice
-- afterwards. Runs as the caller, so RLS applies.
--
-- Invoiced days are locked: they can't be edited, un-approved or deleted while
-- on an invoice.

alter table public.timesheet_entries
  add column invoice_id uuid references public.invoices (id) on delete set null;

create index timesheet_entries_invoice_idx on public.timesheet_entries (invoice_id);

create or replace function public.timesheet_entries_lock_invoiced()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_id is not null then
      raise exception '% has been invoiced, so it can''t be deleted.', old.reference;
    end if;
    return old;
  end if;
  -- Changing invoice_id itself (billing it, or the invoice being deleted) is fine.
  if old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id
     and (new.status is distinct from old.status or new.day_type is distinct from old.day_type
          or new.work_date is distinct from old.work_date
          or new.project_assignment_id is distinct from old.project_assignment_id) then
    raise exception '% has been invoiced, so it can''t be changed.', old.reference;
  end if;
  return new;
end;
$$;

create trigger timesheet_entries_lock_invoiced
  before update or delete on public.timesheet_entries
  for each row execute function public.timesheet_entries_lock_invoiced();

-- Approved, not-yet-invoiced project days in a period, with their line and rate.
create or replace function public.billable_timesheet_days(p_project_id uuid, p_from date, p_to date)
returns table (entry_id uuid, line_id uuid, part_code text, line_type text, day_rate numeric, sort_order int, days numeric)
language sql
stable
set search_path = public
as $$
  select t.id, pl.id, pl.part_code, pl.line_type, pl.day_rate, pl.sort_order, public.day_type_days(t.day_type)
  from public.timesheet_entries t
  join public.project_assignments pa on pa.id = t.project_assignment_id
  join public.project_lines pl on pl.id = pa.project_line_id
  where pl.project_id = p_project_id
    and t.status = 'approved'
    and t.invoice_id is null
    and t.work_date between p_from and p_to;
$$;

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
  v_vat numeric;
  v_total numeric;
  v_rebate numeric;
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

  select round(sum(b.days * b.day_rate), 2) into v_value
  from public.billable_timesheet_days(p_project_id, p_from, p_to) b;

  if v_value is null then
    raise exception 'There are no approved, uninvoiced timesheets on this project between % and %.',
      to_char(p_from, 'DD/MM/YYYY'), to_char(p_to, 'DD/MM/YYYY');
  end if;

  v_vat := round(v_value * 0.2, 2);
  v_total := v_value + v_vat;
  v_rebate := round(v_value * 0.075, 2);

  insert into public.invoices (
    sales_order_id, quote_id, client_id, end_client_id, po_number,
    invoice_date, invoice_period_from, invoice_period_to,
    value, vat, total, rebate, net_value, status
  ) values (
    so.id, so.quote_id, so.client_id, so.end_client_id, so.po_number,
    current_date, p_from, p_to,
    v_value, v_vat, v_total, v_rebate, v_total - v_rebate, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, sort_order, description, qty, unit_price)
  select v_invoice_id,
         row_number() over (order by min(sort_order), line_id) - 1,
         coalesce(nullif(trim(part_code), ''), line_type),
         sum(days), day_rate
  from public.billable_timesheet_days(p_project_id, p_from, p_to)
  group by line_id, part_code, line_type, day_rate;

  update public.timesheet_entries
  set invoice_id = v_invoice_id
  where id in (select entry_id from public.billable_timesheet_days(p_project_id, p_from, p_to));

  return v_invoice_id;
end;
$$;
