'use client'

import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import SettingsDialog from './SettingsDialog'

export default function SettingsMenu({
  variant = 'icon',
  linkedAccounts = false,
  signedIn = false,
}: {
  variant?: 'icon' | 'sidebar'
  linkedAccounts?: boolean
  signedIn?: boolean
}) {
  const inSidebar = variant === 'sidebar'
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={inSidebar ? undefined : 'Settings'}
        aria-haspopup="dialog"
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
      {mounted && createPortal(<SettingsDialog open={open} onClose={() => setOpen(false)} linkedAccounts={linkedAccounts} signedIn={signedIn} />, document.body)}
    </>
  )
}
