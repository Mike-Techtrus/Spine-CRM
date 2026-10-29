import type { ColumnFilters } from '../lib/useColumnFilters'
import type { TableColumn } from '../lib/useColumnPrefs'
import type { SortDirection } from '../lib/useSort'
import { PAGE_SIZE_OPTIONS, usePagination } from '../lib/usePagination'
import { FilterCell, Th } from './ui'

/**
 * A sortable, filterable list table drawn from column definitions, so the
 * Columns box (ColumnPicker) can choose which columns show and in what order.
 * `rows` is the full searched/filtered/sorted list; the table shows one page
 * of it at a time (10 / 25 / 100 rows, remembered per browser under
 * `storageKey`).
 */
export default function DataTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
  onRowClick,
  sortKey,
  direction,
  onSort,
  filters,
  setFilter,
  emptyMessage,
}: {
  storageKey: string
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sortKey: string | null
  direction: SortDirection
  onSort: (key: string) => void
  filters: ColumnFilters
  setFilter: (key: string, value: string) => void
  emptyMessage: string
}) {
  const { pageRows, page, pageCount, pageSize, setPage, setPageSize, total } = usePagination(rows, storageKey)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
            <tr>
              {columns.map((c) => (
                <Th key={c.key} sortKey={c.key} activeSortKey={sortKey} direction={direction} onSort={onSort}>
                  {c.label}
                </Th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <FilterCell
                  key={c.key}
                  value={filters[c.key] ?? ''}
                  onChange={(v) => setFilter(c.key, v)}
                  options={c.filterOptions}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`border-t border-border ${onRowClick ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2 ${c.cellClassName ?? 'text-text-muted'}`}>
                      {c.render ? c.render(row) : (c.value(row) ?? '') === '' ? '—' : c.value(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-border bg-sunken px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <span>
            {first.toLocaleString('en-GB')}–{last.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
          </span>
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="rounded border border-border px-2 py-1 hover:text-text disabled:opacity-30"
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="rounded border border-border px-2 py-1 hover:text-text disabled:opacity-30"
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page === pageCount}
            className="rounded border border-border px-2 py-1 hover:text-text disabled:opacity-30"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setPage(pageCount)}
            disabled={page === pageCount}
            className="rounded border border-border px-2 py-1 hover:text-text disabled:opacity-30"
            aria-label="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
