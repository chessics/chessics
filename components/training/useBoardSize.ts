import { useEffect, useState } from 'react'

export function boardSizeForColumn(width: number, stacked: 'beside-bar' | 'above-bar'): number {
  if (width < 700 && stacked === 'above-bar') return width
  const available = width >= 700 ? width - 300 : width - 24
  return Math.min(width, Math.max(260, Math.min(560, Math.floor(available))))
}

export function useBoardSize(ref: React.RefObject<HTMLDivElement>, stacked: 'beside-bar' | 'above-bar' = 'beside-bar'): number {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize(boardSizeForColumn(el.clientWidth, stacked))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, stacked])
  return size
}
