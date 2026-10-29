import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listQuotes } from '../../lib/api'
import type { QuoteWithRelations } from '../../lib/types'
import { QUOTE_STATUS_LABELS, quoteExpiresOn } from '../../lib/types'
import { Card, FilterSummary, SearchInput, StatusBadge } from '../../components/ui'
import DataTable from '../../components/DataTable'
import ColumnPicker from '../../components/ColumnPicker'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'
import { columnValueGetter, formatMoney, useColumnPrefs, type TableColumn } from '../../lib/useColumnPrefs'

const STATUS_BADGE_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'submitted',
  accepted: 'approved',
  declined: 'rejected',
  expired: 'expired',
}

const STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABELS).map(([, label]) => ({ value: label, label }))

function money(key: 'value' | 'vat' | 'total' | 'rebate' | 'net_value', label: string, defaultHidden = true) {
  return {
    key,
    label,
    value: (q: QuoteWithRelations) => q[key] ?? null,
    render: (q: QuoteWithRelations) => formatMoney(q[key]),
    defaultHidden,
  }
}

// Every column the Columns box offers, in default order.
const COLUMNS: TableColumn<QuoteWithRelations>[] = [
  { key: 'quote_number', label: 'Quote #', value: (q) => q.quote_number, cellClassName: 'font-mono-label text-text-muted' },
  {
    key: 'opportunity',
    label: 'Opportunity',
    value: (q) => q.opportunity?.opportunity_number ?? '',
    cellClassName: 'text-text',
    render: (q) =>
      q.opportunity ? (
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
      ),
  },
  { key: 'client', label: 'Client', value: (q) => q.client?.name ?? '', cellClassName: 'text-text' },
  { key: 'end_client', label: 'End client', value: (q) => q.end_client?.name ?? '' },
  { key: 'quote_date', label: 'Quote date', value: (q) => q.quote_date ?? '', defaultHidden: true },
  {
    key: 'expires',
    label: 'Expires',
    value: (q) => quoteExpiresOn(q).toISOString().slice(0, 10),
    defaultHidden: true,
  },
  { key: 'start_date', label: 'Start date', value: (q) => q.start_date ?? '', defaultHidden: true },
  { key: 'end_date', label: 'End date', value: (q) => q.end_date ?? '', defaultHidden: true },
  money('value', 'Value'),
  money('vat', 'VAT'),
  money('total', 'Total'),
  money('rebate', 'Rebate'),
  money('net_value', 'Net value', false),
  {
    key: 'status',
    label: 'Status',
    value: (q) => QUOTE_STATUS_LABELS[q.status],
    render: (q) => <StatusBadge status={STATUS_BADGE_MAP[q.status]} label={QUOTE_STATUS_LABELS[q.status]} />,
    filterOptions: STATUS_OPTIONS,
  },
  { key: 'created_at', label: 'Created', value: (q) => q.created_at.slice(0, 10), defaultHidden: true },
]

const getValue = columnValueGetter(COLUMNS)

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
  } = useColumnFilters(filtered, getValue, 'quotes')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getValue, 'quotes')
  const { prefs, setPrefs, reset, visibleColumns } = useColumnPrefs('quotes', COLUMNS)

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search quotes…" className="max-w-sm flex-1" />
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
      {!quotes && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {quotes && quotes.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No quotes yet.</p>
        </Card>
      )}

      {quotes && quotes.length > 0 && (
        <DataTable
          storageKey="quotes"
          columns={visibleColumns}
          rows={sorted ?? []}
          rowKey={(q) => q.id}
          onRowClick={(q) => navigate(`/staff/quotes/${q.id}`)}
          sortKey={sortKey}
          direction={direction}
          onSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          emptyMessage="No quotes match your search/filters."
        />
      )}
    </div>
  )
}
