// send-reminders — timesheet reminder emails through Resend (migration 0058).
//
//   POST { kind: 'submit' }    Fridays 3pm UK: "please submit this week's timesheet"
//   POST { kind: 'approve' }   Mondays 9am UK: "N timesheets to approve"
//   POST { kind: 'rejected' }  every 15 min: "your timesheet for … was rejected"
//   POST { kind: 'test', to }  one sample of each email, to `to` only
//   Add dry_run: true to list who would get what without sending anything.
//   Add force: true to skip the "is it 3pm / 9am in the UK" check (submit/approve).
//
// Called by pg_cron (migration 0059), not by people: deployed with JWT
// checking off; the header x-reminder-secret must match the random secret
// stored in Vault as spine_reminders_secret (checked by reminder_secret_ok).
// Who gets what is worked out in SQL (reminder_*_candidates); email_log stops
// anyone getting the same reminder twice.
//
// Secret (added by Mike in Supabase → Edge Functions → Secrets, never in code):
//   RESEND_API_KEY — sending-only key for spine.techtrus.co.uk
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const FROM = 'Spine CRM <noreply@spine.techtrus.co.uk>'
const APP = 'https://spine-crm.vercel.app'
const TZ = 'Europe/London'

type Kind = 'submit' | 'approve' | 'rejected' | 'test'

function env(name: string) {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing secret ${name}.`)
  return v
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } })
}

// ── Dates (UK time) ─────────────────────────────────────────────────────────

function londonParts(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday as string }
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function mondayOf(iso: string) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 Sun … 6 Sat
  return addDays(iso, -((dow + 6) % 7))
}

function ukDate(iso: string, withDay = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    ...(withDay ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function days(n: number) {
  return `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 })} day${Number(n) === 1 ? '' : 's'}`
}

const DAY_TYPE: Record<string, string> = { full_day: 'Full day', half_day_am: 'Half day (AM)', half_day_pm: 'Half day (PM)' }

// ── Email layout ────────────────────────────────────────────────────────────

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Email {
  subject: string
  heading: string
  paragraphs: string[] // already-escaped HTML
  button: { label: string; url: string }
  footer: string
}

function render(e: Email) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Segoe UI,Arial,sans-serif;color:#1a1e18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dde2d8;border-radius:8px">
<tr><td style="padding:20px 28px;border-bottom:3px solid #8cc73f;font-size:13px;letter-spacing:.08em;color:#4a5244"><b style="color:#1a1e18">SPINE CRM</b> &nbsp;·&nbsp; Techtrus</td></tr>
<tr><td style="padding:24px 28px">
<h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${esc(e.heading)}</h1>
${e.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${p}</p>`).join('\n')}
<p style="margin:22px 0 6px"><a href="${esc(e.button.url)}" style="display:inline-block;background:#8cc73f;color:#0a0b0a;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:6px">${esc(e.button.label)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eef0eb;font-size:12px;color:#6e756a;line-height:1.5">${e.footer}</td></tr>
</table></td></tr></table></body></html>`
  const text = [
    e.heading,
    '',
    ...e.paragraphs.map((p) => p.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')),
    '',
    `${e.button.label}: ${e.button.url}`,
    '',
    e.footer.replace(/<[^>]+>/g, ''),
  ].join('\n')
  return { html, text }
}

const OPT_OUT = `You're getting this because you use Spine CRM. You can turn reminder emails off on <a href="${APP}/my/profile" style="color:#4a5244">My Profile</a>.`
const NO_REPLY = 'This is an automatic message from Spine CRM — replies aren’t read.'

function submitEmail(c: SubmitCandidate, weekStart: string): Email {
  const range = `${ukDate(weekStart, true)} – ${ukDate(addDays(weekStart, 4), true)}`
  const draft = Number(c.draft_days)
  const lines = [
    `Hi ${esc(c.name.split(' ')[0])},`,
    draft > 0
      ? `You have <b>${esc(days(draft))}</b> saved as draft for this week (${esc(range)}) that ${draft === 1 ? 'hasn’t' : 'haven’t'} been submitted yet.`
      : `There’s no time logged for this week (${esc(range)}) yet.`,
    `Please fill in and submit your timesheet for <b>${esc(c.projects)}</b> so it can be approved and invoiced.`,
  ]
  return {
    subject: draft > 0 ? 'Reminder: submit this week’s timesheet' : 'Reminder: fill in this week’s timesheet',
    heading: 'Time to submit your timesheet',
    paragraphs: lines,
    button: { label: 'Open my timesheets', url: `${APP}/my/timesheets` },
    footer: `${OPT_OUT}<br>${NO_REPLY}`,
  }
}

function approveEmail(c: ApprovalCandidate): Email {
  const n = Number(c.waiting)
  return {
    subject: `${n} timesheet day${n === 1 ? '' : 's'} waiting for your approval`,
    heading: 'Timesheets to approve',
    paragraphs: [
      `Hi ${esc((c.name ?? '').split(' ')[0] || 'there')},`,
      `There ${n === 1 ? 'is' : 'are'} <b>${n} submitted timesheet day${n === 1 ? '' : 's'}</b> waiting for you to approve, the oldest from ${esc(ukDate(c.oldest))}.`,
      'Approved days can then be invoiced and paid.',
    ],
    button: { label: 'Open Team timesheets', url: `${APP}/staff/timesheets` },
    footer: `${OPT_OUT}<br>${NO_REPLY}`,
  }
}

function rejectedEmail(name: string, rows: RejectedCandidate[]): Email {
  const sorted = [...rows].sort((a, b) => a.work_date.localeCompare(b.work_date))
  const list = sorted
    .map(
      (r) =>
        `&bull; <b>${esc(ukDate(r.work_date, true))}</b> — ${esc(DAY_TYPE[r.day_type] ?? r.day_type)}${r.project ? ` on ${esc(r.project)}` : ''}${r.reason ? `<br><span style="color:#4a5244">Reason: ${esc(r.reason)}</span>` : ''}`,
    )
    .join('<br>')
  const one = sorted.length === 1
  return {
    subject: one ? `Your timesheet for ${ukDate(sorted[0].work_date)} was rejected` : `${sorted.length} timesheet days were rejected`,
    heading: one ? 'Timesheet rejected' : 'Timesheet days rejected',
    paragraphs: [
      `Hi ${esc(name.split(' ')[0])},`,
      `${one ? 'This day was' : 'These days were'} sent back to you:`,
      list,
      'Please correct and submit again.',
    ],
    button: { label: 'Open my timesheets', url: `${APP}/my/timesheets` },
    footer: NO_REPLY,
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────

interface SubmitCandidate {
  field_engineer_id: string
  profile_id: string
  name: string
  email: string
  draft_days: number
  logged_days: number
  projects: string
}
interface ApprovalCandidate {
  profile_id: string
  name: string | null
  email: string
  waiting: number
  oldest: string
}
interface RejectedCandidate {
  dedupe_key: string
  field_engineer_id: string
  profile_id: string
  name: string
  email: string
  work_date: string
  day_type: string
  project: string | null
  reason: string | null
}

interface Outgoing {
  kind: Kind
  dedupeKey: string
  covers?: string[]
  profileId: string | null
  to: string
  email: Email
}

async function send(db: SupabaseClient, o: Outgoing, dryRun: boolean) {
  if (dryRun) return { to: o.to, subject: o.email.subject, status: 'would send' }

  // Claim the dedupe key first, so two runs can't both send it.
  const { data: row, error: claimError } = await db
    .from('email_log')
    .insert({
      kind: o.kind,
      dedupe_key: o.dedupeKey,
      covers: o.covers ?? [],
      profile_id: o.profileId,
      recipient: o.to,
      subject: o.email.subject,
    })
    .select('id')
    .single()
  if (claimError) {
    if (claimError.code === '23505') return { to: o.to, subject: o.email.subject, status: 'already sent' }
    throw new Error(claimError.message)
  }

  const { html, text } = render(o.email)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': o.dedupeKey.slice(0, 256),
    },
    body: JSON.stringify({ from: FROM, to: [o.to], subject: o.email.subject, html, text }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = `${res.status} ${body?.message ?? body?.name ?? 'Resend error'}`
    // A failed send frees the key so the next run tries again.
    await db.from('email_log').update({ status: 'failed', error, dedupe_key: `${o.dedupeKey}:failed:${row.id}` }).eq('id', row.id)
    return { to: o.to, subject: o.email.subject, status: 'failed', error }
  }
  await db.from('email_log').update({ status: 'sent', resend_id: body.id ?? null }).eq('id', row.id)
  return { to: o.to, subject: o.email.subject, status: 'sent' }
}

// ── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: ok } = await db.rpc('reminder_secret_ok', { p_secret: req.headers.get('x-reminder-secret') ?? '' })
  if (ok !== true) return new Response('Forbidden', { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const kind = body.kind as Kind
    const dryRun = body.dry_run === true
    const force = body.force === true
    const now = londonParts()
    const results: unknown[] = []

    if (kind === 'test') {
      const to = String(body.to ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Give a "to" address for the test.' }, 400)
      const weekStart = mondayOf(now.date)
      const samples: Email[] = [
        submitEmail(
          { field_engineer_id: '', profile_id: '', name: 'Sample Person', email: to, draft_days: 2, logged_days: 0, projects: 'PRJ-00000 Sample project' },
          weekStart,
        ),
        approveEmail({ profile_id: '', name: 'Sample Person', email: to, waiting: 7, oldest: addDays(weekStart, -7) }),
        rejectedEmail('Sample Person', [
          { dedupe_key: '', field_engineer_id: '', profile_id: '', name: '', email: to, work_date: addDays(weekStart, -3), day_type: 'full_day', project: 'PRJ-00000 Sample project', reason: 'Wrong project — this was the Reading site.' },
          { dedupe_key: '', field_engineer_id: '', profile_id: '', name: '', email: to, work_date: addDays(weekStart, -2), day_type: 'half_day_am', project: 'PRJ-00000 Sample project', reason: null },
        ]),
      ]
      for (const [i, e] of samples.entries()) {
        results.push(
          await send(db, { kind: 'test', dedupeKey: `test:${Date.now()}:${i}`, profileId: null, to, email: { ...e, subject: `[TEST] ${e.subject}` } }, dryRun),
        )
      }
      return json({ kind, results })
    }

    if (kind === 'submit') {
      if (!force && !(now.weekday === 'Fri' && now.hour === 15)) return json({ kind, skipped: `Not Friday 3pm in the UK (${now.weekday} ${now.hour}:00).` })
      const weekStart = mondayOf(now.date)
      const { data, error } = await db.rpc('reminder_submit_candidates', { p_week_start: weekStart })
      if (error) throw new Error(error.message)
      for (const c of (data ?? []) as SubmitCandidate[]) {
        results.push(
          await send(db, { kind, dedupeKey: `submit:${weekStart}:${c.field_engineer_id}`, profileId: c.profile_id, to: c.email, email: submitEmail(c, weekStart) }, dryRun),
        )
      }
      return json({ kind, week: weekStart, results })
    }

    if (kind === 'approve') {
      if (!force && !(now.weekday === 'Mon' && now.hour === 9)) return json({ kind, skipped: `Not Monday 9am in the UK (${now.weekday} ${now.hour}:00).` })
      const { data, error } = await db.rpc('reminder_approval_candidates')
      if (error) throw new Error(error.message)
      for (const c of (data ?? []) as ApprovalCandidate[]) {
        results.push(await send(db, { kind, dedupeKey: `approve:${now.date}:${c.profile_id}`, profileId: c.profile_id, to: c.email, email: approveEmail(c) }, dryRun))
      }
      return json({ kind, results })
    }

    if (kind === 'rejected') {
      const { data, error } = await db.rpc('reminder_rejected_candidates')
      if (error) throw new Error(error.message)
      const byPerson = new Map<string, RejectedCandidate[]>()
      for (const r of (data ?? []) as RejectedCandidate[]) byPerson.set(r.field_engineer_id, [...(byPerson.get(r.field_engineer_id) ?? []), r])
      for (const rows of byPerson.values()) {
        const keys = rows.map((r) => r.dedupe_key).sort()
        results.push(
          await send(
            db,
            { kind, dedupeKey: `rejected:${keys.join('|')}`.slice(0, 1000), covers: keys, profileId: rows[0].profile_id, to: rows[0].email, email: rejectedEmail(rows[0].name, rows) },
            dryRun,
          ),
        )
      }
      return json({ kind, results })
    }

    return json({ error: 'kind must be submit, approve, rejected or test.' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
