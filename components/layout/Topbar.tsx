'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import SectionLinks from './SectionLinks'

export default function Topbar({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <header
      className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <Link href={signedIn ? '/workbench' : '/'} className="font-logo select-none" style={{ fontSize: 20, lineHeight: 1 }}>
        <span style={{ color: 'var(--text)' }}>chess</span>
        <span style={{ color: 'var(--gold)' }}>ics</span>
      </Link>

      <nav aria-label="Sections" className="hidden sm:flex items-center gap-1">
        <SectionLinks />
      </nav>

      <div className="flex items-center gap-3">
        {signedIn ? (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs px-3 py-1.5 transition-opacity"
            style={{
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              background: 'transparent',
              cursor: signingOut ? 'not-allowed' : 'pointer',
              opacity: signingOut ? 0.5 : 1,
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        ) : (
          <Link
            href="/login"
            className="text-xs px-3 py-1.5"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
