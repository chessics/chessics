'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerLookup from './PlayerLookup'
import '@/components/layout/settings.css'

export default function PlayerLookupButton() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLInputElement>('input[type="text"]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, mounted])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const closed = () => setOpen(false)
    const cancelled = (e: Event) => {
      e.preventDefault()
      setOpen(false)
    }
    dialog.addEventListener('close', closed)
    dialog.addEventListener('cancel', cancelled)
    return () => {
      dialog.removeEventListener('close', closed)
      dialog.removeEventListener('cancel', cancelled)
    }
  }, [mounted])

  return (
    <>
      <button type="button" className="editorial-secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Search size={14} aria-hidden />
        Look up a player
      </button>
      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="settings-dialog lookup-dialog"
            aria-labelledby="lookup-heading"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
          >
            {open && (
              <div className="settings-frame">
                <header className="settings-header">
                  <h2 id="lookup-heading">Look up a player</h2>
                  <button
                    type="button"
                    className="settings-close"
                    onClick={() => setOpen(false)}
                    aria-label="Close player lookup"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </header>
                <div className="lookup-dialog-body">
                  <PlayerLookup bare />
                </div>
              </div>
            )}
          </dialog>,
          document.body
        )}
    </>
  )
}
