import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SharePage from '@/components/share/SharePage'
import { loadShareForPage } from '@/lib/share/page-load'
import { SHARE_HEADLINE, sideToMoveText } from '@/lib/share/words'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await loadShareForPage(params.id)
  if (r.kind !== 'found') return {}
  const description = `${sideToMoveText(r.value.side_to_move)}. Find the move that held.`
  return {
    title: SHARE_HEADLINE,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: SHARE_HEADLINE, description },
    twitter: { card: 'summary_large_image', title: SHARE_HEADLINE, description },
  }
}

export default async function SharedPositionPage({ params }: Props) {
  const r = await loadShareForPage(params.id)
  if (r.kind === 'missing') notFound()
  if (r.kind === 'error') throw new Error('shared position lookup failed')
  return <SharePage share={r.value} mode="live" />
}
