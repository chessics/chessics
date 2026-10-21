import { SOCIAL_CARD_ALT, SOCIAL_CARD_SIZE, socialCard } from '@/components/layout/social-card'

export const alt = SOCIAL_CARD_ALT
export const size = SOCIAL_CARD_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return socialCard()
}
