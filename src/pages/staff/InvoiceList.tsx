import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '../../lib/api'
import type { InvoiceWithRelations } from '../../lib/types'
import { INVOICE_STATUS_LABELS } from '../../lib/types'
import { Card, FilterCell, FilterSummary, SearchInput, StatusBadge, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const STATUS_BADGE_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'submitted',
  paid: 'approved',
  cancelled: 'rejected',
}

const STATUS_OPTIONS = Object.entries(INVOICE_STATUS_LABELS).map(([, label]) => ({ value: label, label }))

function getSearchText(inv: InvoiceWithRelations) {
  return [inv.invoice_number, inv.client?.name, inv.due_date, inv.total, INVOICE_STATUS_LABELS[inv.status]]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(inv: InvoiceWithRelations, key: string) {
  switch (key) {
    case 'invoice_number':
      return inv.invoice_number
    case 'client':
      return inv.client?.name ?? ''
    case 'due_date':
      return inv.due_date ?? ''
    case 'total':
      return inv.total ?? null
    case 'status':
      return INVOICE_STATUS_LABELS[inv.status]
    default:
      return ''
  }
}

export default function InvoiceList() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(invoices, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getSortValue, 'invoices')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, 'invoices')

  useEffect(() => {
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Invoices</h1>
        <p className="text-xs text-text-faint">Created from a sales order — open a sales order to create one.</p>
      </div>

      {invoices && invoices.length > 0 && (
        <SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" className="mb-4 max-w-sm" />
      )}

      <FilterSummary count={activeCount} onClear={clearFilters} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!invoices && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {invoices && invoices.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No invoices yet.</p>
        </Card>
      )}

      {invoices && invoices.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <Th sortKey="invoice_number" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Invoice #
                </Th>
                <Th sortKey="client" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Client
                </Th>
                <Th sortKey="due_date" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Due date
                </Th>
                <Th sortKey="total" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Total
                </Th>
                <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                  Status
                </Th>
              </tr>
              <tr>
                <FilterCell value={filters.invoice_number ?? ''} onChange={(v) => setFilter('invoice_number', v)} />
                <FilterCell value={filters.client ?? ''} onChange={(v) => setFilter('client', v)} />
                <FilterCell value={filters.due_date ?? ''} onChange={(v) => setFilter('due_date', v)} />
                <FilterCell value={filters.total ?? ''} onChange={(v) => setFilter('total', v)} />
                <FilterCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              </tr>
            </thead>
            <tbody>
              {sorted && sorted.length > 0 ? (
                sorted.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/invoices/${inv.id}`)}
                  >
                    <td className="px-4 py-2 font-mono-label text-text-muted">{inv.invoice_number}</td>
                    <td className="px-4 py-2 text-text">{inv.client?.name || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">{inv.due_date || '—'}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {inv.total ? `£${Number(inv.total).toLocaleString('en-GB')}` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={STATUS_BADGE_MAP[inv.status]} label={INVOICE_STATUS_LABELS[inv.status]} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-muted">
                    No invoices match your search/filters.
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
