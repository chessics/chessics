'use client'

import { Fragment, useCallback, useMemo, useState, type ElementType } from 'react'
import { splitSentences, squaresNamed, withLitSquares, type LitShape } from '@/lib/board/squares'

export interface LitHandlers {
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  'data-lit-squares': string
}

export interface LitSquares {
  squares: string[]
  bind: (text: string) => Partial<LitHandlers>
  shapesWith: <T extends LitShape>(base: T[]) => Array<T | LitShape>
}

const NONE: string[] = []

export interface LitState {
  hovered: string[] | null
  focused: string[] | null
  last: 'hover' | 'focus'
}

export function litNow(s: LitState): string[] {
  return (s.last === 'hover' ? s.hovered ?? s.focused : s.focused ?? s.hovered) ?? NONE
}

export type LitEvent = 'enter' | 'leave' | 'focus' | 'blur'

export function litReduce(s: LitState, event: LitEvent, named: string[]): LitState {
  switch (event) {
    case 'enter':
      return { ...s, hovered: named, last: 'hover' }
    case 'leave':
      return { ...s, hovered: null }
    case 'focus':
      return { ...s, focused: named, last: 'focus' }
    case 'blur':
      return { ...s, focused: null }
  }
}

export function useLitSquares(): LitSquares {
  const [state, setState] = useState<LitState>({ hovered: null, focused: null, last: 'hover' })
  const squares = litNow(state)

  const bind = useCallback((text: string): Partial<LitHandlers> => {
    const named = squaresNamed(text)
    if (named.length === 0) return {}
    return {
      onMouseEnter: () => setState((s) => litReduce(s, 'enter', named)),
      onMouseLeave: () => setState((s) => litReduce(s, 'leave', named)),
      onFocus: () => setState((s) => litReduce(s, 'focus', named)),
      onBlur: () => setState((s) => litReduce(s, 'blur', named)),
      'data-lit-squares': named.join(' '),
    }
  }, [])

  const shapesWith = useCallback(<T extends LitShape>(base: T[]) => withLitSquares(base, squares), [squares])

  return useMemo(() => ({ squares, bind, shapesWith }), [squares, bind, shapesWith])
}

export function LitProse({ text, lit, as: Tag = 'span' }: { text: string; lit: LitSquares; as?: ElementType }) {
  return (
    <>
      {splitSentences(text).map((sentence, i) => {
        const handlers = lit.bind(sentence)
        if (!('data-lit-squares' in handlers)) return <Tag key={i}>{sentence}</Tag>
        const body = sentence.trimEnd()
        return (
          <Fragment key={i}>
            <Tag className="lit-sentence" tabIndex={0} {...handlers}>
              {body}
            </Tag>
            {sentence.slice(body.length)}
          </Fragment>
        )
      })}
    </>
  )
}
