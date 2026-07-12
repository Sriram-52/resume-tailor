import type { MasterResume } from '../shared/resume'

/**
 * All prompts sent to the headless Claude CLI live here. Each is engineered to
 * return ONLY JSON (no prose, no code fence) so runClaudeJson can parse it.
 */

const MASTER_SHAPE = `{
  "basics": { "name", "label", "email", "phone", "location", "website", "linkedin", "github", "summary" },
  "work": [ { "company", "position", "location", "startDate", "endDate", "current": boolean, "highlights": [string], "tech": [string] } ],
  "education": [ { "institution", "area", "studyType", "startDate", "endDate", "gpa", "highlights": [string] } ],
  "skills": [ { "category", "items": [string] } ],
  "projects": [ { "name", "description", "highlights": [string], "tech": [string], "url" } ],
  "certifications": [ { "name", "issuer", "date" } ],
  "publications": [ { "title", "venue", "date", "url", "description" } ]
}`

/** Parse raw resume text into the MasterResume shape. */
export function importPrompt(resumeText: string): string {
  return `You are a resume parser. Convert the resume below into a single JSON object with EXACTLY this shape:

${MASTER_SHAPE}

Rules:
- Output ONLY the JSON object. No markdown, no code fence, no commentary.
- Use "" for any string you cannot find and [] for any missing list. Never invent facts.
- Preserve every accomplishment bullet verbatim under the right role's "highlights".
- Put technologies mentioned per role into that role's "tech".
- Keep the person's real wording; do not embellish.

RESUME:
"""
${resumeText}
"""`
}

/** Tailor the master resume to a specific job description. */
export function tailorPrompt(master: MasterResume, jobDescription: string): string {
  return `You are an expert resume writer. Given a MASTER RESUME (a superset of everything the candidate has done) and a JOB DESCRIPTION, produce a TAILORED resume as a JSON object with the SAME shape as the master.

Goals:
- Select and reorder the most relevant work highlights and projects for THIS job.
- Rewrite bullets to mirror the job description's language and emphasize matching impact, WITHOUT inventing anything. Every claim must trace back to the master.
- Trim the summary to a tight 2-3 sentence pitch aimed at this role.
- Keep 3-6 highlights per recent role; fewer for older roles. Drop irrelevant projects.
- Keep skills that matter for this job first.

Hard rules:
- NEVER fabricate employers, titles, dates, degrees, metrics, or technologies not present in the master.
- Output ONLY the tailored JSON object. Same shape as the master. No markdown, no code fence, no commentary.

MASTER RESUME (JSON):
${JSON.stringify(master)}

JOB DESCRIPTION:
"""
${jobDescription}
"""`
}

/**
 * Propose a list of granular, individually-applyable edits that would raise the
 * ATS match. The user reviews and accepts each one; nothing is applied
 * automatically. Each suggestion targets exactly one bullet, the summary, or a
 * skill group so it can be applied programmatically.
 */
export function suggestPrompt(
  current: MasterResume,
  jobDescription: string,
  missingKeywords: string[],
  instructions?: string
): string {
  const guidance = instructions?.trim()
    ? `

IMPORTANT - the user gave this guidance for THIS round of suggestions. Follow it closely and produce a fresh set accordingly:
"""
${instructions.trim()}
"""`
    : ''

  return `You are helping a candidate improve their resume's match to a job posting. Propose a list of SPECIFIC, GRANULAR changes. Each change edits ONE existing bullet / the summary / a skill group, or ADDS one new bullet or skill. The user will accept or reject each change individually, so keep them independent.${guidance}

Return a JSON object EXACTLY like:
{
  "suggestions": [
    {
      "type": "edit" | "add",
      "section": "summary" | "work" | "project" | "skill" | "title",
      "target": string,     // where it applies: for "work"/"title" the company name EXACTLY as written in the resume; for "project" the project name; for "skill" the skill category; for "summary" use ""
      "before": string,     // for "edit": the EXACT existing text being replaced (for "title", the current job title). For "add" and "summary": ""
      "after": string,      // the proposed new text (for "title", the new job title)
      "keywords": [string], // which posting keywords this change adds/strengthens
      "reason": string      // one short line on why it helps
    }
  ]
}

Guidance:
- Prioritize changes that introduce the posting's important keywords, especially these currently missing ones: ${missingKeywords.join(', ') || '(none flagged)'}.
- For "edit", "before" MUST match an existing string in the resume verbatim so it can be located.
- You may use section "title" to change a job title when it would better match the posting: target = the company to retitle that role, OR target = "" to change the PRIMARY headline shown under the candidate's name at the top of the resume (e.g. "Full Stack Developer"). Put the current title in "before" and the new one in "after".
- Attach every change to an existing role/project/skill group or the summary (do not create new employers or jobs).
- Rewrite in the posting's terminology; make each change concrete and natural.
- Offer 6-14 suggestions covering different keywords and sections so the user has real choice.
- Output ONLY the JSON object. No markdown, no code fence, no commentary.

CURRENT RESUME (JSON):
${JSON.stringify(current)}

JOB DESCRIPTION:
"""
${jobDescription}
"""`
}

/** ATS-style keyword gap analysis. */
export function keywordGapPrompt(master: MasterResume, jobDescription: string): string {
  return `You are an ATS (applicant tracking system) analyst. Compare the candidate's MASTER RESUME against the JOB DESCRIPTION and return a JSON object with EXACTLY this shape:

{
  "matchScore": number (0-100),
  "matched": [string],        // important JD keywords/skills already present in the resume
  "missing": [string],        // important JD keywords/skills absent or weak in the resume
  "terminology": [ { "from": string, "to": string } ],  // resume wording -> JD wording to align
  "notes": [string]           // short, concrete suggestions
}

Rules:
- Focus on hard skills, tools, and role-specific terminology an ATS would key on.
- "missing" should only include things a truthful candidate could reasonably claim or address; flag genuine gaps too.
- Output ONLY the JSON object. No markdown, no code fence, no commentary.

MASTER RESUME (JSON):
${JSON.stringify(master)}

JOB DESCRIPTION:
"""
${jobDescription}
"""`
}

/** Cover letter generation. */
export function coverLetterPrompt(
  master: MasterResume,
  jobDescription: string,
  company: string,
  role: string
): string {
  return `Write a concise, specific cover letter (250-350 words) for ${master.basics.name || 'the candidate'} applying to the ${role || 'role'} at ${company || 'the company'}.

Use only facts present in the MASTER RESUME. Connect the candidate's real experience to the job's needs. Warm but professional; no clichés, no em dashes, no filler like "I am writing to apply". Do not invent metrics or employers.

Return a JSON object EXACTLY like: { "coverLetter": string }
Output ONLY that JSON object. No markdown, no code fence.

MASTER RESUME (JSON):
${JSON.stringify(master)}

JOB DESCRIPTION:
"""
${jobDescription}
"""`
}
