import { supabase } from '../supabaseClient'
import type { SalesOrder, SalesOrderWithRelations } from '../types'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { PoReading } from '../poCheck'
import { fetchAllRows, unwrap } from './_shared'

const WITH_RELATIONS_SELECT = `
  *,
  client:accounts!sales_orders_client_id_fkey(id, name),
  end_client:accounts!sales_orders_end_client_id_fkey(id, name),
  quote:quotes(id, quote_number)
`

export async function listSalesOrders(): Promise<SalesOrderWithRelations[]> {
  return fetchAllRows<SalesOrderWithRelations>((from, to) =>
    supabase
      .from('sales_orders')
      .select(WITH_RELATIONS_SELECT)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

export async function getSalesOrder(id: string): Promise<SalesOrderWithRelations> {
  return unwrap(await supabase.from('sales_orders').select(WITH_RELATIONS_SELECT).eq('id', id).single())
}

export type SalesOrderInput = Omit<SalesOrder, 'id' | 'reference' | 'created_at' | 'updated_at'>

export async function createSalesOrder(input: Partial<SalesOrderInput>): Promise<SalesOrder> {
  return unwrap(await supabase.from('sales_orders').insert(input).select().single())
}

export async function updateSalesOrder(id: string, input: Partial<SalesOrderInput>): Promise<SalesOrder> {
  return unwrap(await supabase.from('sales_orders').update(input).eq('id', id).select().single())
}

// Convenience: prefill a new Sales Order's fields from the Quote it's confirming.
// Includes status/quote_number so the form can enforce "only from an accepted quote".
export interface QuoteForConversion {
  id: string
  quote_number: string
  status: string
  client_id: string | null
  end_client_id: string | null
  start_date: string | null
  end_date: string | null
  value: number | null
  vat: number | null
  total: number | null
  rebate: number | null
  net_value: number | null
}

export async function getQuoteForConversion(quoteId: string): Promise<QuoteForConversion> {
  return unwrap<QuoteForConversion>(
    await supabase
      .from('quotes')
      .select('id, quote_number, status, client_id, end_client_id, start_date, end_date, value, vat, total, rebate, net_value')
      .eq('id', quoteId)
      .single(),
  )
}

// ── PO copies (0051) ───────────────────────────────────────────────────────

const PO_BUCKET = 'sales-order-files'
export const PO_FILE_ACCEPT = '.pdf,image/jpeg,image/png,image/webp'
export const PO_FILE_MAX_BYTES = 10 * 1024 * 1024 // matches the bucket's limit in 0051

export interface SalesOrderFile {
  id: string
  sales_order_id: string
  path: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
  ai_reading: PoReading | null // 0052, filled by the read-po Edge Function
  ai_read_at: string | null
  ai_model: string | null
  uploader?: { full_name: string | null } | null
}

export async function listSalesOrderFiles(salesOrderId: string): Promise<SalesOrderFile[]> {
  return unwrap(
    await supabase
      .from('sales_order_files')
      .select('*, uploader:profiles(full_name)')
      .eq('sales_order_id', salesOrderId)
      .order('uploaded_at', { ascending: false }),
  )
}

export async function uploadSalesOrderFile(salesOrderId: string, file: File): Promise<void> {
  const path = `${salesOrderId}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`
  const { error } = await supabase.storage.from(PO_BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  const { error: rowError } = await supabase.from('sales_order_files').insert({
    sales_order_id: salesOrderId,
    path,
    file_name: file.name,
    content_type: file.type || null,
    size_bytes: file.size,
  })
  if (rowError) {
    await supabase.storage.from(PO_BUCKET).remove([path])
    throw new Error(rowError.message)
  }
}

export async function removeSalesOrderFile(file: SalesOrderFile): Promise<void> {
  const { error } = await supabase.from('sales_order_files').delete().eq('id', file.id)
  if (error) throw new Error(error.message)
  await supabase.storage.from(PO_BUCKET).remove([file.path])
}

// Short-lived link that opens the file in the browser (PDF viewer / image).
export async function getSalesOrderFileUrl(file: SalesOrderFile): Promise<string> {
  const { data, error } = await supabase.storage.from(PO_BUCKET).createSignedUrl(file.path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// Has Claude read the PO (read-po Edge Function); the reading is saved on the file's row.
export async function readPoWithAi(fileId: string): Promise<{ reading: PoReading; readAt: string; model: string }> {
  const { data, error } = await supabase.functions.invoke('read-po', { body: { fileId } })
  if (error) {
    // The function returns { error: "..." } — show that, not "non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
  return data
}
