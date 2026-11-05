import SharedPuzzle from './SharedPuzzle'
import type { PublicShare } from '@/lib/share/payload'
import type { ShareMode } from '@/lib/share/api-types'

export default function SharePage({ share, mode, banner }: { share: PublicShare; mode: ShareMode; banner?: string }) {
  return (
    <main className="min-h-screen px-4 pt-8 pb-16 sm:px-6" style={{ background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', position: 'relative', zIndex: 3 }}>
        {banner && (
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' }}>{banner}</p>
        )}
        <a href="/" className="font-logo inline-block" style={{ fontSize: 28, lineHeight: 1, color: 'var(--text)', marginBottom: 24 }}>
          chess<span style={{ color: 'var(--gold)' }}>ics</span>
        </a>
      </div>
      <SharedPuzzle share={share} mode={mode} />
    </main>
  )
}
