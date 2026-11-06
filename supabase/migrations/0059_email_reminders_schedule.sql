-- 0059: switch on the reminder email schedule (send-reminders, 0058).
--
-- pg_cron runs in UTC, so the Friday/Monday jobs run at both possible UTC
-- hours and the function itself only sends at 3pm / 9am UK time (BST or GMT);
-- email_log stops anything going twice. The shared secret is read from Vault
-- each time — it never appears here.
--
-- To pause all reminder emails:
--   select cron.unschedule(jobname) from cron.job where jobname like 'spine-reminders-%';

create or replace function public.call_send_reminders(p_kind text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://qkdczucplehdaezprucv.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'spine_reminders_secret')
    ),
    body := jsonb_build_object('kind', p_kind),
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.call_send_reminders(text) from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname like 'spine-reminders-%';

select cron.schedule('spine-reminders-rejected', '*/15 * * * *', $$select public.call_send_reminders('rejected')$$);
select cron.schedule('spine-reminders-submit', '0 14,15 * * 5', $$select public.call_send_reminders('submit')$$);
select cron.schedule('spine-reminders-approve', '0 8,9 * * 1', $$select public.call_send_reminders('approve')$$);
