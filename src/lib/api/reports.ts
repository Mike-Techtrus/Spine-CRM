import { supabase } from '../supabaseClient'
import { fetchAllRows, unwrap } from './_shared'

// Data for Reports (Reports area). Lines are fetched in batches of ids so a
// year of invoices doesn't make one enormous request.

const BATCH = 200

async function inBatches<T>(ids: string[], fetch: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += BATCH) out.push(...(await fetch(ids.slice(i, i + BATCH))))
  return out
}

export interface InvoiceLineAmount {
  invoice_id: string
  line_type: string | null
  qty: number
  unit_price: number
  expenses_included: number | null
}

export async function listInvoiceLinesFor(invoiceIds: string[]): Promise<InvoiceLineAmount[]> {
  return inBatches(invoiceIds, async (batch) =>
    unwrap(await supabase.from('invoice_lines').select('invoice_id, line_type, qty, unit_price, expenses_included').in('invoice_id', batch)),
  )
}

export interface QuoteLineAmount {
  quote_id: string
  line_type: string | null
  qty: number | null
  unit_cost: number | null
  line_total: number | null
  expenses_included: number | null
}

export async function listQuoteLinesFor(quoteIds: string[]): Promise<QuoteLineAmount[]> {
  return inBatches(quoteIds, async (batch) =>
    unwrap(await supabase.from('quote_lines').select('quote_id, line_type, qty, unit_cost, line_total, expenses_included').in('quote_id', batch)),
  )
}

// When each invoice was paid: the latest recorded payment date (rebate quarters
// go by payment received).
export async function listPaymentDates(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ invoice_id: string; payment_date: string | null }>((from, to) =>
    supabase.from('payments').select('invoice_id, payment_date').order('id').range(from, to),
  )
  const paid = new Map<string, string>()
  for (const r of rows) {
    if (!r.payment_date) continue
    const current = paid.get(r.invoice_id)
    if (!current || r.payment_date > current) paid.set(r.invoice_id, r.payment_date)
  }
  return paid
}
