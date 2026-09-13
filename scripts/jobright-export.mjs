#!/usr/bin/env node
/**
 * Export Jobright recommendations as a list of posting URLs for the Queue.
 *
 * Reads the Jobright session token from ~/.config/jobright/session (one line),
 * pages through /swan/recommend/list/jobs, applies the filters below, and
 * writes two files to ~/Downloads:
 *   jobright-<date>.md   readable table with score, salary, location, flags
 *   jobright-<date>.txt  one apply URL per line, ready to paste into the Queue
 *
 * Ranking note: the feed is already ranked by Jobright, so page 1 is the best of it.
 * Paging deep pulls in Good/Fair matches, which is why --pages defaults to 3, not 10.
 *
 * Usage: node scripts/jobright-export.mjs [--pages 3] [--min-score 75] [--min-salary 120000]
 *          [--all] [--near-only] [--offline]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const PAGES = Number(arg('pages', 3))
const MIN_SCORE = Number(arg('min-score', 75))
const MIN_SALARY = Number(arg('min-salary', 120000))
const ALL = process.argv.includes('--all')
const NEAR_ONLY = process.argv.includes('--near-only')
const OFFLINE = process.argv.includes('--offline')
const CACHE = join(homedir(), '.config/jobright/last.json')

const session = readFileSync(join(homedir(), '.config/jobright/session'), 'utf8').trim()
const headers = {
  accept: 'application/json',
  'x-client-type': 'web',
  referer: 'https://jobright.ai/jobs/recommend',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  cookie: `SESSION_ID=${session}`
}

let rows = []
const seen = new Set()
if (OFFLINE) {
  rows = JSON.parse(readFileSync(CACHE, 'utf8'))
}
for (let p = 0; p < PAGES && !OFFLINE; p++) {
  const url = `https://jobright.ai/swan/recommend/list/jobs?refresh=${p === 0}&sortCondition=0&position=${p * 20}&count=20&syncRerank=false`
  const res = await fetch(url, { headers })
  if (res.status === 401 || res.status === 403) {
    console.error(`HTTP ${res.status}: session expired. Copy a fresh SESSION_ID cookie into ~/.config/jobright/session`)
    process.exit(1)
  }
  if (!res.ok) { console.error(`HTTP ${res.status} on page ${p}`); break }
  const data = await res.json()
  const list = data?.result?.jobList ?? []
  if (!list.length) break
  for (const it of list) {
    const j = it.jobResult ?? {}, c = it.companyResult ?? {}
    const key = `${(c.companyName ?? '').toLowerCase()}|${(j.jobTitle ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      score: Math.round(it.displayScore ?? 0),
      rank: it.rankDesc ?? '',
      title: j.jobTitle ?? '',
      company: c.companyName ?? '',
      location: j.jobLocation ?? '',
      model: j.workModel ?? (j.isRemote ? 'Remote' : ''),
      seniority: j.jobSeniority ?? '',
      years: j.minYearsOfExperience ?? null,
      salary: j.salaryDesc ?? '',
      minSalary: j.minSalary ?? null,
      maxSalary: j.maxSalary ?? null,
      h1b: !!j.isH1bSponsor,
      h1bFilings: Array.isArray(c.h1bAnnualJobCount) ? c.h1bAnnualJobCount.length : 0,
      agency: !!c.isAgency,
      citizenOnly: !!j.isCitizenOnly,
      clearance: !!j.isClearanceRequired,
      companySite: !!j.isCompanySiteLink,
      url: j.applyLink || j.originalUrl || '',
      posted: j.publishTimeDesc ?? '',
      applicants: j.applicantsDisplayText ?? ''
    })
  }
  await new Promise((r) => setTimeout(r, 400))
}
if (!OFFLINE) writeFileSync(CACHE, JSON.stringify(rows))
// Dedupe here too so cached (pre-dedupe) rows and multi-location reposts collapse to one row.
{
  const byKey = new Map()
  for (const r of rows) {
    const k = `${r.company.toLowerCase()}|${r.title.toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (!byKey.has(k) || (byKey.get(k).score ?? 0) < r.score) byKey.set(k, r)
  }
  rows = [...byKey.values()]
}

const junior = /\b(I|1|intern|new grad|recent grad|entry|junior|associate)\b/i
// Stacks and tracks that are not his: a title naming them means the posting wants that specialty.
const offStack = /\b(java|\.net|c#|php|golang|\bgo\b|ruby|rails|scala|kotlin|swift|c\+\+|embedded|hardware|firmware|security|cyber|research engineer|reseach|data engineer|devops|sre|site reliability|contractor|contract\b|salesforce|sap\b|servicenow|mainframe|cobol)\b/i
// Agency heuristics for companies Jobright does not flag.
const agencyName = /\b(consulting|consultancy|solutions|staffing|technologies|infotech|info ?systems|tech(nologies)? (corp|corporation|llc)|global (solutions|services)|it services|systems inc)\b/i
// An off-stack token is only disqualifying if the title names no stack of his:
// "Full Stack Engineer - Java & React" is a React role, not a Java role.
const onStack = /\b(react|node|typescript|javascript|full ?stack|front ?end|next\.?js)\b/i
const offTrack = (title) => offStack.test(title) && !onStack.test(title)
const remoteOrNear = (r) => r.model === 'Remote' || /\bGA\b|Atlanta|Austin|United States$/.test(r.location)
const reason = (r) => [
  r.agency && 'agency', agencyName.test(r.company) && !r.salary && 'looks like agency',
  r.citizenOnly && 'citizen-only', r.clearance && 'clearance', !r.h1b && 'no H1B signal',
  r.rank === 'Fair Match' && 'fair match',
  r.score < MIN_SCORE && `score ${r.score}`, r.maxSalary && r.maxSalary < MIN_SALARY && `max ${r.salary}`,
  junior.test(r.title.replace(/\bAI\b/g, '')) && 'junior title', offTrack(r.title) && 'off-stack title',
  NEAR_ONLY && !remoteOrNear(r) && `not remote/near (${r.location})`, !r.url && 'no link'
].filter(Boolean)
const keep = ALL ? rows.slice() : rows.filter((r) => reason(r).length === 0)
const tonight = keep.filter((r) => remoteOrNear(r) && (!r.maxSalary || r.maxSalary >= 150000) && r.score >= 85).sort((a, b) => b.score - a.score)
// Remote/near first, then by score. The Queue applies links top-down, so whatever
// leads this list is what actually gets tailored.
keep.sort((a, b) => remoteOrNear(b) - remoteOrNear(a) || b.score - a.score)

const date = new Date().toISOString().slice(0, 10)
const md = [
  `# Jobright recommendations, ${date}`,
  `Fetched ${rows.length} over ${PAGES} page(s), kept ${keep.length} (H1B sponsor, no agency, no citizen-only/clearance, Strong/Good match, score >= ${MIN_SCORE}, max salary >= $${MIN_SALARY / 1000}k, no junior titles${NEAR_ONLY ? ', remote or GA/TX only' : ''}).`,
  'Ordered remote/near first, then by score, matching the order the Queue applies them in.',
  '',
  '| Score | Match | Company | Title | Location | Model | Salary | Posted | Link |',
  '|---|---|---|---|---|---|---|---|---|',
  ...keep.map((r) => `| ${r.score} | ${r.rank || '-'} | ${r.company} | ${r.title} | ${r.location} | ${r.model} | ${r.salary || '-'} | ${r.posted} | [apply](${r.url}) |`),
  '',
  '## Dropped (for reference)',
  ...rows.filter((r) => !keep.includes(r)).map((r) => `- ${r.company}: ${r.title} (${reason(r).join(', ')})`)
].join('\n')
const out = join(homedir(), 'Documents', 'JobRight')
writeFileSync(join(out, `jobright-${date}.md`), md)
writeFileSync(join(out, `jobright-${date}.txt`), keep.map((r) => r.url).join('\n') + '\n')
writeFileSync(join(out, `jobright-${date}-tonight.txt`), tonight.map((r) => r.url).join('\n') + '\n')
console.log(`fetched ${rows.length}, kept ${keep.length}, tonight (remote/GA/TX, $150k+, score>=85): ${tonight.length}`)
console.log(`${out}/jobright-${date}.md, .txt, and -tonight.txt written\n`)
for (const r of tonight) console.log(`${String(r.score).padStart(3)}  ${r.company.padEnd(22).slice(0, 22)} ${r.title.slice(0, 48).padEnd(48)} ${r.location.slice(0, 20).padEnd(20)} ${r.model.padEnd(7)} ${r.salary}`)
