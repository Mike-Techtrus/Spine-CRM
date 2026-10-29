import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '../../lib/api'
import type { InvoiceWithRelations } from '../../lib/types'
import { INVOICE_STATUS_LABELS } from '../../lib/types'
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
  paid: 'approved',
  cancelled: 'rejected',
}

const STATUS_OPTIONS = Object.entries(INVOICE_STATUS_LABELS).map(([, label]) => ({ value: label, label }))

function money(
  key: 'value' | 'vat' | 'total' | 'rebate' | 'net_value',
  label: string,
  defaultHidden = true,
): TableColumn<InvoiceWithRelations> {
  return { key, label, value: (inv) => inv[key] ?? null, render: (inv) => formatMoney(inv[key]), defaultHidden }
}

function date(
  key: 'invoice_date' | 'due_date' | 'invoice_period_from' | 'invoice_period_to',
  label: string,
  defaultHidden = true,
): TableColumn<InvoiceWithRelations> {
  return { key, label, value: (inv) => inv[key] ?? '', defaultHidden }
}

// Every column the Columns box offers, in default order.
const COLUMNS: TableColumn<InvoiceWithRelations>[] = [
  {
    key: 'invoice_number',
    label: 'Invoice #',
    value: (inv) => inv.invoice_number,
    cellClassName: 'font-mono-label text-text-muted',
  },
  {
    key: 'sales_order',
    label: 'Sales order',
    value: (inv) => inv.sales_order?.reference ?? '',
    cellClassName: 'font-mono-label text-text-muted',
    defaultHidden: true,
  },
  { key: 'client', label: 'Client', value: (inv) => inv.client?.name ?? '', cellClassName: 'text-text' },
  { key: 'end_client', label: 'End client', value: (inv) => inv.end_client?.name ?? '', defaultHidden: true },
  { key: 'po_number', label: 'PO number', value: (inv) => inv.po_number ?? '', defaultHidden: true },
  date('invoice_date', 'Invoice date'),
  date('invoice_period_from', 'Period from'),
  date('invoice_period_to', 'Period to'),
  date('due_date', 'Due date', false),
  money('value', 'Value'),
  money('vat', 'VAT'),
  money('total', 'Total', false),
  money('rebate', 'Rebate'),
  money('net_value', 'Net value'),
  {
    key: 'status',
    label: 'Status',
    value: (inv) => INVOICE_STATUS_LABELS[inv.status],
    render: (inv) => <StatusBadge status={STATUS_BADGE_MAP[inv.status]} label={INVOICE_STATUS_LABELS[inv.status]} />,
    filterOptions: STATUS_OPTIONS,
  },
  { key: 'created_at', label: 'Created', value: (inv) => inv.created_at.slice(0, 10), defaultHidden: true },
]

const getValue = columnValueGetter(COLUMNS)

function getSearchText(inv: InvoiceWithRelations) {
  return [
    inv.invoice_number,
    inv.sales_order?.reference,
    inv.client?.name,
    inv.end_client?.name,
    inv.po_number,
    inv.due_date,
    inv.total,
    INVOICE_STATUS_LABELS[inv.status],
  ]
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
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
  } = useColumnFilters(filtered, getValue, 'invoices')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getValue, 'invoices')
  const { prefs, setPrefs, reset, visibleColumns } = useColumnPrefs('invoices', COLUMNS)

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" className="max-w-sm flex-1" />
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
      {!invoices && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {invoices && invoices.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">No invoices yet.</p>
        </Card>
      )}

      {invoices && invoices.length > 0 && (
        <DataTable
          storageKey="invoices"
          columns={visibleColumns}
          rows={sorted ?? []}
          rowKey={(inv) => inv.id}
          onRowClick={(inv) => navigate(`/staff/invoices/${inv.id}`)}
          sortKey={sortKey}
          direction={direction}
          onSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          emptyMessage="No invoices match your search/filters."
        />
      )}
    </div>
  )
}
