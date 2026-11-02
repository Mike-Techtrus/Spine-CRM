-- Audit trail: who changed what, and when.
--
-- Every insert, update and delete on the main records is written to
-- audit_log by a trigger:
--   accounts, opportunities, quotes, sales_orders, invoices, payments,
--   projects, project_assignments, timesheet_entries, field_engineers
-- For an update only the fields that changed are kept ({field: {old, new}});
-- for a new record its starting values; for a deleted one its last values
-- (so it can be pieced back together). updated_at/created_at are ignored.
--
-- Quote and invoice LINES aren't logged one by one (each save replaces all
-- lines, which would be noisy) — the quote's/invoice's value changes are.
--
-- The log can only be written by the trigger (no insert/update/delete
-- policies), so nobody can edit or remove history through the app. Staff can
-- read it (History panel on record pages, Admin → Activity).
--
-- Changes made by the database itself (nightly quote expiry, migrations) have
-- no user and show as "System". A migration doing a bulk recalculation can
-- skip logging with:  set local spine.skip_audit = 'on';

begin;

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  record_label text,          -- e.g. INV12366 / T11442 / SO10593 / a name, at the time
  changes jsonb not null,
  changed_by uuid,            -- null = the system (cron jobs, migrations)
  changed_by_name text,       -- name at the time, so history survives renames
  changed_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);
create index audit_log_changed_by_idx on public.audit_log (changed_by);

alter table public.audit_log enable row level security;

create policy audit_log_select_staff on public.audit_log
  for select using ((select public.is_staff()));

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_uid uuid := auth.uid();
begin
  if current_setting('spine.skip_audit', true) = 'on' then
    return null;
  end if;

  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'created_at') and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null; -- saved without changing anything
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := jsonb_strip_nulls(v_new) - 'id' - 'created_at' - 'updated_at';
  else
    v_changes := jsonb_strip_nulls(v_old);
  end if;

  v_row := coalesce(v_new, v_old);

  insert into public.audit_log (table_name, record_id, action, record_label, changes, changed_by, changed_by_name)
  values (
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    coalesce(v_row ->> 'invoice_number', v_row ->> 'quote_number', v_row ->> 'reference', v_row ->> 'name'),
    v_changes,
    v_uid,
    (select p.full_name from public.profiles p where p.id = v_uid)
  );
  return null;
end;
$$;

create trigger audit_accounts after insert or update or delete on public.accounts
  for each row execute function public.audit_row_change();
create trigger audit_opportunities after insert or update or delete on public.opportunities
  for each row execute function public.audit_row_change();
create trigger audit_quotes after insert or update or delete on public.quotes
  for each row execute function public.audit_row_change();
create trigger audit_sales_orders after insert or update or delete on public.sales_orders
  for each row execute function public.audit_row_change();
create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.audit_row_change();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();
create trigger audit_project_assignments after insert or update or delete on public.project_assignments
  for each row execute function public.audit_row_change();
create trigger audit_timesheet_entries after insert or update or delete on public.timesheet_entries
  for each row execute function public.audit_row_change();
create trigger audit_field_engineers after insert or update or delete on public.field_engineers
  for each row execute function public.audit_row_change();

commit;
