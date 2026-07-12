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
  company: string
  role: string
  /** ISO date the record was created (stamped by main, since Date.now is fine there). */
  createdAt: string
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
