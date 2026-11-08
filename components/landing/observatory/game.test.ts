import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { IDLE_SQUARES, SAN, plies, startingPieces } from './game'

describe('Opera Game replay', () => {
  it('is legal and ends in checkmate', () => {
    const chess = new Chess()
    for (const san of SAN) chess.move(san)
    expect(chess.isCheckmate()).toBe(true)
  })

  it('backs its lesson: the f8 bishop and h8 rook are still on their home squares', () => {
    const chess = new Chess()
    for (const san of SAN) chess.move(san)
    expect(IDLE_SQUARES.map(sq => chess.get(sq as 'f8'))).toEqual([{ type: 'b', color: 'b' }, { type: 'r', color: 'b' }])
    expect(plies().some(p => IDLE_SQUARES.includes(p.from))).toBe(false)
  })

  it('describes captures and castling for the animation', () => {
    const list = plies()
    expect(list).toHaveLength(33)
    expect(list[6]).toMatchObject({ san: 'dxe5', capture: 'e5' })
    expect(list[22]).toMatchObject({ san: 'O-O-O', from: 'e1', to: 'c1', rook: { from: 'a1', to: 'd1' } })
    expect(startingPieces()).toHaveLength(32)
  })
})
