-- 0058: timesheet reminder emails (sent through Resend by the send-reminders
-- Edge Function, from Spine CRM <noreply@spine.techtrus.co.uk>).
--
--   submit   Fridays 3pm (UK) — "please submit this week's timesheet" to people
--            on an active project this week who have draft days or nothing logged.
--   approve  Mondays 9am (UK) — "N timesheets to approve" to staff who can
--            approve them (same rule as the Team timesheets badge, 0037).
--   rejected Every 15 minutes — "your timesheet for [date] was rejected", with
--            the reason, to the person (one email per batch of rejections).
--
-- This file sets up everything except the schedule (0059, added once the test
-- email has been checked):
--   * pg_net (lets the database call the Edge Function);
--   * profiles.reminder_emails — per-person opt-out (My Profile);
--   * email_log — every email sent, so nobody gets the same one twice;
--   * the "who gets what" functions, which only the Edge Function can call;
--   * a random shared secret in Vault that the schedule sends and the function
--     checks (generated here in the database — it never appears in this file).

create extension if not exists pg_net with schema extensions;

-- ── Opt-out ─────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists reminder_emails boolean not null default true;
comment on column public.profiles.reminder_emails is 'false = no reminder emails (set on My Profile).';

create or replace function public.set_my_reminder_emails(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set reminder_emails = p_on where id = (select auth.uid());
$$;
revoke all on function public.set_my_reminder_emails(boolean) from public, anon;
grant execute on function public.set_my_reminder_emails(boolean) to authenticated;

-- ── Log ─────────────────────────────────────────────────────────────────────

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('submit', 'approve', 'rejected', 'test')),
  dedupe_key text not null unique, -- e.g. submit:2026-11-02:<person>, so a reminder only goes once
  covers text[] not null default '{}', -- rejected: one key per timesheet day in the email
  profile_id uuid, -- recipient's login (no FK: logs outlive accounts)
  recipient text not null,
  subject text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  resend_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_covers_idx on public.email_log using gin (covers);
create index if not exists email_log_created_idx on public.email_log (created_at desc);

alter table public.email_log enable row level security;
drop policy if exists email_log_select_admin on public.email_log;
create policy email_log_select_admin on public.email_log
  for select to authenticated using ((select public.is_admin()));
-- No write policies: only the Edge Function (service role) writes.

-- ── Shared secret for the schedule ──────────────────────────────────────────

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'spine_reminders_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'spine_reminders_secret',
      'Sent by pg_cron to the send-reminders Edge Function'
    );
  end if;
end $$;

create or replace function public.reminder_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets where name = 'spine_reminders_secret' and decrypted_secret = p_secret);
$$;

-- ── Who gets what ───────────────────────────────────────────────────────────

-- Recipient email = the person's login email.
create or replace function public.login_email(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email::text from auth.users where id = p_user;
$$;

-- Friday: people on an active project this week (the order's dates cover the
-- week, days left on their allocation) who have draft days this week or
-- nothing logged Monday–Friday.
create or replace function public.reminder_submit_candidates(p_week_start date)
returns table (
  field_engineer_id uuid,
  profile_id uuid,
  name text,
  email text,
  draft_days numeric,
  logged_days numeric,
  projects text
)
language sql
stable
security definer
set search_path = public
as $$
  with week as (select p_week_start as mon, p_week_start + 4 as fri),
  live as (
    select distinct a.field_engineer_id, p.reference || ' ' || p.name as project
    from public.project_assignments a
    join public.project_lines l on l.id = a.project_line_id
    join public.projects p on p.id = l.project_id and p.status = 'active'
    join public.sales_orders so on so.id = l.sales_order_id
    cross join week w
    where (so.start_date is null or so.start_date <= w.fri)
      and (so.end_date is null or so.end_date >= w.mon)
      and a.allocated_days > coalesce((
        select sum(case t.day_type when 'full_day' then 1 else 0.5 end)
        from public.timesheet_entries t
        where t.project_assignment_id = a.id and t.status <> 'rejected'
      ), 0)
  ),
  days as (
    select t.field_engineer_id,
      sum(case t.day_type when 'full_day' then 1 else 0.5 end) filter (where t.status = 'draft') as draft_days,
      sum(case t.day_type when 'full_day' then 1 else 0.5 end) filter (where t.status in ('submitted', 'approved')) as logged_days
    from public.timesheet_entries t, week w
    where t.work_date between w.mon and w.fri
    group by t.field_engineer_id
  )
  select fe.id, pr.id, fe.name, public.login_email(fe.user_id),
    coalesce(d.draft_days, 0), coalesce(d.logged_days, 0),
    (select string_agg(project, ', ' order by project) from live where live.field_engineer_id = fe.id)
  from public.field_engineers fe
  join public.profiles pr on pr.id = fe.user_id and pr.reminder_emails
  left join days d on d.field_engineer_id = fe.id
  where fe.is_active
    and exists (select 1 from live where live.field_engineer_id = fe.id)
    and (coalesce(d.draft_days, 0) > 0 or coalesce(d.logged_days, 0) = 0)
    and public.login_email(fe.user_id) is not null;
$$;

-- Monday: staff with Team timesheets who have submitted days waiting for them
-- (project owner or admin for project time; anyone with the area for other
-- time; never their own).
create or replace function public.reminder_approval_candidates()
returns table (profile_id uuid, name text, email text, waiting bigint, oldest date)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.full_name, public.login_email(pr.id), count(*), min(t.work_date)
  from public.profiles pr
  join public.timesheet_entries t on t.status = 'submitted'
  join public.field_engineers fe on fe.id = t.field_engineer_id
  left join public.project_assignments pa on pa.id = t.project_assignment_id
  left join public.project_lines pl on pl.id = pa.project_line_id
  left join public.projects p on p.id = pl.project_id
  where pr.role = 'staff' and pr.reminder_emails
    and 'timesheets' = any (pr.permissions)
    and fe.user_id is distinct from pr.id
    and (t.project_assignment_id is null or p.owner_id = pr.id or 'admin' = any (pr.permissions))
    and public.login_email(pr.id) is not null
  group by pr.id, pr.full_name;
$$;

-- Rejected days not yet emailed (one key per rejection of a submission).
-- Only rejections from the last 7 days, so switching this on doesn't email
-- about old ones. Rejection emails ignore the opt-out — they need acting on.
create or replace function public.reminder_rejected_candidates()
returns table (
  dedupe_key text,
  field_engineer_id uuid,
  profile_id uuid,
  name text,
  email text,
  work_date date,
  day_type text,
  project text,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select k.key, fe.id, fe.user_id, fe.name, public.login_email(fe.user_id), t.work_date, t.day_type::text,
    coalesce(p.reference || ' ' || p.name, t.project_reference), t.rejection_notes
  from public.timesheet_entries t
  join public.field_engineers fe on fe.id = t.field_engineer_id
  left join public.project_assignments pa on pa.id = t.project_assignment_id
  left join public.project_lines pl on pl.id = pa.project_line_id
  left join public.projects p on p.id = pl.project_id
  cross join lateral (select 'rejected:' || t.id || ':' || coalesce(extract(epoch from t.submitted_on)::bigint::text, '0') as key) k
  where t.status = 'rejected'
    and t.updated_at > now() - interval '7 days'
    and fe.user_id is not null
    and public.login_email(fe.user_id) is not null
    and not exists (select 1 from public.email_log l where l.covers @> array[k.key] and l.status <> 'failed');
$$;

revoke all on function public.reminder_secret_ok(text) from public, anon, authenticated;
revoke all on function public.login_email(uuid) from public, anon, authenticated;
revoke all on function public.reminder_submit_candidates(date) from public, anon, authenticated;
revoke all on function public.reminder_approval_candidates() from public, anon, authenticated;
revoke all on function public.reminder_rejected_candidates() from public, anon, authenticated;
grant execute on function public.reminder_secret_ok(text) to service_role;
grant execute on function public.login_email(uuid) to service_role;
grant execute on function public.reminder_submit_candidates(date) to service_role;
grant execute on function public.reminder_approval_candidates() to service_role;
grant execute on function public.reminder_rejected_candidates() to service_role;
