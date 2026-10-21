export function moveListKey(key: string, currentPly: number, totalPlies: number): number | null {
  const clamp = (p: number) => Math.max(0, Math.min(totalPlies, p))
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return clamp(currentPly - 1)
    case 'ArrowRight':
    case 'ArrowDown':
      return clamp(currentPly + 1)
    case 'Home':
      return 0
    case 'End':
      return totalPlies
    default:
      return null
  }
}

export function tabStopPly(currentPly: number, totalPlies: number): number | null {
  if (totalPlies < 1) return null
  return currentPly >= 1 && currentPly <= totalPlies ? currentPly : 1
}
