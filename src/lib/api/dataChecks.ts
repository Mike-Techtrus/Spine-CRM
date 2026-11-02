import { supabase } from '../supabaseClient'
import { unwrap } from './_shared'

// Admin → Data checks (migration 0045): records that look wrong or stuck.

export interface DataCheckRow {
  check_key: string
  record_type: 'sales_order' | 'invoice' | 'quote'
  record_id: string
  reference: string | null
  detail: string
  amount: number | null
  since: string | null
}

export async function listDataChecks(): Promise<DataCheckRow[]> {
  return unwrap(await supabase.from('data_checks').select('*').order('since', { ascending: true, nullsFirst: true }))
}

// "This one's fine" — hides a record from one check, with a reason (admins only).
export async function dismissDataChecks(checkKey: string, recordIds: string[], reason: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('data_check_dismissals').upsert(
    recordIds.map((record_id) => ({ check_key: checkKey, record_id, reason, dismissed_by: auth.user?.id ?? null })),
    { onConflict: 'check_key,record_id' },
  )
  if (error) throw new Error(error.message)
}
