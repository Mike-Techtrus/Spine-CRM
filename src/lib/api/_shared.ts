export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('No data returned')
  return data
}

// Supabase returns at most 1000 rows per request, so list pages that need
// every record (Opportunities, Quotes, Sales Orders, Invoices — searched,
// filtered and sorted in the browser) fetch in 1000-row chunks until a short
// chunk comes back. The query must have a stable order (add .order('id') as a
// tie-breaker) or rows can repeat or go missing between chunks.
const CHUNK_SIZE = 1000

export async function fetchAllRows<T>(
  fetchChunk: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += CHUNK_SIZE) {
    const chunk = unwrap(await fetchChunk(from, from + CHUNK_SIZE - 1))
    rows.push(...chunk)
    if (chunk.length < CHUNK_SIZE) return rows
  }
}
