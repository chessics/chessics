import type { StatsData } from '@/lib/stats/load'
import type { ExistingDaily } from '@/lib/analytics/usage-report'

const VERCEL_ANALYTICS = 'https://vercel.com/chessics/chessics/analytics'

type Metric = 'guestStarted' | 'signups' | 'batchReports' | 'trainingCommits'

const fmt = (n: number) => n.toLocaleString('en-US')

function sum(rows: ExistingDaily[], m: Metric): number | null {
  let total = 0
  for (const r of rows) {
    const v = r[m]
    if (v === null) return null
    total += v
  }
  return total
}

function Change({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return <span style={{ color: 'var(--text-muted)' }}>last 7 days</span>
  const d = now - before
  if (d === 0) return <span style={{ color: 'var(--text-muted)' }}>same as the week before</span>
  return (
    <span style={{ color: d > 0 ? 'var(--brass)' : 'var(--oxblood)' }}>
      {d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))} <span style={{ color: 'var(--text-muted)' }}>vs the week before</span>
    </span>
  )
}

function Bars({ values, height = 36 }: { values: (number | null)[]; height?: number }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0))
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1"
          style={{
            height: v === null ? 1 : Math.max(2, Math.round((v / max) * height)),
            background: v === null ? 'var(--border)' : v === 0 ? 'var(--surface-3)' : 'var(--brass)',
            opacity: i === values.length - 1 ? 1 : 0.75,
          }}
        />
      ))}
    </div>
  )
}

function Tile({ id, label, value, sub, bars }: { id: string; label: string; value: number | null; sub: React.ReactNode; bars?: (number | null)[] }) {
  return (
    <div className="flex flex-col gap-2 p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <p data-stat-value={id} style={{ fontSize: 36, lineHeight: 1, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {value === null ? '–' : fmt(value)}
      </p>
      <span className="text-xs">{sub}</span>
      {bars && <Bars values={bars} />}
    </div>
  )
}

function DayChart({ rows }: { rows: ExistingDaily[] }) {
  const max = Math.max(1, ...rows.map((r) => r.signups))
  const h = 140
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1 sm:gap-2" style={{ height: h + 18 }}>
        {rows.map((r) => (
          <div key={r.day} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: h + 18 }}>
            <span className="text-[10px] font-mono" style={{ color: r.signups ? 'var(--text)' : 'transparent' }}>{r.signups}</span>
            <div
              className="w-full"
              style={{ height: r.signups ? Math.max(3, Math.round((r.signups / max) * h)) : 1, background: r.signups ? 'var(--brass)' : 'var(--border)' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-2" aria-hidden="true">
        {rows.map((r, i) => (
          <span key={r.day} className="flex-1 text-center text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {i % 2 === rows.length % 2 ? '' : Number(r.day.slice(8))}
          </span>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 p-4 sm:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm" style={{ color: 'var(--text)', fontWeight: 500 }}>{title}</h2>
      {children}
      {note && <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{note}</p>}
    </section>
  )
}

function FunnelBar({ id, label, value, first }: { id: string; label: string; value: number; first: number }) {
  const pct = first > 0 ? Math.round((value / first) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span style={{ color: 'var(--text)' }}>{label}</span>
        <span className="font-mono" style={{ color: 'var(--text)' }}>
          <span data-funnel={id}>{fmt(value)}</span>
          {first > 0 && <span style={{ color: 'var(--text-muted)' }}> · {pct}%</span>}
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-3)' }}>
        <div style={{ height: 8, width: `${first > 0 ? Math.max(value ? 2 : 0, pct) : 0}%`, background: 'var(--brass)' }} />
      </div>
    </div>
  )
}

export default function StatsView({ data }: { data: StatsData }) {
  const { week, daily, events } = data
  const thisWeek = daily.slice(-7)
  const weekBefore = daily.slice(0, daily.length - 7)
  const series = (m: Metric) => daily.map((d) => d[m])
  const stamp = new Date(data.now).toISOString().slice(11, 16)
  const funnel = events.status === 'ok' ? events.funnels[0] : null

  return (
    <div className="w-full max-w-5xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-headline" style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 500, color: 'var(--text)' }}>Usage</h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Only you can see this page · counts only, no names · updated {stamp} UTC ·{' '}
          <a href={VERCEL_ANALYTICS} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brass)', textDecoration: 'underline' }}>
            visitors and page views are in Vercel<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile id="guest" label="Guest analyses" value={sum(thisWeek, 'guestStarted')} sub={<Change now={null} before={null} />} bars={series('guestStarted')} />
        <Tile id="signups" label="New accounts" value={sum(thisWeek, 'signups')} sub={<Change now={sum(thisWeek, 'signups')} before={sum(weekBefore, 'signups')} />} bars={series('signups')} />
        <Tile id="reports" label="Account analyses" value={sum(thisWeek, 'batchReports')} sub={<Change now={sum(thisWeek, 'batchReports')} before={sum(weekBefore, 'batchReports')} />} bars={series('batchReports')} />
        <Tile id="training" label="Training answers" value={sum(thisWeek, 'trainingCommits')} sub={<Change now={sum(thisWeek, 'trainingCommits')} before={sum(weekBefore, 'trainingCommits')} />} bars={series('trainingCommits')} />
        <Tile id="active" label="Active accounts" value={week.accountsActive} sub={<span style={{ color: 'var(--text-muted)' }}>analysed, trained or imported, last 7 days</span>} />
        <Tile id="total" label="Total accounts" value={week.totalAccounts} sub={<span style={{ color: 'var(--text-muted)' }}>all time</span>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <Panel title="New accounts per day, last 14 days" note={data.guestsKnown ? undefined : 'Redis is not configured here, so guest analyses are not known.'}>
            <DayChart rows={daily} />
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel
            title="From guest to trainee, last 7 days"
            note={
              events.status === 'not_applied'
                ? 'This fills in once migration 013 is applied: it follows each guest from their analysis to their first training answer.'
                : events.status === 'error'
                  ? "The product events couldn't be read just now."
                  : 'Each step is the people from the step above who went on.'
            }
          >
            {funnel && (
              <div className="flex flex-col gap-3">
                <FunnelBar id="started" label="Started a guest analysis" value={funnel.guestStarted} first={funnel.guestStarted} />
                <FunnelBar id="viewed" label="Saw the report" value={funnel.reportViewed} first={funnel.guestStarted} />
                <FunnelBar id="signed" label="Signed up" value={funnel.signedUp} first={funnel.guestStarted} />
                <FunnelBar id="trained" label="Answered a training position" value={funnel.firstCommit} first={funnel.guestStarted} />
              </div>
            )}
          </Panel>
        </div>
      </div>

      <details className="text-sm" style={{ color: 'var(--text-muted)' }}>
        <summary className="cursor-pointer" style={{ color: 'var(--text)' }}>Numbers by day</summary>
        <div className="overflow-x-auto mt-3">
          <table className="text-xs font-mono" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--brass)' }}>
                {['Day (UTC)', 'Guest analyses', 'New accounts', 'Account analyses', 'Training answers', 'Games added'].map((h) => (
                  <th key={h} scope="col" className="text-left font-normal py-1 pr-4" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day} style={{ borderBottom: '1px solid var(--border)' }}>
                  {[d.day, d.guestStarted ?? '–', d.signups, d.batchReports, d.trainingCommits, d.gamesAdded].map((c, i) => (
                    <td key={i} className="py-1 pr-4" style={{ color: 'var(--text)' }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.cut && <p className="mt-2">Some tables have more rows than this page reads, so a few counts are low.</p>}
      </details>
    </div>
  )
}
