-- Performance tidy-up from Supabase's performance advisor (Nov 2026).
-- Nothing changes on screen and nobody gains or loses access.
--
-- 1. Security rules (RLS policies) that called auth.uid() / is_staff() for
--    every row are rewritten as (select auth.uid()) / (select is_staff()),
--    which Postgres works out once per query instead. The rules themselves
--    are the same — ALTER POLICY only swaps the expressions, so each
--    policy keeps its command and roles.
-- 2. Indexes on 15 foreign-key columns that didn't have one, so joins and
--    deletes along those links don't scan the whole table.
--
-- Left alone on purpose: the "multiple permissive policies" warnings (would
-- mean splitting every *_write_* policy into insert/update/delete — a bigger
-- change for little gain at this size) and the 4 "unused" indexes (the
-- statistics are only a couple of weeks old).

begin;

-- ── 1. Security rules ───────────────────────────────────────────────────────

alter policy accounts_select_all on public.accounts
  using ((select auth.uid()) is not null);

alter policy field_engineers_select_own_or_staff on public.field_engineers
  using (user_id = (select auth.uid()) or (select public.is_staff()));

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()) or (select public.is_staff()));

alter policy project_assignments_select_own on public.project_assignments
  using (field_engineer_id in (
    select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid())
  ));

alter policy timesheets_select_own_or_staff on public.timesheet_entries
  using ((select public.is_staff()) or field_engineer_id in (
    select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid())
  ));

alter policy timesheets_insert_own_or_staff on public.timesheet_entries
  with check ((select public.is_staff()) or field_engineer_id in (
    select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid())
  ));

alter policy timesheets_update_own_while_editable on public.timesheet_entries
  using (
    field_engineer_id in (select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid()))
    and status in ('draft', 'rejected')
  )
  with check (
    field_engineer_id in (select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid()))
    and status in ('draft', 'submitted')
  );

alter policy timesheets_delete_own_draft on public.timesheet_entries
  using (
    status = 'draft'
    and field_engineer_id in (select fe.id from public.field_engineers fe where fe.user_id = (select auth.uid()))
  );

-- ── 2. Foreign-key indexes ──────────────────────────────────────────────────

create index if not exists accounts_rate_card_id_idx on public.accounts (rate_card_id);
create index if not exists contacts_account_id_idx on public.contacts (account_id);
create index if not exists invoices_end_client_id_idx on public.invoices (end_client_id);
create index if not exists invoices_quote_id_idx on public.invoices (quote_id);
create index if not exists line_items_line_type_idx on public.line_items (line_type);
create index if not exists opportunities_billing_account_id_idx on public.opportunities (billing_account_id);
create index if not exists opportunities_contact_id_idx on public.opportunities (contact_id);
create index if not exists project_lines_line_item_id_idx on public.project_lines (line_item_id);
create index if not exists project_lines_quote_line_id_idx on public.project_lines (quote_line_id);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists quote_lines_line_item_id_idx on public.quote_lines (line_item_id);
create index if not exists quotes_contact_id_idx on public.quotes (contact_id);
create index if not exists quotes_end_client_id_idx on public.quotes (end_client_id);
create index if not exists sales_orders_end_client_id_idx on public.sales_orders (end_client_id);
create index if not exists timesheet_entries_approved_by_idx on public.timesheet_entries (approved_by);

commit;
