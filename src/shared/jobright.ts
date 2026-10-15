/**
 * Jobright is the app's primary job source and the system of record for
 * application status. Everything here mirrors what its private web endpoints
 * return; nothing is invented.
 *
 * Two things to keep straight:
 *   - `fit` is Jobright's score, computed server-side from the profile they hold
 *     (which is derived from the resume we sync to them). It is a *fit* score.
 *   - the ATS score lives on `Application.keywordGap.matchScore` and measures
 *     keyword coverage of a *tailored* resume against a posting. The two are not
 *     comparable and are never averaged.
 */

/** Jobright's `applyStatus` integer, as observed on live records. */
export const APPLY_STATUS = {
  applied: 0,
  interviewing: 1,
  offer: 2,
  rejected: 3,
  archived: 4
} as const

export type JobrightApplyStatus = (typeof APPLY_STATUS)[keyof typeof APPLY_STATUS]

/** Our kanban status <-> Jobright's integer. `draft` is local-only and has no pair. */
export const STATUS_TO_JOBRIGHT: Record<string, JobrightApplyStatus | undefined> = {
  draft: undefined,
  applied: APPLY_STATUS.applied,
  interviewing: APPLY_STATUS.interviewing,
  offer: APPLY_STATUS.offer,
  rejected: APPLY_STATUS.rejected,
  archived: APPLY_STATUS.archived
}

export const JOBRIGHT_TO_STATUS: Record<number, string> = {
  0: 'applied',
  1: 'interviewing',
  2: 'offer',
  3: 'rejected',
  4: 'archived'
}

/** The three components behind Jobright's headline fit score. */
export interface FitBreakdown {
  /** 0-100. Missing components come back as null rather than 0. */
  experience: number | null
  skills: number | null
  industry: number | null
}

/**
 * One job as the app uses it. Assembled from `recommend/list/jobs`; the same
 * shape is produced for applied and imported (External) jobs.
 */
export interface JobrightJob {
  /** Jobright's stable id. This is the app's identity for a job everywhere. */
  jobId: string
  title: string
  company: string
  companyLogo: string
  industries: string[]
  location: string
  workModel: string
  seniority: string
  employmentType: string
  minYearsExperience: number | null
  salaryDesc: string
  minSalary: number | null
  maxSalary: number | null
  /** Where to actually apply. Often an ATS (Greenhouse/Ashby/Lever), sometimes LinkedIn. */
  applyUrl: string
  isCompanySiteLink: boolean
  postedDesc: string
  postedAt: number | null
  applicantsDesc: string
  /** Jobright's fit score, 0-100, rounded for display. */
  fit: number
  /**
   * The unrounded score. Rounding collapses the feed into large ties — ten jobs
   * at 90, nine at 93 — and sorting on that makes the order within a group look
   * arbitrary. Display uses `fit`; ordering uses this.
   */
  fitExact: number
  fitRank: string
  fitBreakdown: FitBreakdown
  /** Structured job description. There is no raw JD anywhere in Jobright. */
  summary: string
  responsibilities: string[]
  requiredSkills: string[]
  preferredSkills: string[]
  education: string[]
  benefits: string[]
  skillTags: string[]
  /** Signals the export script used to filter on, kept for the same purpose. */
  h1bSponsor: boolean
  isAgency: boolean
  citizenOnly: boolean
  clearanceRequired: boolean
  /** Present on applied records only. */
  applyStatus: JobrightApplyStatus | null
  appliedAt: number | null
}

/** A company on an exclusion list. Jobright stores these as objects, not names. */
export interface CompanyRef {
  companyId?: string
  companyName: string
}

/** One of Jobright's taxonomy entries (the "Job Titles" filter chips). */
export interface TaxonomyRef {
  taxonomyId?: string
  title: string
}

/**
 * Jobright's server-side saved filter — nine of the export script's heuristics
 * live here, so the feed arrives already filtered.
 *
 * These shapes are taken from a live `filter/saved/list` response, not guessed.
 * Two things to watch: several fields are numeric enums whose meanings we have
 * not decoded (`jobTypes`, `seniority`, `workModel`), and every optional field
 * can come back as an explicit `null` rather than being absent. Anything this
 * app does not edit is passed through untouched rather than rewritten.
 */
export interface JobrightFilter {
  /** A single string, not a list. The taxonomy list is what holds multiple roles. */
  jobTitle?: string | null
  jobTaxonomyList?: TaxonomyRef[] | null
  /** Undecoded numeric enums. Passed through as-is; never synthesised. */
  jobTypes?: number[] | null
  seniority?: number[] | null
  workModel?: number[] | null
  country?: string | null
  city?: string | null
  locations?: unknown[] | null
  radiusRange?: number | null
  skills?: string[] | null
  companies?: unknown[] | null
  companyStages?: string[] | null
  companyCategory?: unknown[] | null
  annualSalaryMinimum?: number | null
  minYearsOfExperienceRange?: number[] | null
  daysAgo?: number | null
  isH1BOnly?: boolean | null
  excludeStaffingAgency?: boolean | null
  excludeSecurityClearance?: boolean | null
  excludeUsCitizen?: boolean | null
  excludedTitle?: string[] | null
  excludedCompanies?: CompanyRef[] | null
  excludedSkills?: string[] | null
  excludeCompanyCategory?: unknown[] | null
  hiddenJobsOnly?: boolean | null
  recommendationPreference?: string | null
  roleType?: string | null
}

export interface SavedFilter {
  surveyId: string
  filterName: string
  isActive: boolean
  filter: JobrightFilter
}

/**
 * The two rules Jobright's saved filter cannot express, so the app applies them
 * to the feed itself after fetching.
 */
export interface LocalFilter {
  /** Drop anything below this Jobright fit score. `displayScore` is a sort key there, not a filter. */
  minFit: number
  /** Keep only remote roles, or ones in these state codes. Empty = no location rule. */
  nearStates: string[]
  /** Whether the location rule is applied at all. */
  nearOnly: boolean
}

export function emptyLocalFilter(): LocalFilter {
  return { minFit: 0, nearStates: [], nearOnly: false }
}

/** Connection state of the Jobright session, surfaced in Settings and as a banner. */
export interface JobrightStatus {
  connected: boolean
  /** Set when we have seen a 401/403 and the user needs to sign in again. */
  needsLogin: boolean
  email: string
  /** True in the dev build, where writes to Jobright are refused. */
  readOnly?: boolean
  checkedAt: string
}

/** Which feed a job list request is for. */
export type JobrightFeed = 'recommended' | 'applied' | 'external'
