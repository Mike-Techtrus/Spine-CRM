-- Projects phase 2: timesheets logged against project allocations.
--
-- Rules enforced here (so they hold however a timesheet is written):
--   • A project timesheet must be for the person on that allocation, and its
--     client is filled in from the project's sales order.
--   • Nobody logs more than one day per date (full = 1, half = 0.5), across
--     all their non-rejected timesheets.
--   • Submitting/approving can't take an allocation past its days: submitted +
--     approved days on the allocation must stay within allocated_days.
--     Drafts aren't counted, so people can plan ahead; the block bites on
--     Submit. A completed project takes no new submissions.
--   • Approving/rejecting a project timesheet needs the project owner or an
--     admin, and nobody can approve their own time.
-- Also: people can delete their own draft timesheets (weekly grid clears).

create or replace function public.day_type_days(d public.day_type)
returns numeric
language sql
immutable
as $$
  select case when d = 'full_day' then 1.0 else 0.5 end
$$;

create or replace function public.timesheet_entries_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_used numeric;
  v_day_total numeric;
  v_entry_user uuid;
begin
  -- Same-date cap across all of this person's live timesheets.
  if new.status <> 'rejected' then
    select coalesce(sum(public.day_type_days(t.day_type)), 0) into v_day_total
    from public.timesheet_entries t
    where t.field_engineer_id = new.field_engineer_id
      and t.work_date = new.work_date
      and t.status <> 'rejected'
      and t.id <> new.id;
    if v_day_total + public.day_type_days(new.day_type) > 1 then
      raise exception 'You''ve already logged % day(s) on %, so this would be more than a full day.',
        v_day_total, to_char(new.work_date, 'DD/MM/YYYY');
    end if;
  end if;

  if new.project_assignment_id is null then
    return new;
  end if;

  select pa.allocated_days, pa.field_engineer_id, pl.part_code, pl.line_type,
         p.reference, p.status as project_status, p.owner_id,
         coalesce(so.end_client_id, so.client_id) as client_id
  into a
  from public.project_assignments pa
  join public.project_lines pl on pl.id = pa.project_line_id
  join public.projects p on p.id = pl.project_id
  join public.sales_orders so on so.id = p.sales_order_id
  where pa.id = new.project_assignment_id;

  if a.field_engineer_id is distinct from new.field_engineer_id then
    raise exception 'That project line isn''t assigned to this person.';
  end if;

  if a.client_id is not null then
    new.client_id := a.client_id;
  end if;

  if new.status in ('submitted', 'approved')
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.day_type is distinct from new.day_type
          or old.project_assignment_id is distinct from new.project_assignment_id) then
    if new.status = 'submitted' and a.project_status = 'complete' then
      raise exception '% is complete, so it can''t take new timesheets.', a.reference;
    end if;

    select coalesce(sum(public.day_type_days(t.day_type)), 0) into v_used
    from public.timesheet_entries t
    where t.project_assignment_id = new.project_assignment_id
      and t.status in ('submitted', 'approved')
      and t.id <> new.id;

    if v_used + public.day_type_days(new.day_type) > a.allocated_days then
      raise exception 'Over allocation on % (%): % of % day(s) already submitted, so % day(s) left. Ask the project owner for more days.',
        a.reference, coalesce(a.part_code, a.line_type), v_used, a.allocated_days, greatest(a.allocated_days - v_used, 0);
    end if;
  end if;

  -- Approving/rejecting: project owner or admin, never your own time.
  if tg_op = 'UPDATE' and new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    select user_id into v_entry_user from public.field_engineers where id = new.field_engineer_id;
    if v_entry_user is not null and v_entry_user = auth.uid() then
      raise exception 'You can''t approve or reject your own timesheet.';
    end if;
    if auth.uid() is not null and a.owner_id is distinct from auth.uid() and not public.is_admin() then
      raise exception 'Only the project owner (or an admin) can approve or reject timesheets on %.', a.reference;
    end if;
  end if;

  return new;
end;
$$;

create trigger timesheet_entries_check
  before insert or update on public.timesheet_entries
  for each row execute function public.timesheet_entries_check();

-- People can clear their own drafts (e.g. emptying a cell on the weekly grid).
create policy "timesheets_delete_own_draft" on public.timesheet_entries
  for delete using (
    status = 'draft'
    and field_engineer_id in (select id from public.field_engineers where user_id = auth.uid())
  );
