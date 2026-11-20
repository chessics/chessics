'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { THEME_STORAGE_KEY, currentTheme, otherTheme, type Theme } from '@/lib/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const read = () => setTheme(currentTheme(document.documentElement, media.matches))
    read()
    media.addEventListener('change', read)
    return () => media.removeEventListener('change', read)
  }, [])

  if (!theme) return <span aria-hidden style={{ width: 30, height: 30 }} />

  const next = otherTheme(theme)
  const choose = () => {
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
    }
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={choose}
      aria-label={next === 'light' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={next === 'light' ? 'Light mode' : 'Dark mode'}
      className="flex items-center justify-center"
      style={{
        width: 30,
        height: 30,
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {next === 'light' ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
    </button>
  )
}
