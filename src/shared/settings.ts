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
   * app default" (see claude.ts). A model id like "claude-opus-4-8" overrides it.
   */
  tailorModel: string
}

export function emptySettings(): AppSettings {
  return { apifyToken: '', tailorModel: '' }
}

/** The model choices offered in Settings. Empty value = app default. */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sonnet 5 (recommended)' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8 (highest quality)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (fastest)' }
]
