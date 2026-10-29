-- Staff profiles alongside contractor profiles.
--
-- Rather than a second table, staff records live in field_engineers too, with
-- kind = 'staff'. They get the same skills profile and CV (0014) for free.
-- day_rate is shown as "Cost rate" for staff. Timesheets only ever deal with
-- kind = 'contractor' records.
--
-- On screen the "Contractors" tab becomes "Users", with Contractors and Staff
-- sub-tabs (/staff/users/...).

alter table public.field_engineers
  add column kind text not null default 'contractor' check (kind in ('contractor', 'staff'));

comment on column public.field_engineers.kind is
  'contractor = external day-rate contractor (timesheets); staff = internal staff profile. day_rate is shown as "Cost rate" for staff.';

create index field_engineers_kind_idx on public.field_engineers (kind);

-- The login dropdown now serves both kinds, so it needs every login plus its
-- role (contractor records pick from Contractor logins, staff from Staff).
-- list_contractor_logins() (0013) is left in place so the live site keeps
-- working until this version is deployed; drop it in a later migration.

create or replace function public.list_people_logins()
returns table (
  id uuid,
  email text,
  full_name text,
  role user_role,
  disabled boolean,
  linked_engineer_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    u.id,
    u.email::text,
    p.full_name,
    p.role,
    coalesce(u.banned_until > now(), false) as disabled,
    fe.id as linked_engineer_id
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.field_engineers fe on fe.user_id = u.id
  where public.is_staff()
  order by lower(u.email);
$$;

revoke all on function public.list_people_logins() from public, anon;
grant execute on function public.list_people_logins() to authenticated;
