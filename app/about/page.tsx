import { publicPageMetadata } from '@/lib/public-page-metadata'
import { SITE_DESCRIPTION } from '@/lib/site'
import ChessBoard from '@/components/workbench/ChessBoard'
import example from '@/app/example/example-report.json'
import type { EvidenceBoard } from '@/lib/diagnosis/finding'
import SourceLink from '@/components/layout/SourceLink'

export const metadata = publicPageMetadata(
  '/about',
  'How chess game review and training work',
  'Learn how Chessics reviews your chess games with Stockfish, groups recurring mistakes, and gives you positions from your own games to practice.',
)

const SECTIONS: ReadonlyArray<{ heading: string; paragraphs: readonly string[] }> = [
  {
    heading: 'The idea',
    paragraphs: [
      'Most game review tells you where you went wrong in one game. Chessics reads many games and finds the one mistake that keeps costing you.',
    ],
  },
  {
    heading: 'How a review works',
    paragraphs: [
      'You give it a Chess.com or Lichess username. It imports your recent games, rapid and blitz by default, and Stockfish checks every move.',
      'Each blunder is traced back to the earlier move where the slide began. The same kind of slip across several games is grouped into one finding, and the boards are the proof: up to six of them, from your side, with your move drawn.',
      'A guest can analyse 10 games without an account. With an account you can analyse 25, 50 or 100 at a time.',
    ],
  },
  {
    heading: 'How training works',
    paragraphs: [
      'Training positions are taken from just before your mistake, and they are not labelled. You draw the move you would play, commit to it, and only then see what the engine preferred and what happened in your game.',
      'A position you miss comes back after 3 days, then 1 week, then 2 weeks. Three correct returns in a row retire it.',
    ],
  },
  {
    heading: 'What it will not do',
    paragraphs: [
      'It does not invent a rating or a score for you. Every chess fact comes from Stockfish, and the numbers sit behind a press, not on the surface.',
    ],
  },
  {
    heading: 'Privacy',
    paragraphs: ['Chessics counts visits anonymously and without cookies.'],
  },
  {
    heading: 'Open source',
    paragraphs: ['Chessics is free software under the AGPL-3.0-or-later license. Anyone can read the code.'],
  },
]

export default function AboutPage() {
  const board = example.findings[0].boards[0] as EvidenceBoard
  return (
    <main className="min-h-screen px-6 pt-20 pb-16 sm:px-16 sm:pt-28" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-xl flex flex-col gap-8">
        <a href="/" className="font-logo self-start" style={{ fontSize: 28, lineHeight: 1, color: 'var(--text)' }}>
          chess<span style={{ color: 'var(--gold)' }}>ics</span>
        </a>
        <h1 className="font-headline" style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 500, color: 'var(--text)' }}>
          How Chessics works
        </h1>
        <p className="text-base" style={{ color: 'var(--text)', lineHeight: 1.6 }}>
          {SITE_DESCRIPTION}
        </p>
        {SECTIONS.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <hr className="hairline w-full" />
            <h2 className="font-headline" style={{ fontSize: 24, fontWeight: 500, color: 'var(--text)' }}>
              {section.heading}
            </h2>
            {section.paragraphs.map((p) => (
              <p key={p} className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {p}
              </p>
            ))}
            {section.heading === 'How a review works' && (
              <figure>
                <div className="aspect-square w-full max-w-64" role="img" aria-label={board.label}>
                  <ChessBoard fen={board.fen} orientation={board.orientation} size="100%" coordinates={false}
                    viewOnly shapes={[{ orig: board.from, dest: board.to, brush: 'mistake' }]} />
                </div>
                <figcaption className="mt-2 text-sm text-text-muted">
                  {board.caption}. The arrow shows the move played in the example report.
                </figcaption>
              </figure>
            )}
          </section>
        ))}
        <hr className="hairline w-full" />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a href="/" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>
            Analyze my games
          </a>
          <a href="/example" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
            See an example report
          </a>
          <SourceLink />
        </div>
      </div>
    </main>
  )
}
