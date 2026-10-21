const CONTROLS =
  'button, a[href], input, select, textarea, summary, [role="button"], [contenteditable="true"], [data-keyboard-board]'

export function keyBelongsToControl(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null
  return !!el && typeof el.closest === 'function' && el.closest(CONTROLS) != null
}
