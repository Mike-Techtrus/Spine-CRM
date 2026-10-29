import { supabase } from '../supabaseClient'
import type { CompanySettings, Invoice, InvoiceLine, InvoiceWithRelations, Payment } from '../types'
import { fetchAllRows, unwrap } from './_shared'

const WITH_RELATIONS_SELECT = `
  *,
  client:accounts!invoices_client_id_fkey(id, name),
  end_client:accounts!invoices_end_client_id_fkey(id, name),
  sales_order:sales_orders(id, reference)
`

export async function listInvoices(): Promise<InvoiceWithRelations[]> {
  return fetchAllRows<InvoiceWithRelations>((from, to) =>
    supabase
      .from('invoices')
      .select(WITH_RELATIONS_SELECT)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

export async function getInvoice(id: string): Promise<InvoiceWithRelations> {
  return unwrap(await supabase.from('invoices').select(WITH_RELATIONS_SELECT).eq('id', id).single())
}

export type InvoiceInput = Omit<Invoice, 'id' | 'invoice_number' | 'created_at' | 'updated_at'>

export async function createInvoice(input: Partial<InvoiceInput>): Promise<Invoice> {
  return unwrap(await supabase.from('invoices').insert(input).select().single())
}

export async function updateInvoice(id: string, input: Partial<InvoiceInput>): Promise<Invoice> {
  return unwrap(await supabase.from('invoices').update(input).eq('id', id).select().single())
}

export interface SalesOrderForConversion {
  id: string
  reference: string
  quote_id: string | null
  client_id: string | null
  end_client_id: string | null
  po_number: string | null
  net_value: number | null
  vat: number | null
  total: number | null
  rebate: number | null
}

export async function getSalesOrderForConversion(salesOrderId: string): Promise<SalesOrderForConversion> {
  return unwrap<SalesOrderForConversion>(
    await supabase
      .from('sales_orders')
      .select('id, reference, quote_id, client_id, end_client_id, po_number, net_value, vat, total, rebate')
      .eq('id', salesOrderId)
      .single(),
  )
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  return unwrap(
    await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false }),
  )
}

export async function recordPayment(input: {
  invoice_id: string
  payment_date: string | null
  original_amount: number | null
  remaining_amount: number | null
  payment_amount: number
}): Promise<Payment> {
  return unwrap(await supabase.from('payments').insert(input).select().single())
}

// ── Invoice lines (migration 0018) ─────────────────────────────────────────

export type InvoiceLineInput = Pick<InvoiceLine, 'description' | 'qty' | 'unit_price'>

export async function listInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  return unwrap(
    await supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('sort_order', { ascending: true }),
  )
}

// Replaces the full set of lines in one go, same approach as replaceQuoteLines.
export async function replaceInvoiceLines(invoiceId: string, lines: InvoiceLineInput[]): Promise<InvoiceLine[]> {
  const { error: deleteError } = await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceId)
  if (deleteError) throw new Error(deleteError.message)
  if (lines.length === 0) return []
  return unwrap(
    await supabase
      .from('invoice_lines')
      .insert(lines.map((line, index) => ({ ...line, invoice_id: invoiceId, sort_order: index })))
      .select(),
  )
}

// ── Company settings (Admin → Invoice settings, migration 0018) ───────────

export async function getCompanySettings(): Promise<CompanySettings> {
  return unwrap(await supabase.from('company_settings').select('*').eq('id', true).single())
}

export async function updateCompanySettings(input: CompanySettings): Promise<CompanySettings> {
  return unwrap(await supabase.from('company_settings').update(input).eq('id', true).select().single())
}
