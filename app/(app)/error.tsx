'use client'

import StatusPage, { PRIMARY_CLASS, StartPageLink, errorReference, primaryStyle } from '@/components/layout/StatusPage'

export default function AppErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      frame="inset"
      headline="Something went wrong"
      sentence="This page could not be shown just now."
      reference={errorReference(error.digest)}
    >
      <button type="button" onClick={reset} className={PRIMARY_CLASS} style={primaryStyle}>
        Try again
      </button>
      <StartPageLink />
    </StatusPage>
  )
}
