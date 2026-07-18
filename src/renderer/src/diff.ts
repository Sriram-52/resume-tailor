import type { MasterResume } from '../../shared/resume'

/**
 * Structural diff between the base (master) resume and the tailored/edited one.
 * Everything is computed in the renderer from data already in memory — no
 * backend, no dependencies. Changed prose (summary, bullets) gets a word-level
 * diff; bullets are paired by similarity so a reword shows as one inline change
 * rather than a separate add + remove.
 */

export interface Token {
  t: 'same' | 'add' | 'del'
  s: string
}

const tokenize = (s: string): string[] => (s ?? '').split(/(\s+)/).filter((x) => x !== '')

/** Word-level diff of two strings (LCS). */
export function wordDiff(oldStr: string, newStr: string): Token[] {
  const o = tokenize(oldStr)
  const n = tokenize(newStr)
  const m = o.length
  const k = n.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = k - 1; j >= 0; j--) {
      dp[i][j] = o[i] === n[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: Token[] = []
  let i = 0
  let j = 0
  while (i < m && j < k) {
    if (o[i] === n[j]) {
      out.push({ t: 'same', s: o[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: 'del', s: o[i] })
      i++
    } else {
      out.push({ t: 'add', s: n[j] })
      j++
    }
  }
  while (i < m) out.push({ t: 'del', s: o[i++] })
  while (j < k) out.push({ t: 'add', s: n[j++] })
  // Merge adjacent tokens of the same type for cleaner rendering.
  const merged: Token[] = []
  for (const t of out) {
    const last = merged[merged.length - 1]
    if (last && last.t === t.t) last.s += t.s
    else merged.push({ ...t })
  }
  return merged
}

const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
function similarity(a: string, b: string): number {
  const wa = new Set(words(a))
  const wb = new Set(words(b))
  if (!wa.size || !wb.size) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

export interface BulletDiff {
  unchanged: number
  changed: { tokens: Token[] }[]
  added: string[]
  removed: string[]
}

/** Diff two bullet lists: exact matches drop out, close matches pair as reworded. */
function diffBullets(base: string[], tailored: string[]): BulletDiff {
  const b = base.filter(Boolean).slice()
  const t = tailored.filter(Boolean).slice()
  let unchanged = 0

  // 1) Remove exact matches.
  for (let i = b.length - 1; i >= 0; i--) {
    const j = t.indexOf(b[i])
    if (j >= 0) {
      unchanged++
      b.splice(i, 1)
      t.splice(j, 1)
    }
  }

  // 2) Greedily pair remaining by similarity (reworded bullets).
  const changed: { tokens: Token[] }[] = []
  const pairs: { bi: number; ti: number; sim: number }[] = []
  for (let bi = 0; bi < b.length; bi++) {
    for (let ti = 0; ti < t.length; ti++) {
      pairs.push({ bi, ti, sim: similarity(b[bi], t[ti]) })
    }
  }
  pairs.sort((x, y) => y.sim - x.sim)
  const usedB = new Set<number>()
  const usedT = new Set<number>()
  for (const p of pairs) {
    if (p.sim < 0.4) break
    if (usedB.has(p.bi) || usedT.has(p.ti)) continue
    usedB.add(p.bi)
    usedT.add(p.ti)
    changed.push({ tokens: wordDiff(b[p.bi], t[p.ti]) })
  }

  const removed = b.filter((_, i) => !usedB.has(i))
  const added = t.filter((_, i) => !usedT.has(i))
  return { unchanged, changed, added, removed }
}

const setDiff = (base: string[], next: string[]): { added: string[]; removed: string[] } => {
  const bl = base.map((s) => s.toLowerCase())
  const nl = next.map((s) => s.toLowerCase())
  return {
    added: next.filter((s) => !bl.includes(s.toLowerCase())),
    removed: base.filter((s) => !nl.includes(s.toLowerCase()))
  }
}

export interface RoleDiff {
  company: string
  position?: { old: string; new: string }
  bullets: BulletDiff
  tech: { added: string[]; removed: string[] }
  isNew: boolean
}

export interface SkillDiff {
  category: string
  added: string[]
  removed: string[]
}

export interface ResumeDiff {
  headline?: { old: string; new: string }
  summary?: Token[]
  contact: { field: string; old: string; new: string }[]
  roles: RoleDiff[]
  skills: SkillDiff[]
  projects: { added: string[]; removed: string[] }
  hasChanges: boolean
}

const norm = (s: string): string => (s ?? '').trim().toLowerCase()

export function diffResume(base: MasterResume, tailored: MasterResume): ResumeDiff {
  const contact: ResumeDiff['contact'] = []
  const fields: (keyof MasterResume['basics'])[] = [
    'email',
    'phone',
    'location',
    'website',
    'linkedin',
    'github'
  ]
  for (const f of fields) {
    if ((base.basics[f] ?? '') !== (tailored.basics[f] ?? '')) {
      contact.push({ field: f, old: base.basics[f] ?? '', new: tailored.basics[f] ?? '' })
    }
  }

  const headline =
    base.basics.label !== tailored.basics.label
      ? { old: base.basics.label, new: tailored.basics.label }
      : undefined

  const summary =
    base.basics.summary !== tailored.basics.summary
      ? wordDiff(base.basics.summary, tailored.basics.summary)
      : undefined

  const roles: RoleDiff[] = []
  for (const tw of tailored.work) {
    const bw = base.work.find((w) => norm(w.company) === norm(tw.company))
    const bullets = diffBullets(bw?.highlights ?? [], tw.highlights)
    const tech = setDiff(bw?.tech ?? [], tw.tech)
    const position =
      bw && bw.position !== tw.position ? { old: bw.position, new: tw.position } : undefined
    const changed =
      !bw || position || bullets.changed.length || bullets.added.length || bullets.removed.length ||
      tech.added.length || tech.removed.length
    if (changed) {
      roles.push({ company: tw.company, position, bullets, tech, isNew: !bw })
    }
  }

  const skills: SkillDiff[] = []
  for (const ts of tailored.skills) {
    const bs = base.skills.find((s) => norm(s.category) === norm(ts.category))
    const d = setDiff(bs?.items ?? [], ts.items)
    if (d.added.length || d.removed.length) {
      skills.push({ category: ts.category, added: d.added, removed: d.removed })
    }
  }

  const baseProj = base.projects.map((p) => p.name)
  const tailProj = tailored.projects.map((p) => p.name)
  const projects = setDiff(baseProj, tailProj)

  const hasChanges =
    !!headline ||
    !!summary ||
    contact.length > 0 ||
    roles.length > 0 ||
    skills.length > 0 ||
    projects.added.length > 0 ||
    projects.removed.length > 0

  return { headline, summary, contact, roles, skills, projects, hasChanges }
}
