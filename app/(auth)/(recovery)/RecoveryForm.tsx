'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { requestPasswordReset, setNewPassword } from './actions'

function Submit({ saving }: { saving: boolean }) {
  const { pending } = useFormStatus()
  const label = saving ? 'Save password' : 'Send reset link'
  return (
    <button type="submit" disabled={pending} className="w-full py-3 text-sm font-medium bg-gold text-bg disabled:opacity-60">
      {pending ? (saving ? 'Saving…' : 'Sending…') : label}
    </button>
  )
}

export default function RecoveryForm({ account, invalidLink }: { account?: string; invalidLink?: boolean }) {
  const saving = account !== undefined
  const [state, action] = useFormState(saving ? setNewPassword.bind(null, account) : requestPasswordReset, null)

  return (
    <>
      {state && 'sent' in state ? (
        <p role="status" className="text-sm text-text">
          If an account uses that address, a reset link is on its way. Open it in this browser.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {invalidLink && !state && (
            <p role="alert" className="text-sm">This reset link is no longer usable. Request a new one and open it in this browser.</p>
          )}
          <label className="flex flex-col gap-2 text-sm">
            {saving ? 'New password' : 'Email'}
            <input
              type={saving ? 'password' : 'email'}
              name={saving ? 'password' : 'email'}
              autoComplete={saving ? 'new-password' : 'email'}
              minLength={saving ? 6 : undefined}
              required
              className="w-full px-4 py-3 bg-surface text-text border border-[var(--border-strong)]"
            />
          </label>
          {state && 'error' in state && <p role="alert" className="text-sm">{state.error}</p>}
          <Submit saving={saving} />
        </form>
      )}
      <Link href={saving ? '/workbench' : '/login'} className="self-start text-sm text-gold underline">
        {saving ? 'Go to the workbench' : 'Back to sign in'}
      </Link>
    </>
  )
}
