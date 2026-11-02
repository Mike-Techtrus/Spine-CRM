-- My Profile: contractors and staff look after their own profile.
--
--   • Phone and address — update_my_profile(). Name, email and day/cost rate
--     stay admin-only (Admin → User Accounts).
--   • CV and profile photo — files in their own folder ({field_engineer id}/…)
--     of the private "contractor-cvs" / new "profile-photos" buckets; the
--     record is pointed at them by set_profile_file() (self or staff).
--   • Driving licence and passport — new person_documents table + private
--     "identity-documents" bucket. Only the person themselves and admins can
--     see them (not all staff).
--   • Skills — they can add/edit/remove their own skills, but only add ones
--     that are active in the skills database. Anything missing they request
--     (skill_requests); an admin approves (approve_skill_request(), which
--     creates the skill and adds it to their profile) or declines it.
--
-- Staff with the usual access keep full control through the existing
-- is_staff() policies.

begin;

-- ── Helper ──────────────────────────────────────────────────────────────────

-- The contractor/staff record linked to the current login, if any.
create or replace function public.my_field_engineer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.field_engineers where user_id = auth.uid();
$$;

-- ── Details ─────────────────────────────────────────────────────────────────

create or replace function public.update_my_profile(
  p_phone text,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_postcode text
)
returns public.field_engineers
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.field_engineers;
begin
  update public.field_engineers
  set phone = nullif(trim(p_phone), ''),
      address_line_1 = nullif(trim(p_address_line_1), ''),
      address_line_2 = nullif(trim(p_address_line_2), ''),
      city = nullif(trim(p_city), ''),
      postcode = upper(nullif(trim(p_postcode), ''))
  where user_id = auth.uid()
  returning * into result;

  if result.id is null then
    raise exception 'Your login isn''t linked to a contractor or staff profile.';
  end if;
  return result;
end;
$$;

-- ── CV and photo on the record ──────────────────────────────────────────────

alter table public.field_engineers
  add column photo_path text,
  add column photo_uploaded_at timestamptz;

comment on column public.field_engineers.photo_path is
  'Object path in the private "profile-photos" storage bucket.';

-- Points a record at a newly uploaded CV or photo (or clears it with a null
-- path). Allowed for the person themselves or any staff user.
create or replace function public.set_profile_file(
  p_field_engineer_id uuid,
  p_kind text,
  p_path text,
  p_file_name text
)
returns public.field_engineers
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.field_engineers;
begin
  if not (public.is_staff() or p_field_engineer_id = public.my_field_engineer_id()) then
    raise exception 'You can only change your own profile.';
  end if;
  if p_path is not null and p_path not like p_field_engineer_id::text || '/%' then
    raise exception 'That file isn''t in this profile''s folder.';
  end if;

  if p_kind = 'cv' then
    update public.field_engineers
    set cv_path = p_path,
        cv_file_name = case when p_path is null then null else p_file_name end,
        cv_uploaded_at = case when p_path is null then null else now() end
    where id = p_field_engineer_id
    returning * into result;
  elsif p_kind = 'photo' then
    update public.field_engineers
    set photo_path = p_path,
        photo_uploaded_at = case when p_path is null then null else now() end
    where id = p_field_engineer_id
    returning * into result;
  else
    raise exception 'Unknown file kind: %', p_kind;
  end if;

  return result;
end;
$$;

-- ── Identity documents ──────────────────────────────────────────────────────

create table public.person_documents (
  id uuid primary key default gen_random_uuid(),
  field_engineer_id uuid not null references public.field_engineers (id) on delete cascade,
  doc_type text not null check (doc_type in ('driving_licence', 'passport')),
  path text not null,
  file_name text not null,
  expires_on date,
  uploaded_at timestamptz not null default now(),
  unique (field_engineer_id, doc_type)
);

comment on table public.person_documents is
  'Driving licence / passport copies. Files are in the private "identity-documents" bucket. Visible to the person and admins only.';

alter table public.person_documents enable row level security;

create policy "person_documents_own_or_admin" on public.person_documents
  for all
  using (field_engineer_id = (select public.my_field_engineer_id()) or (select public.is_admin()))
  with check (field_engineer_id = (select public.my_field_engineer_id()) or (select public.is_admin()));

-- ── Storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 5242880, -- 5 MB
   array['image/jpeg', 'image/png', 'image/webp']),
  ('identity-documents', 'identity-documents', false, 10485760, -- 10 MB
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- CVs: people can now manage the file in their own folder (staff already can).
create policy "contractor_cvs_own_select" on storage.objects
  for select using (
    bucket_id = 'contractor-cvs'
    and (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text
  );
create policy "contractor_cvs_own_insert" on storage.objects
  for insert with check (
    bucket_id = 'contractor-cvs'
    and (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text
  );
create policy "contractor_cvs_own_delete" on storage.objects
  for delete using (
    bucket_id = 'contractor-cvs'
    and (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text
  );

-- Photos: own folder, or any staff user.
create policy "profile_photos_select" on storage.objects
  for select using (
    bucket_id = 'profile-photos'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy "profile_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'profile-photos'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy "profile_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'profile-photos'
    and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );

-- Identity documents: own folder, or admins only.
create policy "identity_documents_select" on storage.objects
  for select using (
    bucket_id = 'identity-documents'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy "identity_documents_insert" on storage.objects
  for insert with check (
    bucket_id = 'identity-documents'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );
create policy "identity_documents_delete" on storage.objects
  for delete using (
    bucket_id = 'identity-documents'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select public.my_field_engineer_id())::text)
  );

-- ── Skills: everyone signed in can read the list ────────────────────────────

alter policy skill_categories_select_staff on public.skill_categories
  using ((select auth.uid()) is not null);
alter policy skill_categories_select_staff on public.skill_categories
  rename to skill_categories_select_signed_in;

alter policy skills_select_staff on public.skills
  using ((select auth.uid()) is not null);
alter policy skills_select_staff on public.skills
  rename to skills_select_signed_in;

-- ── Skills: own profile ─────────────────────────────────────────────────────

create policy "contractor_skills_own_select" on public.contractor_skills
  for select using (field_engineer_id = (select public.my_field_engineer_id()));

-- Only skills that are active in the database can be added.
create policy "contractor_skills_own_insert" on public.contractor_skills
  for insert with check (
    field_engineer_id = (select public.my_field_engineer_id())
    and exists (select 1 from public.skills s where s.id = skill_id and s.is_active)
  );

create policy "contractor_skills_own_update" on public.contractor_skills
  for update
  using (field_engineer_id = (select public.my_field_engineer_id()))
  with check (field_engineer_id = (select public.my_field_engineer_id()));

create policy "contractor_skills_own_delete" on public.contractor_skills
  for delete using (field_engineer_id = (select public.my_field_engineer_id()));

-- ── Skill requests ──────────────────────────────────────────────────────────

create table public.skill_requests (
  id uuid primary key default gen_random_uuid(),
  field_engineer_id uuid not null references public.field_engineers (id) on delete cascade,
  category_id uuid references public.skill_categories (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  details text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  skill_id uuid references public.skills (id) on delete set null, -- the skill it became, once approved
  response text, -- admin's note back
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index skill_requests_field_engineer_id_idx on public.skill_requests (field_engineer_id);
create index skill_requests_category_id_idx on public.skill_requests (category_id);
create index skill_requests_skill_id_idx on public.skill_requests (skill_id);
create index skill_requests_decided_by_idx on public.skill_requests (decided_by);
create index skill_requests_pending_idx on public.skill_requests (created_at) where status = 'pending';

alter table public.skill_requests enable row level security;

create policy "skill_requests_select_own_or_admin" on public.skill_requests
  for select using (field_engineer_id = (select public.my_field_engineer_id()) or (select public.is_admin()));

create policy "skill_requests_insert_own" on public.skill_requests
  for insert with check (
    field_engineer_id = (select public.my_field_engineer_id())
    and status = 'pending'
    and skill_id is null and response is null and decided_by is null and decided_at is null
  );

-- Withdraw your own while it's still pending; admins can delete any.
create policy "skill_requests_delete_own_pending_or_admin" on public.skill_requests
  for delete using (
    (field_engineer_id = (select public.my_field_engineer_id()) and status = 'pending')
    or (select public.is_admin())
  );

-- Approve: creates the skill (or reuses one with the same name in that
-- category, reactivating it), adds it to the requester's profile and marks
-- the request approved. Returns the skill id.
create or replace function public.approve_skill_request(
  p_request_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_response text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.skill_requests;
  v_skill uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve skill requests.';
  end if;

  select * into req from public.skill_requests where id = p_request_id for update;
  if req.id is null or req.status <> 'pending' then
    raise exception 'That request has already been dealt with.';
  end if;
  if p_category_id is null or nullif(trim(p_name), '') is null then
    raise exception 'Choose a category and a name for the skill.';
  end if;

  select id into v_skill from public.skills
  where category_id = p_category_id and lower(name) = lower(trim(p_name));

  if v_skill is null then
    insert into public.skills (category_id, name, description)
    values (p_category_id, trim(p_name), nullif(trim(p_description), ''))
    returning id into v_skill;
  else
    update public.skills set is_active = true where id = v_skill;
  end if;

  insert into public.contractor_skills (field_engineer_id, skill_id)
  values (req.field_engineer_id, v_skill)
  on conflict (field_engineer_id, skill_id) do nothing;

  update public.skill_requests
  set status = 'approved',
      category_id = p_category_id,
      skill_id = v_skill,
      response = nullif(trim(p_response), ''),
      decided_by = auth.uid(),
      decided_at = now()
  where id = req.id;

  return v_skill;
end;
$$;

create or replace function public.decline_skill_request(p_request_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decline skill requests.';
  end if;

  update public.skill_requests
  set status = 'declined',
      response = nullif(trim(p_response), ''),
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'That request has already been dealt with.';
  end if;
end;
$$;

commit;
