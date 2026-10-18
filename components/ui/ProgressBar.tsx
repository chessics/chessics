interface ProgressBarProps {
  value: number
  max?: number
  color?: string
}

export default function ProgressBar({ value, max = 100, color = 'var(--gold)' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--surface-3)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}
