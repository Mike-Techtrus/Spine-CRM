// read-po — reads a customer PO attached to a sales order (sales_order_files,
// migration 0051) with Claude and saves what it found on the file's row
// (ai_reading, migration 0052). The app then compares it with the quote.
//
// Nothing on the sales order itself is changed here — the reading is only a
// suggestion until someone presses "Use these figures" and saves the order.
//
// Needs one secret, added by Mike in Supabase → Edge Functions → Secrets:
//   ANTHROPIC_API_KEY   (from console.anthropic.com → API keys)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
//
// Deploy: `npx supabase functions deploy read-po` (or Dashboard → Edge
// Functions → Deploy new function, name "read-po", paste this file).
//
// Runs as the signed-in user (their token is passed to Supabase), so the
// usual row-level security applies: only people with the Sales Orders area
// can read and save a PO.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const MODEL = 'claude-opus-5-5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const money = { type: ['number', 'null'] }
const text = { type: ['string', 'null'] }

// Keep in step with PoReading in src/lib/poCheck.ts.
const READING_SCHEMA = {
  type: 'object',
  properties: {
    is_purchase_order: { type: 'boolean' },
    po_number: text,
    po_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    buyer: text,
    supplier: text,
    quote_reference: { type: ['string', 'null'], description: 'Any supplier quote number the PO refers to' },
    currency: text,
    value_ex_vat: money,
    vat: money,
    total_inc_vat: money,
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          qty: money,
          unit_price: money,
          amount: money,
        },
        required: ['description', 'qty', 'unit_price', 'amount'],
        additionalProperties: false,
      },
    },
    notes: { type: ['string', 'null'], description: 'Anything that needs a person to look at it' },
  },
  required: [
    'is_purchase_order',
    'po_number',
    'po_date',
    'buyer',
    'supplier',
    'quote_reference',
    'currency',
    'value_ex_vat',
    'vat',
    'total_inc_vat',
    'lines',
    'notes',
  ],
  additionalProperties: false,
}

const PROMPT = `This file was attached to a sales order at Techtrus, an IT services company, as the customer's purchase order (PO) to Techtrus.

Read it and fill in the fields exactly as the document shows them:
- po_number: the purchase order number, exactly as printed (keep leading zeros and prefixes).
- po_date: the date the PO was raised, as YYYY-MM-DD. UK documents write dates day first.
- buyer: the company placing the order. supplier: the company the order is placed with.
- quote_reference: a supplier quote number the PO mentions, if any.
- value_ex_vat, vat, total_inc_vat: the PO's totals as plain numbers (no currency symbols or commas). If the PO only shows one total and says it excludes VAT, put it in value_ex_vat and leave the others null; never work out a figure the document does not show.
- lines: each order line as printed.
- is_purchase_order: false if this is not a purchase order (for example a quote, an invoice or a delivery note).
- notes: anything a person should check — figures that don't add up, more than one PO, unreadable parts, a currency other than GBP. Otherwise null.

Use null for anything the document does not show.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.')

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      throw new HttpError(
        503,
        "Reading POs isn't switched on yet — the Anthropic API key needs adding to Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY).",
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new HttpError(401, 'Not signed in.')
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: allowed } = await db.rpc('can_write', { area: 'sales_orders' })
    if (!allowed) throw new HttpError(403, 'You need the Sales Orders area to read a PO.')

    const { fileId } = await req.json().catch(() => ({}))
    if (typeof fileId !== 'string') throw new HttpError(400, 'No file given.')

    const { data: file, error: fileError } = await db
      .from('sales_order_files')
      .select('id, path, file_name, content_type')
      .eq('id', fileId)
      .single()
    if (fileError || !file) throw new HttpError(404, 'File not found.')

    const { data: blob, error: downloadError } = await db.storage.from('sales-order-files').download(file.path)
    if (downloadError || !blob) throw new HttpError(500, 'Could not open the file.')
    const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()))

    const type = file.content_type ?? blob.type
    let source: Anthropic.Beta.BetaContentBlockParam
    if (type === 'application/pdf') {
      source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    } else if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') {
      source = { type: 'image', source: { type: 'base64', media_type: type, data } }
    } else {
      throw new HttpError(400, 'Only PDFs and photos (JPEG, PNG, WebP) can be read.')
    }

    const client = new Anthropic({ apiKey })
    // fallbacks: "default" — if the model declines, the API re-runs the
    // request on a fallback model within the same call.
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: READING_SCHEMA } },
      messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)

    if (response.stop_reason === 'refusal') throw new HttpError(422, "The AI wouldn't read this file.")
    if (response.stop_reason === 'max_tokens') throw new HttpError(422, 'This PO is too long to read in one go.')
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new HttpError(502, 'The AI gave no answer — try again.')
    const reading = JSON.parse(textBlock.text)

    const readAt = new Date().toISOString()
    const { error: saveError } = await db
      .from('sales_order_files')
      .update({ ai_reading: reading, ai_read_at: readAt, ai_model: response.model })
      .eq('id', file.id)
    if (saveError) throw new HttpError(500, saveError.message)

    return json({ reading, readAt, model: response.model })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: 'The Anthropic API key was turned down — check ANTHROPIC_API_KEY in Supabase.' }, 502)
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI service is busy — try again in a minute.' }, 429)
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `The AI service returned an error (${err.status}): ${err.message}` }, 502)
    }
    console.error(err)
    return json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, 500)
  }
})
