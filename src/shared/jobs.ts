/**
 * Job discovery: search contract postings from a job board (Dice, via Apify)
 * using the user's active profile, then tailor to any result.
 */

/** Employment type filter. */
export type EmploymentType = 'contract' | 'fulltime' | 'parttime' | 'any'

/** Filters the user tweaks before a search. */
export interface JobSearchFilters {
  /** Search keywords. Prefilled with the active profile's job title. */
  keywords: string
  /** Location text, e.g. "Remote", "New York, NY". */
  location: string
  /** Restrict to remote-friendly roles. */
  remote: boolean
  /** Employment type to search for. */
  employmentType: EmploymentType
  /** Only postings newer than this many days (0 = any). */
  postedWithinDays: number
  /** Cap on results fetched — a cost control, since Apify bills per result. */
  maxResults: number
}

export function defaultFilters(): JobSearchFilters {
  return {
    keywords: '',
    location: 'Remote',
    remote: true,
    employmentType: 'contract',
    postedWithinDays: 7,
    maxResults: 30
  }
}

/** A normalized posting returned from a search, ready to tailor to. */
export interface JobLead {
  /** Stable id (board job id, or a hash of the URL). */
  id: string
  title: string
  company: string
  location: string
  remote: boolean
  /** Raw salary text if the posting had one. */
  salary: string
  /** Link to the posting. */
  url: string
  /** Company logo URL, if the posting had one. */
  logo: string
  /** ISO-ish date string the posting was posted, if known. */
  postedDate: string
  /** Full job-description text — enough to tailor against without a second fetch. */
  description: string
  /** e.g. "Direct Hire", "Recruiter", "Employer" — helps spot agency reposts. */
  employerType: string
  /** Agent-assigned fit score (0-100) of the active resume against this job. */
  fitScore?: number
  /** One-line reason for the score (biggest match or gap). */
  matchReason?: string
}

/** The last search, persisted so a paid search survives an app restart. */
export interface JobResultsState {
  filters: JobSearchFilters
  leads: JobLead[]
  /** ISO timestamp of when the search ran. */
  searchedAt: string
}
