import { useState } from 'react'
import { listRecordHistory, REF_FIELDS, resolveAuditRefs, type AuditEntry, type AuditTable } from '../lib/api'
import { Card } from './ui'

// History panel for a record page: who changed what, and when (migration 0040).
// Closed by default; loads when opened, and again each time it's reopened.

const FIELD_LABELS: Record<string, string> = {
  client_id: 'Client',
  end_client_id: 'End client',
  billing_account_id: 'Billing account',
  account_id: 'Account',
  sales_order_id: 'Sales order',
  quote_id: 'Quote',
  invoice_id: 'Invoice',
  opportunity_id: 'Opportunity',
  field_engineer_id: 'Person',
  owner_id: 'Owner',
  approved_by: 'Approved by',
  user_id: 'Login',
  rate_card_id: 'Rate card',
  po_number: 'PO number',
  po_value: 'PO value',
  vat: 'VAT',
  net_value: 'Net value',
  invoiced_to_date: 'Invoiced to date',
  day_rate: 'Day / cost rate',
  day_type: 'Day',
  work_date: 'Date worked',
  project_assignment_id: 'Project line',
  payment_terms_days: 'Payment terms (days)',
  rebate_rate: 'Rebate %',
  cv_file_name: 'CV',
  photo_path: 'Photo',
}

// Housekeeping fields that don't mean anything to people.
const HIDDEN_FIELDS = new Set(['id', 'cv_path', 'cv_uploaded_at', 'photo_uploaded_at', 'sort_order'])

const MONEY_FIELDS = new Set([
  'value', 'vat', 'total', 'rebate', 'net_value', 'invoiced_to_date', 'quote_value', 'po_value', 'difference',
  'estimated_value', 'day_rate', 'payment_amount', 'original_amount', 'remaining_amount',
])

export function fieldLabel(field: string) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  const words = field.replace(/_id$/, '').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function formatAuditValue(field: string, value: unknown, refs: Record<string, string>): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (REF_FIELDS.has(field) && typeof value === 'string') return refs[value] ?? '(removed)'
  if (MONEY_FIELDS.has(field) && !Number.isNaN(Number(value)))
    return `£${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' })
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    const text = value.replace(/_/g, value.includes(' ') ? '_' : ' ')
    return text.length > 80 ? `${text.slice(0, 80)}…` : text
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

// One line per changed field: "Status: Sent → Paid".
export function AuditChanges({ entry, refs }: { entry: AuditEntry; refs: Record<string, string> }) {
  if (entry.action === 'insert') return <p className="text-text-muted">Created</p>
  if (entry.action === 'delete') return <p className="text-danger">Deleted</p>
  const rows = Object.entries(entry.changes).filter(([field]) => !HIDDEN_FIELDS.has(field))
  if (rows.length === 0) return <p className="text-text-muted">Updated</p>
  return (
    <ul className="space-y-0.5">
      {rows.map(([field, change]) => {
        const { old: before, new: after } = (change ?? {}) as { old?: unknown; new?: unknown }
        return (
          <li key={field}>
            <span className="text-text-muted">{fieldLabel(field)}:</span>{' '}
            <span className="text-text-faint line-through decoration-text-faint/50">{formatAuditValue(field, before, refs)}</span>{' '}
            → <span className="text-text">{formatAuditValue(field, after, refs)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function auditWhen(entry: AuditEntry) {
  return new Date(entry.changed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function HistoryCard({ table, recordId }: { table: AuditTable; recordId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  if (!recordId) return null

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || !recordId) return
    setError(null)
    try {
      const list = await listRecordHistory(table, recordId)
      setRefs(await resolveAuditRefs(list))
      setEntries(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history.')
    }
  }

  return (
    <Card className="mt-6 print:hidden">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-text">History</span>
        <span className="text-xs text-text-muted">{open ? 'Hide ▲' : 'Show who changed what ▼'}</span>
      </button>
      {open && (
        <div className="mt-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          {!entries && !error && <p className="text-sm text-text-muted">Loading…</p>}
          {entries && entries.length === 0 && (
            <p className="text-sm text-text-muted">No changes recorded yet. History starts from November 2026.</p>
          )}
          {entries && entries.length > 0 && (
            <ol className="space-y-3">
              {entries.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                  <p className="text-xs font-mono-label text-text-dim">
                    {auditWhen(e)} · {e.changed_by_name ?? 'System'}
                  </p>
                  <AuditChanges entry={e} refs={refs} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  )
}
