export type StripBarState = 'affected' | 'quiet' | 'pending'

interface RecurrenceStripProps {
  bars: StripBarState[]
  height?: number
}

const BAR_COLORS: Record<StripBarState, string> = {
  affected: 'var(--brass)',
  quiet: 'rgba(232, 224, 208, 0.22)',
  pending: 'rgba(232, 224, 208, 0.07)',
}

export default function RecurrenceStrip({ bars, height = 34 }: RecurrenceStripProps) {
  if (bars.length === 0) return null
  return (
    <div
      role="img"
      aria-label={`${bars.filter((b) => b === 'affected').length} of ${bars.length} games affected`}
      style={{ display: 'flex', gap: 5, alignItems: 'stretch', height }}
    >
      {bars.map((state, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: BAR_COLORS[state],
            transition: 'background 0.5s ease',
          }}
        />
      ))}
    </div>
  )
}
