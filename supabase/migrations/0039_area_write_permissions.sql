-- Area permissions enforced by the database for changes (not just the UI).
--
-- Until now any staff login could insert/update/delete pipeline, project and
-- people records directly through the API, whatever areas they'd been given
-- (Admin → Logins). From here, changes need the matching area — or the admin
-- area, which can change everything:
--
--   accounts, contacts                       → accounts   (Opportunities can also add a new account)
--   opportunities                            → opportunities
--   quotes, quote_lines                      → quotes
--   sales_orders                             → sales_orders
--   invoices, invoice_lines, payments        → invoices
--   projects, project_lines, assignments     → projects
--   field_engineers, contractor_skills,
--     CV / photo files                       → engineers  (User Accounts)
--   timesheet_entries (anyone's)             → timesheets or projects
--   timesheet_entries (your own)             → you (contractors keep their tighter 0001 rules)
--
-- Reading stays open to all staff for now: the Dashboard and several pages
-- (e.g. a sales order's invoices, a project's sales order) read across areas.
--
-- Knock-on updates that cross areas run with the database's own rights so
-- they still happen whoever triggers them: invoiced to date on sales orders
-- (from invoices), opportunity estimate/stage (from quotes). The two "create
-- from" functions check the caller's area themselves:
--   create_project_from_sales_order  → sales_orders or projects
--   create_invoice_from_timesheets   → projects or invoices

begin;

-- ── Helper ──────────────────────────────────────────────────────────────────

create or replace function public.can_write(area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_area(area) or public.is_admin();
$$;

-- ── Pipeline and people tables: read = staff, write = area ──────────────────

-- accounts (select-all policy from 0001 stays)
drop policy accounts_write_staff on public.accounts;
create policy accounts_insert on public.accounts
  for insert with check ((select public.can_write('accounts')) or (select public.can_write('opportunities')));
create policy accounts_update on public.accounts
  for update using ((select public.can_write('accounts'))) with check ((select public.can_write('accounts')));
create policy accounts_delete on public.accounts
  for delete using ((select public.can_write('accounts')));

-- contacts
drop policy contacts_staff_full_access on public.contacts;
create policy contacts_select_staff on public.contacts for select using ((select public.is_staff()));
create policy contacts_write on public.contacts
  for all using ((select public.can_write('accounts'))) with check ((select public.can_write('accounts')));

-- opportunities
drop policy opportunities_staff_full_access on public.opportunities;
create policy opportunities_select_staff on public.opportunities for select using ((select public.is_staff()));
create policy opportunities_write on public.opportunities
  for all using ((select public.can_write('opportunities'))) with check ((select public.can_write('opportunities')));

-- quotes + lines
drop policy quotes_staff_full_access on public.quotes;
create policy quotes_select_staff on public.quotes for select using ((select public.is_staff()));
create policy quotes_write on public.quotes
  for all using ((select public.can_write('quotes'))) with check ((select public.can_write('quotes')));

drop policy quote_lines_staff_full_access on public.quote_lines;
create policy quote_lines_select_staff on public.quote_lines for select using ((select public.is_staff()));
create policy quote_lines_write on public.quote_lines
  for all using ((select public.can_write('quotes'))) with check ((select public.can_write('quotes')));

-- sales orders
drop policy sales_orders_staff_full_access on public.sales_orders;
create policy sales_orders_select_staff on public.sales_orders for select using ((select public.is_staff()));
create policy sales_orders_write on public.sales_orders
  for all using ((select public.can_write('sales_orders'))) with check ((select public.can_write('sales_orders')));

-- invoices, lines, payments
drop policy invoices_staff_full_access on public.invoices;
create policy invoices_select_staff on public.invoices for select using ((select public.is_staff()));
create policy invoices_write on public.invoices
  for all using ((select public.can_write('invoices'))) with check ((select public.can_write('invoices')));

drop policy invoice_lines_staff on public.invoice_lines;
create policy invoice_lines_select_staff on public.invoice_lines for select using ((select public.is_staff()));
create policy invoice_lines_write on public.invoice_lines
  for all using ((select public.can_write('invoices'))) with check ((select public.can_write('invoices')));

drop policy payments_staff_full_access on public.payments;
create policy payments_select_staff on public.payments for select using ((select public.is_staff()));
create policy payments_write on public.payments
  for all using ((select public.can_write('invoices'))) with check ((select public.can_write('invoices')));

-- projects (contractors' "assigned" select policies from 0022 stay)
drop policy projects_staff on public.projects;
create policy projects_select_staff on public.projects for select using ((select public.is_staff()));
create policy projects_write on public.projects
  for all using ((select public.can_write('projects'))) with check ((select public.can_write('projects')));

drop policy project_lines_staff on public.project_lines;
create policy project_lines_select_staff on public.project_lines for select using ((select public.is_staff()));
create policy project_lines_write on public.project_lines
  for all using ((select public.can_write('projects'))) with check ((select public.can_write('projects')));

drop policy project_assignments_staff on public.project_assignments;
create policy project_assignments_select_staff on public.project_assignments for select using ((select public.is_staff()));
create policy project_assignments_write on public.project_assignments
  for all using ((select public.can_write('projects'))) with check ((select public.can_write('projects')));

-- people (select-own-or-staff policy stays)
drop policy field_engineers_write_staff on public.field_engineers;
create policy field_engineers_write on public.field_engineers
  for all using ((select public.can_write('engineers'))) with check ((select public.can_write('engineers')));

-- skills on people's profiles (people's own-profile policies from 0036 stay)
drop policy contractor_skills_staff on public.contractor_skills;
create policy contractor_skills_select_staff on public.contractor_skills for select using ((select public.is_staff()));
create policy contractor_skills_write on public.contractor_skills
  for all using ((select public.can_write('engineers'))) with check ((select public.can_write('engineers')));

-- ── Timesheets ──────────────────────────────────────────────────────────────

-- Anyone's timesheets: Team timesheets or Projects area. Approval rules
-- (project owner / admin, never your own) stay in timesheet_entries_check().
drop policy timesheets_staff_full_access on public.timesheet_entries;
create policy timesheets_staff_manage on public.timesheet_entries
  for all
  using ((select public.can_write('timesheets')) or (select public.can_write('projects')))
  with check ((select public.can_write('timesheets')) or (select public.can_write('projects')));

-- Staff with a staff profile: their own time, whatever their areas (submit is
-- auto-approved, un-approve back to draft — 0033/0034).
create policy timesheets_staff_own on public.timesheet_entries
  for all
  using ((select public.is_staff()) and field_engineer_id = (select public.my_field_engineer_id()))
  with check ((select public.is_staff()) and field_engineer_id = (select public.my_field_engineer_id()));

-- The old insert policy let any staff add a timesheet for anyone; now it's
-- just your own (staff adding for others go through timesheets_staff_manage).
alter policy timesheets_insert_own_or_staff on public.timesheet_entries
  with check (field_engineer_id in (
    select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid())
  ));
alter policy timesheets_insert_own_or_staff on public.timesheet_entries
  rename to timesheets_insert_own;

-- ── Files ───────────────────────────────────────────────────────────────────

alter policy contractor_cvs_staff_insert on storage.objects
  with check (bucket_id = 'contractor-cvs' and (select public.can_write('engineers')));
alter policy contractor_cvs_staff_update on storage.objects
  using (bucket_id = 'contractor-cvs' and (select public.can_write('engineers')));
alter policy contractor_cvs_staff_delete on storage.objects
  using (bucket_id = 'contractor-cvs' and (select public.can_write('engineers')));

alter policy profile_photos_insert on storage.objects
  with check (
    bucket_id = 'profile-photos'
    and ((select public.can_write('engineers')) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
alter policy profile_photos_delete on storage.objects
  using (
    bucket_id = 'profile-photos'
    and ((select public.can_write('engineers')) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );

-- CV / photo pointer on the record (0036): self, or User Accounts area.
create or replace function public.set_profile_file(
  p_field_engineer_id uuid,
  p_kind text,
  p_path text,
  p_file_name text
)
returns public.field_engineers
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.field_engineers;
begin
  if not (public.can_write('engineers') or p_field_engineer_id = public.my_field_engineer_id()) then
    raise exception 'You can only change your own profile.';
  end if;
  if p_path is not null and p_path not like p_field_engineer_id::text || '/%' then
    raise exception 'That file isn''t in this profile''s folder.';
  end if;

  if p_kind = 'cv' then
    update public.field_engineers
    set cv_path = p_path,
        cv_file_name = case when p_path is null then null else p_file_name end,
        cv_uploaded_at = case when p_path is null then null else now() end
    where id = p_field_engineer_id
    returning * into result;
  elsif p_kind = 'photo' then
    update public.field_engineers
    set photo_path = p_path,
        photo_uploaded_at = case when p_path is null then null else now() end
    where id = p_field_engineer_id
    returning * into result;
  else
    raise exception 'Unknown file kind: %', p_kind;
  end if;

  return result;
end;
$$;

-- ── Knock-on updates run with the database's own rights ─────────────────────

alter function public.recalc_invoiced_to_date(uuid) security definer set search_path = public;
alter function public.recalc_opportunity_estimate(uuid) security definer set search_path = public;
alter function public.recalc_opportunity_stage(uuid) security definer set search_path = public;
alter function public.opportunity_stage_from_quotes(uuid) security definer set search_path = public;

-- ── "Create from" functions check the caller's area ─────────────────────────

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
begin
  if not (public.can_write('sales_orders') or public.can_write('projects')) then
    raise exception 'You need the Sales Orders or Projects area to create a project.';
  end if;

  select * into so from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Sales order not found';
  end if;

  select coalesce(nullif(trim(o.name), ''), so.reference) into v_name
  from public.quotes q
  left join public.opportunities o on o.id = q.opportunity_id
  where q.id = so.quote_id;

  insert into public.projects (sales_order_id, name, owner_id)
  values (p_sales_order_id, coalesce(v_name, so.reference), auth.uid())
  returning id into v_project_id;

  insert into public.project_lines
    (project_id, quote_line_id, line_item_id, line_type, part_code, description, quoted_days, day_rate, sort_order)
  select
    v_project_id, ql.id, ql.line_item_id, coalesce(li.line_type, ql.line_type), ql.part_code,
    nullif(concat_ws(' — ', nullif(trim(ql.description), ''), nullif(trim(ql.description_2), '')), ''),
    ql.qty, ql.unit_cost, ql.sort_order
  from public.quote_lines ql
  left join public.line_items li on li.id = ql.line_item_id
  join public.line_types lt on lower(lt.name) = lower(coalesce(li.line_type, ql.line_type))
  where ql.quote_id = so.quote_id
    and lt.billing = 'timesheet';

  return v_project_id;
end;
$$;

create or replace function public.create_invoice_from_timesheets(p_project_id uuid, p_from date, p_to date)
returns uuid
language plpgsql
security definer
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
  if not (public.can_write('projects') or public.can_write('invoices')) then
    raise exception 'You need the Projects or Invoices area to invoice timesheets.';
  end if;

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
