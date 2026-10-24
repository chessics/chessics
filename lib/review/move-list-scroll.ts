export function listScrollTop(
  listTop: number,
  listHeight: number,
  rowTop: number,
  rowHeight: number,
): number | null {
  if (rowTop < listTop) return rowTop
  if (rowTop + rowHeight > listTop + listHeight) return rowTop + rowHeight - listHeight
  return null
}

export function scrollListToMove(list: HTMLElement, row: HTMLElement, behavior: ScrollBehavior): void {
  const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
  const top = listScrollTop(list.scrollTop, list.clientHeight, rowTop, row.offsetHeight)
  if (top !== null) list.scrollTo({ top, behavior })
}
