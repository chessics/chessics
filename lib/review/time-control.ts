export function formatTimeControl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const tc = raw.trim()
  if (tc === '') return null
  if (/^\d+\/\d+$/.test(tc)) return 'Daily'
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/)
  if (!m) return tc
  const base = Number(m[1])
  const inc = m[2] ?? '0'
  const minutes = base % 60 === 0 ? String(base / 60) : `${base}s`
  return `${minutes}+${inc}`
}
