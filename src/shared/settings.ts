/**
 * User-editable app settings, stored locally in the app's userData dir
 * (settings.json). Kept out of source and out of the app bundle so the app can
 * be shipped as a DMG and each user supplies their own keys from the UI.
 */
export interface AppSettings {
  /** Apify API token for job discovery (Discover tab). */
  apifyToken: string
  /**
   * Claude model used for tailoring/ATS/cover/chat. Empty string means "use the
   * app default" (see claude.ts). A model id like "claude-opus-5-5" overrides it.
   */
  tailorModel: string
}

export function emptySettings(): AppSettings {
  return { apifyToken: '', tailorModel: '' }
}

/**
 * The model the app uses when the user has not picked one in Settings. Pinned
 * explicitly on every call so the app never inherits the machine's global
 * Claude Code default, which may be a model the bundled CLI cannot run.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5-5'

/** The model choices offered in Settings. Empty value = app default. */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sonnet 5.5 (recommended)' },
  { value: 'claude-fable-5-1', label: 'Fable 5.1 (highest quality)' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5 (fastest)' }
]
