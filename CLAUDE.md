# Spine CRM — Project Notes

Read this first, before starting any task in this folder. It's the handoff from the chat where this project was first set up on GitHub/Vercel — keep it updated as things change.

## What this is

Spine CRM is a custom-built internal CRM for Techtrus (Mike's employer), replacing a legacy Power Apps/Dataverse system. Two modules: Timesheets (field engineer time tracking, approvals) and a full sales pipeline (Accounts → Opportunities → Quotes → Sales Orders → Invoices → Payments).

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind v4, in this folder.
- **Backend**: Supabase (Postgres + Auth + Row-Level Security). Schema/migrations in `supabase/migrations/`, run in order.
- **Hosting**: Vercel, auto-deploys from the `main` branch.
- **Source control**: GitHub — `github.com/mike-techtrus/spine-crm` (public repo).
- **Live URL**: `spine-crm.vercel.app`

## How Claude and Mike work together here (important constraints)

- Claude cannot push to GitHub directly — no GitHub connector is available in this environment, and device-flow CLI login (`gh auth login --web`) fails here with an HTTP 415. Claude also won't type a personal access token into git config even if Mike offers one — that's a hard credential-handling rule, not a preference. The working pattern is: **Claude edits files directly in this folder** (via the link to Mike's computer), then **Mike runs `git add -A && git commit -m "..." && git push` himself**.
- Dotfile paths (anything starting with `.`, e.g. `.github/`) can't be written directly via that file link — it's blocked as a protected path. If a change needs to land in a dotfile path, deliver the file to Mike and have him place it himself.
- `npm run dev` does **not** type-check — only `npm run build` (`tsc -b && vite build`, same as what Vercel runs) catches TypeScript errors. Always verify a build before calling a change done. A bug sat invisible in dev mode for a long time before this was understood (see below).
- `.github/workflows/build.yml` now runs `npm run build` on every push/PR via GitHub Actions, so a broken build shows up as a red X on the commit.
- Branch protection / PR-based workflow was deliberately **not** set up — Mike works solo on this for now, and Vercel already refuses to put a failed build live (confirmed in practice: a broken build just left the previous working version live, nothing broken reached real users). Revisit if other developers join.

## Recent work (as of late Oct 2026)

- **Users tab with staff profiles** (migration 0015): the top-level "Contractors" tab is now **Users** (`/staff/users`, permission key still `engineers`) with Contractors / Staff sub-tabs (`PeopleList.tsx`, `SectionTabs.tsx`). Staff profiles live in `field_engineers` too, with `kind = 'staff'`; `day_rate` is labelled "Cost rate" for them (`PERSON_KINDS` in types.ts). Profiles are `PersonProfile.tsx` at `/staff/users/{contractors|staff}/:id`; old `/staff/engineers` links redirect. Staff linked to a staff profile get My Timesheets; TimesheetDetail blocks approving your own. Login dropdown uses `list_people_logins()`; the old `list_contractor_logins()` is still in the DB only so the previous deploy kept working — drop it in a later migration.
- **Skills database** (migration 0014): `skill_categories`, `skills` and `contractor_skills` tables, plus a CV per contractor in the private `contractor-cvs` storage bucket (`field_engineers.cv_path` etc.). The master list is managed at Admin → Skills (`src/pages/staff/admin/SkillsAdmin.tsx`, writes need `is_admin()`). Profiles are now at `/staff/users/...` (see above). Admin now has tabs (`AdminTabs.tsx`); `/staff/admin` redirects to `/staff/admin/logins`. The Admin sub-tab for accounts is called **Logins** (not Users) so it doesn't clash with the top-level Users tab.
- Contractors link to a login through a dropdown (migration 0013, `list_contractor_logins()`). `field_engineers.user_id` is unique, so one login per contractor.

- "Field Engineer" is now called **"Contractor"** everywhere on screen. Only the labels changed: the database role (`field_engineer`), table (`field_engineers`), permission key (`engineers`) and code names deliberately still say engineer. Use "Contractor" in any new UI text.

- Added an in-app Admin area (`src/pages/staff/admin/UserAdmin.tsx`, branch `feature/user-admin`): add users, set/email password resets, disable/re-enable accounts (a Supabase auth "ban" — no delete, by Mike's choice), change profile, per-area permissions (`profiles.permissions`, migration 0012). Admin actions go through the `admin-users` Edge Function (`supabase/functions/admin-users`) because they need the service-role key. Area permissions are enforced in the UI/routes only so far — RLS still uses `is_staff()`.

- Added a Print / Export PDF feature to the Quote page (`src/pages/staff/QuoteForm.tsx`): a dedicated print-only view, hidden on screen and shown via the browser's print dialog ("Save as PDF"), styled plain black-on-white regardless of the app's dark theme. Shows client/end client, dates, line items, Value/VAT/Total (Rebate and Net value deliberately excluded per Mike's request), and a 30-day quote-validity disclaimer.
- Fixed a TypeScript build error in `OpportunityForm.tsx` (a `source` field typing mismatch) that silently broke `npm run build` — this caused the first failed Vercel deployment.
- Moved the project from local-only (`npm run dev` on Mike's PC) to GitHub + Vercel this week.

## What's next (from the project's own README "what's next" list)

- A Contacts management screen (table + lookups exist, no UI yet).
- Dashboard/reporting views (pipeline by stage, outstanding invoices, etc.).
- Email notifications (quote sent, invoice overdue, timesheet submitted).
- Pagination on list views.
- A proper field-engineer invite flow (currently manual, two steps via the Supabase dashboard — see `README.md` step 4).
- **Legacy data import**: historic quotes/line-items from the old SharePoint/Teams-based Project List need migrating into this schema. This is a separate, ongoing effort — a quote-by-quote backfill of the `quote_lines` table against the live Supabase project, cross-referencing SharePoint source documents, tracked in a different chat with a running spreadsheet of quotes flagged for manual review. Worth knowing it exists even though it isn't file-based work in this repo.

## Working with Mike

- Not deeply technical with git/dev tooling — explain plainly, avoid unexplained jargon, confirm before anything irreversible.
- British English, informal, direct tone. Wants fixes applied, not lectured at.
