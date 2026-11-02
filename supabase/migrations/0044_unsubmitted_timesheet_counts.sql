-- Timesheet reminders (in the app; email to follow once an email service is set up).
--
-- my_action_counts() gains my_unsubmitted: your own DRAFT timesheet days
-- dated before this week (Monday) — time you entered but never submitted.
-- It feeds the badge on Timesheets → My timesheets; the page itself lists
-- the weeks and also notes a week with no time logged.
-- Otherwise identical to 0042.

begin;

create or replace function public.my_action_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'timesheets_to_approve',
      case when public.has_area('timesheets') then (
        select count(*)
        from public.timesheet_entries t
        join public.field_engineers fe on fe.id = t.field_engineer_id
        left join public.project_assignments pa on pa.id = t.project_assignment_id
        left join public.project_lines pl on pl.id = pa.project_line_id
        left join public.projects p on p.id = pl.project_id
        where t.status = 'submitted'
          and fe.user_id is distinct from auth.uid()
          and (t.project_assignment_id is null or p.owner_id = auth.uid() or public.is_admin())
      ) else 0 end,
    'my_rejected_timesheets', (
      select count(*)
      from public.timesheet_entries t
      join public.field_engineers fe on fe.id = t.field_engineer_id
      where t.status = 'rejected' and fe.user_id = auth.uid()
    ),
    'my_unsubmitted', (
      select count(*)
      from public.timesheet_entries t
      join public.field_engineers fe on fe.id = t.field_engineer_id
      where t.status = 'draft' and fe.user_id = auth.uid()
        and t.work_date < date_trunc('week', current_date)::date
    ),
    'skill_requests',
      case when public.is_admin() then (
        select count(*) from public.skill_requests where status = 'pending'
      ) else 0 end,
    'expiring',
      (case when public.can_write('engineers') then (
        select count(*)
        from public.contractor_skills cs
        join public.field_engineers fe on fe.id = cs.field_engineer_id
        where fe.is_active and cs.expires_on is not null and cs.expires_on <= current_date + 60
      ) else 0 end)
      + (case when public.is_admin() then (
        select count(*)
        from public.person_documents d
        join public.field_engineers fe on fe.id = d.field_engineer_id
        where fe.is_active and d.expires_on is not null and d.expires_on <= current_date + 60
      ) else 0 end),
    'my_expiring', (
      select count(*) from public.contractor_skills cs
      where cs.field_engineer_id = public.my_field_engineer_id()
        and cs.expires_on is not null and cs.expires_on <= current_date + 60
    ) + (
      select count(*) from public.person_documents d
      where d.field_engineer_id = public.my_field_engineer_id()
        and d.expires_on is not null and d.expires_on <= current_date + 60
    )
  );
$$;

commit;
