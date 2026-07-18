import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Minimal .env loader for the main process.
 *
 * electron-vite only exposes *prefixed* env vars (MAIN_VITE_*) to the main
 * process at build time, so an unprefixed `.env` (e.g. APIFY_TOKEN=…) isn't in
 * process.env at runtime. This reads a `.env` file ourselves — a personal-use
 * convenience so the user can just drop a token in the project root (dev) or in
 * the app's userData dir (packaged). Anything already in process.env wins.
 */

let loaded = false

export function loadEnvFile(): void {
  if (loaded) return
  loaded = true
  const candidates = [
    join(process.cwd(), '.env'), // dev: project root
    process.resourcesPath && join(process.resourcesPath, '.env'), // packaged: copied in by install:app
    join(app.getAppPath(), '.env'),
    join(app.getPath('userData'), '.env') // user-dropped fallback
  ].filter((p): p is string => Boolean(p))
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      for (const raw of readFileSync(path, 'utf8').split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq < 0) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (key && !(key in process.env)) process.env[key] = val
      }
      break // first .env found wins
    } catch {
      /* ignore an unreadable .env */
    }
  }
}

/** The Apify API token used for job-board searches, if configured. */
export function getApifyToken(): string | undefined {
  return process.env.APIFY_TOKEN?.trim() || undefined
}
