-- Quotes are valid for 30 days. Any quote still in "draft" or "sent"
-- (i.e. not yet accepted or declined) whose quote date — or, if that's not
-- set, its created date — is more than 30 days ago is moved to "expired".
-- Run 0007_quote_expired_status.sql first (separately) before this file.

create or replace function public.expire_old_quotes()
returns void
language sql
as $$
  update public.quotes
  set status = 'expired'
  where status in ('draft', 'sent')
    and coalesce(quote_date, created_at::date) < (current_date - interval '30 days');
$$;

-- Requires the pg_cron extension. If the line below errors, enable it
-- first via the Supabase dashboard: Database -> Extensions -> pg_cron,
-- then re-run just the `select cron.schedule(...)` statement.
create extension if not exists pg_cron;

select cron.schedule(
  'expire-old-quotes-daily',
  '0 1 * * *', -- once a day, 01:00 UTC
  $$select public.expire_old_quotes();$$
);

-- Apply it once immediately, so any already-overdue quotes are marked
-- expired right away rather than waiting for tomorrow's run.
select public.expire_old_quotes();
