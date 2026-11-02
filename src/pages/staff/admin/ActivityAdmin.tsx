import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecentActivity, resolveAuditRefs, type AuditEntry, type AuditTable } from '../../../lib/api'
import { AuditChanges, auditWhen } from '../../../components/HistoryCard'
import { ErrorText, Select } from '../../../components/ui'
import AdminTabs from './AdminTabs'

// Admin → Activity: the latest changes across Spine (audit log, migration 0040).

const TABLES: { key: AuditTable; label: string; path?: (id: string) => string }[] = [
  { key: 'opportunities', label: 'Opportunities', path: (id) => `/staff/opportunities/${id}` },
  { key: 'quotes', label: 'Quotes', path: (id) => `/staff/quotes/${id}` },
  { key: 'sales_orders', label: 'Sales orders', path: (id) => `/staff/sales-orders/${id}` },
  { key: 'invoices', label: 'Invoices', path: (id) => `/staff/invoices/${id}` },
  { key: 'payments', label: 'Payments' },
  { key: 'projects', label: 'Projects', path: (id) => `/staff/projects/${id}` },
  { key: 'project_assignments', label: 'Project allocations' },
  { key: 'timesheet_entries', label: 'Timesheets', path: (id) => `/staff/timesheets/${id}` },
  { key: 'accounts', label: 'Customer accounts', path: () => '/staff/admin/customer-accounts' },
  { key: 'field_engineers', label: 'Contractors & staff', path: (id) => `/staff/admin/user-accounts/contractors/${id}` },
]

const TABLE_BY_KEY = Object.fromEntries(TABLES.map((t) => [t.key, t]))

export default function ActivityAdmin() {
  const [table, setTable] = useState<AuditTable | ''>('')
  const [person, setPerson] = useState('')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEntries(null)
    setError(null)
    ;(async () => {
      try {
        const list = await listRecentActivity({ table: table || undefined, limit: 300 })
        setRefs(await resolveAuditRefs(list))
        setEntries(list)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity.')
      }
    })()
  }, [table])

  const people = useMemo(
    () => [...new Set((entries ?? []).map((e) => e.changed_by_name ?? 'System'))].sort(),
    [entries],
  )
  const visible = (entries ?? []).filter((e) => !person || (e.changed_by_name ?? 'System') === person)

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · Activity</h1>
      <AdminTabs />

      <p className="mb-4 text-sm text-text-muted">
        Who changed what, newest first. Each record&apos;s own page also has a History panel. Recording started in
        November 2026.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={table} onChange={(e) => setTable(e.target.value as AuditTable | '')} className="w-auto" aria-label="Filter by type">
          <option value="">Everything</option>
          {TABLES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} className="w-auto" aria-label="Filter by person">
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      <ErrorText>{error}</ErrorText>
      {!entries && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {entries && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Record</th>
                <th className="px-4 py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                    No changes recorded yet.
                  </td>
                </tr>
              ) : (
                visible.map((e) => {
                  const t = TABLE_BY_KEY[e.table_name]
                  const label = e.record_label ?? t?.label ?? e.table_name
                  return (
                    <tr key={e.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-4 py-2 text-text-muted">{auditWhen(e)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text">{e.changed_by_name ?? 'System'}</td>
                      <td className="px-4 py-2">
                        {t?.path && e.action !== 'delete' ? (
                          <Link to={t.path(e.record_id)} className="text-accent hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="text-text">{label}</span>
                        )}
                        <span className="block text-xs text-text-faint">{t?.label ?? e.table_name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <AuditChanges entry={e} refs={refs} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      {entries && entries.length >= 300 && (
        <p className="mt-3 text-xs text-text-faint">Showing the latest 300 — filter by type to see further back.</p>
      )}
    </div>
  )
}
