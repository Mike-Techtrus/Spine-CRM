import { useMemo, useState, type ReactNode } from 'react'

/**
 * One column of a list table (Opportunities, Quotes, Sales Orders,
 * Invoices). `value` feeds sorting and the column filter; `render` is what
 * the cell shows (defaults to the value, or "—" when empty).
 */
export interface TableColumn<T> {
  key: string
  label: string
  value: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  cellClassName?: string // defaults to muted text
  filterOptions?: { value: string; label: string }[] // a <select> filter instead of free text
  defaultHidden?: boolean // available in the Columns box but off until switched on
}

export interface ColumnPrefs {
  order: string[]
  hidden: string[]
}

const STORAGE_PREFIX = 'spine-crm:columns:'

function defaultPrefs<T>(columns: TableColumn<T>[]): ColumnPrefs {
  return {
    order: columns.map((c) => c.key),
    hidden: columns.filter((c) => c.defaultHidden).map((c) => c.key),
  }
}

// Stored prefs may predate columns added since, or name ones since removed:
// keep the stored order for known columns and append new ones at their
// default visibility.
function readStored<T>(storageKey: string, columns: TableColumn<T>[]): ColumnPrefs {
  const fallback = defaultPrefs(columns)
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs> & { known?: string[] }
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return fallback
    const keys = new Set(columns.map((c) => c.key))
    const known = new Set(parsed.known ?? parsed.order)
    const order = parsed.order.filter((k) => keys.has(k))
    const added = columns.filter((c) => !order.includes(c.key))
    return {
      order: [...order, ...added.map((c) => c.key)],
      hidden: [
        ...parsed.hidden.filter((k) => keys.has(k)),
        ...added.filter((c) => c.defaultHidden && !known.has(c.key)).map((c) => c.key),
      ],
    }
  } catch {
    return fallback
  }
}

function writeStored<T>(storageKey: string, prefs: ColumnPrefs, columns: TableColumn<T>[]) {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + storageKey,
      JSON.stringify({ ...prefs, known: columns.map((c) => c.key) }),
    )
  } catch {
    // ignore — e.g. private browsing with storage disabled
  }
}

/**
 * Which columns a list table shows, and in what order — chosen in the
 * Columns box (ColumnPicker) and remembered per browser, like sorting and
 * filters (useSort / useColumnFilters use the same storage keys).
 */
export function useColumnPrefs<T>(storageKey: string, columns: TableColumn<T>[]) {
  const [prefs, setPrefsState] = useState<ColumnPrefs>(() => readStored(storageKey, columns))

  function setPrefs(next: ColumnPrefs) {
    setPrefsState(next)
    writeStored(storageKey, next, columns)
  }

  function reset() {
    setPrefs(defaultPrefs(columns))
  }

  const visibleColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]))
    return prefs.order
      .filter((k) => !prefs.hidden.includes(k))
      .map((k) => byKey.get(k))
      .filter((c): c is TableColumn<T> => c !== undefined)
  }, [columns, prefs])

  return { prefs, setPrefs, reset, visibleColumns }
}

/** Sort/filter accessor built from the column list, for useSort and useColumnFilters. */
export function columnValueGetter<T>(columns: TableColumn<T>[]) {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  return (row: T, key: string) => byKey.get(key)?.value(row) ?? ''
}

// ── Shared cell formatting ───────────────────────────────────────────────────

export function formatMoney(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `£${Number(value).toLocaleString('en-GB')}`
}

export function yesNo(value: boolean | null | undefined) {
  return value ? 'Yes' : 'No'
}

export const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
]
