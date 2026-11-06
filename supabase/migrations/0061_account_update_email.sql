-- 0061: weekly account update email for a customer (CDW to start with).
--
-- Every Monday at 8am UK, each account with the email switched on gets one
-- email (from "Techtrus <updates@spine.techtrus.co.uk>", replies to the
-- account's reply-to address) showing:
--   outstanding invoices (amount still owed, due date, overdue highlighted),
--   quotes awaiting their decision (valid for 30 days from the quote date),
--   opportunities in progress (no quote sent yet),
--   work going ahead that's still waiting for a PO,
--   active projects: days used against days ordered.
-- Internal figures (rebate, net value, margins, costs, notes) are never read.
--
-- account_update_emails: per account — on/off (off until someone switches it
-- on in Admin → Customer Accounts → Edit), recipients, reply-to, an optional
-- short note. account_update_data(account) gathers the figures as JSON for the
-- send-account-update Edge Function (service role only). The schedule calls
-- the function at both possible UTC hours; it only sends at 8am UK, and
-- email_log stops a second copy.

begin;

create table public.account_update_emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  enabled boolean not null default false,
  recipients text[] not null default '{}',
  reply_to text,
  note text, -- optional line shown under the greeting
  name text, -- for the audit trail label
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger account_update_emails_set_updated_at
  before update on public.account_update_emails
  for each row execute function public.set_updated_at();

create trigger audit_account_update_emails after insert or update or delete on public.account_update_emails
  for each row execute function public.audit_row_change();

alter table public.account_update_emails enable row level security;
create policy account_update_emails_select_staff on public.account_update_emails
  for select using ((select public.is_staff()));
create policy account_update_emails_write on public.account_update_emails
  for all using ((select public.can_write('accounts'))) with check ((select public.can_write('accounts')));

-- email_log gains the new kind.
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('submit', 'approve', 'rejected', 'test', 'account_update'));

-- ── The figures ─────────────────────────────────────────────────────────────

create or replace function public.account_update_data(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with acc as (select id, name from public.accounts where id = p_account),
  sent_quotes as (
    select q.* from public.quotes q where q.client_id = p_account and q.status = 'sent'
  ),
  paid as (
    select invoice_id, sum(payment_amount) as amount from public.payments group by invoice_id
  )
  select jsonb_build_object(
    'account', (select name from acc),
    'company', (select jsonb_build_object('name', company_name, 'address', registered_address,
                                          'company_number', company_number, 'vat_reg', vat_reg)
                from public.company_settings limit 1),
    'invoices', coalesce((
      select jsonb_agg(x order by x->>'due_date' nulls last, x->>'invoice_number')
      from (
        select jsonb_build_object(
          'invoice_number', i.invoice_number,
          'end_client', ec.name,
          'po_number', nullif(trim(i.po_number), ''),
          'invoice_date', i.invoice_date,
          'due_date', i.due_date,
          'total', i.total,
          'outstanding', round(coalesce(i.total, 0) - coalesce(pd.amount, 0), 2)
        ) as x
        from public.invoices i
        left join public.accounts ec on ec.id = i.end_client_id
        left join paid pd on pd.invoice_id = i.id
        where i.client_id = p_account and i.status = 'sent'
          and coalesce(i.total, 0) - coalesce(pd.amount, 0) > 0.005
      ) s), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(x order by x->>'quote_date' nulls last, x->>'quote_number')
      from (
        select jsonb_build_object(
          'quote_number', q.quote_number,
          'opportunity_name', o.name,
          'customer_opportunity_number', nullif(trim(o.customer_opportunity_number), ''),
          'end_client', ec.name,
          'value', q.value,
          'quote_date', q.quote_date,
          'valid_until', q.quote_date + 30
        ) as x
        from sent_quotes q
        left join public.opportunities o on o.id = q.opportunity_id
        left join public.accounts ec on ec.id = q.end_client_id
      ) s), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(x order by x->>'created')
      from (
        select jsonb_build_object(
          'opportunity_number', o.opportunity_number,
          'name', o.name,
          'customer_opportunity_number', nullif(trim(o.customer_opportunity_number), ''),
          'end_client', ec.name,
          'stage', o.stage,
          'created', o.created_at::date
        ) as x
        from public.opportunities o
        left join public.accounts ec on ec.id = o.client_id
        where o.billing_account_id = p_account
          and o.is_active
          and o.stage in ('qualifying', 'quoting')
          and not exists (select 1 from sent_quotes q where q.opportunity_id = o.id)
      ) s), '[]'::jsonb),
    'awaiting_po', coalesce((
      select jsonb_agg(x order by x->>'start_date' nulls last)
      from (
        select jsonb_build_object(
          'reference', so.reference,
          'quote_number', q.quote_number,
          'opportunity_name', o.name,
          'end_client', ec.name,
          'start_date', so.start_date,
          'value', case when so.total is not null then so.total - coalesce(so.vat, 0) else coalesce(so.po_value, so.quote_value) end
        ) as x
        from public.sales_orders so
        left join public.quotes q on q.id = so.quote_id
        left join public.opportunities o on o.id = q.opportunity_id
        left join public.accounts ec on ec.id = so.end_client_id
        where so.client_id = p_account
          and so.closed_at is null
          and so.advanced_without_po
          and coalesce(upper(trim(so.po_number)), '') in ('', 'TBC')
      ) s), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(x order by x->>'reference')
      from (
        select jsonb_build_object(
          'reference', p.reference,
          'name', p.name,
          'end_client', ec.name,
          'po_number', nullif(trim(so.po_number), ''),
          'days_ordered', (select coalesce(sum(l.quoted_days), 0) from public.project_lines l where l.project_id = p.id),
          'days_used', (
            select coalesce(sum(public.day_type_days(t.day_type)), 0)
            from public.timesheet_entries t
            join public.project_assignments a on a.id = t.project_assignment_id
            join public.project_lines l on l.id = a.project_line_id
            where l.project_id = p.id and t.status in ('submitted', 'approved')
          ),
          'end_date', so.end_date
        ) as x
        from public.projects p
        join public.sales_orders so on so.id = p.sales_order_id
        left join public.accounts ec on ec.id = so.end_client_id
        where so.client_id = p_account and p.status = 'active'
      ) s), '[]'::jsonb)
  );
$$;

revoke all on function public.account_update_data(uuid) from public, anon, authenticated;
grant execute on function public.account_update_data(uuid) to service_role;

-- ── Schedule (sends nothing until an account is switched on) ───────────────

select cron.unschedule(jobname) from cron.job where jobname = 'spine-account-updates';
select cron.schedule('spine-account-updates', '0 7,8 * * 1', $cron$
  select net.http_post(
    url := 'https://qkdczucplehdaezprucv.supabase.co/functions/v1/send-account-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'spine_reminders_secret')
    ),
    body := '{"mode":"scheduled"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);

commit;
