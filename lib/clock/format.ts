export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const s = Math.floor(total / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = String(sec).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  if (total < 10_000 && total % 1000 !== 0) return `${m}:${ss}.${Math.floor((total % 1000) / 100)}`
  return `${m}:${ss}`
}

export function formatSpent(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  if (total >= 60_000) {
    const s = Math.floor(total / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  if (total % 1000 === 0) return `${total / 1000} s`
  const tenths = Math.floor(total / 100)
  return `${Math.floor(tenths / 10)}.${tenths % 10} s`
}
