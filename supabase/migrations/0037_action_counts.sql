-- Notification badges: how many things are waiting on the current user.
-- Read by the app on every page change (and once a minute) to put counts on
-- the Timesheets and Admin tabs. Read-only.
--
--   timesheets_to_approve — submitted timesheets this person may approve:
--                           not their own, and either non-project time or a
--                           project they own (admins: any project). Only for
--                           staff with the Team timesheets area — same rule
--                           as the approve button (TimesheetDetail.tsx) and
--                           timesheet_entries_check().
--   my_rejected_timesheets — their own timesheets sent back to them.
--   skill_requests        — pending skill requests (admins only, 0036).

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
    'skill_requests',
      case when public.is_admin() then (
        select count(*) from public.skill_requests where status = 'pending'
      ) else 0 end
  );
$$;

commit;
