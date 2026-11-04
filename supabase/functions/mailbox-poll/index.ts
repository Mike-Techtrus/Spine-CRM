// mailbox-poll — picks up new emails from the watched Microsoft 365 mailbox,
// adds each as an Opportunities → Intake item and runs the AI triage on it.
// Read-only on the mailbox: it never moves, marks, deletes or sends mail.
//
// Called every few minutes by pg_cron (see docs/MAILBOX-SETUP.md), not by
// people, so it's deployed with JWT checking off and instead requires the
// header x-poll-secret to match INTAKE_POLL_SECRET.
//
// Secrets (added in Supabase → Edge Functions → Secrets, never in code):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET — the Azure app registration
//   INTAKE_MAILBOX      — e.g. sales@techtrus.com
//   INTAKE_POLL_SECRET  — any long random string, also stored for pg_cron
//   ANTHROPIC_API_KEY   — same as read-po / triage-email

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { triageIntakeItem } from '../_shared/triage.ts'

const MAX_PER_RUN = 10 // keeps one run well inside the function time limit
const FIRST_RUN_LOOKBACK_DAYS = 2

function env(name: string) {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing secret ${name}.`)
  return v
}

async function graphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('MS_CLIENT_ID'),
      client_secret: env('MS_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}).`)
  return (await res.json()).access_token as string
}

interface GraphMessage {
  id: string
  conversationId: string
  subject: string | null
  receivedDateTime: string
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: { emailAddress?: { address?: string } }[]
  body?: { content?: string }
  hasAttachments: boolean
}

Deno.serve(async (req) => {
  if (req.headers.get('x-poll-secret') !== Deno.env.get('INTAKE_POLL_SECRET') || !Deno.env.get('INTAKE_POLL_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const token = await graphToken()
    const mailbox = encodeURIComponent(env('INTAKE_MAILBOX'))
    const graph = (path: string) =>
      fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
      })

    // Carry on from the newest email already picked up.
    const { data: last } = await db
      .from('intake_items')
      .select('received_at')
      .eq('source', 'mailbox')
      .order('received_at', { ascending: false })
      .limit(1)
    const since = last?.[0]?.received_at ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86400_000).toISOString()

    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${new Date(since).toISOString()}`,
      $orderby: 'receivedDateTime asc',
      $top: String(MAX_PER_RUN + 5),
      $select: 'id,conversationId,subject,receivedDateTime,from,toRecipients,body,hasAttachments',
    })
    const res = await graph(`/mailFolders/inbox/messages?${params}`)
    if (!res.ok) throw new Error(`Reading the mailbox failed (${res.status}): ${await res.text()}`)
    const messages: GraphMessage[] = (await res.json()).value ?? []

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const anthropic = apiKey ? new Anthropic({ apiKey }) : null
    let added = 0
    for (const m of messages) {
      if (added >= MAX_PER_RUN) break
      let attachmentNames: string[] = []
      if (m.hasAttachments) {
        const a = await graph(`/messages/${m.id}/attachments?$select=name`)
        if (a.ok) attachmentNames = ((await a.json()).value ?? []).map((x: { name: string }) => x.name)
      }
      // message_id is unique, so an email already picked up is skipped.
      const { data: inserted, error } = await db
        .from('intake_items')
        .upsert(
          {
            source: 'mailbox',
            message_id: m.id,
            conversation_id: m.conversationId,
            from_name: m.from?.emailAddress?.name ?? null,
            from_email: m.from?.emailAddress?.address ?? null,
            to_emails: (m.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(', ') || null,
            subject: m.subject,
            received_at: m.receivedDateTime,
            body_text: (m.body?.content ?? '').trim() || '(empty email)',
            attachment_names: attachmentNames,
            created_by: null,
          },
          { onConflict: 'message_id', ignoreDuplicates: true },
        )
        .select('id')
      if (error) throw new Error(error.message)
      if (!inserted?.length) continue
      added++
      if (anthropic) {
        // A failed triage is saved on the item (status "error") and can be re-run from Spine.
        await triageIntakeItem(db, anthropic, inserted[0].id).catch(() => {})
      }
    }
    return Response.json({ checked: messages.length, added })
  } catch (err) {
    console.error(err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
})
