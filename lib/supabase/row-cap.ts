export const SUPABASE_MAX_ROWS = 1000

export const MAX_IDS_PER_REQUEST = 100

export function gamesByPliesQueries(
  gameIds: readonly string[],
  plies: readonly number[],
  cap: number = SUPABASE_MAX_ROWS
): { gameIds: string[]; plies: number[] }[] {
  if (plies.length === 0) return []
  const perRequest = Math.max(1, Math.min(MAX_IDS_PER_REQUEST, Math.floor(cap / plies.length)))
  const out: { gameIds: string[]; plies: number[] }[] = []
  for (let i = 0; i < gameIds.length; i += perRequest) {
    out.push({ gameIds: gameIds.slice(i, i + perRequest), plies: [...plies] })
  }
  return out
}

export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = SUPABASE_MAX_ROWS,
  maxPages = 50
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = []
  for (let i = 0; i < maxPages; i++) {
    const { data: rows, error } = await page(i * pageSize, (i + 1) * pageSize - 1)
    if (error) return { data, error }
    data.push(...(rows ?? []))
    if (!rows || rows.length < pageSize) break
  }
  return { data, error: null }
}
