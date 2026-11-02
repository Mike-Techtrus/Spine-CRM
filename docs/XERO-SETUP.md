# Xero link – checklist

Status as of **2 November 2026**: waiting on answers from the external accountants. Nothing has been built yet.

When the answers are back, fill them in under **Part B** (or paste the reply to Claude) and ask Claude to "carry on with the Xero link".

Nothing secret belongs in this file — the repository is public. Never put Xero keys, client secrets or passwords here; they go into Supabase secrets, added by Mike.

---

## Part A – Email to send to the accountants

> **Subject:** Connecting our Spine CRM to Xero – a few questions
>
> Hi [name],
>
> We've built our own CRM (Spine) where we raise quotes, sales orders and invoices, and record what we owe our contractors. To stop invoices being typed in twice, we'd like Spine to send invoices straight into our Xero, and pick up when they've been paid. Before we set it up, could you help with the following?
>
> **Access**
> 1. Is Techtrus its own Xero organisation, or does it sit under your practice? Who is the subscriber?
> 2. Connecting an app needs someone with the right access to approve it on Xero's "Allow access" screen (no passwords are shared). Would that be you, or should we be given access?
> 3. Would you recommend a Xero **Custom Connection** (one-company link, small monthly fee) or a standard app connection? Are you aware of any current Xero charges for either?
>
> **Sales invoices**
> 4. Which **account code(s)** should invoices use — one sales account for everything, or different ones for resource/day-rate work, expenses, logistics, hardware and licensing?
> 5. Which **tax rate** should we use (we assume 20% VAT on Income)? Anything zero-rated or reverse-charge we should know about?
> 6. Do you use any **tracking categories** we should fill in?
> 7. Invoice numbers: should Xero keep **our numbers** (e.g. INV12366), or use its own sequence?
> 8. Should invoices arrive in Xero as **drafts** for you to check, or **approved** and ready to send?
> 9. One customer (CDW) has an agreed **7.5% rebate** on resource work. How do you account for it today — as a line on the invoice, a credit note, or separately?
> 10. From what **date** should Spine start sending invoices, so we don't duplicate ones already in Xero?
>
> **Contractor costs**
> 11. We'd like our monthly **contractor statements** to become **bills** in Xero. Which account code should they use, and should any of these be treated as **self-billing** invoices?
>
> **Payments**
> 12. Are customer payments always recorded in Xero (e.g. from bank feeds)? If so, we'll read "paid" back from Xero rather than recording it twice.
>
> Many thanks,
> Mike

---

## Part B – Answers (fill in when they reply)

| # | Question | Answer |
|---|---|---|
| 1 | Xero organisation / subscriber | |
| 2 | Who approves the connection | |
| 3 | Custom Connection or standard app (and cost) | |
| 4 | Sales account code(s) — per line type? | |
| 5 | Tax rate(s) | |
| 6 | Tracking categories | |
| 7 | Invoice numbering (Spine's or Xero's) | |
| 8 | Draft or approved | |
| 9 | CDW rebate treatment | |
| 10 | Start date | |
| 11 | Contractor bills: account code, self-billing? | |
| 12 | Payments recorded in Xero? | |

## Part C – Setup steps (after Part B)

- [ ] Create the connection (Custom Connection in Xero, or an app at developer.xero.com) — whoever the accountants say.
- [ ] Mike adds the Xero client ID and secret himself as Supabase Edge Function secrets (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`). Never paste them into chat or a file.
- [ ] Claude checks the connection from Supabase with a read-only call (list of account codes and tax rates) before anything is written to Xero.

## Part D – What Claude will build

- **Send to Xero** button on an invoice (and optionally automatic when an invoice is marked Sent), matching the customer to an existing Xero contact or creating one; account codes and tax per Part B; Spine invoice number kept if agreed.
- A record on each Spine invoice of its Xero invoice ID and when it was sent, so it can't be sent twice; errors shown on the invoice.
- **Paid status back from Xero** — a scheduled check that marks Spine invoices Paid (and records the payment) when Xero shows them paid.
- Optionally, **contractor statements → Xero bills** (account code per Part B).
- A test against a single invoice first, checked with the accountants in Xero, before switching it on for everything.
