import { formatClock } from '@/lib/play/session'

export const LOW_TIME_MS = 20_000

export default function PlayClock({ ms, running, label }: { ms: number; running: boolean; label: string }) {
  const low = ms < LOW_TIME_MS
  return (
    <span
      className={`play-clock${running ? ' play-clock-running' : ''}${low ? ' play-clock-low' : ''}`}
      role="timer"
      aria-label={label}
      data-running={running ? 'true' : undefined}
    >
      {formatClock(ms)}
    </span>
  )
}
