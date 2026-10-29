# Spine CRM

A web-based rebuild of Spine CRM — built with React, Supabase (Postgres + Auth + Row-Level
Security) and Vercel, instead of Power Apps/Dataverse. Two modules so far:

- **Timesheets** — field engineers submit day/half-day entries, staff approve/reject with an
  audit trail.
- **Sales pipeline** — Accounts → Opportunities → Quotes → Sales Orders → Invoices → Payments,
  mirroring the schema already designed against Dataverse.

Two kinds of users:

- **Field engineers** (external day-rate contractors) — log in, submit timesheet entries, see
  their own history and any rejection notes. No access to the sales pipeline.
- **Staff** — everything: timesheet approvals, and the full sales pipeline.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (pick a region close to
   your users, e.g. London).
2. In the SQL Editor, run the migrations **in order**:
   - `supabase/migrations/0001_init.sql` — profiles/roles, accounts (as `clients` initially),
     field engineers, timesheet entries.
   - `supabase/migrations/0002_sales_pipeline.sql` — promotes `clients` to a full `accounts`
     table and adds contacts, opportunities, quotes, sales orders, invoices, payments.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.

## 2. Configure the app

```bash
cp .env.example .env.local
```

Edit `.env.local` and paste in the URL and anon key from step 1.

```bash
npm install
npm run dev
```

The app will be running at `http://localhost:5173`.

## 3. Create your own (staff) login

Easiest way for the first account:

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**.
2. Set your email and a password. Under **User Metadata**, add:
   ```json
   { "full_name": "Mike", "role": "staff" }
   ```
3. Sign in at `/login` with that email/password — you'll land in the staff area, with the sales
   pipeline and timesheets both in the nav.

Any further staff accounts work the same way (role: `staff`).

## 4. Add contractors and staff profiles

The **Users** tab has two sub-tabs, **Contractors** and **Staff** (needs
`0015_staff_profiles.sql`). Both are stored in `field_engineers`, told apart by `kind`; staff show
**Cost rate** where contractors show **Day rate** (same column).

1. **Users → Contractors / Staff → Add** — name, email, phone, rate. This creates their profile but
   not a login.
2. Create their login from **Admin → Users → Add user** with the matching profile (Contractor or
   Staff). If the email matches a profile of that kind, it's linked automatically.
3. Otherwise pick the login from the **Login** dropdown. Contractor profiles list Contractor
   logins, staff profiles list Staff logins, and each login links to one person.

Staff linked to a staff profile get a **My Timesheets** tab and can log time like contractors.
Their timesheets appear in the staff Timesheets list (marked "Staff"); nobody can approve their own.

## 4a. Admin area (user accounts and permissions)

Staff with the **Admin** permission get an **Admin** tab where they can add users, set or email
password resets, disable and re-enable accounts (deliberately no delete, so history stays intact),
change someone's profile (Staff / Field engineer) and choose which areas of the app
each staff member can use. This replaces the dashboard steps in §3/§4 for everyone after the first
admin.

One-off setup:

1. Run `supabase/migrations/0012_user_admin.sql` in the SQL Editor. Every existing staff user is
   given all areas, including Admin.
2. Deploy the Edge Function in `supabase/functions/admin-users/index.ts` — Supabase Dashboard →
   **Edge Functions → Deploy a new function**, name it `admin-users`, paste the file in. It needs
   the service-role key, which Supabase provides to Edge Functions automatically.
3. Supabase Dashboard → **Authentication → URL Configuration**: make sure the Site URL is the live
   app (`https://spine-crm.vercel.app`) and add `http://localhost:5173` to Redirect URLs, so
   password-reset emails link back to the app.

Area permissions currently control the nav and which pages open; the database still lets any staff
user read and write sales-pipeline/timesheet data. Tightening the RLS policies per area is the
natural next step (`public.has_area('quotes')` etc. is ready for it).

## 4b. Skills database and contractor profiles

Run `supabase/migrations/0014_skills_database.sql` in the SQL Editor. It creates the skills tables
(seeded with Technical skills / Soft skills / Certifications categories), CV columns on the
contractor record and a private `contractor-cvs` storage bucket (PDF/Word, 10 MB max).

- **Admin → Skills** (Admin permission): manage categories and the master skills list. Skills on a
  contractor's profile can't be deleted, only deactivated.
- **Users → Contractors or Staff → click a name** opens their profile: edit details, add skills from the database
  (with optional level, obtained/expiry dates and notes — expired dates show red, ones expiring
  within 60 days amber), and upload, download or replace their CV.

## 5. Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, **Add New Project**, import the repo (framework preset: Vite).
3. Add the same two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
   Vercel's project settings.
4. Deploy. Vercel will give you a URL you can share with staff and field engineers.

## Using the sales pipeline

The flow mirrors how the Project List worked, now relational instead of flat rows:

1. **Accounts** — add the companies you deal with (clients, end clients). Everything else points
   back to these.
2. **Opportunities** — log new business as it comes in (source, stage, estimated value). The
   "Client" field here is the billing relationship, "End client" is who the work is actually for
   — same distinction the Dataverse build settled on.
3. **Quotes** — create one against an opportunity (or standalone). When it's agreed, open it and
   click **Create Sales Order from this Quote** — carries over client, dates and values so you're
   not retyping them.
4. **Sales Orders** — the confirmed order once a PO's in. One Sales Order is often invoiced more
   than once as work is delivered, so from here click **Create Invoice from this Sales Order** as
   many times as needed.
5. **Invoices** — record payments directly on the invoice (partial payments supported; the
   running "remaining amount" is calculated for you).

Quote numbers, sales order references, invoice numbers and payment references are auto-generated
(`Q-000123`, `SO-000123`, etc.) but can be overwritten — handy when importing historic numbers
from the Project List so they stay recognisable.

## What's built vs. what's next

**Built:**

- Auth (email/password or magic link), role-aware routing (staff vs. field engineer).
- Timesheets: submit/edit entries, approve/reject with audit trail, RLS locking an engineer out
  of anything that isn't their own draft/rejected entry.
- Sales pipeline: Accounts, Opportunities, Quotes, Sales Orders, Invoices, Payments — full
  create/edit for each, with the Quote→Sales Order→Invoice conversion shortcuts above.

**Deliberately out of scope for this pass** (flag if you want these prioritised next):

- A proper in-app invite flow for field engineers (see §4 above).
- Legacy data import (Techtrus Project List / Teams-SharePoint quotes / shared mailbox) — this
  was in progress before the stack change; same analysis-first approach applies, just importing
  into this Postgres schema instead of Dataverse. Now there's a concrete relational schema to
  import into, this is probably the natural next step.
- A Contacts management screen — the `contacts` table and the Opportunity/Quote lookups to it
  exist, but there's no UI to add one yet.
- Dashboard/reporting views (pipeline by stage, outstanding invoices, etc.) — the Project List's
  "Dashboard" sheet did this manually; now it's queryable data, a proper view is easy to add.
- Email notifications (quote sent, invoice overdue, timesheet submitted), PDF generation for
  quotes/invoices, pagination on list views (fine at current data volumes).

## Project structure

```
src/
  lib/
    types.ts        Shared TypeScript types + label maps for every entity
    supabaseClient.ts
    api/             Data-access functions, one file per entity (accounts, timesheets,
                      opportunities, quotes, salesOrders, invoices) re-exported via index.ts
  contexts/          Auth state (session, profile/role)
  components/        Shared UI primitives, layout, route guard
  pages/
    engineer/        Field engineer screens
    staff/           Staff screens — timesheets, accounts, field engineers, and the sales pipeline
supabase/
  migrations/        SQL schema + RLS policies, run in order in the Supabase SQL Editor
```
