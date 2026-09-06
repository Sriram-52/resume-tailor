/**
 * The tailoring queue: paste posting URLs, and the app fetches each posting,
 * tailors the selected base resume to it, scores the match, and saves the
 * result as a draft Application, several at a time, in the background.
 */

export type QueueStatus = 'queued' | 'fetching' | 'tailoring' | 'scoring' | 'done' | 'error'

export interface QueueItem {
  id: string
  url: string
  /** Base resume profile to tailor from. */
  baseId: string
  status: QueueStatus
  /** Filled once the posting is fetched. */
  company: string
  role: string
  /** ATS match score once scoring finishes. */
  matchScore: number | null
  /** The saved Application this produced, once done. */
  appId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

/** Statuses that mean the runner still has work to do on the item. */
export const ACTIVE_STATUSES: QueueStatus[] = ['queued', 'fetching', 'tailoring', 'scoring']

export function isActive(s: QueueStatus): boolean {
  return ACTIVE_STATUSES.includes(s)
}
