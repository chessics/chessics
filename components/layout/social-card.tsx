import { ImageResponse } from 'next/og'
import { SITE_TAGLINE } from '@/lib/site'
import { SOCIAL_CARD_SIZE } from '@/lib/public-page-metadata'
export { SOCIAL_CARD_ALT, SOCIAL_CARD_SIZE } from '@/lib/public-page-metadata'

const ESPRESSO = '#1b1a17'
const CREAM = '#ead9a8'
const MUTED = '#ad9f7b'
const BRASS = '#c9a55c'
const OXBLOOD = '#c0455a'
const UMBER = '#3a3125'

const MOTIF = [BRASS, UMBER, UMBER, OXBLOOD]
const SQUARE = 44

export function socialCardElement() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '80px 96px',
        background: ESPRESSO,
        backgroundImage: 'radial-gradient(ellipse 120% 90% at 50% 20%, rgba(27,26,23,0) 55%, rgba(0,0,0,0.45) 100%)',
        color: CREAM,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', width: SQUARE * 2, height: SQUARE * 2 }}>
        {MOTIF.map((colour, i) => (
          <div key={i} style={{ width: SQUARE, height: SQUARE, background: colour }} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 136, lineHeight: 1, letterSpacing: -4 }}>
          <span style={{ color: CREAM }}>chess</span>
          <span style={{ color: BRASS }}>ics</span>
        </div>
        <div style={{ width: 640, height: 2, marginTop: 40, marginBottom: 36, background: 'rgba(234,217,168,0.4)' }} />
        <div style={{ display: 'flex', fontSize: 44, lineHeight: 1.2, color: MUTED }}>{SITE_TAGLINE}</div>
      </div>
    </div>
  )
}

export function socialCard() {
  return new ImageResponse(socialCardElement(), { ...SOCIAL_CARD_SIZE })
}
