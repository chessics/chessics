const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isStatsOwner(
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  const owner = (env.STATS_OWNER_ID ?? '').trim().toLowerCase()
  if (!ACCOUNT_ID.test(owner)) return false
  return typeof userId === 'string' && userId.trim().toLowerCase() === owner
}
