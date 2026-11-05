'use client'

import { useState } from 'react'
import { deliverLink, shareFailureMessage, shareUrl, type Delivery } from '@/lib/share/deliver'
import { shareCreateUrl, type ShareCreated, type ShareMode } from '@/lib/share/api-types'
import { SHARE_BUTTON_TEXT } from '@/lib/share/words'

type State =
  | { name: 'idle' }
  | { name: 'making' }
  | { name: 'ready'; url: string; delivery: Delivery | null }
  | { name: 'failed'; message: string }

const NOTE: Record<Delivery, string | null> = {
  shared: 'Shared.',
  cancelled: null,
  copied: 'Link copied.',
  manual: 'Copy this link:',
}

export default function ShareButton({ mode, positionId }: { mode: ShareMode; positionId: string }) {
  const [state, setState] = useState<State>({ name: 'idle' })

  const deliver = async (url: string) => {
    const delivery = await deliverLink(url, navigator)
    setState({ name: 'ready', url, delivery })
  }

  const press = async () => {
    if (state.name === 'ready') return deliver(state.url)
    if (state.name === 'making') return
    setState({ name: 'making' })
    try {
      const res = await fetch(shareCreateUrl(mode), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ position_id: positionId }),
      })
      if (!res.ok) {
        const code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
        return setState({ name: 'failed', message: shareFailureMessage(res.status, code) })
      }
      const created = (await res.json()) as ShareCreated
      await deliver(shareUrl(window.location.origin, created.path))
    } catch {
      setState({ name: 'failed', message: shareFailureMessage(0, undefined) })
    }
  }

  const note = state.name === 'ready' ? (state.delivery ? NOTE[state.delivery] : null) : state.name === 'failed' ? state.message : null

  return (
    <span className="share-button" data-testid="share-position">
      <button className="training-btn training-btn-quiet" onClick={press} disabled={state.name === 'making'}>
        {state.name === 'making' ? 'Making the link' : SHARE_BUTTON_TEXT}
      </button>
      <span className="share-button-note" aria-live="polite">
        {note}
      </span>
      {state.name === 'ready' && state.delivery === 'manual' && (
        <input
          className="share-button-url"
          readOnly
          value={state.url}
          aria-label="Share link"
          onFocus={e => e.currentTarget.select()}
        />
      )}
    </span>
  )
}
