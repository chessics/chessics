import { SOCIAL_CARD_SIZE } from '@/components/layout/social-card'
import { SHARE_CARD_ALT, shareCard } from '@/components/share/share-card'
import { loadShareForPage } from '@/lib/share/page-load'

export const alt = SHARE_CARD_ALT
export const size = SOCIAL_CARD_SIZE
export const contentType = 'image/png'
export const dynamic = 'force-dynamic'

export default async function ShareOpenGraphImage({ params }: { params: { id: string } }) {
  const r = await loadShareForPage(params.id)
  if (r.kind !== 'found') return new Response('Not found', { status: r.kind === 'error' ? 500 : 404 })
  return shareCard(r.value)
}
