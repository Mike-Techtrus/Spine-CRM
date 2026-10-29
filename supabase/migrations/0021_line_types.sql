-- Managed list of line types for rate-card line items (Admin → Rate cards),
-- each with how it gets billed:
--   timesheet — time & materials: will be added to invoices automatically from
--               approved timesheets once the timesheet module drives
--               invoicing (e.g. Resource).
--   manual    — added to invoices by hand (e.g. Expenses, Hardware).
--
-- line_items.line_type now has to be one of these names; renaming a type
-- updates its line items too (on update cascade). Quote lines keep their own
-- line_type text as written — past quotes are a record and aren't changed.

create type public.line_type_billing as enum ('timesheet', 'manual');

create table public.line_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  billing public.line_type_billing not null default 'manual',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.line_types enable row level security;

create policy "line_types_select_staff" on public.line_types for select using (public.is_staff());
create policy "line_types_write_admin" on public.line_types
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.line_types (name, billing, sort_order) values
  ('Outsource Resource', 'timesheet', 1),
  ('Resource', 'timesheet', 2),
  ('Expenses', 'manual', 3),
  ('Logistics', 'manual', 4),
  ('Licensing', 'manual', 5),
  ('Hardware', 'manual', 6);

-- Obvious reclassifications of the seeded line items (all were
-- "Outsource Resource"); everything else stays as it was.
update public.line_items set line_type = 'Expenses'
  where lower(part_code) in ('expenses', 'expenses/logistics');
update public.line_items set line_type = 'Logistics'
  where lower(part_code) = 'logistics';

alter table public.line_items
  add constraint line_items_line_type_fkey
  foreign key (line_type) references public.line_types (name) on update cascade;
