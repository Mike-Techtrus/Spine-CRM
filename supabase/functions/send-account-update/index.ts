// send-account-update — the weekly account update email for a customer
// (migration 0061; CDW to start with).
//
//   POST { mode: 'scheduled' }          pg_cron, Mondays: every switched-on account, at 8am UK
//                                        (header x-reminder-secret, same Vault secret as send-reminders)
//   POST { mode: 'preview', account_id } signed-in staff: returns the email (subject + HTML) — sends nothing
//   POST { mode: 'test', account_id }    signed-in staff: sends it to their own login email only, marked [TEST]
//   Add force: true to 'scheduled' to skip the 8am check.
//
// Only safe figures are read (account_update_data) — never rebate, net value,
// margins, costs or internal notes. Deployed with JWT checking off; staff calls
// are checked here (can_write('accounts')) with the caller's own token.
//
// Secret: RESEND_API_KEY (added by Mike). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const FROM = 'Techtrus <updates@spine.techtrus.co.uk>'
const LOGO = 'https://spine-crm.vercel.app/techtrus-logo-print.png'
const TZ = 'Europe/London'
const QUOTE_VALIDITY_DAYS = 30

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function env(name: string) {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing secret ${name}.`)
  return v
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// ── Dates and money ─────────────────────────────────────────────────────────

function london(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday as string }
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function ukDate(iso: string | null | undefined, long = false) {
  if (!iso) return '—'
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    ...(long ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  })
}

function money(v: number | string | null | undefined) {
  return `£${Number(v ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function days(n: number) {
  return Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function esc(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── The data (account_update_data, 0061) ────────────────────────────────────

interface Data {
  account: string
  company: { name: string | null; address: string | null; company_number: string | null; vat_reg: string | null } | null
  invoices: { invoice_number: string; end_client: string | null; po_number: string | null; invoice_date: string | null; due_date: string | null; total: number; outstanding: number }[]
  quotes: { quote_number: string; opportunity_name: string | null; customer_opportunity_number: string | null; end_client: string | null; value: number | null; quote_date: string | null; valid_until: string | null }[]
  opportunities: { opportunity_number: string; name: string; customer_opportunity_number: string | null; end_client: string | null; stage: string; created: string }[]
  awaiting_po: { reference: string; quote_number: string | null; opportunity_name: string | null; end_client: string | null; start_date: string | null; value: number | null }[]
  projects: { reference: string; name: string; end_client: string | null; po_number: string | null; days_ordered: number; days_used: number; end_date: string | null }[]
}

interface Settings {
  account_id: string
  enabled: boolean
  recipients: string[]
  reply_to: string | null
  note: string | null
}

// ── Email layout ────────────────────────────────────────────────────────────

const C = {
  ink: '#1b1f1a',
  muted: '#5c6558',
  faint: '#8a9182',
  line: '#e3e7df',
  soft: '#f5f7f2',
  green: '#6fa82f',
  red: '#c53438',
  amber: '#a86e00',
}
const FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif"

function th(label: string, align: 'left' | 'right' = 'left') {
  return `<th align="${align}" style="${FONT};font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};padding:8px 10px;border-bottom:2px solid ${C.line};text-align:${align}">${label}</th>`
}

function td(html: string, align: 'left' | 'right' = 'left', extra = '') {
  return `<td align="${align}" style="${FONT};font-size:13px;color:${C.ink};padding:9px 10px;border-bottom:1px solid ${C.line};text-align:${align};vertical-align:top;${extra}">${html}</td>`
}

function sub(text: string | null | undefined) {
  return text ? `<br><span style="font-size:12px;color:${C.muted}">${esc(text)}</span>` : ''
}

function table(head: string, rows: string[], foot = '') {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">
<tr>${head}</tr>${rows.join('')}${foot}</table>`
}

function section(title: string, intro: string, body: string) {
  return `<tr><td style="padding:26px 32px 0">
<h2 style="${FONT};margin:0 0 4px;font-size:16px;font-weight:600;color:${C.ink}">${title}</h2>
<p style="${FONT};margin:0 0 12px;font-size:13px;color:${C.muted}">${intro}</p>
${body}
</td></tr>`
}

function tile(label: string, value: string, note: string, tone?: 'red') {
  return `<td width="25%" valign="top" style="padding:0 4px">
<div style="border:1px solid ${tone === 'red' ? '#efc4c5' : C.line};border-radius:8px;padding:12px 12px 10px;background:#ffffff">
<div style="${FONT};font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">${label}</div>
<div style="${FONT};font-size:20px;font-weight:600;color:${tone === 'red' ? C.red : C.ink};margin-top:4px">${value}</div>
<div style="${FONT};font-size:12px;color:${C.faint};margin-top:2px">${note}</div>
</div></td>`
}

const STAGE: Record<string, string> = { qualifying: 'Gathering requirements', quoting: 'Preparing quote' }

function render(d: Data, s: Pick<Settings, 'note'>, today: string) {
  const owed = d.invoices.reduce((a, i) => a + Number(i.outstanding), 0)
  const overdue = d.invoices.filter((i) => i.due_date && i.due_date < today)
  const overdueTotal = overdue.reduce((a, i) => a + Number(i.outstanding), 0)
  const quotedTotal = d.quotes.reduce((a, q) => a + Number(q.value ?? 0), 0)

  const subject = `Techtrus weekly update for ${d.account} — ${ukDate(today)}`

  const tiles = `<tr><td style="padding:22px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${tile('Invoices outstanding', money(owed), `${d.invoices.length} invoice${d.invoices.length === 1 ? '' : 's'}${overdue.length ? ` · ${money(overdueTotal)} overdue` : ''}`, overdue.length ? 'red' : undefined)}
${tile('Quotes with you', String(d.quotes.length), d.quotes.length ? `${money(quotedTotal)} ex VAT` : 'none waiting')}
${tile('Opportunities', String(d.opportunities.length), 'in progress')}
${tile('Awaiting PO', String(d.awaiting_po.length), d.awaiting_po.length ? 'work under way' : 'none')}
</tr></table></td></tr>`

  const parts: string[] = []

  if (d.invoices.length) {
    const rows = d.invoices.map((i) => {
      const late = i.due_date ? daysBetween(i.due_date, today) : null
      const status =
        late === null
          ? ''
          : late > 0
            ? `<span style="color:${C.red};font-weight:600">${late} day${late === 1 ? '' : 's'} overdue</span>`
            : late === 0
              ? `<span style="color:${C.amber};font-weight:600">Due today</span>`
              : `<span style="color:${C.muted}">Due in ${-late} day${late === -1 ? '' : 's'}</span>`
      const part = Number(i.outstanding) < Number(i.total) - 0.005 ? sub(`of ${money(i.total)}`) : ''
      return `<tr>${td(`<b>${esc(i.invoice_number)}</b>${sub(i.end_client)}`)}${td(esc(i.po_number ?? 'PO to follow'))}${td(ukDate(i.invoice_date))}${td(`${ukDate(i.due_date)}<br><span style="font-size:12px">${status}</span>`)}${td(`${money(i.outstanding)}${part}`, 'right', 'white-space:nowrap')}</tr>`
    })
    const foot = `<tr><td colspan="4" style="${FONT};font-size:13px;font-weight:600;color:${C.ink};padding:10px;text-align:right">Total outstanding (inc VAT)</td><td align="right" style="${FONT};font-size:14px;font-weight:700;color:${C.ink};padding:10px;white-space:nowrap">${money(owed)}</td></tr>`
    parts.push(
      section(
        'Invoices outstanding',
        overdue.length ? `${overdue.length} of these ${overdue.length === 1 ? 'is' : 'are'} past the due date — we&rsquo;d be grateful if you could check ${overdue.length === 1 ? 'it' : 'them'} with your accounts team.` : 'Amounts still to be paid, including VAT.',
        table(th('Invoice') + th('PO') + th('Invoice date') + th('Due') + th('Amount due', 'right'), rows, foot),
      ),
    )
  }

  if (d.quotes.length) {
    const rows = d.quotes.map((q) => {
      const left = q.valid_until ? daysBetween(today, q.valid_until) : null
      const valid = q.valid_until
        ? `${ukDate(q.valid_until)}${left !== null && left <= 7 && left >= 0 ? `<br><span style="font-size:12px;color:${C.amber};font-weight:600">${left === 0 ? 'Expires today' : `${left} day${left === 1 ? '' : 's'} left`}</span>` : ''}`
        : '—'
      const ref = [q.customer_opportunity_number, q.end_client].filter(Boolean).join(' · ')
      return `<tr>${td(`<b>${esc(q.quote_number)}</b>`)}${td(`${esc(q.opportunity_name ?? '—')}${sub(ref)}`)}${td(ukDate(q.quote_date))}${td(valid)}${td(money(q.value), 'right', 'white-space:nowrap')}</tr>`
    })
    parts.push(
      section(
        'Quotes awaiting your decision',
        `Each quote is valid for ${QUOTE_VALIDITY_DAYS} days. Let us know if anything needs changing — we&rsquo;re happy to revise.`,
        table(th('Quote') + th('Opportunity') + th('Sent') + th('Valid until') + th('Value ex VAT', 'right'), rows),
      ),
    )
  }

  if (d.opportunities.length) {
    const rows = d.opportunities.map(
      (o) =>
        `<tr>${td(`<b>${esc(o.customer_opportunity_number ?? o.opportunity_number)}</b>${o.customer_opportunity_number ? sub(`Our ref ${o.opportunity_number}`) : ''}`)}${td(`${esc(o.name)}${sub(o.end_client)}`)}${td(esc(STAGE[o.stage] ?? o.stage))}${td(ukDate(o.created))}</tr>`,
    )
    parts.push(
      section(
        'Opportunities in progress',
        'Requests we&rsquo;re working on — a quote will follow.',
        table(th('Opportunity') + th('Description') + th('Stage') + th('Received'), rows),
      ),
    )
  }

  if (d.awaiting_po.length) {
    const rows = d.awaiting_po.map(
      (s) =>
        `<tr>${td(`<b>${esc(s.quote_number ?? s.reference)}</b>${s.quote_number ? sub(`Order ${s.reference}`) : ''}`)}${td(`${esc(s.opportunity_name ?? '—')}${sub(s.end_client)}`)}${td(ukDate(s.start_date))}${td(money(s.value), 'right', 'white-space:nowrap')}</tr>`,
    )
    parts.push(
      section(
        'Work under way — PO still needed',
        'We&rsquo;ve gone ahead on these at your request. Please send the purchase order when it&rsquo;s raised so we can invoice against it.',
        table(th('Quote') + th('Job') + th('Started') + th('Value ex VAT', 'right'), rows),
      ),
    )
  }

  if (d.projects.length) {
    const rows = d.projects.map((p) => {
      const ordered = Number(p.days_ordered)
      const used = Number(p.days_used)
      const pct = ordered > 0 ? Math.min(100, Math.round((used / ordered) * 100)) : 0
      const bar = `<table role="presentation" width="140" cellpadding="0" cellspacing="0" style="margin-top:5px"><tr><td style="background:${C.line};height:6px;border-radius:3px;font-size:0;line-height:0"><div style="width:${pct}%;height:6px;background:${used > ordered ? C.red : C.green};border-radius:3px"></div></td></tr></table>`
      return `<tr>${td(`<b>${esc(p.reference)}</b>${sub(p.po_number ? `PO ${p.po_number}` : null)}`)}${td(`${esc(p.name)}${sub(p.end_client)}`)}${td(`${days(used)} of ${days(ordered)} days${bar}`)}${td(ukDate(p.end_date))}</tr>`
    })
    parts.push(
      section(
        'Projects in progress',
        'Days used so far against the days ordered. We&rsquo;ll let you know in good time if more days are needed.',
        table(th('Project') + th('Job') + th('Days used') + th('Planned end'), rows),
      ),
    )
  }

  if (parts.length === 0) {
    parts.push(
      section('All clear', 'There&rsquo;s nothing outstanding with Techtrus this week — no unpaid invoices, quotes or open requests.', ''),
    )
  }

  const co = d.company
  const companyLine = [co?.name, co?.address, co?.company_number ? `Company No. ${co.company_number}` : null, co?.vat_reg ? `VAT Reg. ${co.vat_reg}` : null]
    .filter(Boolean)
    .map(esc)
    .join(' · ')

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.soft}">
<div style="display:none;max-height:0;overflow:hidden">${esc(`${money(owed)} outstanding · ${d.quotes.length} quote${d.quotes.length === 1 ? '' : 's'} awaiting your decision · ${d.opportunities.length} in progress`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};padding:28px 12px"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid ${C.line};border-radius:10px;overflow:hidden">
<tr><td style="height:4px;background:${C.green};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="${LOGO}" alt="Techtrus" height="48" style="display:block;height:48px;width:auto;border:0"></td>
<td valign="middle" align="right" style="${FONT};text-align:right"><div style="font-size:18px;font-weight:600;color:${C.ink}">Weekly account update</div><div style="font-size:13px;color:${C.muted};margin-top:2px">${esc(ukDate(today, true))}</div></td>
</tr></table></td></tr>
<tr><td style="padding:22px 32px 0">
<p style="${FONT};margin:0 0 10px;font-size:15px;color:${C.ink}">Hello ${esc(d.account)} team,</p>
${s.note ? `<p style="${FONT};margin:0 0 10px;font-size:14px;line-height:1.55;color:${C.ink}">${esc(s.note)}</p>` : ''}
<p style="${FONT};margin:0;font-size:14px;line-height:1.55;color:${C.ink}">Here&rsquo;s a summary of everything open between us this week.</p>
</td></tr>
${tiles}
${parts.join('\n')}
<tr><td style="padding:28px 32px 26px">
<p style="${FONT};margin:0;font-size:14px;line-height:1.55;color:${C.ink}">If anything here doesn&rsquo;t look right, or you&rsquo;d like an update on a particular job, just reply to this email.</p>
<p style="${FONT};margin:14px 0 0;font-size:14px;color:${C.ink}">Kind regards,<br><b>The Techtrus team</b></p>
</td></tr>
<tr><td style="padding:16px 32px;background:${C.soft};border-top:1px solid ${C.line}">
<p style="${FONT};margin:0;font-size:11px;line-height:1.5;color:${C.faint}">${companyLine}</p>
<p style="${FONT};margin:4px 0 0;font-size:11px;line-height:1.5;color:${C.faint}">You&rsquo;re receiving this weekly update as a Techtrus customer. To change who receives it, reply to this email.</p>
</td></tr>
</table></td></tr></table></body></html>`

  const text = [
    `Weekly account update — ${ukDate(today, true)}`,
    '',
    `Hello ${d.account} team,`,
    s.note ?? '',
    `Invoices outstanding: ${money(owed)} (${d.invoices.length})${overdue.length ? `, ${money(overdueTotal)} overdue` : ''}`,
    ...d.invoices.map((i) => `  ${i.invoice_number}  PO ${i.po_number ?? 'to follow'}  due ${ukDate(i.due_date)}  ${money(i.outstanding)}`),
    `Quotes awaiting your decision: ${d.quotes.length}`,
    ...d.quotes.map((q) => `  ${q.quote_number}  ${q.opportunity_name ?? ''}  valid until ${ukDate(q.valid_until)}  ${money(q.value)} ex VAT`),
    `Opportunities in progress: ${d.opportunities.length}`,
    ...d.opportunities.map((o) => `  ${o.customer_opportunity_number ?? o.opportunity_number}  ${o.name}  ${STAGE[o.stage] ?? o.stage}`),
    `Work under way, PO still needed: ${d.awaiting_po.length}`,
    ...d.awaiting_po.map((s2) => `  ${s2.quote_number ?? s2.reference}  ${s2.opportunity_name ?? ''}  ${money(s2.value)} ex VAT`),
    `Projects in progress: ${d.projects.length}`,
    ...d.projects.map((p) => `  ${p.reference}  ${p.name}  ${days(p.days_used)} of ${days(p.days_ordered)} days`),
    '',
    'Any questions, just reply to this email.',
    'Kind regards, The Techtrus team',
    '',
    companyLine.replace(/&[a-z]+;/g, ''),
  ].join('\n')

  return { subject, html, text }
}

// ── Sending ─────────────────────────────────────────────────────────────────

async function send(
  db: SupabaseClient,
  o: { dedupeKey: string; to: string[]; replyTo: string | null; subject: string; html: string; text: string; profileId: string | null },
) {
  const { data: row, error } = await db
    .from('email_log')
    .insert({ kind: 'account_update', dedupe_key: o.dedupeKey, profile_id: o.profileId, recipient: o.to.join(', '), subject: o.subject })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { status: 'already sent' }
    throw new Error(error.message)
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': o.dedupeKey.slice(0, 256) },
    body: JSON.stringify({ from: FROM, to: o.to, reply_to: o.replyTo ? [o.replyTo] : undefined, subject: o.subject, html: o.html, text: o.text }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = `${res.status} ${body?.message ?? body?.name ?? 'Resend error'}`
    await db.from('email_log').update({ status: 'failed', error: msg, dedupe_key: `${o.dedupeKey}:failed:${row.id}` }).eq('id', row.id)
    return { status: 'failed', error: msg }
  }
  await db.from('email_log').update({ status: 'sent', resend_id: body.id ?? null }).eq('id', row.id)
  return { status: 'sent' }
}

async function dataFor(db: SupabaseClient, accountId: string): Promise<Data> {
  const { data, error } = await db.rpc('account_update_data', { p_account: accountId })
  if (error) throw new Error(error.message)
  if (!data?.account) throw new Error('Account not found.')
  return data as Data
}

// ── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const now = london()

    // Scheduled run (pg_cron, shared secret).
    if (body.mode === 'scheduled') {
      const { data: ok } = await db.rpc('reminder_secret_ok', { p_secret: req.headers.get('x-reminder-secret') ?? '' })
      if (ok !== true) return new Response('Forbidden', { status: 403 })
      if (!body.force && !(now.weekday === 'Mon' && now.hour === 8)) return json({ skipped: `Not Monday 8am in the UK (${now.weekday} ${now.hour}:00).` })
      const { data: list, error } = await db.from('account_update_emails').select('*').eq('enabled', true)
      if (error) throw new Error(error.message)
      const results = []
      for (const s of (list ?? []) as Settings[]) {
        const to = (s.recipients ?? []).map((x) => x.trim()).filter(Boolean)
        if (to.length === 0) continue
        const email = render(await dataFor(db, s.account_id), s, now.date)
        results.push({ account: s.account_id, ...(await send(db, { dedupeKey: `account_update:${s.account_id}:${now.date}`, to, replyTo: s.reply_to, profileId: null, ...email })) })
      }
      return json({ results })
    }

    // Staff: preview or test, checked with their own token.
    const auth = req.headers.get('Authorization') ?? ''
    const userDb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
    const { data: who } = await userDb.auth.getUser()
    const { data: allowed } = await userDb.rpc('can_write', { area: 'accounts' })
    if (!who?.user || allowed !== true) return json({ error: 'You need the Customer Accounts area to do this.' }, 403)

    const accountId = String(body.account_id ?? '')
    if (!accountId) return json({ error: 'No account given.' }, 400)
    const { data: settings } = await db.from('account_update_emails').select('*').eq('account_id', accountId).maybeSingle()
    const s: Settings = (settings as Settings) ?? { account_id: accountId, enabled: false, recipients: [], reply_to: null, note: null }
    const note = typeof body.note === 'string' ? body.note : s.note // preview what's typed, before saving
    const email = render(await dataFor(db, accountId), { note }, now.date)

    if (body.mode === 'preview') return json({ subject: email.subject, html: email.html })

    if (body.mode === 'test') {
      const to = who.user.email
      if (!to) return json({ error: 'Your login has no email address.' }, 400)
      const replyTo = typeof body.reply_to === 'string' && body.reply_to.trim() ? body.reply_to.trim() : s.reply_to
      const result = await send(db, {
        dedupeKey: `account_update:test:${accountId}:${Date.now()}`,
        to: [to],
        replyTo,
        profileId: who.user.id,
        ...email,
        subject: `[TEST] ${email.subject}`,
      })
      if (result.status !== 'sent') return json({ error: result.error ?? 'Not sent.' }, 502)
      return json({ sentTo: to })
    }

    return json({ error: 'mode must be preview, test or scheduled.' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
