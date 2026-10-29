-- Lets the Contractors page offer a dropdown of logins to link a contractor
-- record to, instead of pasting a Supabase user UUID.
--
-- Emails live in auth.users, which the browser can't read. This security
-- definer function exposes just what the dropdown needs, only to staff, and
-- only for Contractor (field_engineer) logins. field_engineers.user_id is
-- already unique (0001_init.sql), so a login can only ever be linked to one
-- contractor record; linked_engineer_id lets the UI show which.

create or replace function public.list_contractor_logins()
returns table (
  id uuid,
  email text,
  full_name text,
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
    coalesce(u.banned_until > now(), false) as disabled,
    fe.id as linked_engineer_id
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.field_engineers fe on fe.user_id = u.id
  where p.role = 'field_engineer'
    and public.is_staff()
  order by lower(u.email);
$$;

revoke all on function public.list_contractor_logins() from public, anon;
grant execute on function public.list_contractor_logins() to authenticated;
