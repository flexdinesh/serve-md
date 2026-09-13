export const THEME_STORAGE_KEY = "servef-theme"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = Exclude<Theme, "system">

export interface ThemeSnapshot {
  theme: Theme
  resolvedTheme: ResolvedTheme
}

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark"
}

export function parseTheme(value: string | null): Theme {
  return isTheme(value) ? value : "system"
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light"
  return theme
}

export function readStoredTheme(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "system"
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Theme selection still applies when storage is unavailable.
  }
}

function themeColorScheme(meta: HTMLMetaElement): ResolvedTheme | null {
  const markedScheme = meta.dataset.servefThemeColor
  if (isResolvedTheme(markedScheme)) return markedScheme

  const media = meta.media.toLowerCase()
  const scheme = media.includes("prefers-color-scheme: dark")
    ? "dark"
    : media.includes("prefers-color-scheme: light")
      ? "light"
      : null
  if (scheme) meta.dataset.servefThemeColor = scheme
  return scheme
}

export function applyResolvedTheme(resolvedTheme: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle("light", resolvedTheme === "light")
  root.classList.toggle("dark", resolvedTheme === "dark")
  root.style.colorScheme = resolvedTheme

  const themeColors = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  for (const meta of themeColors) {
    const scheme = themeColorScheme(meta)
    if (scheme) meta.media = scheme === resolvedTheme ? "all" : "not all"
  }
}

export function initializeTheme(): ThemeSnapshot {
  const theme = readStoredTheme()
  const resolvedTheme = resolveTheme(theme, window.matchMedia("(prefers-color-scheme: dark)").matches)
  applyResolvedTheme(resolvedTheme)
  return { theme, resolvedTheme }
}
