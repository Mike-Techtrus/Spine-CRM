-- New "Reports" area (first report: Rebate). Area permissions are stored per
-- login in profiles.permissions (0012); give it to everyone who already has the
-- Admin area so it shows up straight away. Others can be given it in
-- Admin → Logins. The admin-users Edge Function's AREA_KEYS also lists
-- 'reports' (deployed alongside this), or saving a login would drop it.
--
-- Reports only read data, which all staff can already read, so no new
-- row-level security is needed.

begin;

update public.profiles
set permissions = array_append(permissions, 'reports')
where role = 'staff'
  and 'admin' = any (permissions)
  and not ('reports' = any (permissions));

commit;
