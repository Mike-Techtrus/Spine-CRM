-- Spine CRM — Timesheet module
-- Initial schema: profiles (roles), clients, field engineers, timesheet entries.
-- Mirrors the field set already designed in the Power Apps/Dataverse build
-- (spine_fieldengineer, spine_timesheetentry) so nothing from that design work is lost.

-- ─────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────
-- profiles — one row per auth user, carries their role in the app
-- ─────────────────────────────────────────────────────────────────────────
create type user_role as enum ('staff', 'field_engineer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role user_role not null default 'field_engineer',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with an app role. Created automatically on sign-up by handle_new_user().';

-- Helper used throughout RLS policies below. security definer + a fixed
-- search_path so it can read profiles even though profiles itself has RLS on,
-- without that lookup recursing back through the caller's own policies.
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff'
  );
$$;

-- Auto-create a profile row whenever someone signs up. The role and name are
-- expected to arrive via the auth signUp() call's options.data (see
-- src/pages/InviteSetPassword.tsx / staff invite flow) — defaults to
-- field_engineer if not supplied so nobody ends up profile-less.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'field_engineer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- clients — who the work is done for (seed/import this from the Techtrus
-- Project List once we get to the sales-pipeline module; kept minimal here)
-- ─────────────────────────────────────────────────────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- field_engineers — external day-rate contractors. user_id is filled in once
-- they accept their invite and create a login; a row can exist before that.
-- ─────────────────────────────────────────────────────────────────────────
create table public.field_engineers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null unique,
  name text not null,
  email text not null unique,
  phone text,
  day_rate numeric(10, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index field_engineers_user_id_idx on public.field_engineers (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- timesheet_entries — one row per day/half-day worked
-- ─────────────────────────────────────────────────────────────────────────
create type day_type as enum ('full_day', 'half_day_am', 'half_day_pm');
create type timesheet_status as enum ('draft', 'submitted', 'approved', 'rejected');

create sequence public.timesheet_reference_seq;

create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'TS-' || lpad(nextval('public.timesheet_reference_seq')::text, 6, '0')
  ),
  field_engineer_id uuid not null references public.field_engineers (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_reference text,
  work_date date not null,
  day_type day_type not null default 'full_day',
  work_description text,
  status timesheet_status not null default 'draft',
  submitted_on timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_on timestamptz,
  rejection_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rejection_notes_required_when_rejected check (
    status <> 'rejected' or rejection_notes is not null
  )
);

create index timesheet_entries_field_engineer_idx on public.timesheet_entries (field_engineer_id);
create index timesheet_entries_client_idx on public.timesheet_entries (client_id);
create index timesheet_entries_status_idx on public.timesheet_entries (status);
create index timesheet_entries_work_date_idx on public.timesheet_entries (work_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger timesheet_entries_set_updated_at
  before update on public.timesheet_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.field_engineers enable row level security;
alter table public.timesheet_entries enable row level security;

-- profiles: everyone can read their own profile; staff can read everyone's
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

-- clients: any signed-in user can read (needed to populate the timesheet
-- form's client dropdown); only staff can write
create policy "clients_select_all" on public.clients
  for select using (auth.uid() is not null);

create policy "clients_write_staff" on public.clients
  for all using (public.is_staff()) with check (public.is_staff());

-- field_engineers: an engineer can read their own record; staff can read/write all
create policy "field_engineers_select_own_or_staff" on public.field_engineers
  for select using (user_id = auth.uid() or public.is_staff());

create policy "field_engineers_write_staff" on public.field_engineers
  for all using (public.is_staff()) with check (public.is_staff());

-- timesheet_entries:
--   staff: full access
--   field engineer: can see and create their own rows; can only edit their
--   own rows while still draft/rejected (i.e. before approval, or to fix up
--   a rejection); cannot touch approval fields — those are staff-only via a
--   separate policy below.
create policy "timesheets_select_own_or_staff" on public.timesheet_entries
  for select using (
    public.is_staff()
    or field_engineer_id in (
      select id from public.field_engineers where user_id = auth.uid()
    )
  );

create policy "timesheets_insert_own_or_staff" on public.timesheet_entries
  for insert with check (
    public.is_staff()
    or field_engineer_id in (
      select id from public.field_engineers where user_id = auth.uid()
    )
  );

create policy "timesheets_update_own_while_editable" on public.timesheet_entries
  for update using (
    field_engineer_id in (
      select id from public.field_engineers where user_id = auth.uid()
    )
    and status in ('draft', 'rejected')
  )
  with check (
    field_engineer_id in (
      select id from public.field_engineers where user_id = auth.uid()
    )
    and status in ('draft', 'submitted') -- an engineer can move draft/rejected -> submitted, or keep editing a draft
  );

create policy "timesheets_staff_full_access" on public.timesheet_entries
  for all using (public.is_staff()) with check (public.is_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- Seed data — remove or edit before go-live. Useful for local dev/testing.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.clients (name) values
  ('Example Client Ltd');
