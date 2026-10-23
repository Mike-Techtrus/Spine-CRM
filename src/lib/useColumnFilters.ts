import { useMemo, useState } from 'react'

export type ColumnFilters = Record<string, string>

const STORAGE_PREFIX = 'spine-crm:filters:'

function readStored(storageKey: string): ColumnFilters {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: ColumnFilters = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v !== '') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeStored(storageKey: string, value: ColumnFilters) {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(value))
  } catch {
    // ignore — e.g. private browsing with storage disabled
  }
}

/**
 * Per-column filtering for list tables, layered on top of the free-text
 * search box. `getValue(row, key)` reuses the same accessor each page
 * already defines for sorting (useSort) — a filter's value matches a row
 * when the column's value (stringified) contains it, case-insensitively.
 * For a <select>-driven column this is effectively an exact match, since
 * the option values are the exact label strings getValue returns.
 *
 * Pass `storageKey` (same convention as useSort) to remember active filters
 * across navigation, per browser.
 */
export function useColumnFilters<T>(
  rows: T[] | null | undefined,
  getValue: (row: T, key: string) => string | number | null | undefined,
  storageKey?: string,
) {
  const [filters, setFiltersState] = useState<ColumnFilters>(() => (storageKey ? readStored(storageKey) : {}))

  function setFilter(key: string, value: string) {
    setFiltersState((prev) => {
      const next = { ...prev }
      if (value) next[key] = value
      else delete next[key]
      if (storageKey) writeStored(storageKey, next)
      return next
    })
  }

  function clearFilters() {
    setFiltersState({})
    if (storageKey) writeStored(storageKey, {})
  }

  const activeCount = Object.keys(filters).length

  const filtered = useMemo(() => {
    if (!rows || activeCount === 0) return rows ?? null
    return rows.filter((row) =>
      Object.entries(filters).every(([key, term]) => {
        const v = getValue(row, key)
        if (v === null || v === undefined) return false
        return String(v).toLowerCase().includes(term.toLowerCase())
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters])

  return { filters, setFilter, clearFilters, activeCount, filtered }
}
