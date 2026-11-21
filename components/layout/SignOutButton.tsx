'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/auth/signout', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      router.push('/')
      router.refresh()
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <div className="settings-action">
      <button type="button" className="settings-button settings-button-live" onClick={signOut} disabled={busy}>
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {failed && <p role="alert" className="settings-row-hint">Couldn’t sign out. Try again.</p>}
    </div>
  )
}
