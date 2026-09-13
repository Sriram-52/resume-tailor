import type { MasterResume } from './resume'

/** A tailored resume is the same shape as the master, but trimmed/rewritten. */
export type TailoredResume = MasterResume

export interface KeywordGap {
  /** 0-100 estimate of how well the resume matches the JD. */
  matchScore: number
  /** JD keywords already well-represented in the resume. */
  matched: string[]
  /** JD keywords/skills missing or weakly represented. */
  missing: string[]
  /** Suggested terminology swaps: say it the way the JD says it. */
  terminology: { from: string; to: string }[]
  /** Short, actionable notes. */
  notes: string[]
}

/** A single granular, user-reviewable resume change proposed by the AI. */
export interface Suggestion {
  type: 'edit' | 'add'
  /** "title" retitles a role's position; the rest edit/add bullets, summary, or skills. */
  section: 'summary' | 'work' | 'project' | 'skill' | 'title'
  /** Where it applies: company name / project name / skill category; "" for summary. */
  target: string
  /** For "edit": exact existing text to replace. Empty for "add"/"summary". */
  before: string
  /** Proposed new text. */
  after: string
  /** Posting keywords this change addresses. */
  keywords: string[]
  reason: string
}

export type ApplicationStatus =
  | 'draft'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'archived'

export interface Application {
  id: string
  /**
   * Jobright's job id, when the application came from Jobright (which is now
   * everything except hand-entered records). This is the key the backfill and
   * the status sync match on.
   */
  jobId?: string
  /** Jobright's fit score at the time the job was queued, 0-100. Not an ATS score. */
  fit?: number | null
  /** Where the lead came from. Dice leads are imported into Jobright first. */
  source?: 'jobright' | 'dice' | 'manual'
  /** Whether the tailoring saw the employer's own posting text or only Jobright's structure. */
  jdSource?: 'posting' | 'jobright'
  /**
   * Remote / Hybrid / Onsite, and the posting's location, as Jobright reported
   * them. Kept on the record because the job itself is not: once a posting is
   * gone from the feed there is no way to recover how it was advertised, which
   * makes "which work models actually convert" unanswerable after the fact.
   */
  workModel?: string
  location?: string
  company: string
  role: string
  /** ISO date the record was created (stamped by main, since Date.now is fine there). */
  createdAt: string
  /**
   * ISO date this actually became an application — stamped the first time it
   * leaves `draft`. `createdAt` is when it was *tailored*, which is a different
   * day whenever you write a resume one evening and send it the next, so the
   * daily goal and streak count on this.
   */
  appliedAt?: string
  status: ApplicationStatus
  /** Link to the job posting, if provided. */
  jobUrl?: string
  /** The pasted job description, kept for reference and re-runs. */
  jobDescription: string
  /** Which base-resume profile this was tailored from, so "Continue" can re-select it. */
  baseId?: string
  tailored: TailoredResume
  keywordGap: KeywordGap | null
  coverLetter: string | null
  /** Which HTML template was used to render. */
  template: string
  /** Absolute paths to any exported PDFs. */
  files: { resumePdf?: string; coverLetterPdf?: string }
  notes: string
}
