import { app, BrowserWindow, session } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  APPLY_STATUS,
  type FitBreakdown,
  type JobrightApplyStatus,
  type JobrightJob,
  type JobrightStatus,
  type LocalFilter,
  type SavedFilter
} from '../shared/jobright'

/**
 * Client for Jobright's private web endpoints.
 *
 * There is no public API and no API key: the site authenticates with a single
 * `SESSION_ID` cookie. We own that cookie in a dedicated Electron session
 * partition, so signing in is a real login window rather than a token the user
 * pastes, and the cookie rotates on its own like it would in a browser tab.
 *
 * Request pacing is deliberately human-scale (see PAGE_DELAY_MS): this is one
 * person's own account, read the way a tab would read it. Nothing here ever
 * auto-applies.
 */

const ORIGIN = 'https://jobright.ai'
const PARTITION = 'persist:jobright'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
/** Gap between paged requests, matching what a person clicking "next" would produce. */
const PAGE_DELAY_MS = 400
const TIMEOUT_MS = 20000
/** The feed is already ranked, so page 1 is the best of it. Paging deep only adds Fair matches. */
export const DEFAULT_PAGES = 3
const PAGE_SIZE = 20

/**
 * Whether this is the dev build (or an unpackaged `pnpm dev` run).
 *
 * Dev and prod keep separate cookie jars, but both adopt the same
 * ~/.config/jobright/session file, so the dev build ends up signed in as the
 * real account. Reads are harmless and make the dev app actually usable — a
 * throwaway account would have no recommendations and no history. WRITES are
 * the danger, so they are refused here rather than left to discipline.
 */
declare const __APP_VARIANT__: string
const IS_DEV = !app.isPackaged || __APP_VARIANT__ === 'dev'

/** Thrown instead of performing a write, in the dev build. */
export class JobrightDevWriteError extends Error {
  constructor(what: string) {
    super(`Dev build: ${what} was not sent to Jobright. Your real account is untouched.`)
    this.name = 'JobrightDevWriteError'
  }
}

/** Thrown when the session is gone. The renderer turns this into a "Reconnect" banner. */
export class JobrightAuthError extends Error {
  constructor() {
    super('Your Jobright session has expired. Sign in again to refresh the feed.')
    this.name = 'JobrightAuthError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let needsLogin = false

function partition(): Electron.Session {
  return session.fromPartition(PARTITION)
}

/** The session cookie, or null when the user has never signed in (or has been signed out). */
async function sessionId(): Promise<string | null> {
  const jar = await partition().cookies.get({ domain: 'jobright.ai', name: 'SESSION_ID' })
  const value = jar[0]?.value?.trim()
  if (value) return value
  return adoptScriptSession()
}

/**
 * The standalone export script kept its token in ~/.config/jobright/session. If
 * the app has no cookie yet but that file does, adopt it so the first launch
 * after the rebuild is already signed in.
 */
let adopted = false
async function adoptScriptSession(): Promise<string | null> {
  if (adopted) return null
  adopted = true
  const path = join(homedir(), '.config/jobright/session')
  if (!existsSync(path)) return null
  const value = readFileSync(path, 'utf-8').trim()
  if (!value) return null
  try {
    await partition().cookies.set({
      url: ORIGIN,
      name: 'SESSION_ID',
      value,
      domain: 'jobright.ai',
      path: '/',
      secure: true
    })
    return value
  } catch {
    return null
  }
}

async function headers(extra?: Record<string, string>): Promise<Record<string, string>> {
  const sid = await sessionId()
  if (!sid) throw new JobrightAuthError()
  return {
    accept: 'application/json',
    'x-client-type': 'web',
    referer: `${ORIGIN}/jobs/recommend`,
    'user-agent': UA,
    cookie: `SESSION_ID=${sid}`,
    ...extra
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const isPost = init?.body !== undefined
  const res = await fetch(`${ORIGIN}${path}`, {
    method: init?.method ?? (isPost ? 'POST' : 'GET'),
    headers: await headers(isPost ? { 'content-type': 'application/json' } : undefined),
    body: isPost ? JSON.stringify(init?.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 401 || res.status === 403) {
    needsLogin = true
    throw new JobrightAuthError()
  }
  if (!res.ok) throw new Error(`Jobright returned HTTP ${res.status} for ${path}.`)
  needsLogin = false
  const json = (await res.json()) as { result?: T }
  return (json?.result ?? (json as T)) as T
}

// ---- session -------------------------------------------------------------

export async function status(): Promise<JobrightStatus> {
  const sid = await sessionId()
  return {
    connected: !!sid && !needsLogin,
    needsLogin: !sid || needsLogin,
    email: '',
    readOnly: IS_DEV,
    checkedAt: new Date().toISOString()
  }
}

/**
 * Open a real Jobright login window on the app's own session partition and
 * resolve once the site hands us a SESSION_ID. The user types their password
 * into Jobright's page; the app never sees it.
 */
export function login(parent: BrowserWindow | null): Promise<JobrightStatus> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent: parent ?? undefined,
      modal: !!parent,
      title: 'Sign in to Jobright',
      webPreferences: { partition: PARTITION, nodeIntegration: false, contextIsolation: true }
    })
    let settled = false
    const finish = async (): Promise<void> => {
      if (settled) return
      settled = true
      needsLogin = false
      const s = await status()
      if (!win.isDestroyed()) win.close()
      resolve(s)
    }
    // The cookie can land on any navigation in the flow, so poll the jar rather
    // than trying to guess which redirect is the successful one.
    const timer = setInterval(async () => {
      const jar = await partition().cookies.get({ domain: 'jobright.ai', name: 'SESSION_ID' })
      if (jar[0]?.value) {
        clearInterval(timer)
        void finish()
      }
    }, 700)
    win.on('closed', async () => {
      clearInterval(timer)
      if (!settled) {
        settled = true
        resolve(await status())
      }
    })
    void win.loadURL(`${ORIGIN}/jobs/recommend`)
  })
}

export async function signOut(): Promise<JobrightStatus> {
  await partition().clearStorageData({ storages: ['cookies'] })
  needsLogin = true
  return status()
}

// ---- normalisation -------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
/**
 * Coerce one of Jobright's list fields to strings. Most are plain string arrays,
 * but a few carry objects, and a React child that is an object crashes the
 * renderer — so anything object-shaped is reduced to its most label-like field
 * rather than passed through.
 */
const arr = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      if (typeof x === 'string') return x.trim()
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        return str(o.title ?? o.displayName ?? o.name ?? o.companyName ?? o.label)
      }
      return ''
    })
    .filter(Boolean)
}

/** Some fields are a single comma-separated string where a list would be expected. */
const csv = (v: unknown): string[] =>
  typeof v === 'string'
    ? v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : []

/**
 * The three components behind the headline fit score.
 *
 * `recommendationScores` is a LIST of `{featureName, displayName, score}`, not an
 * object keyed by name, and the scores are 0-1 rather than 0-100. Reading it as
 * a map silently yields nothing, which shows up as three dashes on every card.
 */
function breakdown(raw: Record<string, unknown>): FitBreakdown {
  const rows = Array.isArray(raw.recommendationScores)
    ? (raw.recommendationScores as Record<string, unknown>[])
    : []
  const pick = (feature: string): number | null => {
    const hit = rows.find((r) => str(r.featureName) === feature)
    const v = num(hit?.score)
    if (v === null) return null
    return Math.round(v <= 1 ? v * 100 : v)
  }
  return {
    experience: pick('q_seniority_match'),
    skills: pick('q_job_skill_match'),
    industry: pick('q_industry_match')
  }
}

/** One raw `jobList`/`list` entry -> the shape the app uses. Returns null if unusable. */
export function normalize(raw: unknown): JobrightJob | null {
  if (!raw || typeof raw !== 'object') return null
  const it = raw as Record<string, unknown>
  const j = (it.jobResult ?? {}) as Record<string, unknown>
  const c = (it.companyResult ?? {}) as Record<string, unknown>
  const jobId = str(j.jobId) || str(it.impId)
  if (!jobId) return null
  const fitRaw = num(it.displayScore) ?? 0
  const applyStatus = num(it.applyStatus)
  return {
    jobId,
    title: str(j.jobTitle) || str(j.jobNlpTitle),
    company: str(c.companyName),
    companyLogo: str(j.jdLogo) || str(c.companyLogo),
    // `companyCategories` is one comma-separated string; the funding stage is a
    // separate field but reads as another tag on the card.
    industries: [...csv(c.companyCategories), str(c.fundraisingCurrentStage)]
      .filter(Boolean)
      .slice(0, 3),
    location: str(j.jobLocation),
    workModel: str(j.workModel) || (j.isRemote === true ? 'Remote' : ''),
    seniority: str(j.jobSeniority),
    employmentType: str(j.employmentType),
    minYearsExperience: num(j.minYearsOfExperience),
    salaryDesc: str(j.salaryDesc),
    minSalary: num(j.minSalary),
    maxSalary: num(j.maxSalary),
    applyUrl: str(j.applyLink) || str(j.originalUrl),
    isCompanySiteLink: j.isCompanySiteLink === true,
    postedDesc: str(j.publishTimeDesc),
    postedAt: num(j.publishTime),
    applicantsDesc: str(j.applicantsDisplayText),
    fit: Math.round(fitRaw),
    fitRank: str(it.rankDesc),
    fitBreakdown: breakdown(j),
    summary: str(j.jobSummary),
    responsibilities: arr(j.coreResponsibilities),
    requiredSkills: arr(j.skillSummaries),
    preferredSkills: arr(j.detailQualifications ?? j.qualifications),
    education: arr(j.educationSummaries),
    benefits: arr(j.benefitsSummaries),
    skillTags: arr(j.jobTags),
    h1bSponsor: j.isH1bSponsor === true,
    isAgency: c.isAgency === true,
    citizenOnly: j.isCitizenOnly === true,
    clearanceRequired: j.isClearanceRequired === true,
    applyStatus: applyStatus === null ? null : (applyStatus as JobrightApplyStatus),
    appliedAt: num(it.applyTime)
  }
}

// ---- feeds ---------------------------------------------------------------

/**
 * The ranked recommendation feed. Deduped on jobId *and* on company+title, since
 * Jobright reposts the same role across locations as separate records.
 */
export async function listRecommended(pages = DEFAULT_PAGES): Promise<JobrightJob[]> {
  const out: JobrightJob[] = []
  const seen = new Set<string>()
  for (let p = 0; p < pages; p++) {
    const q = new URLSearchParams({
      refresh: String(p === 0),
      sortCondition: '0',
      position: String(p * PAGE_SIZE),
      count: String(PAGE_SIZE),
      syncRerank: 'false'
    })
    const result = await call<{ jobList?: unknown[] }>(`/swan/recommend/list/jobs?${q}`)
    const list = result?.jobList ?? []
    if (!list.length) break
    for (const raw of list) {
      const job = normalize(raw)
      if (!job) continue
      const key = `${job.company.toLowerCase()}|${job.title.toLowerCase().replace(/\s+/g, ' ')}`
      if (seen.has(job.jobId) || seen.has(key)) continue
      seen.add(job.jobId)
      seen.add(key)
      out.push(job)
    }
    if (p < pages - 1) await sleep(PAGE_DELAY_MS)
  }
  return out
}

/**
 * Page through one of the POST list endpoints.
 *
 * Three things about these, all learned the hard way against the live API:
 *
 *  - `pageNum` is IGNORED. Asking for pages 0..39 returns page one forty times
 *    while `hasMore` stays true. The opaque `cursor` is the real pagination.
 *  - The page-size ceiling is undocumented and differs per endpoint, and a
 *    large page also truncates the cursor walk — 20 per page reaches 141
 *    applied records where 100 per page stops at 62.
 *  - So: small pages, follow the cursor, and stop the moment a page adds
 *    nothing new, because `hasMore` cannot be trusted on its own.
 */
async function listPaged(path: string, max: number): Promise<JobrightJob[]> {
  const out: JobrightJob[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; out.length < max; page++) {
    const body: Record<string, unknown> = { pageNum: page, pageSize: PAGE_SIZE }
    if (cursor) body.cursor = cursor
    const result = await call<{ list?: unknown[]; hasMore?: boolean; cursor?: string }>(path, {
      body
    })
    const list = result?.list ?? []
    if (!list.length) break
    const before = seen.size
    for (const raw of list) {
      const job = normalize(raw)
      if (job && !seen.has(job.jobId)) {
        seen.add(job.jobId)
        out.push(job)
      }
    }
    // A page of pure duplicates means the cursor is not advancing; stop rather
    // than trust `hasMore` and spin.
    if (seen.size === before) break
    cursor = result?.cursor
    if (!result?.hasMore || !cursor) break
    await sleep(PAGE_DELAY_MS)
  }
  return out
}

/**
 * Every applied record, paged. This is the backfill source: Jobright's history
 * runs far further back than the app's own, and it owns status truth.
 */
export async function listApplied(max = 600): Promise<JobrightJob[]> {
  return listPaged('/swan/job/applied/jobs-v3', max)
}

// ---- writes --------------------------------------------------------------

export async function ignore(jobId: string): Promise<void> {
  if (IS_DEV) throw new JobrightDevWriteError('hiding this job')
  await call('/swan/job/ignore', { body: { jobId } })
}

/**
 * Mark a job applied on Jobright.
 *
 * This is `/swan/job/apply`, NOT `apply-status/save` — payload captured from
 * their own UI by intercepting the "Already Applied" menu item. The two are not
 * interchangeable: `apply` is what puts a job into the applied list in the first
 * place, while `apply-status/save` only moves a job ALREADY in that list between
 * Applied / Interviewing / Offer / Rejected / Archived. Calling the latter on a
 * job Jobright has never seen as applied does nothing, which is exactly how
 * every "mark as applied" silently failed to sync.
 *
 * `source: 0` is what their UI sends for a self-reported apply.
 */
export async function markApplied(jobId: string): Promise<void> {
  if (IS_DEV) throw new JobrightDevWriteError('marking this applied')
  await call('/swan/job/apply', { body: { jobId, source: 0 } })
}

/**
 * Move a job's status on Jobright. The app owns only the local `draft` state;
 * everything from Applied onwards is written here so the two sides reconcile.
 *
 * A job has to be in the applied list before its status can be moved, so this
 * always registers the apply first. That call is idempotent for a job already
 * applied, which is cheaper than asking whether it is.
 */
export async function setApplyStatus(
  jobId: string,
  applyStatus: JobrightApplyStatus
): Promise<void> {
  if (IS_DEV) throw new JobrightDevWriteError('the status change')
  await markApplied(jobId)
  if (applyStatus === APPLY_STATUS.applied) return
  await call('/swan/job/apply-status/save', { body: { jobId, applyStatus } })
}

/**
 * Push an arbitrary posting URL into Jobright so it gets a jobId, a fit score
 * and status tracking. This is how Dice leads enter the app: there is then only
 * one identity space and one tracker.
 */
export async function importByUrl(url: string): Promise<{ taskId: string }> {
  if (IS_DEV) throw new JobrightDevWriteError('importing this posting')
  return call<{ taskId: string }>('/swan/import/job-by-url', { body: { url } })
}

export async function importStatus(taskId: string): Promise<{ status: string; jobId?: string }> {
  return call(`/swan/import/job-by-url/status?taskId=${encodeURIComponent(taskId)}`)
}

// ---- saved filter --------------------------------------------------------

export async function listSavedFilters(): Promise<SavedFilter[]> {
  const result = await call<SavedFilter[] | { filterList?: SavedFilter[] }>('/swan/filter/saved/list')
  if (Array.isArray(result)) return result
  return result?.filterList ?? []
}

export async function createSavedFilter(f: SavedFilter): Promise<void> {
  if (IS_DEV) throw new JobrightDevWriteError('the feed filter')
  await call('/swan/filter/saved/create', { body: f })
}

// ---- local filtering -----------------------------------------------------

/**
 * The two rules Jobright's saved filter cannot express. Everything else
 * (salary, H1B, agency, clearance, citizenship, excluded titles/companies,
 * seniority, work model, recency) is pushed server-side instead.
 */
export function applyLocalFilter(jobs: JobrightJob[], f: LocalFilter): JobrightJob[] {
  const near = (j: JobrightJob): boolean =>
    /remote/i.test(j.workModel) ||
    f.nearStates.some((s) => new RegExp(`\\b${s}\\b`, 'i').test(j.location)) ||
    /United States$/.test(j.location)
  return jobs.filter((j) => j.fit >= f.minFit && (!f.nearOnly || near(j)))
}
