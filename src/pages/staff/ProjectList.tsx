import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAllProjectLines, listAssignmentTimesheets, listProjectAssignments, listProjects } from '../../lib/api'
import { DAY_TYPE_DAYS, PROJECT_STATUS_LABELS, type ProjectWithRelations } from '../../lib/types'
import { Card, FilterSummary, SearchInput, StatusBadge } from '../../components/ui'
import DataTable from '../../components/DataTable'
import ColumnPicker from '../../components/ColumnPicker'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'
import { columnValueGetter, useColumnPrefs, type TableColumn } from '../../lib/useColumnPrefs'

// A project with its day totals worked out from lines, assignments and timesheets.
type ProjectRow = ProjectWithRelations & { quoted: number; allocated: number; used: number }

const STATUS_OPTIONS = Object.values(PROJECT_STATUS_LABELS).map((label) => ({ value: label, label }))

function days(n: number) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

const COLUMNS: TableColumn<ProjectRow>[] = [
  { key: 'reference', label: 'Project', value: (p) => p.reference, cellClassName: 'font-mono-label text-text-muted' },
  { key: 'name', label: 'Name', value: (p) => p.name, cellClassName: 'text-text' },
  { key: 'client', label: 'Client', value: (p) => p.sales_order?.client?.name ?? '' },
  { key: 'end_client', label: 'End client', value: (p) => p.sales_order?.end_client?.name ?? '' },
  {
    key: 'sales_order',
    label: 'Sales order',
    value: (p) => p.sales_order?.reference ?? '',
    cellClassName: 'font-mono-label text-text-muted',
  },
  { key: 'owner', label: 'Owner', value: (p) => p.owner?.full_name ?? '' },
  { key: 'quoted', label: 'Quoted days', value: (p) => p.quoted, render: (p) => days(p.quoted) },
  { key: 'allocated', label: 'Allocated', value: (p) => p.allocated, render: (p) => days(p.allocated) },
  {
    key: 'used',
    label: 'Timesheeted',
    value: (p) => p.used,
    render: (p) => (p.allocated ? `${days(p.used)} (${Math.round((p.used / p.allocated) * 100)}%)` : days(p.used)),
  },
  {
    key: 'status',
    label: 'Status',
    value: (p) => PROJECT_STATUS_LABELS[p.status],
    render: (p) => (
      <StatusBadge status={p.status === 'active' ? 'submitted' : 'approved'} label={PROJECT_STATUS_LABELS[p.status]} />
    ),
    filterOptions: STATUS_OPTIONS,
  },
]

const getValue = columnValueGetter(COLUMNS)

function getSearchText(p: ProjectRow) {
  return [p.reference, p.name, p.sales_order?.reference, p.sales_order?.client?.name, p.sales_order?.end_client?.name, p.owner?.full_name]
    .filter(Boolean)
    .join(' ')
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(rows, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getValue, 'projects')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getValue, 'projects')
  const { prefs, setPrefs, reset, visibleColumns } = useColumnPrefs('projects', COLUMNS)

  useEffect(() => {
    ;(async () => {
      try {
        const [projects, lines, assignments] = await Promise.all([
          listProjects(),
          listAllProjectLines(),
          listProjectAssignments(),
        ])
        const entries = await listAssignmentTimesheets(assignments.map((a) => a.id))
        const lineProject = new Map(lines.map((l) => [l.id, l.project_id]))
        const assignmentProject = new Map(assignments.map((a) => [a.id, lineProject.get(a.project_line_id)]))
        const totals = new Map<string, { quoted: number; allocated: number; used: number }>()
        const get = (id: string) => totals.get(id) ?? totals.set(id, { quoted: 0, allocated: 0, used: 0 }).get(id)!
        for (const l of lines) get(l.project_id).quoted += Number(l.quoted_days)
        for (const a of assignments) {
          const pid = lineProject.get(a.project_line_id)
          if (pid) get(pid).allocated += Number(a.allocated_days)
        }
        for (const e of entries) {
          const pid = assignmentProject.get(e.project_assignment_id)
          if (pid && e.status !== 'rejected') get(pid).used += DAY_TYPE_DAYS[e.day_type]
        }
        setRows(projects.map((p) => ({ ...p, ...(totals.get(p.id) ?? { quoted: 0, allocated: 0, used: 0 }) })))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      }
    })()
  }, [])

  const activeCountProjects = useMemo(() => rows?.filter((r) => r.status === 'active').length ?? 0, [rows])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Projects</h1>
        <p className="text-xs text-text-faint">Created from a sales order — open a sales order and use "Create project".</p>
      </div>

      {rows && rows.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" className="max-w-sm flex-1" />
          <span className="text-xs text-text-muted">{activeCountProjects} active</span>
          <ColumnPicker columns={COLUMNS} prefs={prefs} onChange={setPrefs} onReset={reset} onHide={(key) => setFilter(key, '')} />
        </div>
      )}

      <FilterSummary count={activeCount} onClear={clearFilters} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!rows && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No projects yet.</p>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <DataTable
          storageKey="projects"
          columns={visibleColumns}
          rows={sorted ?? []}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/staff/projects/${p.id}`)}
          sortKey={sortKey}
          direction={direction}
          onSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          emptyMessage="No projects match your search/filters."
        />
      )}
    </div>
  )
}
