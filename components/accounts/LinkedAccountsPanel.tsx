'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { countNoun } from '@/lib/count-noun'
import { linkErrorMessage, linkedMessage } from '@/lib/accounts/messages'
import { PLATFORM_LABEL, type AccountPlatform } from '@/lib/accounts/rules'
import './accounts.css'
import { CHESS_USERNAME_FIELD, chessUsernameText } from '@/lib/forms/chess-username-field'

interface Row {
  id: string
  platform: AccountPlatform
  username: string
  games: number
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; accounts: Row[]; activeId: string | null; max: number }

export default function LinkedAccountsPanel() {
  const router = useRouter()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [platform, setPlatform] = useState<AccountPlatform>('chess_com')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { accounts: Row[]; activeId: string | null; max: number }
      setLoad({ kind: 'ready', ...body })
    } catch {
      setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name || busy) return
    setBusy('add')
    setMessage(null)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username: name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', text: linkErrorMessage(body.error, PLATFORM_LABEL[platform]) })
        return
      }
      setMessage({
        tone: 'ok',
        text: linkedMessage({ username: body.account.username, created: body.created, claimed: body.claimed, imported: body.imported }),
      })
      setUsername('')
      await refresh()
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: linkErrorMessage(undefined, PLATFORM_LABEL[platform]) })
    } finally {
      setBusy(null)
    }
  }

  async function show(id: string) {
    setBusy(id)
    setMessage(null)
    try {
      const res = await fetch('/api/accounts/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      await refresh()
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'Couldn’t switch accounts. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function remove(row: Row) {
    setBusy(row.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/accounts/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setConfirming(null)
      setMessage({ tone: 'ok', text: `Removed ${row.username}. Its games are kept and come back if you add it again.` })
      await refresh()
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: `${row.username} wasn’t removed. Try again.` })
    } finally {
      setBusy(null)
    }
  }

  const full = load.kind === 'ready' && load.accounts.length >= load.max

  return (
    <div className="linked-accounts">
      <p className="settings-row-label">Chess accounts</p>
      <p className="settings-row-hint">
        Each account keeps its own games, reports and training. Choose which one you see with Show, or from the list above your game library.
      </p>

      {load.kind === 'loading' && <p className="linked-accounts-status">Loading your accounts…</p>}
      {load.kind === 'failed' && (
        <p className="linked-accounts-status">
          Your accounts didn’t load.{' '}
          <button type="button" className="linked-accounts-link" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}

      {load.kind === 'ready' && load.accounts.length === 0 && (
        <p className="linked-accounts-status">No account linked yet. Add your chess.com or lichess name below.</p>
      )}

      {load.kind === 'ready' && load.accounts.length > 0 && (
        <ul className="linked-accounts-list">
          {load.accounts.map((row) => {
            const active = row.id === load.activeId
            return (
              <li key={row.id} className="linked-account" data-active={active || undefined}>
                <div className="linked-account-name">
                  <span className="linked-account-username">{row.username}</span>
                  <span className="linked-account-meta">
                    {PLATFORM_LABEL[row.platform]} · {countNoun(row.games, 'game')}
                    {active && ' · Shown now'}
                  </span>
                </div>
                {confirming === row.id ? (
                  <div className="linked-account-actions" role="group" aria-label={`Remove ${row.username}?`}>
                    <span className="linked-account-confirm">Remove {row.username}? Its games are kept.</span>
                    <button type="button" className="settings-action" data-tone="danger" disabled={busy !== null} onClick={() => void remove(row)}>
                      Remove
                    </button>
                    <button type="button" className="settings-action" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="linked-account-actions">
                    {!active && (
                      <button type="button" className="settings-action" disabled={busy !== null} onClick={() => void show(row.id)}>
                        Show
                      </button>
                    )}
                    <button
                      type="button"
                      className="settings-action"
                      disabled={busy !== null}
                      onClick={() => setConfirming(row.id)}
                      aria-label={`Remove ${row.username}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {load.kind === 'ready' && (
        <form className="linked-accounts-add" onSubmit={add}>
          <div className="linked-accounts-platforms" role="group" aria-label="Site">
            {(['chess_com', 'lichess'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                className="settings-action"
                data-pressed={platform === p || undefined}
                onClick={() => {
                  setPlatform(p)
                  inputRef.current?.focus()
                }}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
          <label htmlFor={inputId} className="sr-only">
            {chessUsernameText(`${PLATFORM_LABEL[platform]} username`)}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="linked-accounts-input"
            {...CHESS_USERNAME_FIELD}
            placeholder={chessUsernameText(`${PLATFORM_LABEL[platform]} username`)}
            maxLength={30}
            value={username}
            disabled={full}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="settings-action" data-tone="primary" disabled={full || busy !== null || !username.trim()}>
            {busy === 'add' ? 'Adding…' : 'Add account'}
          </button>
        </form>
      )}
      {full && <p className="linked-accounts-status">You’ve linked {load.kind === 'ready' ? load.max : ''} accounts, the most Chessics allows.</p>}

      <p className="linked-accounts-message" role="status" data-tone={message?.tone}>
        {message?.text ?? ''}
      </p>
    </div>
  )
}
