import { supabase } from '../supabaseClient'
import { unwrap } from './_shared'

// Audit trail (migration 0040): one row per insert/update/delete on the main
// records, written by a database trigger. Read-only from the app.

export type AuditTable =
  | 'accounts'
  | 'opportunities'
  | 'quotes'
  | 'sales_orders'
  | 'invoices'
  | 'payments'
  | 'projects'
  | 'project_assignments'
  | 'timesheet_entries'
  | 'field_engineers'

export interface AuditEntry {
  id: number
  table_name: AuditTable
  record_id: string
  action: 'insert' | 'update' | 'delete'
  record_label: string | null
  // update: { field: { old, new } }; insert/delete: { field: value }
  changes: Record<string, unknown>
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
}

export async function listRecordHistory(table: AuditTable, recordId: string): Promise<AuditEntry[]> {
  return unwrap(
    await supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', table)
      .eq('record_id', recordId)
      .order('changed_at', { ascending: false })
      .limit(200),
  )
}

export async function listRecentActivity(filters: { table?: AuditTable; changedBy?: string; limit?: number }): Promise<AuditEntry[]> {
  let query = supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(filters.limit ?? 200)
  if (filters.table) query = query.eq('table_name', filters.table)
  if (filters.changedBy) query = query.eq('changed_by', filters.changedBy)
  return unwrap(await query)
}

// Turns the ids stored in changes (client_id, sales_order_id, owner_id…) into
// names, so History reads "Client: Acme → CDW" rather than two long codes.
const REF_SOURCES: { fields: string[]; table: string; label: string }[] = [
  { fields: ['client_id', 'end_client_id', 'billing_account_id', 'account_id'], table: 'accounts', label: 'name' },
  { fields: ['sales_order_id'], table: 'sales_orders', label: 'reference' },
  { fields: ['quote_id'], table: 'quotes', label: 'quote_number' },
  { fields: ['invoice_id'], table: 'invoices', label: 'invoice_number' },
  { fields: ['opportunity_id'], table: 'opportunities', label: 'name' },
  { fields: ['field_engineer_id'], table: 'field_engineers', label: 'name' },
  { fields: ['owner_id', 'approved_by', 'user_id'], table: 'profiles', label: 'full_name' },
  { fields: ['rate_card_id'], table: 'rate_cards', label: 'name' },
]

export const REF_FIELDS = new Set(REF_SOURCES.flatMap((s) => s.fields))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveAuditRefs(entries: AuditEntry[]): Promise<Record<string, string>> {
  const wanted = new Map<string, Set<string>>() // table -> ids
  for (const e of entries) {
    for (const [field, change] of Object.entries(e.changes)) {
      const source = REF_SOURCES.find((s) => s.fields.includes(field))
      if (!source) continue
      const values = e.action === 'update' ? Object.values((change ?? {}) as Record<string, unknown>) : [change]
      for (const v of values) {
        if (typeof v === 'string' && UUID.test(v)) {
          if (!wanted.has(source.table)) wanted.set(source.table, new Set())
          wanted.get(source.table)!.add(v)
        }
      }
    }
  }

  const names: Record<string, string> = {}
  await Promise.all(
    [...wanted.entries()].map(async ([table, ids]) => {
      const label = REF_SOURCES.find((s) => s.table === table)!.label
      const { data } = await supabase.from(table).select(`id, ${label}`).in('id', [...ids])
      for (const row of (data ?? []) as unknown as Record<string, string>[]) names[row.id] = row[label]
    }),
  )
  return names
}
