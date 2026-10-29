import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAllTimesheets, listAccounts, listFieldEngineers } from '../../lib/api'
import type { Account, FieldEngineer, TimesheetEntryWithRelations, TimesheetStatus } from '../../lib/types'
import { DAY_TYPE_LABELS, STATUS_LABELS } from '../../lib/types'
import { Card, SearchInput, Select, StatusBadge, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'

function getSearchText(ts: TimesheetEntryWithRelations) {
  return [
    ts.reference,
    ts.work_date,
    ts.field_engineer.name,
    ts.client.name,
    DAY_TYPE_LABELS[ts.day_type],
    STATUS_LABELS[ts.status],
  ]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(ts: TimesheetEntryWithRelations, key: string) {
  switch (key) {
    case 'reference':
      return ts.reference
    case 'work_date':
      return ts.work_date
    case 'engineer':
      return ts.field_engineer.name
    case 'client':
      return ts.client.name
    case 'day_type':
      return DAY_TYPE_LABELS[ts.day_type]
    case 'status':
      return STATUS_LABELS[ts.status]
    default:
      return ''
  }
}

export default function AllTimesheets() {
  const navigate = useNavigate()
  const [timesheets, setTimesheets] = useState<TimesheetEntryWithRelations[] | null>(null)
  const [engineers, setEngineers] = useState<FieldEngineer[]>([])
  const [clients, setClients] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(timesheets, getSearchText)
  const { sorted, sortKey, direction, toggleSort } = useSort(filtered, getSortValue, 'timesheets')

  const [statusFilter, setStatusFilter] = useState<TimesheetStatus | ''>('submitted')
  const [engineerFilter, setEngineerFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')

  useEffect(() => {
    listFieldEngineers().then(setEngineers).catch(() => {})
    listAccounts(false).then(setClients).catch(() => {})
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setTimesheets(
          await listAllTimesheets({
            status: statusFilter || undefined,
            fieldEngineerId: engineerFilter || undefined,
            clientId: clientFilter || undefined,
          }),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timesheets.')
      }
    })()
  }, [statusFilter, engineerFilter, clientFilter])

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-text">Timesheets</h1>

      <SearchInput value={query} onChange={setQuery} placeholder="Search timesheets…" className="mb-4 max-w-sm" />

      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-mono-label text-text-muted">Status</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TimesheetStatus | '')}>
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono-label text-text-muted">Person</label>
            <Select value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)}>
              <option value="">All</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono-label text-text-muted">Client</label>
            <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">All</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!timesheets && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {timesheets && timesheets.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No timesheets match these filters.</p>
        </Card>
      )}

      {timesheets && timesheets.length > 0 && sorted && sorted.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No timesheets match "{query}".</p>
        </Card>
      )}

      {sorted && sorted.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <Th sortKey="reference" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Ref
                </Th>
                <Th sortKey="work_date" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Date
                </Th>
                <Th sortKey="engineer" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Person
                </Th>
                <Th sortKey="client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Client
                </Th>
                <Th sortKey="day_type" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Type
                </Th>
                <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Status
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ts) => (
                <tr
                  key={ts.id}
                  className="cursor-pointer border-t border-border hover:bg-surface-raised"
                  onClick={() => navigate(`/staff/timesheets/${ts.id}`)}
                >
                  <td className="px-4 py-2 font-mono-label text-text-muted">{ts.reference}</td>
                  <td className="px-4 py-2 text-text">{ts.work_date}</td>
                  <td className="px-4 py-2 text-text">
                    {ts.field_engineer.name}
                    {ts.field_engineer.kind === 'staff' && <span className="ml-2 text-xs text-text-faint">Staff</span>}
                  </td>
                  <td className="px-4 py-2 text-text">{ts.client.name}</td>
                  <td className="px-4 py-2 text-text-muted">{DAY_TYPE_LABELS[ts.day_type]}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={ts.status} label={STATUS_LABELS[ts.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
