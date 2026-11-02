-- Margin per project: each allocation keeps its own cost rate.
--
-- project_assignments.cost_rate = what this person costs per day on this
-- project line. Filled in from their Day / Cost rate (Admin → User Accounts)
-- when they're allocated, and editable on the project page afterwards, so a
-- later change to someone's standard rate doesn't rewrite past margins and a
-- rate agreed for one project can be recorded there. The sell side is the
-- line's quoted day rate (project_lines.day_rate), already locked from the quote.
--
-- Existing allocations take their person's current rate.

begin;

alter table public.project_assignments
  add column cost_rate numeric(10, 2) check (cost_rate is null or cost_rate >= 0);

comment on column public.project_assignments.cost_rate is
  'Cost per day for this person on this line (0041). Defaults to field_engineers.day_rate when allocated.';

create or replace function public.project_assignments_default_cost_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cost_rate is null then
    select fe.day_rate into new.cost_rate from public.field_engineers fe where fe.id = new.field_engineer_id;
  end if;
  return new;
end;
$$;

create trigger project_assignments_default_cost_rate
  before insert on public.project_assignments
  for each row execute function public.project_assignments_default_cost_rate();

set local spine.skip_audit = 'on';

update public.project_assignments pa
set cost_rate = fe.day_rate
from public.field_engineers fe
where fe.id = pa.field_engineer_id and pa.cost_rate is null;

commit;
