'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useState } from 'react'
import { FLAGS } from '@/lib/flags'

const navLinks = [
  { href: '/workbench', label: 'Workbench' },
  { href: '/games', label: 'Games' },
  ...(FLAGS.progressPage ? [{ href: '/progress', label: 'Progress' }] : []),
]

export default function Topbar({ signedIn }: { signedIn: boolean }) {
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
      className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0"
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

      <nav className="hidden sm:flex items-center gap-1">
        {navLinks.map(({ href, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx('px-4 py-1.5 text-sm transition-colors')}
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
