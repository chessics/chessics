'use client'

import { Bell, Crosshair, LayoutGrid, Palette, Search, Shield, User, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import LinkedAccountsPanel from '@/components/accounts/LinkedAccountsPanel'
import './settings.css'

type Row = {
  label: string
  hint?: string
  control: 'field' | 'select' | 'toggle' | 'button'
  value: string
}
type Section = {
  id: string
  label: string
  icon: LucideIcon
  heading: string
  rows: Row[]
}

const SECTIONS: Section[] = [
  {
    id: 'account',
    label: 'Account',
    icon: User,
    heading: 'Account',
    rows: [
      { label: 'Email', control: 'field', value: 'Not shown yet' },
      {
        label: 'Chess.com username',
        hint: 'Where your games are imported from.',
        control: 'field',
        value: 'Not set',
      },
      { label: 'Lichess username', control: 'field', value: 'Not set' },
      {
        label: 'Sign out of all devices',
        control: 'button',
        value: 'Sign out everywhere',
      },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    heading: 'Appearance',
    rows: [
      {
        label: 'Theme',
        hint: 'Use the switch in the top bar for now.',
        control: 'select',
        value: 'System',
      },
      { label: 'Text size', control: 'select', value: 'Default' },
    ],
  },
  {
    id: 'board',
    label: 'Board',
    icon: LayoutGrid,
    heading: 'Board',
    rows: [
      { label: 'Board style', control: 'select', value: 'Wood' },
      { label: 'Piece set', control: 'select', value: 'Classic' },
      {
        label: 'Coordinates',
        hint: 'Letters and numbers along the edge of the board.',
        control: 'toggle',
        value: 'On',
      },
      { label: 'Move sounds', control: 'toggle', value: 'Off' },
    ],
  },
  {
    id: 'training',
    label: 'Training',
    icon: Crosshair,
    heading: 'Training',
    rows: [
      {
        label: 'Replay speed',
        hint: 'How fast your game line plays after a miss.',
        control: 'select',
        value: 'Normal',
      },
      {
        label: 'Show the opponent’s last move',
        control: 'toggle',
        value: 'On',
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    heading: 'Notifications',
    rows: [
      {
        label: 'Weekly report by email',
        hint: 'One email on Mondays.',
        control: 'toggle',
        value: 'Off',
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Shield,
    heading: 'Privacy',
    rows: [
      {
        label: 'Download my data',
        hint: 'Your games, analyses and answers.',
        control: 'button',
        value: 'Download',
      },
      {
        label: 'Delete my account',
        control: 'button',
        value: 'Delete account',
      },
    ],
  },
]

const LINKED_ACCOUNT_ROWS = new Set(['Chess.com username', 'Lichess username'])

export default function SettingsDialog({
  open,
  onClose,
  linkedAccounts = false,
}: {
  open: boolean
  onClose: () => void
  linkedAccounts?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [active, setActive] = useState(SECTIONS[0].id)
  const [query, setQuery] = useState('')
  const headingId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const closed = () => onCloseRef.current()
    const cancelled = (e: Event) => {
      e.preventDefault()
      onCloseRef.current()
    }
    dialog.addEventListener('close', closed)
    dialog.addEventListener('cancel', cancelled)
    return () => {
      dialog.removeEventListener('close', closed)
      dialog.removeEventListener('cancel', cancelled)
    }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTIONS
    return SECTIONS.filter(
      (s) => s.label.toLowerCase().includes(q) || s.rows.some((r) => r.label.toLowerCase().includes(q)),
    )
  }, [query])

  const section = shown.find((s) => s.id === active) ?? shown[0] ?? SECTIONS[0]

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="settings-frame">
          <header className="settings-header">
            <h2 id={headingId}>Settings</h2>
            <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
              <X size={18} aria-hidden />
            </button>
          </header>

          <div className="settings-body">
            <nav className="settings-nav" aria-label="Settings sections">
              <label className="settings-search">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  placeholder="Search"
                  aria-label="Search settings"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <ul>
                {shown.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      aria-current={id === section.id ? 'true' : undefined}
                      onClick={() => setActive(id)}
                    >
                      <Icon size={16} aria-hidden />
                      {label}
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="settings-nav-empty">No setting matches.</li>}
              </ul>
            </nav>

            <section className="settings-content" aria-label={section.heading}>
              <h3>{section.heading}</h3>
              {section.id === 'account' && linkedAccounts && <LinkedAccountsPanel />}
              <p className="settings-note">
                {section.id === 'account' && linkedAccounts ? 'The settings below aren’t built yet.' : 'These settings aren’t built yet.'}
              </p>
              <ul className="settings-rows">
                {section.rows
                  .filter((row) => !(section.id === 'account' && linkedAccounts && LINKED_ACCOUNT_ROWS.has(row.label)))
                  .map((row) => (
                  <li key={row.label} className="settings-row">
                    <div>
                      <p className="settings-row-label">{row.label}</p>
                      {row.hint && <p className="settings-row-hint">{row.hint}</p>}
                    </div>
                    <Control row={row} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}

function Control({ row }: { row: Row }) {
  const title = 'Coming soon'
  if (row.control === 'button') {
    return (
      <button type="button" className="settings-button" disabled title={title}>
        {row.value}
      </button>
    )
  }
  if (row.control === 'toggle') {
    const on = row.value === 'On'
    return (
      <span className="settings-toggle" data-on={on} aria-disabled="true" title={title}>
        <span aria-hidden />
        <span className="sr-only">
          {row.label}: {row.value}, coming soon
        </span>
      </span>
    )
  }
  return (
    <span className="settings-field" data-kind={row.control} aria-disabled="true" title={title}>
      {row.value}
      {row.control === 'select' && <span aria-hidden className="settings-caret" />}
    </span>
  )
}
