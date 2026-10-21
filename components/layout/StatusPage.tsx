import type { ReactNode } from 'react'

export const NOT_FOUND_TITLE = 'Page not found'

export function errorReference(digest: unknown): string | null {
  return typeof digest === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(digest) ? digest : null
}

interface Props {
  headline: string
  sentence: string
  reference?: string | null
  frame?: 'page' | 'inset'
  children: ReactNode
}

export default function StatusPage({ headline, sentence, reference = null, frame = 'page', children }: Props) {
  const body = (
    <div className="w-full max-w-md flex flex-col gap-6">
      {frame === 'page' && (
        <a href="/" className="font-logo self-start" style={{ fontSize: 28, lineHeight: 1, color: 'var(--text)' }}>
          chess<span style={{ color: 'var(--gold)' }}>ics</span>
        </a>
      )}
      <div className="flex flex-col gap-3">
        <h1 className="font-headline" style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 500, color: 'var(--text)' }}>
          {headline}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {sentence}
        </p>
      </div>
      <hr className="hairline w-full" />
      <div className="flex flex-wrap items-center gap-4">{children}</div>
      {reference && (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          Reference {reference}
        </p>
      )}
    </div>
  )

  if (frame === 'inset') return <section className="pt-6 sm:pt-10">{body}</section>

  return (
    <main className="min-h-screen px-6 pt-20 pb-16 sm:px-16 sm:pt-28" style={{ background: 'var(--bg)' }}>
      {body}
    </main>
  )
}

export const PRIMARY_CLASS = 'px-5 py-2.5 text-sm font-medium'
export const primaryStyle = {
  background: 'var(--gold)',
  color: '#1a1512',
  border: 'none',
  cursor: 'pointer',
} as const

export function StartPageLink({ primary = false }: { primary?: boolean }) {
  return (
    <a
      href="/"
      className={primary ? PRIMARY_CLASS : 'text-sm'}
      style={primary ? primaryStyle : { color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}
    >
      Go to the start page
    </a>
  )
}
