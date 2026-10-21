export const REVIEW_BOARD_MAX = 480
export const REVIEW_BOARD_BESIDE = 22

export function reviewBoardSize(columnWidth: number): number {
  if (!Number.isFinite(columnWidth) || columnWidth <= 0) return REVIEW_BOARD_MAX
  return Math.max(0, Math.min(REVIEW_BOARD_MAX, Math.floor(columnWidth - REVIEW_BOARD_BESIDE)))
}
