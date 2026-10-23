import { supabase } from '../supabaseClient'
import type { Opportunity, OpportunityWithRelations } from '../types'
import { unwrap } from './_shared'

// billing_account_id is labelled "Client" in the UI, client_id is labelled "End Client" —
// see the comment on OpportunityWithRelations in lib/types.ts.
const WITH_RELATIONS_SELECT = `
  *,
  client:accounts!opportunities_billing_account_id_fkey(id, name),
  end_client:accounts!opportunities_client_id_fkey(id, name)
`

export async function listOpportunities(): Promise<OpportunityWithRelations[]> {
  return unwrap(
    await supabase.from('opportunities').select(WITH_RELATIONS_SELECT).order('created_at', { ascending: false }),
  )
}

export async function getOpportunity(id: string): Promise<OpportunityWithRelations> {
  return unwrap(await supabase.from('opportunities').select(WITH_RELATIONS_SELECT).eq('id', id).single())
}

export type OpportunityInput = Omit<
  Opportunity,
  'id' | 'created_at' | 'updated_at' | 'is_active' | 'opportunity_number'
>

export async function createOpportunity(input: Partial<OpportunityInput> & { name: string }): Promise<Opportunity> {
  return unwrap(await supabase.from('opportunities').insert(input).select().single())
}

export async function updateOpportunity(
  id: string,
  input: Partial<OpportunityInput & { is_active: boolean }>,
): Promise<Opportunity> {
  return unwrap(await supabase.from('opportunities').update(input).eq('id', id).select().single())
}
