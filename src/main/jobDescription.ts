import type { JobrightJob } from '../shared/jobright'
import { fetchJobPosting } from './jobFetch'

/**
 * Producing the text we tailor against.
 *
 * Jobright has no raw job description anywhere — it stores an LLM-structured
 * version (summary, responsibilities, required/preferred skills, benefits,
 * skill tags). That structure is always available and costs no extra request,
 * so it is the floor.
 *
 * The employer's own wording still matters for keyword matching, so we also try
 * the apply link. About half of those fetches fail — ZipRecruiter 403s, Workday
 * and Oracle render with JavaScript, some boards time out — and that used to
 * fail the whole queue item. Now it just means we tailor from the structure
 * alone and say so.
 */

export type JdSource = 'posting' | 'jobright'

export interface AssembledJd {
  text: string
  source: JdSource
  /** Set when the posting fetch failed, for display on the queue row. */
  note: string
}

function section(heading: string, lines: string[]): string {
  if (!lines.length) return ''
  return `${heading}\n${lines.map((l) => `- ${l}`).join('\n')}\n`
}

/** The structured description, rendered as plain text a model can tailor against. */
export function structuredJd(job: JobrightJob): string {
  const head = [
    `${job.title} at ${job.company}`,
    [job.location, job.workModel, job.employmentType, job.seniority].filter(Boolean).join(' · '),
    job.salaryDesc,
    job.minYearsExperience ? `${job.minYearsExperience}+ years experience` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return [
    head,
    '',
    job.summary,
    '',
    section('Responsibilities', job.responsibilities),
    section('Required', job.requiredSkills),
    section('Preferred', job.preferredSkills),
    section('Education', job.education),
    section('Benefits', job.benefits),
    job.skillTags.length ? `Skills: ${job.skillTags.join(', ')}` : ''
  ]
    .filter((s) => s !== '')
    .join('\n')
    .trim()
}

/**
 * Structured description always; the employer's own posting text on top when the
 * apply link can actually be read. Never throws and never returns empty.
 */
export async function assembleJd(job: JobrightJob): Promise<AssembledJd> {
  const structured = structuredJd(job)
  if (!job.applyUrl) {
    return { text: structured, source: 'jobright', note: 'No apply link on the posting.' }
  }
  try {
    const fetched = await fetchJobPosting(job.applyUrl)
    if (fetched.ok && fetched.data?.description?.trim()) {
      return {
        text: `${structured}\n\n--- Full posting as published ---\n\n${fetched.data.description.trim()}`,
        source: 'posting',
        note: ''
      }
    }
    return {
      text: structured,
      source: 'jobright',
      note: fetched.error ?? 'The posting page could not be read.'
    }
  } catch (e) {
    return {
      text: structured,
      source: 'jobright',
      note: e instanceof Error ? e.message : 'The posting page could not be read.'
    }
  }
}
