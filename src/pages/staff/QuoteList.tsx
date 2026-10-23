import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listQuotes } from '../../lib/api'
import type { QuoteWithRelations } from '../../lib/types'
import { QUOTE_STATUS_LABELS } from '../../lib/types'
import { Card, FilterCell, FilterSummary, SearchInput, StatusBadge, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const STATUS_BADGE_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'submitted',
  accepted: 'approved',
  declined: 'rejected',
  expired: 'expired',
}

const STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABELS).map(([, label]) => ({ value: label, label }))

function getSearchText(q: QuoteWithRelations) {
  return [
    q.quote_number,
    q.opportunity?.opportunity_number,
    q.opportunity?.name,
    q.client?.name,
    q.end_client?.name,
    q.net_value,
    QUOTE_STATUS_LABELS[q.status],
  ]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(q: QuoteWithRelations, key: string) {
  switch (key) {
    case 'quote_number':
      return q.quote_number
    case 'opportunity':
      return q.opportunity?.opportunity_number ?? ''
    case 'client':
      return q.client?.name ?? ''
    case 'end_client':
      return q.end_client?.name ?? ''
    case 'net_value':
      return q.net_value ?? null
    case 'status':
      return QUOTE_STATUS_LABELS[q.status]
    default:
      return ''
  }
}

export default function QuoteList() {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<QuoteWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(quotes, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getSortValue, 'quotes')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, 'quotes')

  useEffect(() => {
    listQuotes()
      .then(setQuotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Quotes</h1>
        <p className="text-xs text-text-faint">Created from an opportunity — open an opportunity to create one.</p>
      </div>

      {quotes && quotes.length > 0 && (
        <SearchInput value={query} onChange={setQuery} placeholder="Search quotes…" className="mb-4 max-w-sm" />
      )}

      <FilterSummary count={activeCount} onClear={clearFilters} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!quotes && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {quotes && quotes.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No quotes yet.</p>
        </Card>
      )}

      {quotes && quotes.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <Th sortKey="quote_number" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Quote #
                </Th>
                <Th sortKey="opportunity" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Opportunity
                </Th>
                <Th sortKey="client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Client
                </Th>
                <Th sortKey="end_client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  End client
                </Th>
                <Th sortKey="net_value" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Net value
                </Th>
                <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Status
                </Th>
              </tr>
              <tr>
                <FilterCell value={filters.quote_number ?? ''} onChange={(v) => setFilter('quote_number', v)} />
                <FilterCell value={filters.opportunity ?? ''} onChange={(v) => setFilter('opportunity', v)} />
                <FilterCell value={filters.client ?? ''} onChange={(v) => setFilter('client', v)} />
                <FilterCell value={filters.end_client ?? ''} onChange={(v) => setFilter('end_client', v)} />
                <FilterCell value={filters.net_value ?? ''} onChange={(v) => setFilter('net_value', v)} />
                <FilterCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              </tr>
            </thead>
            <tbody>
              {sorted && sorted.length > 0 ? (
                sorted.map((q) => (
                  <tr
                    key={q.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/quotes/${q.id}`)}
                  >
                    <td className="px-4 py-2 font-mono-label text-text-muted">{q.quote_number}</td>
                    <td className="px-4 py-2 text-text">
                      {q.opportunity ? (
                        <Link
                          to={`/staff/opportunities/${q.opportunity.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          <span className="font-mono-label text-text-muted">{q.opportunity.opportunity_number}</span>
                          <span className="text-text-muted"> — {q.opportunity.name}</span>
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-text">{q.client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{q.end_client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {q.net_value ? `£${Number(q.net_value).toLocaleString('en-GB')}` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={STATUS_BADGE_MAP[q.status]} label={QUOTE_STATUS_LABELS[q.status]} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-muted">
                    No quotes match your search/filters.
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
