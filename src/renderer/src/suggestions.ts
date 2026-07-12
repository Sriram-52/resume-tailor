import type { MasterResume } from '../../shared/resume'
import type { Suggestion } from '../../shared/application'

/**
 * Apply a set of accepted suggestions to a resume, returning a new resume.
 * Locations are matched by text (company/project name, exact "before" bullet)
 * rather than array indices, so a miscount by the model can't corrupt the wrong
 * line. A suggestion that can't be located is skipped silently.
 */

function findByName<T extends { company?: string; name?: string }>(
  list: T[],
  target: string,
  key: 'company' | 'name'
): T | undefined {
  const t = target.trim().toLowerCase()
  return (
    list.find((x) => (x[key] ?? '').trim().toLowerCase() === t) ??
    list.find((x) => {
      const v = (x[key] ?? '').trim().toLowerCase()
      return v && (v.includes(t) || t.includes(v))
    })
  )
}

export function applySuggestions(resume: MasterResume, accepted: Suggestion[]): MasterResume {
  const r: MasterResume = structuredClone(resume)

  for (const s of accepted) {
    if (s.section === 'summary') {
      if (s.after.trim()) r.basics.summary = s.after
      continue
    }

    if (s.section === 'title') {
      if (!s.after.trim()) continue
      if (!s.target.trim()) {
        // No target => the primary headline under the candidate's name.
        r.basics.label = s.after
      } else {
        const w = findByName(r.work, s.target, 'company')
        if (w) w.position = s.after
      }
      continue
    }

    if (s.section === 'work') {
      const w = findByName(r.work, s.target, 'company')
      if (!w) continue
      if (s.type === 'edit' && s.before) {
        const idx = w.highlights.findIndex((h) => h === s.before)
        if (idx >= 0) w.highlights[idx] = s.after
        else w.highlights.push(s.after)
      } else {
        w.highlights.push(s.after)
      }
      continue
    }

    if (s.section === 'project') {
      const p = findByName(r.projects, s.target, 'name')
      if (!p) continue
      if (s.type === 'edit' && s.before) {
        const idx = p.highlights.findIndex((h) => h === s.before)
        if (idx >= 0) p.highlights[idx] = s.after
        else p.highlights.push(s.after)
      } else {
        p.highlights.push(s.after)
      }
      continue
    }

    if (s.section === 'skill') {
      const items = s.after
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      const group = r.skills.find(
        (g) => g.category.trim().toLowerCase() === s.target.trim().toLowerCase()
      )
      if (group) {
        for (const it of items) if (!group.items.includes(it)) group.items.push(it)
      } else {
        r.skills.push({ category: s.target || 'Skills', items })
      }
    }
  }

  return r
}
