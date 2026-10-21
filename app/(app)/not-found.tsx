import type { Metadata } from 'next'
import StatusPage, { NOT_FOUND_TITLE, StartPageLink } from '@/components/layout/StatusPage'
import DocumentTitle from '@/components/layout/DocumentTitle'

export const metadata: Metadata = {
  title: NOT_FOUND_TITLE,
}

export default function AppNotFound() {
  return (
    <StatusPage frame="inset" headline={NOT_FOUND_TITLE} sentence="Nothing is at this address.">
      <StartPageLink primary />
      <DocumentTitle title={`${NOT_FOUND_TITLE} · Chessics`} />
    </StatusPage>
  )
}
