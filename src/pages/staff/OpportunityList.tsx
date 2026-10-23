import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listOpportunities } from '../../lib/api'
import type { OpportunityWithRelations } from '../../lib/types'
import { OPPORTUNITY_STAGE_LABELS } from '../../lib/types'
import { Button, Card, FilterCell, FilterSummary, SearchInput, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const STAGE_OPTIONS = Object.entries(OPPORTUNITY_STAGE_LABELS).map(([, label]) => ({ value: label, label }))

function getSearchText(o: OpportunityWithRelations) {
  return [
    o.opportunity_number,
    o.name,
    o.customer_opportunity_number,
    o.opportunity_owner,
    o.end_client?.name,
    OPPORTUNITY_STAGE_LABELS[o.stage],
    o.estimated_value,
    o.expected_close_date,
  ]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(o: OpportunityWithRelations, key: string) {
  switch (key) {
    case 'opportunity_number':
      return o.opportunity_number
    case 'name':
      return o.name
    case 'customer_opportunity_number':
      return o.customer_opportunity_number ?? ''
    case 'opportunity_owner':
      return o.opportunity_owner ?? ''
    case 'end_client':
      return o.end_client?.name ?? ''
    case 'stage':
      return OPPORTUNITY_STAGE_LABELS[o.stage]
    case 'estimated_value':
      return o.estimated_value ?? null
    case 'expected_close_date':
      return o.expected_close_date ?? ''
    default:
      return ''
  }
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
  } = useColumnFilters(filtered, getSortValue, 'opportunities')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, 'opportunities')

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
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search opportunities…"
          className="mb-4 max-w-sm"
        />
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
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <Th sortKey="opportunity_number" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Opp #
                </Th>
                <Th sortKey="name" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Customer Opp Name
                </Th>
                <Th
                  sortKey="customer_opportunity_number"
                  activeSortKey={sortKey}
                  direction={direction}
                  onSort={toggleSort}
                >
                  Customer Opp #
                </Th>
                <Th sortKey="opportunity_owner" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Owner
                </Th>
                <Th sortKey="end_client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  End client
                </Th>
                <Th sortKey="stage" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Stage
                </Th>
                <Th sortKey="estimated_value" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Est. value
                </Th>
                <Th sortKey="expected_close_date" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Expected close
                </Th>
              </tr>
              <tr>
                <FilterCell value={filters.opportunity_number ?? ''} onChange={(v) => setFilter('opportunity_number', v)} />
                <FilterCell value={filters.name ?? ''} onChange={(v) => setFilter('name', v)} />
                <FilterCell
                  value={filters.customer_opportunity_number ?? ''}
                  onChange={(v) => setFilter('customer_opportunity_number', v)}
                />
                <FilterCell value={filters.opportunity_owner ?? ''} onChange={(v) => setFilter('opportunity_owner', v)} />
                <FilterCell value={filters.end_client ?? ''} onChange={(v) => setFilter('end_client', v)} />
                <FilterCell value={filters.stage ?? ''} onChange={(v) => setFilter('stage', v)} options={STAGE_OPTIONS} />
                <FilterCell value={filters.estimated_value ?? ''} onChange={(v) => setFilter('estimated_value', v)} />
                <FilterCell
                  value={filters.expected_close_date ?? ''}
                  onChange={(v) => setFilter('expected_close_date', v)}
                />
              </tr>
            </thead>
            <tbody>
              {sorted && sorted.length > 0 ? (
                sorted.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/opportunities/${o.id}`)}
                  >
                    <td className="px-4 py-2 font-mono-label text-text-muted">{o.opportunity_number}</td>
                    <td className="px-4 py-2 text-text">{o.name}</td>
                    <td className="px-4 py-2 text-text-muted">{o.customer_opportunity_number || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{o.opportunity_owner || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{o.end_client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{OPPORTUNITY_STAGE_LABELS[o.stage]}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {o.estimated_value ? `£${Number(o.estimated_value).toLocaleString('en-GB')}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-text-muted">{o.expected_close_date || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-text-muted">
                    No opportunities match your search/filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
