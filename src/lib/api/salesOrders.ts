import { supabase } from '../supabaseClient'
import type { SalesOrder, SalesOrderWithRelations } from '../types'
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
