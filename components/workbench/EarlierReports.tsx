import Link from 'next/link'
import { countNoun } from '@/lib/count-noun'
import type { ReportRow } from '@/lib/workbench/report-choice'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EarlierReports({ reports }: { reports: readonly ReportRow[] }) {
  if (reports.length === 0) return null
  return (
    <section aria-labelledby="earlier-reports" className="earlier-reports">
      <h2 id="earlier-reports" className="earlier-reports-title">
        Earlier reports
      </h2>
      <ul>
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/workbench/batch/${r.id}`} className="earlier-report">
              <span className="earlier-report-date">{formatDate(r.generated_at)}</span>
              <span className="earlier-report-count">{countNoun(r.game_count ?? 0, 'game')}</span>
              <span className="earlier-report-open" aria-hidden>
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="earlier-reports-note">One-game analyses are on that game’s review in your game library.</p>
    </section>
  )
}
