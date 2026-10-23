import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSalesOrders } from '../../lib/api'
import type { SalesOrderWithRelations } from '../../lib/types'
import { Card, FilterCell, FilterSummary, SearchInput, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

function getSearchText(o: SalesOrderWithRelations) {
  return [o.reference, o.client?.name, o.end_client?.name, o.po_number, o.net_value, o.invoiced_to_date]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(o: SalesOrderWithRelations, key: string) {
  switch (key) {
    case 'reference':
      return o.reference
    case 'client':
      return o.client?.name ?? ''
    case 'end_client':
      return o.end_client?.name ?? ''
    case 'po_number':
      return o.po_number ?? ''
    case 'net_value':
      return o.net_value ?? null
    case 'invoiced_to_date':
      return o.invoiced_to_date ?? null
    default:
      return ''
  }
}

export default function SalesOrderList() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<SalesOrderWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(orders, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getSortValue, 'sales-orders')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, 'sales-orders')

  useEffect(() => {
    listSalesOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Sales Orders</h1>
        <p className="text-xs text-text-faint">Created from an accepted quote — open a quote to create one.</p>
      </div>

      {orders && orders.length > 0 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search sales orders…"
          className="mb-4 max-w-sm"
        />
      )}

      <FilterSummary count={activeCount} onClear={clearFilters} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!orders && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {orders && orders.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No sales orders yet.</p>
        </Card>
      )}

      {orders && orders.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <Th sortKey="reference" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Ref
                </Th>
                <Th sortKey="client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Client
                </Th>
                <Th sortKey="end_client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  End client
                </Th>
                <Th sortKey="po_number" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  PO number
                </Th>
                <Th sortKey="net_value" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Net value
                </Th>
                <Th sortKey="invoiced_to_date" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Invoiced to date
                </Th>
              </tr>
              <tr>
                <FilterCell value={filters.reference ?? ''} onChange={(v) => setFilter('reference', v)} />
                <FilterCell value={filters.client ?? ''} onChange={(v) => setFilter('client', v)} />
                <FilterCell value={filters.end_client ?? ''} onChange={(v) => setFilter('end_client', v)} />
                <FilterCell value={filters.po_number ?? ''} onChange={(v) => setFilter('po_number', v)} />
                <FilterCell value={filters.net_value ?? ''} onChange={(v) => setFilter('net_value', v)} />
                <FilterCell value={filters.invoiced_to_date ?? ''} onChange={(v) => setFilter('invoiced_to_date', v)} />
              </tr>
            </thead>
            <tbody>
              {sorted && sorted.length > 0 ? (
                sorted.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/sales-orders/${o.id}`)}
                  >
                    <td className="px-4 py-2 font-mono-label text-text-muted">{o.reference}</td>
                    <td className="px-4 py-2 text-text">{o.client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{o.end_client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{o.po_number || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {o.net_value ? `£${Number(o.net_value).toLocaleString('en-GB')}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {o.invoiced_to_date ? `£${Number(o.invoiced_to_date).toLocaleString('en-GB')}` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-muted">
                    No sales orders match your search/filters.
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
