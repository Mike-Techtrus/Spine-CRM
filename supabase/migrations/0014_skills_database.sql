-- Skills database + contractor skills profiles + CV uploads.
--
--   skill_categories   — e.g. Technical skills, Soft skills, Certifications.
--                        Managed from Admin → Skills.
--   skills             — the master list, each in one category. Managed from
--                        Admin → Skills. Deactivate rather than delete once a
--                        skill is in use (contractor_skills restricts deletes).
--   contractor_skills  — which skills a contractor has, with optional level,
--                        dates (mainly for certifications) and notes.
--   field_engineers.cv_* + storage bucket "contractor-cvs" — one CV per
--                        contractor, private, downloaded via signed URLs.
--
-- Writes to the master list need the "admin" area (is_admin(), 0012). Reading
-- it and building contractor profiles is open to staff, matching how the rest
-- of the contractor data works today.

-- ── Categories ──────────────────────────────────────────────────────────────
create table public.skill_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index skill_categories_name_key on public.skill_categories (lower(name));

insert into public.skill_categories (name, sort_order) values
  ('Technical skills', 1),
  ('Soft skills', 2),
  ('Certifications', 3);

-- ── Skills ──────────────────────────────────────────────────────────────────
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.skill_categories (id) on delete restrict,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index skills_category_name_key on public.skills (category_id, lower(name));
create index skills_category_id_idx on public.skills (category_id);

-- ── Contractor skills ───────────────────────────────────────────────────────
create table public.contractor_skills (
  id uuid primary key default gen_random_uuid(),
  field_engineer_id uuid not null references public.field_engineers (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  level text check (level in ('beginner', 'intermediate', 'advanced', 'expert')),
  obtained_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  unique (field_engineer_id, skill_id)
);

create index contractor_skills_skill_id_idx on public.contractor_skills (skill_id);

-- ── CV on the contractor record ─────────────────────────────────────────────
alter table public.field_engineers
  add column cv_path text,
  add column cv_file_name text,
  add column cv_uploaded_at timestamptz;

comment on column public.field_engineers.cv_path is
  'Object path in the private "contractor-cvs" storage bucket.';

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.skill_categories enable row level security;
alter table public.skills enable row level security;
alter table public.contractor_skills enable row level security;

create policy "skill_categories_select_staff" on public.skill_categories
  for select using (public.is_staff());
create policy "skill_categories_write_admin" on public.skill_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "skills_select_staff" on public.skills
  for select using (public.is_staff());
create policy "skills_write_admin" on public.skills
  for all using (public.is_admin()) with check (public.is_admin());

create policy "contractor_skills_staff" on public.contractor_skills
  for all using (public.is_staff()) with check (public.is_staff());

-- ── CV storage ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contractor-cvs',
  'contractor-cvs',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

create policy "contractor_cvs_staff_select" on storage.objects
  for select using (bucket_id = 'contractor-cvs' and public.is_staff());
create policy "contractor_cvs_staff_insert" on storage.objects
  for insert with check (bucket_id = 'contractor-cvs' and public.is_staff());
create policy "contractor_cvs_staff_update" on storage.objects
  for update using (bucket_id = 'contractor-cvs' and public.is_staff());
create policy "contractor_cvs_staff_delete" on storage.objects
  for delete using (bucket_id = 'contractor-cvs' and public.is_staff());
