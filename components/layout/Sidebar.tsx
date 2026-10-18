'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Crosshair, Swords } from 'lucide-react'
import { clsx } from 'clsx'

const items = [
  { href: '/workbench', icon: Swords, label: 'Workbench' },
  { href: '/train', icon: Crosshair, label: 'Train' },
  { href: '/games', icon: BookOpen, label: 'Games' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      aria-label="Sections"
      className="w-14 flex flex-col items-center py-4 gap-2 shrink-0"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {items.map(({ href, icon: Icon, label }) => {
        const isActive = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={clsx('w-9 h-9 flex items-center justify-center transition-colors')}
            style={{
              background: isActive ? 'rgba(201,165,92,0.12)' : 'transparent',
              color: isActive ? 'var(--gold)' : 'var(--text-dim)',
            }}
          >
            <Icon size={18} />
          </Link>
        )
      })}
    </aside>
  )
}
