import { ImageResponse } from 'next/og'
import { SOCIAL_CARD_SIZE } from '@/lib/public-page-metadata'
import { boardCardElement } from '@/components/share/share-card'
import type { EvidenceBoard } from '@/lib/diagnosis/finding'
import data from './example-report.json'

export const size = SOCIAL_CARD_SIZE
export const contentType = 'image/png'

export default function ExampleImage() {
  const board = data.findings[0].boards[0] as EvidenceBoard
  return new ImageResponse(boardCardElement({
    ...board,
    headline: data.verdict,
    headlineSize: 44,
  }), size)
}
