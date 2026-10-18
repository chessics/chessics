export const LOST_AFTER_SILENT_MS = 5 * 60_000

export function jobIsLost(record: { status?: unknown; updatedAt?: unknown }, nowMs: number): boolean {
  if (record.status !== 'processing') return false
  if (typeof record.updatedAt !== 'string') return false
  const at = Date.parse(record.updatedAt)
  if (Number.isNaN(at)) return false
  return nowMs - at > LOST_AFTER_SILENT_MS
}
