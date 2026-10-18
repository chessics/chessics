'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useState } from 'react'

const navLinks = [
  { href: '/workbench', label: 'Workbench' },
  { href: '/games', label: 'Games' },
  { href: '/progress', label: 'Progress' },
]

export default function Topbar() {
  const pathname = usePathname()
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
      className="flex items-center justify-between px-6 h-14 shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <Link href="/workbench" className="font-logo select-none" style={{ fontSize: 20, lineHeight: 1 }}>
        <span style={{ color: 'var(--text)' }}>chess</span>
        <span style={{ color: 'var(--gold)' }}>ics</span>
      </Link>

      <nav className="flex items-center gap-1">
        {navLinks.map(({ href, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx('px-4 py-1.5 rounded-full text-sm transition-colors')}
              style={{
                color: isActive ? 'var(--gold)' : 'var(--text-muted)',
                background: isActive ? 'rgba(201,165,92,0.1)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center gap-3">
        <span
          className="text-xs font-mono px-2.5 py-1 rounded"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--gold)',
            border: '1px solid var(--border)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          1342 elo
        </span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold select-none"
          style={{ background: 'var(--gold-dim)', color: '#1a1512' }}
        >
          A
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-xs px-3 py-1.5 rounded-md transition-opacity"
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
      </div>
    </header>
  )
}
