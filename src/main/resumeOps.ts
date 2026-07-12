import type { MasterResume, ProjectItem, WorkItem } from '../shared/resume'

/**
 * Pure resume-editing operations. These are the primitives the conversational
 * agent's tools call to mutate the working resume. Everything locates targets by
 * text (company name, exact bullet text) rather than array index, so the agent
 * can't corrupt the wrong line by miscounting. Each returns the new resume plus a
 * short human-readable description of what changed (for the chat transcript).
 */

export interface EditResult {
  resume: MasterResume
  changed: boolean
  description: string
}

function clone(r: MasterResume): MasterResume {
  return structuredClone(r)
}

function findRole(r: MasterResume, company: string): WorkItem | undefined {
  const t = company.trim().toLowerCase()
  return (
    r.work.find((w) => w.company.trim().toLowerCase() === t) ??
    r.work.find((w) => {
      const v = w.company.trim().toLowerCase()
      return v && (v.includes(t) || t.includes(v))
    })
  )
}

export function setSummary(resume: MasterResume, text: string): EditResult {
  const r = clone(resume)
  r.basics.summary = text
  return { resume: r, changed: true, description: 'Updated the summary.' }
}

export function setHeadline(resume: MasterResume, text: string): EditResult {
  const r = clone(resume)
  r.basics.label = text
  return { resume: r, changed: true, description: `Set the headline to "${text}".` }
}

export function retitleRole(resume: MasterResume, company: string, title: string): EditResult {
  const r = clone(resume)
  const w = findRole(r, company)
  if (!w) return { resume, changed: false, description: `No role found matching "${company}".` }
  const old = w.position
  w.position = title
  return { resume: r, changed: true, description: `Retitled ${w.company}: "${old}" → "${title}".` }
}

export function editBullet(
  resume: MasterResume,
  company: string,
  before: string,
  after: string
): EditResult {
  const r = clone(resume)
  const w = findRole(r, company)
  if (!w) return { resume, changed: false, description: `No role found matching "${company}".` }
  const idx = w.highlights.findIndex((h) => h === before || h.includes(before))
  if (idx < 0)
    return { resume, changed: false, description: `Could not find that bullet under ${w.company}.` }
  w.highlights[idx] = after
  return { resume: r, changed: true, description: `Edited a bullet under ${w.company}.` }
}

export function addBullet(resume: MasterResume, company: string, text: string): EditResult {
  const r = clone(resume)
  const w = findRole(r, company)
  if (!w) return { resume, changed: false, description: `No role found matching "${company}".` }
  w.highlights.push(text)
  return { resume: r, changed: true, description: `Added a bullet to ${w.company}.` }
}

export function removeBullet(resume: MasterResume, company: string, match: string): EditResult {
  const r = clone(resume)
  const w = findRole(r, company)
  if (!w) return { resume, changed: false, description: `No role found matching "${company}".` }
  const before = w.highlights.length
  w.highlights = w.highlights.filter((h) => !(h === match || h.includes(match)))
  const changed = w.highlights.length < before
  return {
    resume: changed ? r : resume,
    changed,
    description: changed ? `Removed a bullet from ${w.company}.` : `No matching bullet under ${w.company}.`
  }
}

export function setSkillGroup(
  resume: MasterResume,
  category: string,
  items: string[]
): EditResult {
  const r = clone(resume)
  const g = r.skills.find((s) => s.category.trim().toLowerCase() === category.trim().toLowerCase())
  if (g) {
    g.items = items
    return { resume: r, changed: true, description: `Updated the "${category}" skills.` }
  }
  r.skills.push({ category, items })
  return { resume: r, changed: true, description: `Added a "${category}" skill group.` }
}

/** Replace the tech-tag chips on a role (the keyword tags shown under the title). */
export function setRoleTech(
  resume: MasterResume,
  company: string,
  items: string[]
): EditResult {
  const r = clone(resume)
  const w = findRole(r, company)
  if (!w) return { resume, changed: false, description: `No role found matching "${company}".` }
  w.tech = items
  return { resume: r, changed: true, description: `Updated the tech tags for ${w.company}.` }
}

const CONTACT_FIELDS = ['website', 'linkedin', 'github', 'email', 'phone', 'location'] as const
type ContactField = (typeof CONTACT_FIELDS)[number]

/** Set one header/contact field (website, linkedin, github, email, phone, location). */
export function setContact(resume: MasterResume, field: string, value: string): EditResult {
  const key = field.trim().toLowerCase() as ContactField
  if (!CONTACT_FIELDS.includes(key)) {
    return {
      resume,
      changed: false,
      description: `Unknown contact field "${field}". Use one of: ${CONTACT_FIELDS.join(', ')}.`
    }
  }
  const r = clone(resume)
  r.basics[key] = value
  return { resume: r, changed: true, description: `Set ${key} to "${value}".` }
}

function findProject(r: MasterResume, name: string): ProjectItem | undefined {
  const t = name.trim().toLowerCase()
  return (
    r.projects.find((p) => p.name.trim().toLowerCase() === t) ??
    r.projects.find((p) => {
      const v = p.name.trim().toLowerCase()
      return v && (v.includes(t) || t.includes(v))
    })
  )
}

/** Add a new project. Missing fields default to empty. */
export function addProject(
  resume: MasterResume,
  project: {
    name: string
    description?: string
    tech?: string[]
    url?: string
    highlights?: string[]
  }
): EditResult {
  const r = clone(resume)
  r.projects.push({
    name: project.name,
    description: project.description ?? '',
    highlights: project.highlights ?? [],
    tech: project.tech ?? [],
    url: project.url ?? ''
  })
  return { resume: r, changed: true, description: `Added the project "${project.name}".` }
}

/** Remove a project, matched by name. */
export function removeProject(resume: MasterResume, name: string): EditResult {
  const r = clone(resume)
  const before = r.projects.length
  const t = name.trim().toLowerCase()
  r.projects = r.projects.filter((p) => {
    const v = p.name.trim().toLowerCase()
    return !(v === t || v.includes(t) || t.includes(v))
  })
  const changed = r.projects.length < before
  return {
    resume: changed ? r : resume,
    changed,
    description: changed ? `Removed the project "${name}".` : `No project found matching "${name}".`
  }
}

/** Update fields on an existing project, located by name. Only provided fields change. */
export function editProject(
  resume: MasterResume,
  name: string,
  patch: { name?: string; description?: string; tech?: string[]; url?: string; highlights?: string[] }
): EditResult {
  const r = clone(resume)
  const p = findProject(r, name)
  if (!p) return { resume, changed: false, description: `No project found matching "${name}".` }
  if (patch.name !== undefined) p.name = patch.name
  if (patch.description !== undefined) p.description = patch.description
  if (patch.tech !== undefined) p.tech = patch.tech
  if (patch.url !== undefined) p.url = patch.url
  if (patch.highlights !== undefined) p.highlights = patch.highlights
  return { resume: r, changed: true, description: `Updated the project "${p.name}".` }
}
