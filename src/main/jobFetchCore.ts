import type { JobPosting } from '../shared/jobPosting'

/**
 * Turn a job-posting URL into either a fully structured posting (when the URL
 * belongs to a job board with a public API) or the page's readable text (for
 * the model to extract from). Pure network + parsing: no Electron, no LLM.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const TIMEOUT_MS = 20000
/** Pages shorter than this after stripping are almost always a JS shell or a login wall. */
const MIN_PAGE_TEXT = 400
/** Cap what we hand to the model. */
const MAX_TEXT = 40000

export type FetchedSource =
  | { kind: 'posting'; posting: JobPosting }
  | { kind: 'text'; text: string; url: string }

export type FetchResult = { ok: true; value: FetchedSource } | { ok: false; error: string }

/** Minimal HTML -> readable text. Good enough for job postings. */
export function htmlToText(h: string): string {
  return h
    .replace(/<(script|style|noscript|svg|nav|header|footer|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/tr|\/section|\/article)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function titleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

async function getText(url: string, accept = 'text/html,*/*'): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: ctrl.signal
    })
  } finally {
    clearTimeout(t)
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await getText(url, 'application/json')
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ---- Ashby: https://jobs.ashbyhq.com/<slug>/<jobId> -------------------------
interface AshbyJob {
  id: string
  title: string
  location?: string
  isRemote?: boolean
  descriptionHtml?: string
  descriptionPlain?: string
}
async function fromAshby(slug: string, jobId: string): Promise<JobPosting | null> {
  const d = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`
  )
  const j = d?.jobs?.find((x) => x.id === jobId)
  if (!j) return null
  const loc = [j.location, j.isRemote ? 'Remote' : ''].filter(Boolean).join(' · ')
  return {
    company: titleCase(slug),
    role: j.title,
    location: loc,
    description: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml ?? ''),
    source: 'ashby'
  }
}

// ---- Greenhouse: (job-)boards.greenhouse.io/<slug>/jobs/<id>, or ?gh_jid=<id> on a custom domain
interface GhJob {
  title: string
  location?: { name?: string }
  content?: string
}
async function fromGreenhouse(slug: string, jobId: string): Promise<JobPosting | null> {
  const [job, board] = await Promise.all([
    getJson<GhJob>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${jobId}`
    ),
    getJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`)
  ])
  if (!job?.title) return null
  // Greenhouse returns the body as HTML-escaped HTML.
  const unescaped = htmlToText(job.content ?? '')
  const description = /<[a-z][\s\S]*>/i.test(unescaped) ? htmlToText(unescaped) : unescaped
  return {
    company: board?.name?.trim() || titleCase(slug),
    role: job.title,
    location: job.location?.name ?? '',
    description,
    source: 'greenhouse'
  }
}

/**
 * Lever's API has no company field, but the hosted page's <title> is
 * "<Company> - <Role>". Best effort; null falls back to the slug.
 */
async function leverCompanyName(slug: string, jobId: string): Promise<string | null> {
  try {
    const res = await getText(`https://jobs.lever.co/${encodeURIComponent(slug)}/${jobId}`)
    if (!res.ok) return null
    const title = (await res.text()).match(/<title>([^<]+)<\/title>/i)?.[1] ?? ''
    const company = htmlToText(title).split(' - ')[0]?.trim()
    return company && company.length < 80 ? company : null
  } catch {
    return null
  }
}

// ---- Lever: https://jobs.lever.co/<slug>/<id> -------------------------------
interface LeverJob {
  text: string
  categories?: { location?: string; commitment?: string; team?: string }
  descriptionPlain?: string
  lists?: { text: string; content: string }[]
  additionalPlain?: string
  workplaceType?: string
}
async function fromLever(slug: string, jobId: string): Promise<JobPosting | null> {
  const [j, company] = await Promise.all([
    getJson<LeverJob>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${jobId}`),
    leverCompanyName(slug, jobId)
  ])
  if (!j?.text) return null
  const parts = [j.descriptionPlain ?? '']
  for (const l of j.lists ?? []) parts.push(`${l.text}\n${htmlToText(l.content)}`)
  if (j.additionalPlain) parts.push(j.additionalPlain)
  return {
    company: company ?? titleCase(slug),
    role: j.text,
    location: [j.categories?.location, j.workplaceType].filter(Boolean).join(' · '),
    description: parts.filter(Boolean).join('\n\n').trim(),
    source: 'lever'
  }
}

// ---- LinkedIn: /jobs/view/<id> has a guest endpoint that needs no login ------
async function fromLinkedIn(jobId: string): Promise<string | null> {
  try {
    const res = await getText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`)
    if (!res.ok) return null
    const text = htmlToText(await res.text())
    return text.length >= MIN_PAGE_TEXT ? text : null
  } catch {
    return null
  }
}

/**
 * Candidate Greenhouse board slugs for a custom-domain careers page that uses
 * `?gh_jid=`. The embed script usually names the board; when the page renders
 * client-side and the HTML is bare, fall back to guesses from the hostname
 * (suki.ai -> suki, sukiai; hioscar.com -> hioscar, oscar).
 */
function greenhouseSlugCandidates(html: string, host: string): string[] {
  const out: string[] = []
  const m =
    html.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\/js\?for=|embed\/job_app\?for=)([a-z0-9_-]+)/i) ??
    html.match(/job-boards\.greenhouse\.io\/([a-z0-9_-]+)\//i)
  if (m?.[1]) out.push(m[1].toLowerCase())
  const parts = host.replace(/^(www|careers|jobs|boards)\./, '').split('.')
  const base = parts[0] ?? ''
  const tld = parts.slice(1).join('')
  for (const c of [base, base + tld, base.replace(/^(hi|get|join|try|use)/, '')]) {
    if (c && c.length >= 3 && !out.includes(c)) out.push(c)
  }
  return out
}

export async function fetchJobSource(rawUrl: string): Promise<FetchResult> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error('bad protocol')
  } catch {
    return { ok: false, error: 'That does not look like a valid http(s) URL.' }
  }
  const host = url.hostname.toLowerCase()
  const segs = url.pathname.split('/').filter(Boolean)

  try {
    // Job-board APIs first: structured, fast, no model call.
    if (host === 'jobs.ashbyhq.com' && segs.length >= 2) {
      const p = await fromAshby(segs[0], segs[1])
      if (p) return { ok: true, value: { kind: 'posting', posting: p } }
    }
    if (/^(job-)?boards\.greenhouse\.io$/.test(host) && segs[1] === 'jobs' && segs[2]) {
      const p = await fromGreenhouse(segs[0], segs[2])
      if (p) return { ok: true, value: { kind: 'posting', posting: p } }
    }
    if (host === 'jobs.lever.co' && segs.length >= 2) {
      const p = await fromLever(segs[0], segs[1])
      if (p) return { ok: true, value: { kind: 'posting', posting: p } }
    }
    if (/(^|\.)linkedin\.com$/.test(host)) {
      const id = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1] ?? url.searchParams.get('currentJobId')
      if (id) {
        const text = await fromLinkedIn(id)
        if (text) return { ok: true, value: { kind: 'text', text: text.slice(0, MAX_TEXT), url: rawUrl } }
      }
      return {
        ok: false,
        error: 'LinkedIn would not serve this posting without a login. Copy the description and paste it instead.'
      }
    }

    // Generic page.
    const res = await getText(url.toString())
    if (!res.ok) {
      return { ok: false, error: `The page returned HTTP ${res.status}. Paste the description instead.` }
    }
    const html = await res.text()

    // Custom-domain Greenhouse embeds (?gh_jid=123) point back at a board slug.
    const ghJid = url.searchParams.get('gh_jid')
    if (ghJid) {
      for (const slug of greenhouseSlugCandidates(html, host)) {
        const p = await fromGreenhouse(slug, ghJid)
        if (p) return { ok: true, value: { kind: 'posting', posting: p } }
      }
    }

    const text = htmlToText(html)
    if (text.length < MIN_PAGE_TEXT) {
      return {
        ok: false,
        error:
          'The page has almost no readable text, so it probably renders with JavaScript or needs a login. Paste the description instead.'
      }
    }
    return { ok: true, value: { kind: 'text', text: text.slice(0, MAX_TEXT), url: rawUrl } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: /abort/i.test(msg) ? 'Timed out fetching the page.' : `Could not fetch the page: ${msg}`
    }
  }
}
