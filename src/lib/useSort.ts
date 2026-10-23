import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

const STORAGE_PREFIX = 'spine-crm:sort:'

interface StoredSort {
  sortKey: string | null
  direction: SortDirection
}

function readStoredSort(storageKey: string): StoredSort | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.sortKey !== 'string' && parsed.sortKey !== null) return null
    if (parsed.direction !== 'asc' && parsed.direction !== 'desc') return null
    return { sortKey: parsed.sortKey, direction: parsed.direction }
  } catch {
    return null
  }
}

function writeStoredSort(storageKey: string, value: StoredSort) {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(value))
  } catch {
    // ignore — e.g. private browsing with storage disabled
  }
}

/**
 * Generic click-to-sort helper for list tables.
 *
 * `getValue(row, key)` returns the comparable value for a given column key —
 * each page defines this once (a small switch over its column keys) so the
 * table markup can stay as plain JSX per row rather than a generic renderer.
 *
 * Empty/null/undefined values always sort to the bottom, regardless of
 * direction, so toggling a column doesn't bury real data under blanks.
 *
 * Pass `storageKey` (unique per list page, e.g. "opportunities") to remember
 * the chosen column/direction across navigation and reloads, per browser.
 */
export function useSort<T>(
  rows: T[] | null | undefined,
  getValue: (row: T, key: string) => string | number | null | undefined,
  storageKey?: string,
) {
  const [sortKey, setSortKey] = useState<string | null>(() =>
    storageKey ? (readStoredSort(storageKey)?.sortKey ?? null) : null,
  )
  const [direction, setDirection] = useState<SortDirection>(() =>
    storageKey ? (readStoredSort(storageKey)?.direction ?? 'asc') : 'asc',
  )

  function toggleSort(key: string) {
    let nextKey = key
    let nextDirection: SortDirection = 'asc'
    if (sortKey === key) {
      nextDirection = direction === 'asc' ? 'desc' : 'asc'
    }
    setSortKey(nextKey)
    setDirection(nextDirection)
    if (storageKey) writeStoredSort(storageKey, { sortKey: nextKey, direction: nextDirection })
  }

  const sorted = useMemo(() => {
    if (!rows || !sortKey) return rows ?? null
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = getValue(a, sortKey)
      const bv = getValue(b, sortKey)
      const aEmpty = av === null || av === undefined || av === ''
      const bEmpty = bv === null || bv === undefined || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1

      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      }
      return direction === 'asc' ? cmp : -cmp
    })
    return copy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, direction])

  return { sorted, sortKey, direction, toggleSort }
}
