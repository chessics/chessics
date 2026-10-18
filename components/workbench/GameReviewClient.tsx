'use client'

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
} from 'react'
import dynamic from 'next/dynamic'
import { Chess } from 'chess.js'
import type { BoardShape } from './ChessBoard'
import type {
  Game,
  Move,
  GameAnalysis,
  CausalChain,
  CausalChainNode,
  MoveClassification,
} from '@/lib/supabase/types'

const ChessBoard = dynamic(() => import('./ChessBoard'), { ssr: false })

const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const CLASS_COLOR: Record<MoveClassification, string> = {
  blunder: 'var(--blunder)',
  mistake: 'var(--mistake)',
  inaccuracy: 'var(--inaccuracy)',
  good: 'var(--good)',
  excellent: 'var(--good)',
  brilliant: 'var(--brilliant)',
}

const CLASS_SYMBOL: Record<MoveClassification, string> = {
  blunder: '??',
  mistake: '?',
  inaccuracy: '?!',
  good: '!',
  excellent: '!!',
  brilliant: '★',
}

function getMoveSquares(
  fen: string,
  san: string
): { from: string; to: string } | null {
  try {
    const chess = new Chess(fen)
    const mv = chess.move(san)
    return mv ? { from: mv.from, to: mv.to } : null
  } catch {
    return null
  }
}

function evalToWhitePercent(cp: number | null): number {
  if (cp === null) return 50
  const clamped = Math.max(-1500, Math.min(1500, cp))
  return ((Math.tanh(clamped / 500) + 1) / 2) * 100
}

function evalToLabel(cp: number | null): string {
  if (cp === null) return '—'
  if (Math.abs(cp) >= 900) return cp > 0 ? '+M' : '−M'
  const p = cp / 100
  return p > 0 ? `+${p.toFixed(1)}` : p.toFixed(1)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export type ChainWithNodes = CausalChain & { nodes: CausalChainNode[] }

interface FullChainNode {
  ply: number
  san: string
  explanation: string
  kind: 'root' | 'mid' | 'terminal'
}

function buildChainNodes(chain: ChainWithNodes): FullChainNode[] {
  return [
    {
      ply: chain.root_move_ply,
      san: chain.root_move_san,
      explanation: chain.root_move_explanation,
      kind: 'root',
    },
    ...chain.nodes.map((n) => ({
      ply: n.move_ply,
      san: n.move_san,
      explanation: n.explanation,
      kind: 'mid' as const,
    })),
    {
      ply: chain.terminal_blunder_ply,
      san: chain.terminal_blunder_san,
      explanation: chain.terminal_blunder_explanation,
      kind: 'terminal',
    },
  ]
}

interface EvalBarProps {
  cp: number | null
  height: number
  flipped: boolean
}

function EvalBar({ cp, height, flipped }: EvalBarProps) {
  const whitePercent = evalToWhitePercent(cp)
  const label = evalToLabel(cp)

  return (
    <div
      style={{
        width: 12,
        height,
        flexShrink: 0,
        position: 'relative',
        background: '#1a1512',
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          [flipped ? 'top' : 'bottom']: 0,
          left: 0,
          right: 0,
          height: `${whitePercent}%`,
          background: 'var(--text)',
          transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          bottom: flipped ? 'auto' : 4,
          top: flipped ? 4 : 'auto',
          left: '50%',
          transform: 'translateX(-50%) rotate(-90deg)',
          fontSize: 8,
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--text-dim)',
          whiteSpace: 'nowrap',
          letterSpacing: 0,
        }}
        title={label}
      />
    </div>
  )
}

interface MoveCellProps {
  move: Move
  isActive: boolean
  onClick: () => void
}

const MoveCell = forwardRef<HTMLButtonElement, MoveCellProps>(
  ({ move, isActive, onClick }, ref) => {
    const cls = move.classification
    const color = cls ? CLASS_COLOR[cls] : undefined
    const sym = cls ? CLASS_SYMBOL[cls] : undefined

    return (
      <button
        ref={ref}
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '4px 8px',
          background: isActive
            ? 'rgba(201,165,92,0.18)'
            : 'transparent',
          border: 'none',
          borderRadius: 3,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          if (!isActive)
            e.currentTarget.style.background = 'rgba(201,165,92,0.08)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
        }}
      >
        {color && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: isActive ? 'var(--gold)' : 'var(--text)',
            fontWeight: isActive ? 500 : 400,
            letterSpacing: -0.3,
          }}
        >
          {move.san}
        </span>
        {sym && cls && (cls === 'blunder' || cls === 'mistake') && (
          <span style={{ fontSize: 9, color, lineHeight: 1, marginLeft: 1 }}>
            {sym}
          </span>
        )}
      </button>
    )
  }
)
MoveCell.displayName = 'MoveCell'

interface Props {
  game: Game
  moves: Move[]
  analysis: GameAnalysis | null
  causalChains: ChainWithNodes[]
  initialChainRootPly?: number | null
}

export default function GameReviewClient({
  game,
  moves,
  analysis,
  causalChains,
  initialChainRootPly = null,
}: Props) {
  const [currentPly, setCurrentPly] = useState(0)
  const [activeChainId, setActiveChainId] = useState<string | null>(null)
  const [boardShapes, setBoardShapes] = useState<BoardShape[]>([])

  const totalPlies = moves.length
  const orientation = game.user_color ?? 'white'
  const isFlipped = orientation === 'black'

  const currentFen = useMemo(() => {
    if (currentPly === 0) return moves[0]?.fen_before ?? STARTING_FEN
    return moves[currentPly - 1]?.fen_after ?? STARTING_FEN
  }, [currentPly, moves])

  const currentEval = useMemo(() => {
    if (currentPly === 0) return moves[0]?.eval_before ?? null
    return moves[currentPly - 1]?.eval_after ?? null
  }, [currentPly, moves])

  const lastMoveSquares = useMemo((): [string, string] | null => {
    if (currentPly === 0 || !moves[currentPly - 1]) return null
    const m = moves[currentPly - 1]
    const sq = getMoveSquares(m.fen_before, m.san)
    return sq ? [sq.from, sq.to] : null
  }, [currentPly, moves])

  const goTo = useCallback(
    (ply: number) => {
      setCurrentPly(Math.max(0, Math.min(ply, totalPlies)))
      setActiveChainId(null)
      setBoardShapes([])
    },
    [totalPlies]
  )

  const goForward = useCallback(() => goTo(currentPly + 1), [currentPly, goTo])
  const goBackward = useCallback(
    () => goTo(currentPly - 1),
    [currentPly, goTo]
  )
  const goToStart = useCallback(() => goTo(0), [goTo])
  const goToEnd = useCallback(() => goTo(totalPlies), [goTo, totalPlies])

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goBackward()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [goForward, goBackward])

  const setActiveMoveRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPly]
  )

  useEffect(() => {
    if (initialChainRootPly === null) return
    const chain = causalChains.find((c) => c.root_move_ply === initialChainRootPly)
    if (!chain) return
    setCurrentPly(chain.root_move_ply)
    setActiveChainId(chain.id)
    const moveData = moves.find((m) => m.ply_number === chain.root_move_ply)
    if (moveData) {
      const sq = getMoveSquares(moveData.fen_before, moveData.san)
      if (sq) setBoardShapes([{ orig: sq.to, brush: 'chain_root' }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChainRootPly])

  const handleChainNodeClick = useCallback(
    (ply: number, chainId: string, brush: string) => {
      setCurrentPly(ply)
      setActiveChainId(chainId)
      const moveData = moves.find((m) => m.ply_number === ply)
      if (moveData) {
        const sq = getMoveSquares(moveData.fen_before, moveData.san)
        if (sq) setBoardShapes([{ orig: sq.to, brush }])
      }
    },
    [moves]
  )

  const movePairs = useMemo(() => {
    const pairs: Array<{ num: number; white: Move; black: Move | null }> = []
    let i = 0
    while (i < moves.length) {
      const w = moves[i]
      if (w.ply_number % 2 === 0) {
        pairs.push({ num: Math.ceil(w.ply_number / 2), white: w, black: null })
        i++
      } else {
        pairs.push({
          num: Math.ceil(w.ply_number / 2),
          white: w,
          black: moves[i + 1] ?? null,
        })
        i += 2
      }
    }
    return pairs
  }, [moves])

  const resultLabel =
    game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'
  const resultBg =
    game.result === 'win'
      ? 'rgba(39,174,96,0.12)'
      : game.result === 'loss'
        ? 'rgba(192,57,43,0.12)'
        : 'rgba(154,136,120,0.08)'
  const resultColor =
    game.result === 'win'
      ? 'var(--good)'
      : game.result === 'loss'
        ? 'var(--blunder)'
        : 'var(--text-muted)'

  const boardSize = 480

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        minHeight: 'calc(100vh - 56px - 48px)',
      }}
    >
      <div
        style={{
          width: '60%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingRight: 28,
          borderRight: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <EvalBar cp={currentEval} height={boardSize} flipped={isFlipped} />
          <ChessBoard
            fen={currentFen}
            orientation={orientation}
            lastMove={lastMoveSquares}
            shapes={boardShapes}
            size={boardSize}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 22,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color:
                currentEval === null
                  ? 'var(--text-dim)'
                  : (currentEval ?? 0) >= 0
                    ? 'var(--text)'
                    : 'var(--text-muted)',
              minWidth: 48,
            }}
          >
            {evalToLabel(currentEval)}
          </span>

          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { label: '⏮', fn: goToStart, title: 'Start' },
                { label: '←', fn: goBackward, title: 'Prev (←)' },
                { label: '→', fn: goForward, title: 'Next (→)' },
                { label: '⏭', fn: goToEnd, title: 'End' },
              ] as const
            ).map(({ label, fn, title }) => (
              <button
                key={label}
                onClick={fn}
                title={title}
                style={{
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold)'
                  e.currentTarget.style.color = 'var(--gold)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: 'var(--text-dim)',
              minWidth: 48,
              textAlign: 'right',
            }}
          >
            {currentPly}/{totalPlies}
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 0',
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          {movePairs.length === 0 && (
            <p
              style={{
                padding: '12px 16px',
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              No moves loaded.
            </p>
          )}
          {movePairs.map(({ num, white, black }) => (
            <div
              key={num}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 1fr',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  padding: '0 6px',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textAlign: 'right',
                  lineHeight: '26px',
                }}
              >
                {num}.
              </span>
              <MoveCell
                move={white}
                isActive={currentPly === white.ply_number}
                onClick={() => goTo(white.ply_number)}
                ref={
                  currentPly === white.ply_number ? setActiveMoveRef : undefined
                }
              />
              {black ? (
                <MoveCell
                  move={black}
                  isActive={currentPly === black.ply_number}
                  onClick={() => goTo(black.ply_number)}
                  ref={
                    currentPly === black.ply_number
                      ? setActiveMoveRef
                      : undefined
                  }
                />
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          width: '40%',
          minWidth: 0,
          paddingLeft: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '16px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                  vs {game.opponent_username ?? 'Unknown'}
                </span>
                <span
                  style={{
                    padding: '2px 9px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.04em',

                    background: resultBg,
                    color: resultColor,
                    border: `1px solid ${resultColor}`,
                  }}
                >
                  {resultLabel}
                </span>
              </div>
              <div
                style={{
                  marginTop: 5,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {formatDate(game.played_at)}
                </span>
                {game.time_control && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {game.time_control}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    textTransform: 'capitalize',
                  }}
                >
                  {orientation}
                </span>
              </div>
              {game.opening_name && (
                <p
                  style={{
                    marginTop: 5,
                    fontSize: 12,
                    color: 'var(--text-dim)',
                  }}
                >
                  {game.opening_name}
                </p>
              )}
            </div>

            {analysis?.overall_accuracy !== null &&
              analysis?.overall_accuracy !== undefined && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: 'var(--gold)',
                      fontFamily: 'JetBrains Mono, monospace',
                      lineHeight: 1,
                    }}
                  >
                    {analysis.overall_accuracy.toFixed(0)}
                    <span style={{ fontSize: 14 }}>%</span>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      marginTop: 3,
                      letterSpacing: '0.08em',

                    }}
                  >
                    accuracy
                  </div>
                </div>
              )}
          </div>

          {(game.user_rating_at_time ?? game.opponent_rating_at_time) && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 16,
                fontSize: 12,
              }}
            >
              {game.user_rating_at_time && (
                <span style={{ color: 'var(--text-muted)' }}>
                  You:{' '}
                  <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {game.user_rating_at_time}
                  </strong>
                </span>
              )}
              {game.opponent_rating_at_time && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Opp:{' '}
                  <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {game.opponent_rating_at_time}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>

        {causalChains.length > 0 && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '0.1em',

                  color: 'var(--gold)',
                  fontWeight: 600,
                }}
              >
                Why you lost this position
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  marginLeft: 'auto',
                }}
              >
                {causalChains.length} chain
                {causalChains.length !== 1 ? 's' : ''} detected
              </span>
            </div>

            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {causalChains.map((chain, chainIdx) => {
                const nodes = buildChainNodes(chain)
                const isActive = activeChainId === chain.id
                const terminalMoveNum = Math.ceil(
                  chain.terminal_blunder_ply / 2
                )

                return (
                  <div key={chain.id}>
                    {chainIdx > 0 && (
                      <div
                        style={{
                          height: 1,
                          background: 'var(--border)',
                          marginBottom: 16,
                        }}
                      />
                    )}

                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        marginBottom: 10,
                      }}
                    >
                      Move {terminalMoveNum} blunder:{' '}
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--blunder)',
                        }}
                      >
                        {chain.terminal_blunder_san}
                      </span>
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: 0,
                        overflowX: 'auto',
                        paddingBottom: 4,
                      }}
                    >
                      {nodes.map((node, nodeIdx) => {
                        const isRoot = node.kind === 'root'
                        const isTerminal = node.kind === 'terminal'
                        const nodeBrush = isRoot
                          ? 'chain_root'
                          : isTerminal
                            ? 'chain_blunder'
                            : 'chain_mid'
                        const nodeBorderColor = isRoot
                          ? 'rgba(201,165,92,0.45)'
                          : isTerminal
                            ? 'rgba(192,57,43,0.45)'
                            : 'var(--border)'
                        const nodeSanColor = isRoot
                          ? 'var(--gold)'
                          : isTerminal
                            ? 'var(--blunder)'
                            : 'var(--text)'

                        return (
                          <div
                            key={nodeIdx}
                            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <button
                              onClick={() =>
                                handleChainNodeClick(
                                  node.ply,
                                  chain.id,
                                  nodeBrush
                                )
                              }
                              style={{
                                width: 100,
                                padding: '10px 10px 8px',
                                background:
                                  isActive && currentPly === node.ply
                                    ? 'var(--surface-2)'
                                    : 'var(--surface-3)',
                                border: `1px solid ${nodeBorderColor}`,
                                borderRadius: 6,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background 0.15s, border-color 0.15s',
                                flexShrink: 0,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                  'var(--surface-2)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  isActive && currentPly === node.ply
                                    ? 'var(--surface-2)'
                                    : 'var(--surface-3)'
                              }}
                            >
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: 8,
                                  letterSpacing: '0.08em',

                                  color: isRoot
                                    ? 'var(--gold-dim)'
                                    : isTerminal
                                      ? 'var(--blunder)'
                                      : 'var(--text-dim)',
                                  marginBottom: 4,
                                  fontWeight: 600,
                                }}
                              >
                                {isRoot
                                  ? 'Root'
                                  : isTerminal
                                    ? 'Blunder'
                                    : `Step ${nodeIdx}`}
                              </span>

                              <span
                                style={{
                                  display: 'block',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: nodeSanColor,
                                  marginBottom: 5,
                                }}
                              >
                                {node.san}
                              </span>

                              <span
                                style={{
                                  display: 'block',
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
                                  lineHeight: 1.4,
                                }}
                              >
                                {node.explanation.length > 60
                                  ? node.explanation.slice(0, 57) + '…'
                                  : node.explanation}
                              </span>
                            </button>

                            {nodeIdx < nodes.length - 1 && (
                              <span
                                style={{
                                  padding: '0 6px',
                                  fontSize: 12,
                                  color: 'var(--text-dim)',
                                  flexShrink: 0,
                                }}
                              >
                                →
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {chain.chain_explanation && (
                      <p
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          lineHeight: 1.6,
                          fontStyle: 'italic',
                        }}
                      >
                        {chain.chain_explanation}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {analysis &&
          (analysis.opening_accuracy !== null ||
            analysis.middlegame_accuracy !== null ||
            analysis.endgame_accuracy !== null) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
              }}
            >
              {(
                [
                  { label: 'Opening', val: analysis.opening_accuracy },
                  { label: 'Middlegame', val: analysis.middlegame_accuracy },
                  { label: 'Endgame', val: analysis.endgame_accuracy },
                ] as const
              ).map(({ label, val }) => (
                <div
                  key={label}
                  style={{
                    padding: '14px 8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      color:
                        val === null
                          ? 'var(--text-dim)'
                          : val >= 85
                            ? 'var(--good)'
                            : val >= 65
                              ? 'var(--gold)'
                              : 'var(--mistake)',
                      lineHeight: 1,
                    }}
                  >
                    {val !== null ? `${val.toFixed(0)}%` : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      marginTop: 4,
                      letterSpacing: '0.06em',

                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

        {analysis?.key_moment_move_ply &&
          analysis?.key_moment_explanation && (
            <button
              onClick={() => goTo(analysis.key_moment_move_ply!)}
              style={{
                padding: '16px 18px',
                background: 'var(--surface)',
                border: '1px solid rgba(201,165,92,0.28)',
                borderRadius: 8,
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor =
                  'rgba(201,165,92,0.55)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor =
                  'rgba(201,165,92,0.28)'
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 9,
                  letterSpacing: '0.12em',

                  color: 'var(--gold-dim)',
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                The turning point
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 15,
                    color: 'var(--gold)',
                    fontWeight: 600,
                  }}
                >
                  {moves.find(
                    (m) =>
                      m.ply_number === analysis.key_moment_move_ply
                  )?.san ?? `ply ${analysis.key_moment_move_ply}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  move {Math.ceil(analysis.key_moment_move_ply / 2)}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  lineHeight: 1.65,
                }}
              >
                {analysis.key_moment_explanation}
              </p>
              <span
                style={{
                  display: 'block',
                  marginTop: 8,
                  fontSize: 10,
                  color: 'var(--gold-dim)',
                  letterSpacing: '0.05em',
                }}
              >
                Click to jump →
              </span>
            </button>
          )}

        {analysis?.claude_narrative && (
          <div
            style={{
              padding: '18px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 9,
                letterSpacing: '0.12em',

                color: 'var(--text-dim)',
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Coach Analysis
            </span>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: 'var(--text)',
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
              }}
            >
              {analysis.claude_narrative}
            </p>
          </div>
        )}

        {!analysis && (
          <div
            style={{
              padding: '24px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <p
              style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}
            >
              This game hasn&apos;t been analyzed yet.
            </p>
            <p
              style={{
                color: 'var(--text-dim)',
                fontSize: 12,
                margin: '6px 0 16px',
              }}
            >
              Move through the game with the board controls above.
            </p>
            <button
              style={{
                padding: '8px 20px',
                background: 'var(--gold)',
                color: '#1a1512',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Analyze this game
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
