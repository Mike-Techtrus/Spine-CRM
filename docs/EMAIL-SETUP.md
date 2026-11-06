# Email setup – checklist

Status as of **6 November 2026**: Parts A and B done (except DKIM signing for techtrus.com, below); Part C built, waiting for the test email to be checked before the schedule goes on. Tick items off as they're done. When everything in Part A is done, ask Claude to "carry on with the email reminders" — it will check the DNS from its side and build the rest (Part C).

Nothing secret belongs in this file: the repository is public.

---

## Part A – Spine's reminder emails (Resend)

Spine will send reminders from **`Spine CRM <noreply@spine.techtrus.co.uk>`** through **Resend** (resend.com).

- [x] Resend account created and connected to Claude.
- [x] Domain **spine.techtrus.co.uk** added in Resend — EU region (eu-west-1), sending only, open/click tracking off.
- [x] **Get access to Cloudflare** for techtrus.co.uk (DNS is on Cloudflare — `andy` / `zara.ns.cloudflare.com`).
      Don't create a new Cloudflare account and "Add site" — that would ask to change nameservers and could break the website and email.
      Instead ask whoever owns the existing Cloudflare account (IT provider / web designer) to either invite you (Manage Account → Members, a DNS role is enough) or add the records below for you.
- [x] **Add these 5 records** (added by the IT provider; Resend shows **Verified** on 6 Nov 2026) in Cloudflare → techtrus.co.uk → DNS → Records (type the Name exactly as shown; Cloudflare adds `.techtrus.co.uk`):

  | Type  | Name                       | Content / value                                       | Priority |
  |-------|----------------------------|--------------------------------------------------------|----------|
  | TXT   | `resend._domainkey.spine`  | *(the long `p=MIGf…` DKIM key — see below)*            | —        |
  | MX    | `send.spine`               | `feedback-smtp.eu-west-1.amazonses.com`                | 10       |
  | TXT   | `send.spine`               | `v=spf1 include:amazonses.com ~all`                    | —        |
  | CNAME | `rsend.spine`              | `send.forge.rmta.net` — **Proxy status: DNS only (grey cloud)** | — |
  | TXT   | `_dmarc.spine`             | `v=DMARC1; p=none;`                                    | —        |

  DKIM key for `resend._domainkey.spine` (copy as one line):

  ```
  p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvIkBABKk6pbDIbzNgOGGGVjLj53lCBNJGN51m99f8q2UtyTKJVjqiIYmApMQAx99ezEHdtj0NTiXksLFLg03qYI/g07CSvRKgFm2yoaF6eS+OpgkAGLh/FqelLgmfmJ2tCUkgzXRpqKoWTlI9Tzvu65bHaLxrWixjMfNkrUcMeQIDAQAB
  ```

  (This is a *public* key — fine to keep here. It's also shown in Resend → Domains → spine.techtrus.co.uk.)

- [x] **Create the sending key**: Resend → API Keys → Create → name `Spine CRM reminders`, permission **Sending access**, domain **spine.techtrus.co.uk**. Copy it (shown once).
- [x] **Put it in Supabase yourself**: Spine CRM project → Edge Functions → Secrets → Add new secret → name `RESEND_API_KEY`, value = the key. Don't paste the key into chat or into any file.

## Part B – General email security for Techtrus (found on 2 Nov 2026)

Not needed for Spine, but worth fixing. All of it is Cloudflare DNS except step 2 (Microsoft 365 / Exchange admin).

**techtrus.com** (Microsoft 365 / Exchange Online):

- [x] **1. Fix SPF** — the current record `v=spf1 include:spf.protection.outlook.com include:techtrus.co.uk -all` points at techtrus.co.uk, which has **no SPF record**, so SPF checks error and outgoing mail is more likely to land in spam.
      Change it to `v=spf1 include:spf.protection.outlook.com -all` — first check nothing else sends *as @techtrus.com* (website forms, accounts software, scanners…); if something does, add its `include:` too.
- [x] **2. Turn on DKIM** — CNAMEs added by the IT provider and signing switched on in Microsoft 365 (6 Nov 2026; it had last been checked in 2016) (Exchange admin): security.microsoft.com → Email & collaboration → Policies & rules → Threat policies → Email authentication settings → DKIM → techtrus.com. Add the two CNAMEs it shows (`selector1._domainkey`, `selector2._domainkey`) in Cloudflare as **DNS only**, wait ~15 min, then switch signing **On**.
- [x] **3. Add DMARC** (monitor mode first): TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@techtrus.com`. Create a `dmarc@techtrus.com` mailbox or shared mailbox for the reports. After 2–4 weeks of clean reports, change `p=none` → `p=quarantine`.
- [x] **4. Tidy up**: delete the leftover MX record `ms34331684.msv1.invalid` (priority 0).

**techtrus.co.uk** (mail via `mx-lon` / `mx-dfw.smtp.directrouter.com`):

- [x] **5. SPF** — none at the moment. If anything sends as @techtrus.co.uk, ask that provider for the right SPF line; if nothing does, add TXT `v=spf1 -all`.
- [x] **6. DMARC** — TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@techtrus.com`.

## Part C – What Claude builds once Part A is done

- Check spine.techtrus.co.uk shows **Verified** in Resend.
- A Supabase Edge Function that sends the reminders, using the `RESEND_API_KEY` secret.
- Database schedule (pg_cron + pg_net, via Supabase Vault):
  - **Friday 3pm** — "please submit this week's timesheet" to anyone on an active project with draft days this week or nothing logged.
  - **Monday 9am** — "you have N timesheets to approve" to project owners / admins.
  - **Straight away** — "your timesheet for [date] was rejected" (with the reason) to the person.
- A log of every email sent, so nobody gets the same reminder twice, and a per-person opt-out.
- A **test email to Mike first**, before anyone else gets anything.
- Optional: use Resend for Supabase's own login emails too (password resets/invites) — the built-in sender only allows a few an hour.
