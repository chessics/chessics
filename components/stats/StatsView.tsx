import type { StatsData } from '@/lib/stats/load'

type Cell = number | null

const show = (n: Cell) => (n === null ? '–' : n.toLocaleString('en-US'))

const thStyle = { color: 'var(--text-muted)', fontWeight: 400, textAlign: 'left' as const, padding: '6px 16px 6px 0' }
const tdStyle = { color: 'var(--text)', textAlign: 'right' as const, padding: '6px 0 6px 16px' }

function Table({ head, rows }: { head: string[]; rows: [string, ...Cell[]][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm" style={{ borderCollapse: 'collapse', minWidth: 280 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--brass)' }}>
            {head.map((h, i) => (
              <th key={h} scope="col" style={i === 0 ? thStyle : { ...thStyle, textAlign: 'right', padding: '6px 0 6px 16px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...cells]) => (
            <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
              <th scope="row" style={thStyle}>{label}</th>
              {cells.map((c, i) => (
                <td key={i} className="font-mono" style={tdStyle}>{show(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <hr className="hairline w-full" />
      <h2 className="font-headline" style={{ fontSize: 24, fontWeight: 500, color: 'var(--text)' }}>{title}</h2>
      {children}
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</p>
}

const EVENT_LABELS: Record<string, string> = {
  guest_analysis_started: 'Guest analysis started',
  analysis_started: 'Signed-in analysis started',
  report_viewed: 'Report viewed',
  signup: 'Sign-up',
  training_commit: 'Training answer',
  play_started: 'Play-out started',
  share_created: 'Share link made',
  share_viewed: 'Share link opened',
  share_answered: 'Share link answered',
}

export default function StatsView({ data }: { data: StatsData }) {
  const { week, month, daily, events } = data
  const stamp = new Date(data.now).toISOString().slice(0, 16).replace('T', ' ')
  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline" style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 500, color: 'var(--text)' }}>Usage</h1>
        <Note>Only you can see this page. Counts only: no names, emails or usernames. Read at {stamp} UTC.</Note>
        <Note>Visitors and page views are in Vercel: open the project, then Analytics.</Note>
      </div>

      <Section title="Accounts and analyses">
        <Table
          head={['', 'Last 7 days', 'Last 30 days']}
          rows={[
            ['Guest analyses', week.guestStarted, month.guestStarted],
            ['Sign-ups', week.signups, month.signups],
            ['Accounts that ran an analysis', week.accountsWithBatchReport, month.accountsWithBatchReport],
            ['Accounts active', week.accountsActive, month.accountsActive],
            ['Accounts that trained for the first time', week.firstCommits, month.firstCommits],
            ['Training answers', week.trainingCommits, month.trainingCommits],
            ['Total accounts', week.totalAccounts, month.totalAccounts],
          ]}
        />
        <Note>
          {data.guestsKnown
            ? 'Guest analyses are counted from the results still in Redis, which keeps them 7 days, so there is no 30-day figure.'
            : 'Redis is not configured here, so guest analyses are not known.'}
          {data.cut ? ' Some tables have more rows than this page reads, so a few counts are low.' : ''}
        </Note>
      </Section>

      <Section title="By day">
        <Table
          head={['Day (UTC)', 'Guest analyses', 'Sign-ups', 'Batch reports', 'Training answers', 'Games added']}
          rows={[...daily].reverse().map((d) => [d.day, d.guestStarted, d.signups, d.batchReports, d.trainingCommits, d.gamesAdded])}
        />
      </Section>

      <Section title="Product events">
        {events.status === 'not_applied' && <Note>Product events start once migration 013 is applied.</Note>}
        {events.status === 'error' && <Note>The product events couldn&apos;t be read just now.</Note>}
        {events.status === 'ok' && (
          <>
            <Note>Guests followed from their analysis to their first training answer.</Note>
            <Table
              head={['', ...events.funnels.map((f) => `Last ${f.days} days`)]}
              rows={[
                ['Started a guest analysis', ...events.funnels.map((f) => f.guestStarted)],
                ['Saw the report', ...events.funnels.map((f) => f.reportViewed)],
                ['Signed up', ...events.funnels.map((f) => f.signedUp)],
                ['Answered a training position', ...events.funnels.map((f) => f.firstCommit)],
              ]}
            />
            <Table
              head={['', 'Last 7 days', 'Last 30 days']}
              rows={[
                ['Guest analyses started', events.week.guestAnalyses, events.month.guestAnalyses],
                ['Signed-in analyses started', events.week.signedInAnalyses, events.month.signedInAnalyses],
                ['Reports viewed', events.week.reportsViewed, events.month.reportsViewed],
                ['Sign-up events', events.week.signups, events.month.signups],
                ['First training answers', events.week.firstCommits, events.month.firstCommits],
                ['Training answer events', events.week.trainingCommits, events.month.trainingCommits],
                ['Accounts with any event', events.week.activeAccounts, events.month.activeAccounts],
              ]}
            />
            <Table
              head={['Day (UTC)', ...events.names.map((n) => EVENT_LABELS[n] ?? n)]}
              rows={[...events.daily].reverse().map((d) => [d.day, ...events.names.map((n) => d.counts[n] ?? 0)])}
            />
            {events.cut && <Note>The events table has more rows than this page reads, so a few counts are low.</Note>}
          </>
        )}
      </Section>
    </div>
  )
}
