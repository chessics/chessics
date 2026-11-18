'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Crosshair, Swords, TrendingUp } from 'lucide-react'
import { FLAGS } from '@/lib/flags'

const sections = [
  { href: '/workbench', label: 'Workbench', icon: Swords },
  { href: '/train', label: 'Train', icon: Crosshair },
  { href: '/games', label: 'Games', icon: BookOpen },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
]

export default function SectionLinks() {
  const pathname = usePathname()

  return sections.map(({ href, label, icon: Icon }) => {
    if (href === '/progress' && !FLAGS.progressPage) return null
    const current = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? 'page' : undefined}
        className="inline-flex items-center gap-1.5 px-2 py-2 text-sm transition-colors"
        style={{
          color: current ? 'var(--gold)' : 'var(--text-muted)',
          background: current ? 'rgba(201,165,92,0.1)' : 'transparent',
          fontWeight: current ? 500 : 400,
        }}
      >
        <Icon size={16} aria-hidden="true" />
        {label}
      </Link>
    )
  })
}
