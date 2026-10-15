import { randomUUID } from 'crypto'
import type { JobrightJob } from '../shared/jobright'
import { fetchJobPosting } from './jobFetch'
import { importByUrl, importStatus, JobrightAuthError } from './jobright'
import { loadExternal, saveExternal } from './store'

/**
 * Jobs added by pasting a URL.
 *
 * Jobright's recommendation feed is the main source, but it does not have
 * everything — and a posting you find yourself still needs tailoring. These are
 * fetched with the same resolver the Tailor form uses (Ashby, Greenhouse,
 * Lever, Workday and LinkedIn have direct handlers; anything else is read as
 * page text and extracted by the model), then shaped into the same JobrightJob
 * the feed produces so they flow through the queue, the board and the
 * tailoring workspace with no special-casing anywhere downstream.
 *
 * Registering them with Jobright happens in the background and is allowed to
 * fail: the job is usable here either way, and a dead session or an unsupported
 * host should not block tailoring something you already have the text for.
 */

/** Synthetic ids are prefixed so a locally-added job is always distinguishable. */
export const EXTERNAL_PREFIX = 'ext:'

export function isExternalId(jobId: string): boolean {
  return jobId.startsWith(EXTERNAL_PREFIX)
}

function toJob(url: string, posting: Awaited<ReturnType<typeof fetchJobPosting>>['data']): JobrightJob {
  return {
    jobId: `${EXTERNAL_PREFIX}${randomUUID()}`,
    title: posting?.role || 'Untitled role',
    company: posting?.company || 'Unknown',
    companyLogo: '',
    industries: [],
    location: posting?.location ?? '',
    workModel: '',
    seniority: '',
    employmentType: '',
    minYearsExperience: null,
    salaryDesc: '',
    minSalary: null,
    maxSalary: null,
    applyUrl: url,
    isCompanySiteLink: true,
    postedDesc: 'Added by you',
    postedAt: Date.now(),
    applicantsDesc: '',
    // No Jobright model has scored this, so there is no fit. Showing 0 would
    // read as "terrible match" rather than "not scored"; null is honest.
    fit: 0,
    fitExact: 0,
    fitRank: 'Added manually',
    fitBreakdown: { experience: null, skills: null, industry: null },
    summary: (posting?.description ?? '').slice(0, 400),
    responsibilities: [],
    requiredSkills: [],
    preferredSkills: [],
    education: [],
    benefits: [],
    skillTags: [],
    h1bSponsor: false,
    isAgency: false,
    citizenOnly: false,
    clearanceRequired: false,
    applyStatus: null,
    appliedAt: null
  }
}

export interface ExternalAddResult {
  ok: boolean
  job?: JobrightJob
  /** The full posting text, so the queue can tailor without re-fetching. */
  description?: string
  error?: string
}

/** Fetch a pasted URL, store it as an External job, and start the Jobright import. */
export async function addExternal(rawUrl: string): Promise<ExternalAddResult> {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'That does not look like a URL.' }

  const existing = loadExternal().find((j) => j.applyUrl === url)
  if (existing) return { ok: true, job: existing, description: '' }

  const fetched = await fetchJobPosting(url)
  if (!fetched.ok || !fetched.data) {
    return { ok: false, error: fetched.error ?? 'Could not read that posting.' }
  }
  const job = toJob(url, fetched.data)
  saveExternal([job, ...loadExternal()])
  void registerWithJobright(job, url)
  return { ok: true, job, description: fetched.data.description }
}

/**
 * Hand the URL to Jobright so the job gets a real id and shows up in their
 * tracking too. Polled because the import is asynchronous on their side.
 * Failure is logged into the record, never thrown: the job already works here.
 */
async function registerWithJobright(job: JobrightJob, url: string): Promise<void> {
  try {
    const { taskId } = await importByUrl(url)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const status = await importStatus(taskId)
      if (status?.jobId) {
        // Adopt Jobright's id so status pushes and the applied list line up.
        const all = loadExternal().map((j) =>
          j.jobId === job.jobId ? { ...j, jobId: status.jobId as string } : j
        )
        saveExternal(all)
        return
      }
      if (status?.status && /fail|error/i.test(status.status)) return
    }
  } catch (e) {
    if (!(e instanceof JobrightAuthError)) return
  }
}

export function listExternal(): JobrightJob[] {
  return loadExternal()
}

export function removeExternal(jobId: string): JobrightJob[] {
  const next = loadExternal().filter((j) => j.jobId !== jobId)
  saveExternal(next)
  return next
}
