import { clsx } from 'clsx'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export default function Button({ variant = 'gold', size = 'md', className, children, ...props }: ButtonProps) {
  const base = 'rounded-lg font-medium transition-opacity disabled:opacity-40 cursor-pointer'

  const variants = {
    gold: 'text-[#1a1512]',
    ghost: 'border',
    danger: '',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  const styles: Record<string, React.CSSProperties> = {
    gold: { background: 'var(--gold)', color: '#1a1512' },
    ghost: { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border-strong)' },
    danger: { background: 'var(--blunder)', color: '#fff' },
  }

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      style={styles[variant]}
      {...props}
    >
      {children}
    </button>
  )
}
