import { clsx } from 'clsx'

type BadgeVariant = 'blunder' | 'mistake' | 'inaccuracy' | 'good' | 'brilliant' | 'default'

const variantColors: Record<BadgeVariant, string> = {
  blunder: 'var(--blunder)',
  mistake: 'var(--mistake)',
  inaccuracy: 'var(--inaccuracy)',
  good: 'var(--good)',
  brilliant: 'var(--brilliant)',
  default: 'var(--gold)',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-2 py-0.5 text-xs font-medium', className)}
      style={{
        background: `${variantColors[variant]}22`,
        color: variantColors[variant],
        border: `1px solid ${variantColors[variant]}44`,
      }}
    >
      {children}
    </span>
  )
}
