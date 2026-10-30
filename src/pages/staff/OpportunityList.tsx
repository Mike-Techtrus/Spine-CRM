import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listOpportunities } from '../../lib/api'
import type { OpportunityWithRelations } from '../../lib/types'
import {
  CURRENT_OPPORTUNITY_STAGES,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_STAGE_BADGE,
  OPPORTUNITY_STAGE_LABELS,
} from '../../lib/types'
import { Button, Card, FilterSummary, SearchInput, StatusBadge } from '../../components/ui'
import DataTable from '../../components/DataTable'
import ColumnPicker from '../../components/ColumnPicker'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'
import { columnValueGetter, formatMoney, useColumnPrefs, type TableColumn } from '../../lib/useColumnPrefs'

const STAGE_OPTIONS = CURRENT_OPPORTUNITY_STAGES.map((s) => ({ value: OPPORTUNITY_STAGE_LABELS[s], label: OPPORTUNITY_STAGE_LABELS[s] }))
const SOURCE_OPTIONS = Object.entries(OPPORTUNITY_SOURCE_LABELS).map(([, label]) => ({ value: label, label }))

// Every column the Columns box offers, in default order.
const COLUMNS: TableColumn<OpportunityWithRelations>[] = [
  {
    key: 'opportunity_number',
    label: 'Opp #',
    value: (o) => o.opportunity_number,
    cellClassName: 'font-mono-label text-text-muted',
  },
  { key: 'name', label: 'Customer Opp Name', value: (o) => o.name, cellClassName: 'text-text' },
  { key: 'customer_opportunity_number', label: 'Customer Opp #', value: (o) => o.customer_opportunity_number ?? '' },
  { key: 'opportunity_owner', label: 'Owner', value: (o) => o.opportunity_owner ?? '' },
  { key: 'client', label: 'Client', value: (o) => o.client?.name ?? '', defaultHidden: true },
  { key: 'end_client', label: 'End client', value: (o) => o.end_client?.name ?? '' },
  {
    key: 'stage',
    label: 'Stage',
    value: (o) => OPPORTUNITY_STAGE_LABELS[o.stage],
    render: (o) => <StatusBadge status={OPPORTUNITY_STAGE_BADGE[o.stage]} label={OPPORTUNITY_STAGE_LABELS[o.stage]} />,
    filterOptions: STAGE_OPTIONS,
  },
  {
    key: 'estimated_value',
    label: 'Est. value',
    value: (o) => o.estimated_value ?? null,
    render: (o) => formatMoney(o.estimated_value),
  },
  { key: 'expected_close_date', label: 'Expected close', value: (o) => o.expected_close_date ?? '' },
  {
    key: 'source',
    label: 'Source',
    value: (o) => (o.source ? OPPORTUNITY_SOURCE_LABELS[o.source] : ''),
    filterOptions: SOURCE_OPTIONS,
    defaultHidden: true,
  },
  { key: 'created_at', label: 'Created', value: (o) => o.created_at.slice(0, 10), defaultHidden: true },
]

const getValue = columnValueGetter(COLUMNS)

function getSearchText(o: OpportunityWithRelations) {
  return [
    o.opportunity_number,
    o.name,
    o.customer_opportunity_number,
    o.opportunity_owner,
    o.client?.name,
    o.end_client?.name,
    OPPORTUNITY_STAGE_LABELS[o.stage],
    o.estimated_value,
    o.expected_close_date,
  ]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

export default function OpportunityList() {
  const navigate = useNavigate()
  const [opportunities, setOpportunities] = useState<OpportunityWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(opportunities, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getValue, 'opportunities')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getValue, 'opportunities')
  const { prefs, setPrefs, reset, visibleColumns } = useColumnPrefs('opportunities', COLUMNS)

  useEffect(() => {
    listOpportunities()
      .then(setOpportunities)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Opportunities</h1>
        <Link to="/staff/opportunities/new">
          <Button>New opportunity</Button>
        </Link>
      </div>

      {opportunities && opportunities.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search opportunities…" className="max-w-sm flex-1" />
          <ColumnPicker
            columns={COLUMNS}
            prefs={prefs}
            onChange={setPrefs}
            onReset={reset}
            onHide={(key) => setFilter(key, '')}
          />
        </div>
      )}

      <FilterSummary count={activeCount} onClear={clearFilters} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!opportunities && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {opportunities && opportunities.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No opportunities yet.</p>
        </Card>
      )}

      {opportunities && opportunities.length > 0 && (
        <DataTable
          storageKey="opportunities"
          columns={visibleColumns}
          rows={sorted ?? []}
          rowKey={(o) => o.id}
          onRowClick={(o) => navigate(`/staff/opportunities/${o.id}`)}
          sortKey={sortKey}
          direction={direction}
          onSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          emptyMessage="No opportunities match your search/filters."
        />
      )}
    </div>
  )
}
