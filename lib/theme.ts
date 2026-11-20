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
