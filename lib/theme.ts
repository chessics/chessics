export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'chessics-theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export function currentTheme(root: HTMLElement, prefersLight: boolean): Theme {
  const picked = root.getAttribute('data-theme')
  if (isTheme(picked)) return picked
  return prefersLight ? 'light' : 'dark'
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light'
}

export type ThemeChoice = 'system' | Theme

export function storedThemeChoice(storage: Pick<Storage, 'getItem'> | null): ThemeChoice {
  try {
    const t = storage?.getItem(THEME_STORAGE_KEY)
    return isTheme(t) ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyThemeChoice(
  choice: ThemeChoice,
  root: HTMLElement,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null
): void {
  withoutTransitions(root.ownerDocument ?? null, () => {
    if (choice === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', choice)
  })
  try {
    if (choice === 'system') storage?.removeItem(THEME_STORAGE_KEY)
    else storage?.setItem(THEME_STORAGE_KEY, choice)
  } catch {
  }
}

export const THEME_SWITCH_STYLE_ID = 'theme-switch-no-transitions'

export function withoutTransitions(doc: Document | null, change: () => void): void {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') {
    change()
    return
  }
  const style = doc.createElement('style')
  style.id = THEME_SWITCH_STYLE_ID
  style.textContent = '*,*::before,*::after{transition:none !important}'
  doc.head.appendChild(style)
  change()
  void doc.defaultView?.getComputedStyle(doc.documentElement).color
  const remove = () => style.remove()
  const raf = doc.defaultView?.requestAnimationFrame
  if (raf) raf(() => raf(remove))
  else remove()
}
