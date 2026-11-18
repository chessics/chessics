import { publicPageMetadata } from '@/lib/public-page-metadata'
import Link from 'next/link'
import Diagnosis from '@/components/diagnosis/Diagnosis'
import { REPORT_COLUMN, VERDICT_FONT_SIZE, PROSE_MEASURE } from '@/components/report/column'
import { EXAMPLE_INTRO, EXAMPLE_SOURCES_NOTE, type ExampleReport } from '@/lib/diagnosis/example'
import data from './example-report.json'

const report = data as unknown as ExampleReport
export const metadata = publicPageMetadata(
  '/example',
  'Example chess game review',
  "See where one player's rapid and blitz chess games went wrong. This example report shows the recurring mistake and the positions where it appeared.",
  { url: '/example/opengraph-image', alt: `${report.findings[0].boards[0].label}. ${report.verdict}` },
)

export default function ExamplePage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 lg:px-12 py-10" style={{ background: 'var(--bg)' }}>
      <div className={`flex flex-col gap-6 ${REPORT_COLUMN}`}>
        <nav className="flex items-baseline justify-between gap-4" aria-label="Site">
          <Link href="/" className="font-logo" style={{ fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1 }}>
            <span style={{ color: 'var(--text)' }}>chess</span>
            <span style={{ color: 'var(--gold)' }}>ics</span>
          </Link>
          <Link href="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Try it on your games
          </Link>
        </nav>
        <p className="text-sm" style={{ color: 'var(--text-muted)', maxWidth: PROSE_MEASURE }} data-example-intro>
          {EXAMPLE_INTRO}
        </p>
        {report.verdict && (
          <h1 className="font-headline" style={{ fontSize: VERDICT_FONT_SIZE, lineHeight: 1.25, color: 'var(--text)', fontWeight: 500 }}>
            {report.verdict}
          </h1>
        )}
        <Diagnosis findings={report.findings} reviewLinks={false} opponentsRemoved sourcesNote={EXAMPLE_SOURCES_NOTE} />
        <p className="text-sm pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <Link href="/" style={{ color: 'var(--gold-dim)', textDecoration: 'underline' }}>
            Analyze your own games
          </Link>
        </p>
      </div>
    </main>
  )
}
