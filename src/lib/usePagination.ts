import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE_OPTIONS = [10, 25, 100] as const
const DEFAULT_PAGE_SIZE = 25

const STORAGE_PREFIX = 'spine-crm:page-size:'

function readStored(storageKey: string): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_PREFIX + storageKey))
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

/**
 * Splits an already searched/filtered/sorted list into pages. The rows-per-
 * page choice is remembered per browser (same storage keys as useSort);
 * the page itself goes back to 1 whenever the list changes, e.g. a new
 * search, filter or sort.
 */
export function usePagination<T>(rows: T[], storageKey: string) {
  const [pageSize, setPageSizeState] = useState(() => readStored(storageKey))
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [rows])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)

  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize],
  )

  function setPageSize(size: number) {
    setPageSizeState(size)
    setPage(1)
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, String(size))
    } catch {
      // ignore — e.g. private browsing with storage disabled
    }
  }

  return { pageRows, page: currentPage, pageCount, pageSize, setPage, setPageSize, total: rows.length }
}
