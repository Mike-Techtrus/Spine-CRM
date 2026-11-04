// triage-email — "Check with AI" on an Opportunities → Intake item. Checks the
// signed-in user has the Opportunities area, then runs the shared triage
// (../_shared/triage.ts), which saves the AI's reading on the intake item.
//
// Needs secret ANTHROPIC_API_KEY (the same one as read-po; Mike adds it).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically. The service-role client is used only after the permission
// check, so the triage can read opportunities and accounts for matching.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { triageIntakeItem } from '../_shared/triage.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(
      {
        error:
          "The AI isn't switched on yet — the Anthropic API key needs adding to Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY).",
      },
      503,
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: allowed } = await asUser.rpc('can_write', { area: 'opportunities' })
  if (!allowed) return json({ error: 'You need the Opportunities area to check emails.' }, 403)

  const { intakeId } = await req.json().catch(() => ({}))
  if (typeof intakeId !== 'string') return json({ error: 'No email given.' }, 400)

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    const reading = await triageIntakeItem(service, new Anthropic({ apiKey }), intakeId)
    return json({ reading })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: 'The Anthropic API key was turned down — check ANTHROPIC_API_KEY in Supabase.' }, 502)
    }
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'The AI service is busy — try again in a minute.' }, 429)
    return json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, 500)
  }
})
