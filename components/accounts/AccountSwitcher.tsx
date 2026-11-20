'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'
import './accounts.css'
import { accountLabel, type AccountPlatform } from '@/lib/accounts/rules'

export interface SwitcherAccount {
  id: string
  platform: AccountPlatform
  username: string
}

export default function AccountSwitcher({ accounts, activeId }: { accounts: SwitcherAccount[]; activeId: string | null }) {
  const router = useRouter()
  const id = useId()
  const [value, setValue] = useState(activeId ?? accounts[0]?.id ?? '')
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (activeId) setValue(activeId)
  }, [activeId])
  if (accounts.length < 2) return null

  async function pick(next: string) {
    const previous = value
    setValue(next)
    setFailed(false)
    try {
      const res = await fetch('/api/accounts/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      startTransition(() => router.refresh())
    } catch {
      setValue(previous)
      setFailed(true)
    }
  }

  return (
    <div className="account-switcher" data-pending={pending || undefined}>
      <label htmlFor={id} className="account-switcher-label">
        Account
      </label>
      <select id={id} value={value} onChange={(e) => pick(e.target.value)} aria-busy={pending || undefined}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {accountLabel(a)}
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className="account-switcher-error">
          Couldn’t switch. Try again.
        </p>
      )}
    </div>
  )
}
