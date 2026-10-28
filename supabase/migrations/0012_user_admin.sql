-- In-app user administration: per-area permissions for staff profiles.
--
-- Creating users and changing passwords needs Supabase's admin API (the
-- service-role key), which must never reach the browser — that part lives in
-- the admin-users Edge Function (supabase/functions/admin-users). This
-- migration only adds what the database needs: which areas of the app each
-- staff member can use, and who counts as an admin.
--
-- Area keys (keep in step with APP_AREAS in src/lib/types.ts):
--   dashboard, opportunities, quotes, sales_orders, invoices, timesheets,
--   accounts, engineers, admin

alter table public.profiles
  add column permissions text[] not null default '{}';

comment on column public.profiles.permissions is
  'Areas of the app a staff user can open (see APP_AREAS in src/lib/types.ts). Ignored for field engineers. "admin" unlocks the user administration area.';

-- Existing staff keep access to everything they have today, plus admin, so
-- nobody is locked out the moment this goes live. Trim it back from the
-- Admin area afterwards.
update public.profiles
set permissions = array[
  'dashboard', 'opportunities', 'quotes', 'sales_orders', 'invoices',
  'timesheets', 'accounts', 'engineers', 'admin'
]
where role = 'staff';

-- True if the signed-in user is staff and has been given the named area.
-- Same security definer pattern as is_staff() in 0001_init.sql.
create or replace function public.has_area(area text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff' and area = any (permissions)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_area('admin');
$$;

-- Staff created outside the app (e.g. Supabase Dashboard → Add user, as in
-- README step 3) get every area except admin, matching what staff could do
-- before permissions existed. Users created from the Admin area have their
-- permissions set straight after by the admin-users function.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role user_role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'field_engineer');
begin
  insert into public.profiles (id, full_name, role, permissions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new_role,
    case when new_role = 'staff' then array[
      'dashboard', 'opportunities', 'quotes', 'sales_orders', 'invoices',
      'timesheets', 'accounts', 'engineers'
    ] else '{}' end
  );
  return new;
end;
$$;
