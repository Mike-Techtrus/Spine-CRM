import { supabase } from '../supabaseClient'
import type { Quote, QuoteLine, QuoteWithRelations } from '../types'
import { unwrap } from './_shared'

const WITH_RELATIONS_SELECT = `
  *,
  client:accounts!quotes_client_id_fkey(id, name),
  end_client:accounts!quotes_end_client_id_fkey(id, name),
  opportunity:opportunities(id, name, opportunity_number)
`

export async function listQuotes(): Promise<QuoteWithRelations[]> {
  return unwrap(
    await supabase.from('quotes').select(WITH_RELATIONS_SELECT).order('created_at', { ascending: false }),
  )
}

export async function getQuote(id: string): Promise<QuoteWithRelations> {
  return unwrap(await supabase.from('quotes').select(WITH_RELATIONS_SELECT).eq('id', id).single())
}

export async function listQuotesByOpportunity(opportunityId: string): Promise<QuoteWithRelations[]> {
  return unwrap(
    await supabase
      .from('quotes')
      .select(WITH_RELATIONS_SELECT)
      .eq('opportunity_id', opportunityId)
      .order('quote_date', { ascending: false, nullsFirst: false }),
  )
}

export type QuoteInput = Omit<Quote, 'id' | 'quote_number' | 'created_at' | 'updated_at'>

export async function createQuote(input: Partial<QuoteInput>): Promise<Quote> {
  return unwrap(await supabase.from('quotes').insert(input).select().single())
}

export async function updateQuote(id: string, input: Partial<QuoteInput>): Promise<Quote> {
  return unwrap(await supabase.from('quotes').update(input).eq('id', id).select().single())
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export type QuoteLineInput = Pick<
  QuoteLine,
  'line_type' | 'part_code' | 'description' | 'description_2' | 'vendor' | 'qty' | 'unit_cost'
>

export async function listQuoteLines(quoteId: string): Promise<QuoteLine[]> {
  return unwrap(
    await supabase.from('quote_lines').select('*').eq('quote_id', quoteId).order('sort_order', { ascending: true }),
  )
}

// Replaces the full set of line items for a quote in one go — simplest
// consistent way to save an editable list without diffing row-by-row.
export async function replaceQuoteLines(quoteId: string, lines: QuoteLineInput[]): Promise<QuoteLine[]> {
  const { error: deleteError } = await supabase.from('quote_lines').delete().eq('quote_id', quoteId)
  if (deleteError) throw new Error(deleteError.message)
  if (lines.length === 0) return []
  return unwrap(
    await supabase
      .from('quote_lines')
      .insert(lines.map((line, index) => ({ ...line, quote_id: quoteId, sort_order: index })))
      .select(),
  )
}
