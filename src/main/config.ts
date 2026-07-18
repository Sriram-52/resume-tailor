import { loadSettings } from './store'

/**
 * App configuration derived from user Settings (stored locally in userData).
 *
 * All secrets and overrides come from the in-app Settings tab — nothing is read
 * from environment variables or a bundled .env, so the app ships as a DMG with
 * no embedded secrets and each user supplies their own from the UI.
 */

/** The Apify API token used for job-board searches, if the user set one. */
export function getApifyToken(): string | undefined {
  return loadSettings().apifyToken?.trim() || undefined
}

/**
 * The Claude model to use for tailoring/ATS/cover/chat, if the user picked a
 * non-default one. `undefined` means "let claude.ts choose the default".
 */
export function getTailorModel(): string | undefined {
  return loadSettings().tailorModel?.trim() || undefined
}
