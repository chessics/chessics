'use client'

import { errorReference } from '@/components/layout/StatusPage'

const ESPRESSO = '#1a1512'
const CREAM = '#e8e0d0'
const MUTED = '#a2977f'
const BRASS = '#c9a55c'
const HAIRLINE = 'rgba(201, 165, 92, 0.18)'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = errorReference(error.digest)
  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Chessics</title>
        <style>{`:focus-visible { outline: 1px solid ${BRASS}; outline-offset: 2px; }`}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: ESPRESSO,
          color: CREAM,
          fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
          colorScheme: 'dark',
        }}
      >
        <main style={{ padding: '80px 24px 64px', maxWidth: 448 }}>
          <a href="/" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: CREAM, textDecoration: 'none' }}>
            chess<span style={{ color: BRASS }}>ics</span>
          </a>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, lineHeight: 1.2, fontWeight: 500, margin: '24px 0 12px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>The site could not be shown just now.</p>
          <hr style={{ border: 'none', borderTop: `1px solid ${HAIRLINE}`, margin: '24px 0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={reset}
              style={{ background: BRASS, color: ESPRESSO, border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
            <a href="/" style={{ color: CREAM, fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Go to the start page
            </a>
          </div>
          {reference && (
            <p style={{ fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", fontSize: 12, color: MUTED, marginTop: 24 }}>
              Reference {reference}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
