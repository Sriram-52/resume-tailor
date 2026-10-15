import { randomUUID } from 'crypto'
import type { Application, ApplicationStatus } from '../shared/application'
import { emptyMaster } from '../shared/resume'
import { JOBRIGHT_TO_STATUS, STATUS_TO_JOBRIGHT, type JobrightJob } from '../shared/jobright'
import { listApplied, setApplyStatus } from './jobright'
import { structuredJd } from './jobDescription'
import { loadApplications, saveApplications } from './store'
import type { BackfillResult } from '../shared/ipc'

/**
 * Reconciling the board with Jobright.
 *
 * Jobright owns everything from Applied onwards; the app owns only `draft`
 * (tailored, not yet sent), which is never pushed. Their history runs years
 * further back than the app's, so the board would be lying if it showed only
 * what this app happened to tailor.
 */

/** Same identity rule the export script used, for records with no jobId yet. */
function titleKey(company: string, role: string): string {
  return `${company.toLowerCase().trim()}|${role.toLowerCase().replace(/\s+/g, ' ').trim()}`
}

/** Drop tracking params so two spellings of one apply link match. */
function urlKey(raw?: string): string {
  if (!raw) return ''
  try {
    const u = new URL(raw)
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|src$|gh_src$|lever-source$)/i.test(k)) u.searchParams.delete(k)
    }
    u.hash = ''
    u.pathname = u.pathname.replace(/\/+$/, '')
    return u.toString().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

/** A Jobright applied record with no local counterpart, as a history-only Application. */
function historyRecord(job: JobrightJob): Application {
  return {
    id: randomUUID(),
    jobId: job.jobId,
    fit: job.fit,
    source: 'jobright',
    workModel: job.workModel || undefined,
    location: job.location || undefined,
    company: job.company || 'Unknown',
    role: job.title || 'Unknown',
    createdAt: new Date(job.appliedAt ?? Date.now()).toISOString(),
    status: (JOBRIGHT_TO_STATUS[job.applyStatus ?? 0] ?? 'applied') as ApplicationStatus,
    jobUrl: job.applyUrl,
    jobDescription: structuredJd(job),
    tailored: emptyMaster(),
    keywordGap: null,
    coverLetter: null,
    template: 'classic',
    files: {},
    notes: job.location ? `Location: ${job.location}` : ''
  }
}

/**
 * Pull every applied record from Jobright and reconcile it with the local board:
 * adopt their status on matched records, and create history-only records for the
 * rest. Records with no tailoring simply have no ATS score, which is itself
 * useful to see.
 */
export async function backfillFromJobright(): Promise<BackfillResult> {
  const remote = await listApplied()
  const local = loadApplications()

  const byJobId = new Map<string, Application>()
  const byUrl = new Map<string, Application>()
  const byTitle = new Map<string, Application>()
  for (const a of local) {
    if (a.jobId) byJobId.set(a.jobId, a)
    const u = urlKey(a.jobUrl)
    if (u) byUrl.set(u, a)
    byTitle.set(titleKey(a.company, a.role), a)
  }

  let matched = 0
  let created = 0
  let statusUpdated = 0
  const additions: Application[] = []

  for (const job of remote) {
    const hit =
      byJobId.get(job.jobId) ??
      byUrl.get(urlKey(job.applyUrl)) ??
      byTitle.get(titleKey(job.company, job.title))
    if (hit) {
      matched++
      // Adopt Jobright's identity and status; never overwrite a local draft.
      if (!hit.jobId) hit.jobId = job.jobId
      if (hit.fit == null) hit.fit = job.fit
      const remoteStatus = JOBRIGHT_TO_STATUS[job.applyStatus ?? 0] as ApplicationStatus | undefined
      if (remoteStatus && hit.status !== 'draft' && hit.status !== remoteStatus) {
        hit.status = remoteStatus
        statusUpdated++
      }
      continue
    }
    additions.push(historyRecord(job))
    created++
  }

  if (additions.length || matched) {
    // Newest first, matching how the board and the tracker already order things.
    const merged = [...local, ...additions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    saveApplications(merged)
  }
  return { fetched: remote.length, matched, created, statusUpdated }
}

/**
 * Push a board move to Jobright. `draft` is local-only, so moving *into* it
 * pushes nothing; moving out of it is what actually marks the job applied.
 */
export async function pushStatus(app: Application, status: ApplicationStatus): Promise<boolean> {
  const remote = STATUS_TO_JOBRIGHT[status]
  if (!app.jobId || remote === undefined) return false
  await setApplyStatus(app.jobId, remote)
  return true
}
