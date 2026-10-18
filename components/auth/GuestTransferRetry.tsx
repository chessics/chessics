'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { transferGuestSession, type TransferOutcome } from '@/lib/auth/transfer'

export const RETRY_LINE =
  "Your guest analysis hasn't moved to your account yet. It will try again next time you open this page."

export async function retryGuestTransfer({
  signedIn,
  transfer,
  refresh,
}: {
  signedIn: boolean
  transfer: () => Promise<TransferOutcome>
  refresh: () => void
}): Promise<string | null> {
  if (!signedIn) return null
  const outcome = await transfer()
  if (outcome === 'transferred') refresh()
  return outcome === 'failed' || outcome === 'not_ready' ? RETRY_LINE : null
}

export default function GuestTransferRetry({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  const [line, setLine] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void retryGuestTransfer({
      signedIn,
      transfer: () => transferGuestSession(),
      refresh: () => router.refresh(),
    }).then((next) => {
      if (live) setLine(next)
    })
    return () => {
      live = false
    }
  }, [signedIn, router])

  if (!line) return null
  return (
    <p
      role="status"
      className="text-sm py-2"
      style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
    >
      {line}
    </p>
  )
}
