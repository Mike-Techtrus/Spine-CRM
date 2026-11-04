import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { mergeQualification, type IntakeReading, type Qualification } from '../intake'
import type { Opportunity } from '../types'
import { unwrap } from './_shared'

// Opportunities → Intake (0054): emails triaged by AI, waiting for a person.

export type IntakeStatus = 'new' | 'triaged' | 'error' | 'linked' | 'created' | 'dismissed'

export interface IntakeItem {
  id: string
  source: 'paste' | 'mailbox'
  message_id: string | null
  conversation_id: string | null
  from_name: string | null
  from_email: string | null
  to_emails: string | null
  subject: string | null
  received_at: string
  body_text: string
  attachment_names: string[]
  status: IntakeStatus
  ai: IntakeReading | null
  ai_model: string | null
  ai_at: string | null
  ai_error: string | null
  opportunity_id: string | null
  decided_by: string | null
  decided_at: string | null
  dismissed_reason: string | null
  created_at: string
  opportunity?: Pick<Opportunity, 'id' | 'opportunity_number' | 'name'> | null
}

const SELECT = '*, opportunity:opportunities(id, opportunity_number, name)'
export const TO_REVIEW: IntakeStatus[] = ['new', 'triaged', 'error']

export async function listIntakeItems(statuses: IntakeStatus[]): Promise<IntakeItem[]> {
  return unwrap(
    await supabase.from('intake_items').select(SELECT).in('status', statuses).order('received_at', { ascending: false }).limit(200),
  )
}

export async function getIntakeItem(id: string): Promise<IntakeItem> {
  return unwrap(await supabase.from('intake_items').select(SELECT).eq('id', id).single())
}

export async function listIntakeForOpportunity(opportunityId: string): Promise<IntakeItem[]> {
  return unwrap(
    await supabase.from('intake_items').select(SELECT).eq('opportunity_id', opportunityId).order('received_at', { ascending: false }),
  )
}

export async function addPastedEmail(input: {
  from_name: string | null
  from_email: string | null
  subject: string | null
  received_at: string
  body_text: string
}): Promise<IntakeItem> {
  return unwrap(await supabase.from('intake_items').insert({ ...input, source: 'paste' }).select(SELECT).single())
}

// Runs the AI triage (triage-email Edge Function); the reading is saved on the item.
export async function triageIntake(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('triage-email', { body: { intakeId: id } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
}

async function decide(id: string, fields: Partial<IntakeItem>) {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('intake_items')
    .update({ ...fields, decided_by: auth.user?.id ?? null, decided_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Brings the email's qualification into the opportunity's running sheet.
async function applyQualification(opportunityId: string, item: IntakeItem) {
  if (!item.ai) return
  const { data, error } = await supabase.from('opportunities').select('qualification').eq('id', opportunityId).single()
  if (error) throw new Error(error.message)
  const merged = mergeQualification((data?.qualification as Qualification | null) ?? null, item.ai, item.id)
  const { error: saveError } = await supabase
    .from('opportunities')
    .update({ qualification: merged, qualification_updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
  if (saveError) throw new Error(saveError.message)
}

export async function linkIntakeToOpportunity(item: IntakeItem, opportunityId: string): Promise<void> {
  await applyQualification(opportunityId, item)
  await decide(item.id, { status: 'linked', opportunity_id: opportunityId })
}

export async function createOpportunityFromIntake(
  item: IntakeItem,
  input: {
    name: string
    customer_opportunity_number: string | null
    billing_account_id: string | null
    client_id: string | null
    description: string | null
  },
): Promise<string> {
  const opp = unwrap<Opportunity>(
    await supabase
      .from('opportunities')
      .insert({ ...input, source: 'email', stage: 'qualifying' })
      .select()
      .single(),
  )
  await applyQualification(opp.id, item)
  await decide(item.id, { status: 'created', opportunity_id: opp.id })
  return opp.id
}

export async function dismissIntake(id: string, reason: string | null): Promise<void> {
  await decide(id, { status: 'dismissed', dismissed_reason: reason })
}

// Back to the review list (e.g. linked to the wrong opportunity). The opportunity keeps any sheet already merged in.
export async function reopenIntake(item: IntakeItem): Promise<void> {
  const { error } = await supabase
    .from('intake_items')
    .update({ status: item.ai ? 'triaged' : 'new', opportunity_id: null, decided_by: null, decided_at: null, dismissed_reason: null })
    .eq('id', item.id)
  if (error) throw new Error(error.message)
}

export async function saveOpportunityQualification(opportunityId: string, q: Qualification): Promise<void> {
  const { error } = await supabase
    .from('opportunities')
    .update({ qualification: q, qualification_updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
  if (error) throw new Error(error.message)
}
