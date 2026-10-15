/**
 * Shapes shared between main and the renderer for calls that can fail because
 * the Jobright session died. Every Jobright call answers in this shape so the
 * renderer has exactly one place to decide "show the Reconnect banner".
 */
export type JobrightReply<T> =
  | { ok: true; data: T }
  | { ok: false; needsLogin: boolean; error: string }

export interface SetStatusReply {
  ok: boolean
  /** The full list after the local write, so the renderer can replace state wholesale. */
  apps: import('./application').Application[]
  /** Whether the move also reached Jobright. False means local-only for now. */
  synced: boolean
  needsLogin?: boolean
  error?: string
}

/** What a Jobright backfill did, reported back to the Resume/Settings screen. */
export interface BackfillResult {
  fetched: number
  matched: number
  created: number
  statusUpdated: number
}
