'use client'

import { Settings } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

const PLACEHOLDERS = [
  { label: 'Board style', note: 'Coming soon' },
  { label: 'Piece set', note: 'Coming soon' },
  { label: 'Move sounds', note: 'Coming soon' },
  { label: 'Chess.com and Lichess names', note: 'Coming soon' },
]

export default function SettingsMenu({ variant = 'icon' }: { variant?: 'icon' | 'sidebar' }) {
  const inSidebar = variant === 'sidebar'
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={inSidebar ? undefined : 'Settings'}
        aria-expanded={open}
        aria-controls={panelId}
        title={inSidebar ? undefined : 'Settings'}
        className={
          inSidebar
            ? 'inline-flex w-full items-center gap-1.5 px-2 py-2 text-sm transition-colors'
            : 'flex items-center justify-center'
        }
        style={{
          ...(inSidebar ? {} : { width: 30, height: 30, border: '1px solid var(--border)' }),
          color: open ? 'var(--text)' : 'var(--text-muted)',
          background: open ? 'rgb(var(--accent-rgb) / 0.1)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <Settings size={inSidebar ? 16 : 14} aria-hidden />
        {inSidebar && 'Settings'}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Settings"
          style={{
            position: 'absolute',
            ...(inSidebar
              ? { left: 0, bottom: 'calc(100% + 8px)' }
              : { right: 0, top: 'calc(100% + 8px)' }),
            width: 'min(280px, calc(100vw - 32px))',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            zIndex: 60,
          }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text)', fontWeight: 500 }}>
              Settings
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Nothing to change here yet.
            </p>
          </div>
          <ul>
            {PLACEHOLDERS.map(({ label, note }, i) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                style={{
                  color: 'var(--text-muted)',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span>{label}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
