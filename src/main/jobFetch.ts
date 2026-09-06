import type { JobPosting } from '../shared/jobPosting'
import { fetchJobSource } from './jobFetchCore'
import { runClaudeJson } from './claude'
import { jobExtractPrompt } from './prompts'
import { getTailorModel } from './config'

/**
 * Resolve a job URL into the fields the Tailor form needs. Job-board APIs give
 * us structured data directly; anything else is fetched as text and the model
 * extracts company, role, location, and the cleaned description.
 */
export async function fetchJobPosting(
  url: string
): Promise<{ ok: boolean; data?: JobPosting; error?: string }> {
  const src = await fetchJobSource(url)
  if (!src.ok) return { ok: false, error: src.error }
  if (src.value.kind === 'posting') return { ok: true, data: src.value.posting }

  const r = await runClaudeJson<Omit<JobPosting, 'source'>>(
    jobExtractPrompt(src.value.text, src.value.url),
    { model: getTailorModel(), kind: 'jobfetch', timeoutMs: 120000 }
  )
  if (!r.ok || !r.data) return { ok: false, error: r.error ?? 'Could not read the posting.' }
  const d = r.data
  if (!d.description?.trim()) {
    return { ok: false, error: 'The page did not contain a job description I could find. Paste it instead.' }
  }
  return {
    ok: true,
    data: {
      company: d.company?.trim() ?? '',
      role: d.role?.trim() ?? '',
      location: d.location?.trim() ?? '',
      description: d.description.trim(),
      source: /linkedin\.com/i.test(src.value.url) ? 'linkedin' : 'page'
    }
  }
}
