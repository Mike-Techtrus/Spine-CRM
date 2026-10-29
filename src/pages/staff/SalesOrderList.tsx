import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSalesOrders } from '../../lib/api'
import type { SalesOrderWithRelations } from '../../lib/types'
import { INVOICING_STATUS_BADGE, INVOICING_STATUS_LABELS, invoicingStatus } from '../../lib/types'
import { Card, FilterSummary, SearchInput, StatusBadge } from '../../components/ui'
import DataTable from '../../components/DataTable'
import ColumnPicker from '../../components/ColumnPicker'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'
import {
  columnValueGetter,
  formatMoney,
  useColumnPrefs,
  YES_NO_OPTIONS,
  yesNo,
  type TableColumn,
} from '../../lib/useColumnPrefs'

type MoneyKey = 'quote_value' | 'po_value' | 'difference' | 'vat' | 'total' | 'rebate' | 'net_value' | 'invoiced_to_date'

function money(key: MoneyKey, label: string, defaultHidden = true): TableColumn<SalesOrderWithRelations> {
  return { key, label, value: (o) => o[key] ?? null, render: (o) => formatMoney(o[key]), defaultHidden }
}

function date(
  key: 'po_received_date' | 'start_date' | 'end_date' | 'timesheet_sent',
  label: string,
): TableColumn<SalesOrderWithRelations> {
  return { key, label, value: (o) => o[key] ?? '', defaultHidden: true }
}

const INVOICING_OPTIONS = Object.values(INVOICING_STATUS_LABELS).map((label) => ({ value: label, label }))

// Every column the Columns box offers, in default order.
const COLUMNS: TableColumn<SalesOrderWithRelations>[] = [
  { key: 'reference', label: 'Ref', value: (o) => o.reference, cellClassName: 'font-mono-label text-text-muted' },
  {
    key: 'quote',
    label: 'Quote #',
    value: (o) => o.quote?.quote_number ?? '',
    cellClassName: 'font-mono-label text-text-muted',
    defaultHidden: true,
  },
  { key: 'client', label: 'Client', value: (o) => o.client?.name ?? '', cellClassName: 'text-text' },
  { key: 'end_client', label: 'End client', value: (o) => o.end_client?.name ?? '' },
  { key: 'po_number', label: 'PO number', value: (o) => o.po_number ?? '' },
  date('po_received_date', 'PO received'),
  {
    key: 'advanced_without_po',
    label: 'Advanced without PO',
    value: (o) => yesNo(o.advanced_without_po),
    filterOptions: YES_NO_OPTIONS,
    defaultHidden: true,
  },
  date('start_date', 'Start date'),
  date('end_date', 'End date'),
  money('quote_value', 'Quote value'),
  money('po_value', 'PO value'),
  money('difference', 'Difference'),
  {
    key: 'quote_match',
    label: 'Quote match',
    value: (o) => yesNo(o.quote_match),
    filterOptions: YES_NO_OPTIONS,
    defaultHidden: true,
  },
  money('vat', 'VAT'),
  money('total', 'Total'),
  money('rebate', 'Rebate'),
  money('net_value', 'Net value', false),
  money('invoiced_to_date', 'Invoiced to date', false),
  {
    key: 'balance',
    label: 'Balance to invoice',
    value: (o) => invoicingStatus(o).balance,
    render: (o) => {
      const { status, balance } = invoicingStatus(o)
      if (status === 'fully_invoiced') return '£0'
      return balance < 0 ? <span className="text-danger">−{formatMoney(-balance)}</span> : formatMoney(balance)
    },
  },
  {
    key: 'invoicing',
    label: 'Invoicing',
    value: (o) => INVOICING_STATUS_LABELS[invoicingStatus(o).status],
    render: (o) => {
      const { status } = invoicingStatus(o)
      return <StatusBadge status={INVOICING_STATUS_BADGE[status]} label={INVOICING_STATUS_LABELS[status]} />
    },
    filterOptions: INVOICING_OPTIONS,
  },
  date('timesheet_sent', 'Timesheet sent'),
  { key: 'created_at', label: 'Created', value: (o) => o.created_at.slice(0, 10), defaultHidden: true },
]

const getValue = columnValueGetter(COLUMNS)

function getSearchText(o: SalesOrderWithRelations) {
  return [o.reference, o.quote?.quote_number, o.client?.name, o.end_client?.name, o.po_number, o.net_value, o.invoiced_to_date]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
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
  } = useColumnFilters(filtered, getValue, 'sales-orders')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getValue, 'sales-orders')
  const { prefs, setPrefs, reset, visibleColumns } = useColumnPrefs('sales-orders', COLUMNS)

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search sales orders…" className="max-w-sm flex-1" />
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
      {!orders && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {orders && orders.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No sales orders yet.</p>
        </Card>
      )}

      {orders && orders.length > 0 && (
        <DataTable
          storageKey="sales-orders"
          columns={visibleColumns}
          rows={sorted ?? []}
          rowKey={(o) => o.id}
          onRowClick={(o) => navigate(`/staff/sales-orders/${o.id}`)}
          sortKey={sortKey}
          direction={direction}
          onSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          emptyMessage="No sales orders match your search/filters."
        />
      )}
    </div>
  )
}
