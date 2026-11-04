-- 0054: Opportunity intake — emails about new or existing opportunities,
-- triaged by AI (Edge Function triage-email) for a person to act on.
--
--   • intake_items — one row per email: pasted in (Opportunities → Intake →
--     Add email) or picked up from the watched mailbox (Edge Function
--     mailbox-poll, once Microsoft 365 is connected). The AI's reading is in
--     `ai` (category, match, qualification sheet, gaps, draft questions); it
--     is only a suggestion. A person then creates an opportunity, links it to
--     one, or dismisses it.
--   • opportunities.qualification — the running qualification sheet, copied
--     from the latest linked email and shown on the opportunity page.
--   • Same pattern as the other pipeline tables (0039): any staff can read,
--     changes need the Opportunities area.

begin;

create table public.intake_items (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'paste' check (source in ('paste', 'mailbox')),
  message_id text unique,          -- mailbox message id (Microsoft Graph); null for pasted emails
  conversation_id text,            -- mailbox thread id, so replies find their opportunity
  from_name text,
  from_email text,
  to_emails text,
  subject text,
  received_at timestamptz not null default now(),
  body_text text not null,
  attachment_names text[] not null default '{}',
  status text not null default 'new'
    check (status in ('new', 'triaged', 'error', 'linked', 'created', 'dismissed')),
  ai jsonb,
  ai_model text,
  ai_at timestamptz,
  ai_error text,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  dismissed_reason text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.intake_items is
  'Emails about opportunities, triaged by AI (triage-email) for a person to act on. The AI reading is a suggestion only.';

create index intake_items_opportunity_id_idx on public.intake_items (opportunity_id);
create index intake_items_conversation_id_idx on public.intake_items (conversation_id);
create index intake_items_status_idx on public.intake_items (status, received_at desc);
create index intake_items_decided_by_idx on public.intake_items (decided_by);
create index intake_items_created_by_idx on public.intake_items (created_by);

alter table public.intake_items enable row level security;

create policy intake_items_select_staff on public.intake_items
  for select using ((select public.is_staff()));
create policy intake_items_write on public.intake_items
  for all using ((select public.can_write('opportunities'))) with check ((select public.can_write('opportunities')));

alter table public.opportunities
  add column qualification jsonb,
  add column qualification_updated_at timestamptz;

comment on column public.opportunities.qualification is
  'Running qualification sheet (job type, facts, gaps) from the latest linked intake email. Edited by people on the opportunity page.';

commit;
