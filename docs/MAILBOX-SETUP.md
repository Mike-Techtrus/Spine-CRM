# Connecting a mailbox to Spine's opportunity intake

Spine can watch **one** Microsoft 365 mailbox, for example a shared sales inbox. Every few minutes it picks up new emails and adds them to **Opportunities → Intake**, where the AI reads them and a person decides what to do.

The connection is **read-only and limited to that one mailbox**. It can't send, move, delete or mark emails as read, and it can't see anyone else's mailbox.

Until this is set up, people can paste emails into Intake by hand, and everything else works the same.

---

## Part 1 — for the Microsoft 365 admin

### 1. Register an app in Microsoft Entra

1. Open **entra.microsoft.com** and go to **Applications → App registrations → New registration**.
2. Name it `Spine opportunity intake`. Choose **Single tenant**, leave Redirect URI blank, and press **Register**.
3. On the app's **Overview** page, note the **Application (client) ID** and the **Directory (tenant) ID**.

### 2. Give it permission to read mail

1. Go to **API permissions → Add a permission → Microsoft Graph → Application permissions**.
2. Tick **Mail.Read** and press **Add permissions**.
3. Press **Grant admin consent for Techtrus**.

### 3. Limit it to the one mailbox (important)

On its own, Mail.Read lets the app read **every** mailbox. This step restricts it to the intake mailbox only.

1. Create a **mail-enabled security group**, for example `spine-intake-mailboxes`, with the intake mailbox as its only member.
2. In **Exchange Online PowerShell**, run:

```powershell
New-ApplicationAccessPolicy -AppId <Application (client) ID> -PolicyScopeGroupId spine-intake-mailboxes@techtrus.com -AccessRight RestrictAccess -Description "Spine intake: one mailbox only"
```

3. Check it. The first command should say **Granted** and the second **Denied**:

```powershell
Test-ApplicationAccessPolicy -AppId <Application (client) ID> -Identity sales@techtrus.com
Test-ApplicationAccessPolicy -AppId <Application (client) ID> -Identity someone.else@techtrus.com
```

Microsoft can take up to an hour to apply the policy.

### 4. Create a client secret

1. Go to **Certificates & secrets → New client secret**, describe it as `Spine`, and set it to expire in 24 months.
2. Copy the **Value** straight away, because it's only shown once.
3. Hand it to Mike in person or through a password manager. Don't send it by email or Teams.

Put a reminder in the diary to renew the secret before it expires.

---

## Part 2 — for Mike (Supabase)

### 5. Add the secrets

Open Supabase → project **Spine CRM** → **Edge Functions → Secrets** and add:

| Name | Value |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID from step 1 |
| `MS_CLIENT_ID` | Application (client) ID from step 1 |
| `MS_CLIENT_SECRET` | Secret value from step 4 |
| `INTAKE_MAILBOX` | The mailbox address, e.g. `sales@techtrus.com` |
| `INTAKE_POLL_SECRET` | A long random string, e.g. from a password generator |
| `ANTHROPIC_API_KEY` | Already there if PO checking is set up (see `PO-AI-SETUP.md`) |

### 6. Tell Claude it's done

Claude will then:

- deploy the `mailbox-poll` function;
- run it once to check it can read the mailbox;
- once you've said yes, schedule it every 5 minutes with `pg_cron`. The poll secret is stored in Supabase Vault, not in a migration, because the repo is public.

On its first run it picks up the last 2 days of email, then carries on from the newest email it has seen.

---

## Cost

Each email costs roughly 3–8p for the AI (Claude Opus 5.5); Spine's opportunity and account lists are cached between emails to keep it down. A busy inbox of 50 emails a day is roughly £2–4 a day. Emails that aren't opportunity-related cost the same to read (the AI has to read them to tell), so watching a focused sales / opportunities inbox is cheaper than a personal one.

## Switching it off

Delete the `INTAKE_POLL_SECRET` secret (or ask Claude to unschedule the job). Emails already picked up stay in Intake.
