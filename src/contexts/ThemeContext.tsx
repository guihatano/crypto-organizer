import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (next: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Defensive read (mirrors readStoredCurrency in App.tsx, T-05-02): only
 * the literal 'light'/'dark'/'system' select that state — any other
 * stored value (tampered, absent, or garbage) falls back to 'system' so
 * the very first load follows the OS prefers-color-scheme (D-01).
 */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function isEffectiveDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && prefersDark())
}

function applyEffectiveTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', isEffectiveDark(theme))
}

/**
 * 3-state theme provider (D-01/D-02/D-03). Persists an explicit
 * Claro/Escuro/Sistema choice to localStorage (key `theme`) so it wins
 * over OS changes until changed again (D-02); when nothing is stored the
 * app follows prefers-color-scheme (D-01). While in 'system', a live
 * matchMedia subscription re-applies the theme on OS change without a
 * reload (D-03). Must agree with the anti-FOUC script in index.html on
 * both the storage key and the `.dark` class it toggles on
 * document.documentElement.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const isFirstRender = useRef(true)

  // Persist only an explicit user selection (D-02) — fail-silent per
  // UI-SPEC/T-05-03 (private-mode/quota errors must not crash the app;
  // the theme still applies for the session). Skip the initial mount so
  // an untouched fallback (e.g. 'system') is never written to storage.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore — theme still applies in-memory for this session
    }
  }, [theme])

  // Apply the effective theme to <html> whenever the mode changes.
  useEffect(() => {
    applyEffectiveTheme(theme)
  }, [theme])

  // Sistema live-follow (D-03): while in 'system', re-apply on OS change.
  useEffect(() => {
    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyEffectiveTheme('system')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  function setTheme(next: Theme) {
    setThemeState(next)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
