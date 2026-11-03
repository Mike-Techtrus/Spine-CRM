-- 0050: more than one sales order on a project.
--
-- When a project's days run out, extra days are quoted on the same opportunity,
-- the new quote becomes a new sales order (own PO), and that order's day-rate
-- lines are added to the existing project instead of starting a new one.
--
--   • project_lines.sales_order_id — the sales order (and so PO) a line was
--     quoted on. Existing lines get their project's sales order.
--     projects.sales_order_id stays as the project's original order.
--   • add_sales_order_to_project(project, sales order) copies the order's
--     timesheet-billed quote lines onto the project (same client only; not if
--     the order is closed or already on a project; the project must be active).
--   • project_for_sales_order(sales order) — the project an order is on,
--     whether it started the project or was added to it.
--   • project_candidates_for_sales_order(sales order) — active projects for
--     the same client, same-opportunity ones first, for the picker.
--   • create_invoice_from_timesheets gains p_sales_order_id: one draft invoice
--     per sales order, so each PO is billed for its own lines. Left out, it
--     works as before when all the days in the period are on one order.

begin;

alter table public.project_lines
  add column sales_order_id uuid references public.sales_orders (id) on delete restrict;

update public.project_lines pl
set sales_order_id = p.sales_order_id
from public.projects p
where p.id = pl.project_id;

alter table public.project_lines alter column sales_order_id set not null;

create index project_lines_sales_order_id_idx on public.project_lines (sales_order_id);

-- ── Which project is a sales order on? ───────────────────────────────────────

create or replace function public.project_for_sales_order(p_sales_order_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select id from public.projects where sales_order_id = p_sales_order_id),
    (select project_id from public.project_lines where sales_order_id = p_sales_order_id limit 1)
  );
$$;

create or replace function public.project_candidates_for_sales_order(p_sales_order_id uuid)
returns table (id uuid, reference text, name text, same_opportunity boolean)
language sql
stable
set search_path = public
as $$
  select p.id, p.reference, p.name,
         coalesce(pq.opportunity_id = q.opportunity_id, false) as same_opportunity
  from public.sales_orders so
  left join public.quotes q on q.id = so.quote_id
  join public.sales_orders pso on pso.client_id = so.client_id
  join public.projects p on p.sales_order_id = pso.id and p.status = 'active'
  left join public.quotes pq on pq.id = pso.quote_id
  where so.id = p_sales_order_id
  order by 4 desc, p.created_at desc;
$$;

-- ── Create a project (now records each line's sales order) ───────────────────

create or replace function public.create_project_from_sales_order(p_sales_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  v_name text;
  v_project_id uuid;
  v_existing text;
begin
  if not (public.can_write('sales_orders') or public.can_write('projects')) then
    raise exception 'You need the Sales Orders or Projects area to create a project.';
  end if;

  select * into so from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Sales order not found';
  end if;

  select reference into v_existing from public.projects where id = public.project_for_sales_order(p_sales_order_id);
  if v_existing is not null then
    raise exception 'This sales order is already on project %.', v_existing;
  end if;

  select coalesce(nullif(trim(o.name), ''), so.reference) into v_name
  from public.quotes q
  left join public.opportunities o on o.id = q.opportunity_id
  where q.id = so.quote_id;

  insert into public.projects (sales_order_id, name, owner_id)
  values (p_sales_order_id, coalesce(v_name, so.reference), auth.uid())
  returning id into v_project_id;

  insert into public.project_lines
    (project_id, sales_order_id, quote_line_id, line_item_id, line_type, part_code, description, quoted_days, day_rate, expenses_included, sort_order)
  select
    v_project_id, so.id, ql.id, ql.line_item_id, coalesce(li.line_type, ql.line_type), ql.part_code,
    nullif(concat_ws(' — ', nullif(trim(ql.description), ''), nullif(trim(ql.description_2), '')), ''),
    ql.qty, ql.unit_cost, ql.expenses_included, ql.sort_order
  from public.quote_lines ql
  left join public.line_items li on li.id = ql.line_item_id
  join public.line_types lt on lower(lt.name) = lower(coalesce(li.line_type, ql.line_type))
  where ql.quote_id = so.quote_id
    and lt.billing = 'timesheet';

  return v_project_id;
end;
$$;

-- ── Add another sales order's lines to an existing project ───────────────────

create or replace function public.add_sales_order_to_project(p_project_id uuid, p_sales_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  prj public.projects%rowtype;
  v_project_client uuid;
  v_existing text;
  v_offset int;
  v_added int;
begin
  if not (public.can_write('sales_orders') or public.can_write('projects')) then
    raise exception 'You need the Sales Orders or Projects area to add to a project.';
  end if;

  select * into so from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Sales order not found.';
  end if;
  select * into prj from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;

  select reference into v_existing from public.projects where id = public.project_for_sales_order(p_sales_order_id);
  if v_existing is not null then
    raise exception 'This sales order is already on project %.', v_existing;
  end if;
  if so.closed_at is not null then
    raise exception 'This sales order is closed — reopen it first.';
  end if;
  if prj.status <> 'active' then
    raise exception '% is complete — set it back to Active first.', prj.reference;
  end if;
  if so.quote_id is null then
    raise exception 'This sales order has no quote, so there are no lines to add.';
  end if;

  select client_id into v_project_client from public.sales_orders where id = prj.sales_order_id;
  if v_project_client is distinct from so.client_id then
    raise exception 'This sales order is for a different client from %.', prj.reference;
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_offset from public.project_lines where project_id = p_project_id;

  insert into public.project_lines
    (project_id, sales_order_id, quote_line_id, line_item_id, line_type, part_code, description, quoted_days, day_rate, expenses_included, sort_order)
  select
    p_project_id, so.id, ql.id, ql.line_item_id, coalesce(li.line_type, ql.line_type), ql.part_code,
    nullif(concat_ws(' — ', nullif(trim(ql.description), ''), nullif(trim(ql.description_2), '')), ''),
    ql.qty, ql.unit_cost, ql.expenses_included,
    v_offset + (row_number() over (order by ql.sort_order, ql.id))::int - 1
  from public.quote_lines ql
  left join public.line_items li on li.id = ql.line_item_id
  join public.line_types lt on lower(lt.name) = lower(coalesce(li.line_type, ql.line_type))
  where ql.quote_id = so.quote_id
    and lt.billing = 'timesheet';

  get diagnostics v_added = row_count;
  if v_added = 0 then
    raise exception 'The quote on this sales order has no lines billed from timesheets, so there is nothing to add.';
  end if;

  return v_added;
end;
$$;

-- ── Invoicing: one draft invoice per sales order ─────────────────────────────

drop function public.create_invoice_from_timesheets(uuid, date, date);
drop function public.billable_timesheet_days(uuid, date, date);

create function public.billable_timesheet_days(p_project_id uuid, p_from date, p_to date)
returns table (entry_id uuid, line_id uuid, sales_order_id uuid, part_code text, line_type text, day_rate numeric, expenses_included numeric, sort_order int, days numeric)
language sql
stable
set search_path = public
as $$
  select t.id, pl.id, pl.sales_order_id, pl.part_code, pl.line_type, pl.day_rate, pl.expenses_included, pl.sort_order,
         public.day_type_days(t.day_type)
  from public.timesheet_entries t
  join public.project_assignments pa on pa.id = t.project_assignment_id
  join public.project_lines pl on pl.id = pa.project_line_id
  where pl.project_id = p_project_id
    and t.status = 'approved'
    and t.invoice_id is null
    and t.work_date between p_from and p_to;
$$;

create function public.create_invoice_from_timesheets(p_project_id uuid, p_from date, p_to date, p_sales_order_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  so public.sales_orders%rowtype;
  v_so_id uuid := p_sales_order_id;
  v_orders int;
  v_invoice_id uuid;
  v_value numeric;
  v_eligible numeric;
  v_vat numeric;
  v_total numeric;
  v_rebate numeric;
  v_terms int;
begin
  if not (public.can_write('projects') or public.can_write('invoices')) then
    raise exception 'You need the Projects or Invoices area to invoice timesheets.';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid period (from must be on or before to).';
  end if;

  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  if v_so_id is null then
    select count(distinct b.sales_order_id), min(b.sales_order_id::text)::uuid into v_orders, v_so_id
    from public.billable_timesheet_days(p_project_id, p_from, p_to) b;
    if v_orders > 1 then
      raise exception 'The days in this period are on more than one sales order — invoice each sales order separately.';
    end if;
  elsif not exists (select 1 from public.project_lines where project_id = p_project_id and sales_order_id = v_so_id) then
    raise exception 'That sales order is not on this project.';
  end if;

  select * into so from public.sales_orders where id = v_so_id;

  -- Rebate is on the labour part only (day rate less any bundled expenses, 0047).
  select round(sum(b.days * b.day_rate), 2),
         round(coalesce(sum(b.days * (b.day_rate - coalesce(b.expenses_included, 0)))
                          filter (where public.rebate_eligible_type(b.line_type)), 0), 2)
    into v_value, v_eligible
  from public.billable_timesheet_days(p_project_id, p_from, p_to) b
  where b.sales_order_id = v_so_id;

  if v_value is null then
    raise exception 'There are no approved, uninvoiced timesheets on this % between % and %.',
      case when p_sales_order_id is null then 'project' else 'sales order' end,
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

  insert into public.invoice_lines (invoice_id, sort_order, description, line_type, qty, unit_price, expenses_included)
  select v_invoice_id,
         row_number() over (order by min(b.sort_order), b.line_id) - 1,
         coalesce(nullif(trim(b.part_code), ''), b.line_type),
         b.line_type,
         sum(b.days), b.day_rate, b.expenses_included
  from public.billable_timesheet_days(p_project_id, p_from, p_to) b
  where b.sales_order_id = v_so_id
  group by b.line_id, b.part_code, b.line_type, b.day_rate, b.expenses_included;

  update public.timesheet_entries
  set invoice_id = v_invoice_id
  where id in (
    select b.entry_id from public.billable_timesheet_days(p_project_id, p_from, p_to) b where b.sales_order_id = v_so_id
  );

  return v_invoice_id;
end;
$$;

commit;
