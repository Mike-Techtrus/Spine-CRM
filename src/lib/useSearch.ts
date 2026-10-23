import { useMemo, useState } from 'react'

/**
 * Generic "search any field" helper for list tables.
 *
 * `getSearchText(row)` returns a single string containing every field the
 * row should be searchable by (each page assembles this from its own
 * fields, including nested/related names that aren't necessarily a single
 * column). Matching is a simple case-insensitive substring test, split on
 * whitespace so "royal hospital" matches "Royal Marsden Hospital" even
 * though the words aren't adjacent in the source text.
 */
export function useSearch<T>(rows: T[] | null | undefined, getSearchText: (row: T) => string) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!rows) return rows ?? null
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return rows
    return rows.filter((row) => {
      const haystack = getSearchText(row).toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query])

  return { query, setQuery, filtered }
}
