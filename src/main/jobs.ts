import type { MasterResume } from '../shared/resume'
import type { EmploymentType, JobLead, JobSearchFilters } from '../shared/jobs'
import { getApifyToken } from './config'
import { runClaudeJson } from './claude'
import { scoreJobsPrompt } from './prompts'

/**
 * Job discovery via Apify's Dice.com scraper.
 *
 * Dice is the highest-signal board for US tech *contract* work. The actor
 * (`easyapi/dice-com-job-scraper`, pay-per-result) takes a Dice search URL with
 * filters baked into query params and returns full postings — including the job
 * description — so a result can be tailored to without a second fetch.
 */

const ACTOR = 'easyapi~dice-com-job-scraper'
const RUN_SYNC = (token: string): string =>
  `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`

/** Map "posted within N days" to Dice's postedDate token. Omitted for "any". */
function postedDateToken(days: number): string | undefined {
  if (days <= 1) return 'ONE'
  if (days <= 3) return 'THREE'
  if (days <= 7) return 'SEVEN'
  return undefined // any date
}

/** Dice employment-type tokens for each filter value ('any' omits the filter). */
const EMPLOYMENT_TOKEN: Record<EmploymentType, string | undefined> = {
  contract: 'CONTRACTS|THIRD_PARTY', // contract + C2C
  fulltime: 'FULLTIME',
  parttime: 'PARTTIME',
  any: undefined
}

/** Build a Dice.com search URL from the filters. */
export function buildDiceSearchUrl(filters: JobSearchFilters): string {
  const p = new URLSearchParams()
  if (filters.keywords.trim()) p.set('q', filters.keywords.trim())
  if (filters.location.trim()) p.set('location', filters.location.trim())
  const employment = EMPLOYMENT_TOKEN[filters.employmentType]
  if (employment) p.set('filters.employmentType', employment)
  if (filters.remote) p.set('filters.workplaceTypes', 'Remote')
  const posted = postedDateToken(filters.postedWithinDays)
  if (posted) p.set('filters.postedDate', posted)
  return `https://www.dice.com/jobs?${p.toString()}`
}

/** Read the first present key from a loosely-typed scraper record. */
function pick(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

function toBool(o: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return /remote|true|yes/i.test(v)
  }
  return false
}

/** Normalize one raw scraper item into a JobLead (field names vary by actor). */
function normalize(raw: unknown): JobLead | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = pick(o, 'detailsPageUrl', 'url', 'jobUrl', 'link')
  const title = pick(o, 'title', 'jobTitle')
  if (!title && !url) return null
  const description = pick(o, 'description', 'descriptionHtml', 'summary', 'jobDescription')
  return {
    id: pick(o, 'jobId', 'id') || url || title,
    title,
    company: pick(o, 'company', 'companyName', 'employer'),
    location: pick(o, 'location', 'jobLocation'),
    remote: toBool(o, 'isRemote', 'workFromHomeAvailability') || /remote/i.test(pick(o, 'workplaceTypes', 'location')),
    salary: pick(o, 'salary', 'salaryRaw', 'compensation'),
    url,
    logo: pick(o, 'companyLogo', 'companyLogoUrl', 'logo', 'companyImage'),
    postedDate: pick(o, 'postDate', 'datePosted', 'postedDate', 'modifiedDate'),
    description,
    employerType: pick(o, 'employerType', 'jobType', 'contractType')
  }
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

/** Convert the JSON-LD description HTML to readable plain text. */
function htmlToText(h: string): string {
  return h
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/tr)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/**
 * The Apify Dice actor only returns a short listing snippet. The full job
 * description lives in the detail page's JSON-LD (JobPosting.description), which
 * is in the server-rendered HTML — so a plain fetch retrieves it. Returns the
 * full description text, or null if unavailable.
 */
async function fetchDiceDescription(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    const html = await res.text()
    const blocks = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
    )
    for (const b of blocks) {
      try {
        const parsed = JSON.parse(b[1])
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const o of arr) {
          if (o && o['@type'] === 'JobPosting' && typeof o.description === 'string') {
            return htmlToText(o.description)
          }
        }
      } catch {
        /* skip a malformed block */
      }
    }
    return null
  } catch {
    return null
  }
}

/** Enrich leads in place with full job descriptions, fetched with limited concurrency. */
async function enrichDescriptions(leads: JobLead[]): Promise<void> {
  const CONCURRENCY = 6
  let next = 0
  async function worker(): Promise<void> {
    while (next < leads.length) {
      const l = leads[next++]
      if (!l.url) continue
      const full = await fetchDiceDescription(l.url)
      if (full && full.length > l.description.length) l.description = full
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, leads.length) }, worker))
}

/** Drop obvious agency reposts: same title+company kept once (Phase 1 dedupe). */
function dedupe(leads: JobLead[]): JobLead[] {
  const seen = new Set<string>()
  const out: JobLead[] = []
  for (const l of leads) {
    const key = `${l.title}::${l.company}`.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out
}

export interface JobSearchResult {
  ok: boolean
  data?: JobLead[]
  error?: string
}

/** Run a contract-job search on Dice via Apify and return normalized leads. */
export async function searchDice(filters: JobSearchFilters): Promise<JobSearchResult> {
  const token = getApifyToken()
  if (!token) {
    return { ok: false, error: 'No Apify token. Add APIFY_TOKEN to your .env, then restart the app.' }
  }
  const searchUrl = buildDiceSearchUrl(filters)
  const maxResults = Math.max(1, Math.min(filters.maxResults || 30, 200))

  try {
    const res = await fetch(RUN_SYNC(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchUrl, maxResults }),
      // The actor runs server-side; run-sync waits for it. Give it room.
      signal: AbortSignal.timeout(180_000)
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 401) return { ok: false, error: 'Apify rejected the token (401). Check APIFY_TOKEN.' }
      return { ok: false, error: `Apify returned ${res.status}. ${body.slice(0, 200)}` }
    }
    const items = (await res.json()) as unknown
    if (!Array.isArray(items)) return { ok: false, error: 'Unexpected response from Apify.' }
    const leads = dedupe(items.map(normalize).filter((l): l is JobLead => l !== null))
    // The actor only returns a short snippet; pull the full JD from each detail
    // page (JSON-LD) so scoring and tailoring have the real description.
    await enrichDescriptions(leads)
    return { ok: true, data: leads }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: /timeout|aborted/i.test(msg)
        ? 'The search took too long and timed out. Try fewer results or narrower filters.'
        : `Search failed: ${msg}`
    }
  }
}

const clampScore = (n: unknown): number =>
  typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0

/**
 * ATS-style fit scoring of the active resume against each lead, in one Claude
 * call. Returns the leads with fitScore/matchReason filled in, sorted best-first.
 */
export async function scoreJobLeads(
  resume: MasterResume,
  leads: JobLead[]
): Promise<JobSearchResult> {
  if (!leads.length) return { ok: true, data: [] }
  const jobs = leads.map((l) => ({
    id: l.id,
    title: l.title,
    company: l.company,
    jd: (l.description || '').replace(/\s+/g, ' ').slice(0, 1500)
  }))
  const r = await runClaudeJson<{
    scores: { id: string; fitScore: number; matchReason: string }[]
  }>(scoreJobsPrompt(resume, jobs), { model: process.env.TAILOR_MODEL })
  if (!r.ok || !r.data?.scores) return { ok: false, error: r.error ?? 'Scoring failed.' }

  const byId = new Map(r.data.scores.map((s) => [String(s.id), s]))
  const scored = leads.map((l) => {
    const s = byId.get(l.id)
    return s ? { ...l, fitScore: clampScore(s.fitScore), matchReason: s.matchReason } : l
  })
  scored.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1))
  return { ok: true, data: scored }
}
