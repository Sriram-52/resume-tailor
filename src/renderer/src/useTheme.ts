import { useEffect, useState } from 'react'
import type { Theme } from '../../shared/settings'

/**
 * Applies the chosen theme to the document root.
 *
 * The stylesheet keys off a `data-theme` attribute rather than a
 * `prefers-color-scheme` media query, so 'system' has to be resolved here — and
 * re-resolved when the OS flips, which is what the matchMedia listener is for.
 */
export function useTheme(theme: Theme): void {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
    document.documentElement.dataset.theme = resolved
  }, [theme, systemDark])
}
