import { emptyLocalFilter, type LocalFilter } from './jobright'

export type Theme = 'system' | 'light' | 'dark'
import { DEFAULT_CONCURRENCY } from './queue'

/**
 * User-editable app settings, stored locally in the app's userData dir
 * (settings.json). Kept out of source and out of the app bundle so the app can
 * be shipped as a DMG and each user supplies their own keys from the UI.
 */
export interface AppSettings {
  /** Apify API token for Dice imports (External tab). */
  apifyToken: string
  /**
   * The two feed rules Jobright's saved filter cannot express. Everything else
   * is pushed server-side, so the feed arrives already filtered.
   */
  localFilter: LocalFilter
  /** How many jobs are tailored at once. Each is two Claude CLI calls. */
  concurrency: number
  /**
   * When the active resume was last pushed to Jobright. Their fit score is
   * computed from the copy they hold, so a stale sync silently rots the feed's
   * ranking — the Resume screen shows a badge when this falls behind.
   */
  resumeSyncedAt: string
  /**
   * Claude model used for tailoring/ATS/cover/chat. Empty string means "use the
   * app default" (see claude.ts). A model id like "claude-opus-4-8" overrides it.
   */
  tailorModel: string
  /**
   * Appearance. 'system' follows the OS; the other two pin it. Resolved to an
   * explicit light/dark in the renderer, because the stylesheet keys off a
   * `data-theme` attribute rather than a media query.
   */
  theme: Theme
  /** Applications to send per day. 0 turns the goal and streak off. */
  dailyGoal: number
}

export function emptySettings(): AppSettings {
  return {
    apifyToken: '',
    localFilter: emptyLocalFilter(),
    concurrency: DEFAULT_CONCURRENCY,
    resumeSyncedAt: '',
    theme: 'system',
    dailyGoal: 0,
    tailorModel: ''
  }
}

/**
 * The model the app uses when the user has not picked one in Settings. Pinned
 * explicitly on every call so the app never inherits the machine's global
 * Claude Code default, which may be a model the bundled CLI cannot run.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5'

/** The model choices offered in Settings. Empty value = app default. */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sonnet 5 (recommended)' },
  { value: 'claude-fable-5-1', label: 'Fable 5.1 (highest quality)' },
  { value: 'claude-opus-5', label: 'Opus 5' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (fastest)' }
]
