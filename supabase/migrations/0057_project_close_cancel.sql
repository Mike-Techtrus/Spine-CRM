-- 0057: close a project as completed, or cancel it.
--
-- * New status 'cancelled' (alongside 'active' and 'complete').
-- * projects.closed_at / closed_by / closed_reason record when, who and why —
--   set by trigger whenever the status moves off 'active', cleared on reopen.
-- * A project can only be cancelled while it has no timesheeted days
--   (drafts, submitted or approved — rejected days don't count). Otherwise
--   it should be closed as completed.
-- * No time can be logged against a cancelled project. (Completed projects
--   already refuse submissions — 0023/0034.)
-- Later: closure report / CSAT steps when a project is completed.

alter type public.project_status add value if not exists 'cancelled';

alter table public.projects
  add column if not exists closed_at timestamptz,
  -- No foreign key on purpose: a second link to profiles would make the app's
  -- owner:profiles(...) embed ambiguous (and break the live site until deployed).
  add column if not exists closed_by uuid,
  add column if not exists closed_reason text;


comment on column public.projects.closed_at is 'When the project was completed or cancelled (null while active).';
comment on column public.projects.closed_reason is 'Closing note: why it was cancelled, or a completion note.';

-- Status changes: stamp/clear the closing fields; refuse cancelling once time is logged.
create or replace function public.projects_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status::text = 'active' then
    new.closed_at := null;
    new.closed_by := null;
    new.closed_reason := null;
    return new;
  end if;

  if new.status::text = 'cancelled' then
    select count(*) into v_days
    from public.timesheet_entries t
    join public.project_assignments a on a.id = t.project_assignment_id
    join public.project_lines l on l.id = a.project_line_id
    where l.project_id = new.id and t.status <> 'rejected';
    if v_days > 0 then
      raise exception 'Project % has % timesheeted day(s), so it can''t be cancelled — close it as completed instead.',
        new.reference, v_days;
    end if;
  end if;

  new.closed_at := now();
  new.closed_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists projects_status_change on public.projects;
create trigger projects_status_change
  before update of status on public.projects
  for each row execute function public.projects_status_change();

-- No time on a cancelled project.
create or replace function public.timesheet_entries_cancelled_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  if new.project_assignment_id is null then
    return new;
  end if;
  select p.reference into v_ref
  from public.project_assignments a
  join public.project_lines l on l.id = a.project_line_id
  join public.projects p on p.id = l.project_id
  where a.id = new.project_assignment_id and p.status::text = 'cancelled';
  if v_ref is not null then
    raise exception 'Project % has been cancelled, so time can''t be logged against it.', v_ref;
  end if;
  return new;
end;
$$;

drop trigger if exists timesheet_entries_cancelled_project on public.timesheet_entries;
create trigger timesheet_entries_cancelled_project
  before insert or update on public.timesheet_entries
  for each row execute function public.timesheet_entries_cancelled_project();
