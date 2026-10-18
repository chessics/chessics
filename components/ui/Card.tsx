import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated'
}

export default function Card({ variant = 'default', className, children, style, ...props }: CardProps) {
  const bg = variant === 'elevated' ? 'var(--surface-2)' : 'var(--surface)'

  return (
    <div
      className={className}
      style={{
        background: bg,
        border: '1px solid var(--border)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
