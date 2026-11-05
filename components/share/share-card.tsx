import { ImageResponse } from 'next/og'
import { SOCIAL_CARD_SIZE } from '@/components/layout/social-card'
import { PIECE_IMAGES, type PieceCode } from '@/lib/share/pieces'
import { SHARE_HEADLINE, sideToMoveText } from '@/lib/share/words'
import type { PublicShare } from '@/lib/share/payload'

const ESPRESSO = '#1a1512'
const CREAM = '#e8e0d0'
const MUTED = '#a2977f'
const BRASS = '#c9a55c'
const DARK = '#7a4f28'
const LIGHT = '#dfba85'
const MISTAKE = '#d6344f'

export const SHARE_CARD_BOARD = 520
const SQ = SHARE_CARD_BOARD / 8
const PAD_LEFT = 55
const PAD_RIGHT = 72
const GAP = 64
export const SHARE_CARD_TEXT_WIDTH = SOCIAL_CARD_SIZE.width - PAD_LEFT - SHARE_CARD_BOARD - GAP - PAD_RIGHT
const FILES = 'abcdefgh'

export function boardSquares(fen: string, orientation: 'white' | 'black'): { square: string; dark: boolean; piece: PieceCode | null }[] {
  const ranks = fen.split(' ')[0].split('/')
  const grid: (PieceCode | null)[][] = ranks.map(r => {
    const row: (PieceCode | null)[] = []
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) row.push(null)
      else row.push(`${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toLowerCase()}` as PieceCode)
    }
    return row
  })
  const out: { square: string; dark: boolean; piece: PieceCode | null }[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rank = orientation === 'white' ? r : 7 - r
      const file = orientation === 'white' ? f : 7 - f
      const square = `${FILES[file]}${8 - rank}`
      out.push({ square, dark: (file + (8 - rank)) % 2 === 1, piece: grid[rank]?.[file] ?? null })
    }
  }
  return out
}

export function squareCentre(square: string, orientation: 'white' | 'black'): { x: number; y: number } {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1])
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 8 - rank : rank - 1
  return { x: (col + 0.5) * SQ, y: (row + 0.5) * SQ }
}

export function arrowPolygon(from: string, to: string, orientation: 'white' | 'black'): string {
  const s = squareCentre(from, orientation)
  const e = squareCentre(to, orientation)
  const len = Math.hypot(e.x - s.x, e.y - s.y) || 1
  const dx = (e.x - s.x) / len
  const dy = (e.y - s.y) / len
  const px = -dy
  const py = dx
  const head = SQ * 0.5
  const half = SQ * 0.32
  const shaft = SQ * 0.11
  const bx = e.x - dx * head
  const by = e.y - dy * head
  const pts = [
    [s.x + px * shaft, s.y + py * shaft],
    [bx + px * shaft, by + py * shaft],
    [bx + px * half, by + py * half],
    [e.x, e.y],
    [bx - px * half, by - py * half],
    [bx - px * shaft, by - py * shaft],
    [s.x - px * shaft, s.y - py * shaft],
  ]
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export function shareCardElement(share: PublicShare) {
  const squares = boardSquares(share.fen, share.side_to_move)
  const from = share.game_move_uci.slice(0, 2)
  const to = share.game_move_uci.slice(2, 4)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: `55px ${PAD_RIGHT}px 55px ${PAD_LEFT}px`,
        background: ESPRESSO,
        backgroundImage: 'radial-gradient(ellipse 120% 90% at 50% 20%, rgba(26,21,18,0) 55%, rgba(10,7,5,0.5) 100%)',
        color: CREAM,
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width: SHARE_CARD_BOARD, height: SHARE_CARD_BOARD, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: SHARE_CARD_BOARD, height: SHARE_CARD_BOARD }}>
          {squares.map(sq => (
            <div
              key={sq.square}
              style={{ width: SQ, height: SQ, display: 'flex', background: sq.dark ? DARK : LIGHT }}
            >
              {sq.piece && (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img src={PIECE_IMAGES[sq.piece]} width={SQ} height={SQ} />
              )}
            </div>
          ))}
        </div>
        <svg
          width={SHARE_CARD_BOARD}
          height={SHARE_CARD_BOARD}
          viewBox={`0 0 ${SHARE_CARD_BOARD} ${SHARE_CARD_BOARD}`}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <polygon points={arrowPolygon(from, to, share.side_to_move)} fill={MISTAKE} fillOpacity={0.9} />
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: SHARE_CARD_BOARD,
          width: SHARE_CARD_TEXT_WIDTH,
          marginLeft: GAP,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginBottom: 20 }}>{sideToMoveText(share.side_to_move)}</div>
          <div style={{ display: 'flex', width: SHARE_CARD_TEXT_WIDTH, fontSize: 64, lineHeight: 1.12, letterSpacing: -1, color: CREAM }}>
            {SHARE_HEADLINE}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: SHARE_CARD_TEXT_WIDTH, height: 2, marginBottom: 24, background: 'rgba(201,165,92,0.45)' }} />
          <div style={{ display: 'flex', fontSize: 36, lineHeight: 1 }}>
            <span style={{ color: CREAM }}>chess</span>
            <span style={{ color: BRASS }}>ics</span>
            <span style={{ color: MUTED }}>.com</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SHARE_CARD_ALT = SHARE_HEADLINE

export function shareCard(share: PublicShare) {
  return new ImageResponse(shareCardElement(share), {
    ...SOCIAL_CARD_SIZE,
    headers: { 'cache-control': 'public, max-age=3600, s-maxage=3600' },
  })
}
