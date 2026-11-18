import { boardOutOfView } from '@/lib/review/board-into-view'

export function showTrainingAnswer(root: HTMLElement | null) {
  if (!root || root.clientWidth >= 700) return
  const grid = root.querySelector<HTMLElement>('.training-grid')
  const next = root.querySelector<HTMLElement>('[data-training-next]')
  if (!grid || !next) return

  const top = grid.getBoundingClientRect().top
  const bottom = next.getBoundingClientRect().bottom
  const inset = parseFloat(window.getComputedStyle(grid).scrollMarginTop) || 0
  const height = window.innerHeight
  if (!boardOutOfView({ top, bottom }, height, inset)) return

  if (bottom - top <= height - inset) {
    grid.scrollIntoView({ block: 'start', inline: 'nearest' })
  } else {
    next.scrollIntoView({ block: 'end', inline: 'nearest' })
  }
}
