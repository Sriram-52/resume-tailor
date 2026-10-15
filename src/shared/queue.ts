import type { JobrightJob } from './jobright'

/**
 * The tailoring queue. Select jobs in the feed, and each one is tailored from
 * the chosen base resume, scored, and saved as a local `draft` Application.
 *
 * Jobs carry their full Jobright record, so a restart resumes without refetching
 * and without depending on the feed still containing them.
 */

export type QueueStatus = 'queued' | 'fetching' | 'tailoring' | 'scoring' | 'done' | 'error'

/** Where the job description text came from. See main/jobDescription.ts. */
export type JdSource = 'posting' | 'jobright'

export interface QueueItem {
  id: string
  /** Jobright's job id — the app's identity for a job everywhere. */
  jobId: string
  /** Snapshot of the job, so the runner never has to go back to the feed. */
  job: JobrightJob
  /** Base resume profile to tailor from. */
  baseId: string
  status: QueueStatus
  /** ATS match score once scoring finishes. */
  matchScore: number | null
  /**
   * Whether the employer's own posting text could be read. `jobright` means we
   * tailored from the structured description alone — a degraded result, not a
   * failure.
   */
  jdSource: JdSource | null
  /** Why the posting fetch fell back, shown on the queue row. */
  jdNote: string
  /** The saved Application this produced, once done. */
  appId?: string
  /** Set only for real failures: no base resume, or tailoring itself failed. */
  error?: string
  createdAt: string
  updatedAt: string
}

/** Statuses that mean the runner still has work to do on the item. */
export const ACTIVE_STATUSES: QueueStatus[] = ['queued', 'fetching', 'tailoring', 'scoring']

export function isActive(s: QueueStatus): boolean {
  return ACTIVE_STATUSES.includes(s)
}

/** How many postings are processed at once. Each item is two Claude CLI calls. */
export const DEFAULT_CONCURRENCY = 3

/** Selecting more than this at once is worth a confirmation: it is 2x calls. */
export const BULK_WARN_THRESHOLD = 25
