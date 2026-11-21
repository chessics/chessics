'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import OptionPicker from '@/components/ui/OptionPicker'
import { accountLabel, PLATFORM_LABEL, type AccountPlatform } from '@/lib/accounts/rules'
import { landingErrorMessage } from '@/lib/sync/poll'
import { countNoun } from '@/lib/count-noun'
import { analyzeSession, BATCH_CHOICES, type AnalyzeFilter } from '@/lib/sync/analyze-session'
import '@/components/analyze/analyze.css'

export interface AnalyzeAccount {
  id: string
  platform: AccountPlatform
  username: string
}

export default function AnalyzeForm({
  accounts,
  activeId,
  linked,
  waiting,
  calibrationLevel,
  errorCode,
  retryAt,
}: {
  accounts: AnalyzeAccount[]
  activeId: string | null
  linked: boolean
  waiting: Record<string, number>
  calibrationLevel: number
  errorCode: string | null
  retryAt: string | null
}) {
  const router = useRouter()
  const [accountId, setAccountId] = useState(activeId ?? accounts[0]?.id ?? '')
  const [platform, setPlatform] = useState<AccountPlatform>('chess_com')
  const [username, setUsername] = useState('')
  const [size, setSize] = useState<(typeof BATCH_CHOICES)[number]>(25)
  const [filter, setFilter] = useState<AnalyzeFilter>('rapid_blitz')
  const [starting, setStarting] = useState(false)
  const [problem, setProblem] = useState<string | null>(() => landingErrorMessage(errorCode, retryAt))

  const account = accounts.find((a) => a.id === accountId) ?? null
  const noAccount = accounts.length === 0
  const count = account ? waiting[account.id] : undefined

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (starting) return
    const who = account
      ? { username: account.username, platform: account.platform }
      : username.trim()
        ? { username: username.trim(), platform }
        : null
    if (!who) {
      setProblem('Enter your username first.')
      return
    }
    setStarting(true)
    setProblem(null)
    if (linked && account && account.id !== activeId) {
      try {
        const res = await fetch('/api/accounts/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: account.id }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } catch {
        setStarting(false)
        setProblem('Couldn’t switch to that account. Try again.')
        return
      }
    }
    try {
      localStorage.setItem(
        'chessics_session',
        JSON.stringify(analyzeSession({ ...who, batchSize: size, timeControlFilter: filter, calibrationLevel }))
      )
    } catch {
      setStarting(false)
      setProblem('Allow browser storage to start your analysis.')
      return
    }
    router.push('/analyzing')
  }

  return (
    <form className="analyze-form" onSubmit={start}>
      <fieldset className="analyze-field">
        <legend>Account</legend>
        {noAccount ? (
          <div className="analyze-new-account">
            <div role="group" aria-label="Site" className="analyze-segments">
              {(['chess_com', 'lichess'] as const).map((p) => (
                <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}>
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
            <input
              type="text"
              aria-label={`${PLATFORM_LABEL[platform]} username`}
              placeholder="Username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="analyze-input"
            />
          </div>
        ) : accounts.length === 1 ? (
          <p className="analyze-account">{accountLabel(accounts[0])}</p>
        ) : (
          <OptionPicker
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))}
          />
        )}
        {account && count !== undefined && (
          <p className="analyze-hint">
            {count > 0
              ? `${countNoun(count, 'game')} in your library ${count === 1 ? 'isn’t' : 'aren’t'} analyzed yet. Your newest games are fetched first.`
              : 'Every game in your library is analyzed. Your newest games are fetched first.'}
          </p>
        )}
        {linked && (
          <p className="analyze-hint">
            Add another account in <span className="analyze-strong">Settings → Account</span>.
          </p>
        )}
      </fieldset>

      <fieldset className="analyze-field">
        <legend>How many games</legend>
        <div role="group" aria-label="How many games" className="analyze-segments">
          {BATCH_CHOICES.map((n) => (
            <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="analyze-hint">More games make a habit easier to confirm. 100 games take a few minutes.</p>
      </fieldset>

      <fieldset className="analyze-field">
        <legend>Which games</legend>
        <div role="group" aria-label="Which games" className="analyze-segments">
          <button type="button" aria-pressed={filter === 'rapid_blitz'} onClick={() => setFilter('rapid_blitz')}>
            Rapid and blitz
          </button>
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All games
          </button>
        </div>
        {filter === 'rapid_blitz' && <p className="analyze-hint">Bullet and daily games are left out.</p>}
      </fieldset>

      {problem && (
        <p role="alert" className="analyze-problem">
          {problem}
        </p>
      )}

      <div className="analyze-submit">
        <button type="submit" className="editorial-action" disabled={starting}>
          {starting ? 'Starting…' : `Analyze ${size} games`}
        </button>
        <Link href="/games" className="analyze-secondary">
          Or pick one game from your library
        </Link>
      </div>
    </form>
  )
}
