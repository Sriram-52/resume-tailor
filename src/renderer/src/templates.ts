import type { MasterResume } from '../../shared/resume'

/**
 * Resume templates. Each takes a (tailored) MasterResume and returns a full,
 * self-contained HTML document with inline CSS. The same string is used for
 * the on-screen preview (iframe srcDoc) and for PDF export (printToPDF), so
 * what you see is exactly what prints. All are single-column = ATS-safe.
 */

export interface Template {
  id: string
  name: string
  render: (r: MasterResume) => string
}

const esc = (s: string): string =>
  (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const svg = (path: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

const icons = {
  pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  phone: svg(
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'
  ),
  mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>'),
  globe: svg(
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>'
  ),
  linkedin: svg(
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>'
  ),
  github: svg(
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>'
  )
}

const urlFor = (kind: 'linkedin' | 'github' | 'website', v: string): string => {
  if (/^https?:\/\//i.test(v)) return v
  const u = v.replace(/^@/, '')
  if (kind === 'linkedin') return `https://www.linkedin.com/in/${u}`
  if (kind === 'github') return `https://github.com/${u}`
  return `https://${u}`
}

const linkItem = (href: string, icon: string, label: string): string =>
  `<a class="c-item" href="${esc(href)}">${icon}<span>${esc(label)}</span></a>`
const textItem = (icon: string, label: string): string =>
  `<span class="c-item">${icon}<span>${esc(label)}</span></span>`

const contactLine = (r: MasterResume): string => {
  const b = r.basics
  const items: string[] = []
  if (b.location) items.push(textItem(icons.pin, b.location))
  if (b.phone) items.push(linkItem(`tel:${b.phone}`, icons.phone, b.phone))
  if (b.email) items.push(linkItem(`mailto:${b.email}`, icons.mail, b.email))
  if (b.website) items.push(linkItem(urlFor('website', b.website), icons.globe, 'Portfolio'))
  if (b.linkedin) items.push(linkItem(urlFor('linkedin', b.linkedin), icons.linkedin, 'LinkedIn'))
  if (b.github) items.push(linkItem(urlFor('github', b.github), icons.github, 'GitHub'))
  return items.join('<span class="c-sep">·</span>')
}

const bullets = (items: string[]): string =>
  items.filter(Boolean).length
    ? `<ul>${items.filter(Boolean).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
    : ''

/** A compact "Tech: …" line for a role or project, from its tech-tag list. */
const techLine = (items: string[]): string =>
  (items ?? []).filter(Boolean).length
    ? `<div class="tech"><span class="tech-label">Tech:</span> ${(items ?? [])
        .filter(Boolean)
        .map(esc)
        .join(' · ')}</div>`
    : ''

function shell(css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.35; font-size: 10.5pt; }
  a { color: inherit; text-decoration: none; }
  .c-item { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
  .c-item svg { width: 10px; height: 10px; flex-shrink: 0; }
  .c-sep { margin: 0 7px; opacity: 0.5; }
  .tech { font-size: 8.5pt; color: #555; margin-top: 3px; }
  .tech-label { font-weight: bold; }
  ${css}
  </style></head><body>${body}</body></html>`
}

// --- Classic: serif, centered header, ruled section titles ----------------
const classic: Template = {
  id: 'classic',
  name: 'Classic',
  render: (r) =>
    shell(
      `
      .wrap { padding: 4px 2px; }
      header { text-align: center; margin-bottom: 10px; }
      h1 { font-size: 20pt; margin: 0 0 2px; letter-spacing: 0.5px; }
      .label { font-size: 11pt; color: #444; margin-bottom: 4px; }
      .contact { font-size: 9pt; color: #333; }
      h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1.5px solid #333;
           padding-bottom: 2px; margin: 14px 0 6px; }
      .summary { margin: 4px 0 2px; }
      .item { margin-bottom: 8px; }
      .item-head { display: flex; justify-content: space-between; font-weight: bold; }
      .item-sub { display: flex; justify-content: space-between; font-style: italic; color: #333; font-size: 9.5pt; }
      ul { margin: 3px 0 0; padding-left: 18px; }
      li { margin-bottom: 2px; }
      .skills-row { margin-bottom: 3px; }
      .skills-cat { font-weight: bold; }
    `,
      `<div class="wrap">
      <header>
        <h1>${esc(r.basics.name)}</h1>
        ${r.basics.label ? `<div class="label">${esc(r.basics.label)}</div>` : ''}
        <div class="contact">${contactLine(r)}</div>
      </header>
      ${r.basics.summary ? `<h2>Summary</h2><div class="summary">${esc(r.basics.summary)}</div>` : ''}
      ${
        r.work.length
          ? `<h2>Experience</h2>${r.work
              .map(
                (w) => `<div class="item">
        <div class="item-head"><span>${esc(w.position)}</span><span>${esc(w.startDate)}${w.startDate || w.endDate ? ' – ' : ''}${esc(w.current ? 'Present' : w.endDate)}</span></div>
        <div class="item-sub"><span>${esc(w.company)}</span><span>${esc(w.location)}</span></div>
        ${bullets(w.highlights)}
        ${techLine(w.tech)}
      </div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.projects.length
          ? `<h2>Projects</h2>${r.projects
              .map(
                (p) => `<div class="item">
        <div class="item-head"><span>${esc(p.name)}</span></div>
        ${p.description ? `<div>${esc(p.description)}</div>` : ''}
        ${bullets(p.highlights)}
        ${techLine(p.tech)}
      </div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.skills.length
          ? `<h2>Skills</h2>${r.skills
              .map(
                (s) =>
                  `<div class="skills-row"><span class="skills-cat">${esc(s.category)}: </span>${s.items.map(esc).join(', ')}</div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.education.length
          ? `<h2>Education</h2>${r.education
              .map(
                (e) => `<div class="item">
        <div class="item-head"><span>${esc(e.studyType)}${e.studyType && e.area ? ', ' : ''}${esc(e.area)}</span><span>${esc(e.startDate)}${e.startDate || e.endDate ? ' – ' : ''}${esc(e.endDate)}</span></div>
        <div class="item-sub"><span>${esc(e.institution)}</span><span>${e.gpa ? 'GPA ' + esc(e.gpa) : ''}</span></div>
        ${bullets(e.highlights)}
      </div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.certifications.length
          ? `<h2>Certifications</h2>${r.certifications
              .map(
                (c) =>
                  `<div class="item"><div class="item-head"><span>${esc(c.name)}</span><span>${esc(c.date)}</span></div><div class="item-sub"><span>${esc(c.issuer)}</span></div></div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.publications?.length
          ? `<h2>Publications</h2>${r.publications
              .map(
                (p) =>
                  `<div class="item"><div class="item-head"><span>${esc(p.title)}</span><span>${esc(p.date)}</span></div><div class="item-sub"><span>${esc(p.venue)}</span></div>${p.description ? `<div>${esc(p.description)}</div>` : ''}</div>`
              )
              .join('')}`
          : ''
      }
    </div>`
    )
}

// --- Modern: sans-serif, left-aligned, accent color -----------------------
const modern: Template = {
  id: 'modern',
  name: 'Modern',
  render: (r) =>
    shell(
      `
      body { font-family: 'Helvetica Neue', Arial, sans-serif; }
      .wrap { padding: 4px 2px; }
      header { border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 10px; }
      h1 { font-size: 22pt; margin: 0; color: #111; }
      .label { font-size: 11pt; color: #2563eb; font-weight: 600; margin: 2px 0 4px; }
      .contact { font-size: 8.5pt; color: #555; }
      h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1.5px; color: #2563eb; margin: 13px 0 5px; }
      .item { margin-bottom: 8px; }
      .item-head { display: flex; justify-content: space-between; }
      .role { font-weight: 700; }
      .company { color: #2563eb; font-weight: 600; }
      .when { color: #666; font-size: 9pt; }
      ul { margin: 3px 0 0; padding-left: 16px; }
      li { margin-bottom: 2px; }
      .skills-row { margin-bottom: 3px; }
      .skills-cat { font-weight: 700; }
    `,
      `<div class="wrap">
      <header>
        <h1>${esc(r.basics.name)}</h1>
        ${r.basics.label ? `<div class="label">${esc(r.basics.label)}</div>` : ''}
        <div class="contact">${contactLine(r)}</div>
      </header>
      ${r.basics.summary ? `<h2>Summary</h2><div>${esc(r.basics.summary)}</div>` : ''}
      ${
        r.work.length
          ? `<h2>Experience</h2>${r.work
              .map(
                (w) => `<div class="item">
        <div class="item-head"><span class="role">${esc(w.position)} · <span class="company">${esc(w.company)}</span></span><span class="when">${esc(w.startDate)}${w.startDate || w.endDate ? ' – ' : ''}${esc(w.current ? 'Present' : w.endDate)}</span></div>
        ${bullets(w.highlights)}
        ${techLine(w.tech)}
      </div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.projects.length
          ? `<h2>Projects</h2>${r.projects
              .map(
                (p) =>
                  `<div class="item"><div class="role">${esc(p.name)}</div>${p.description ? `<div>${esc(p.description)}</div>` : ''}${bullets(p.highlights)}${techLine(p.tech)}</div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.skills.length
          ? `<h2>Skills</h2>${r.skills
              .map(
                (s) =>
                  `<div class="skills-row"><span class="skills-cat">${esc(s.category)}: </span>${s.items.map(esc).join(', ')}</div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.education.length
          ? `<h2>Education</h2>${r.education
              .map(
                (e) =>
                  `<div class="item"><div class="item-head"><span class="role">${esc(e.studyType)}${e.studyType && e.area ? ', ' : ''}${esc(e.area)} · <span class="company">${esc(e.institution)}</span></span><span class="when">${esc(e.startDate)}${e.startDate || e.endDate ? ' – ' : ''}${esc(e.endDate)}</span></div></div>`
              )
              .join('')}`
          : ''
      }
      ${
        r.certifications.length
          ? `<h2>Certifications</h2>${r.certifications
              .map((c) => `<div class="item"><span class="role">${esc(c.name)}</span> — ${esc(c.issuer)} <span class="when">${esc(c.date)}</span></div>`)
              .join('')}`
          : ''
      }
      ${
        r.publications?.length
          ? `<h2>Publications</h2>${r.publications
              .map(
                (p) =>
                  `<div class="item"><div class="item-head"><span class="role">${esc(p.title)}</span><span class="when">${esc(p.date)}</span></div><div class="company">${esc(p.venue)}</div>${p.description ? `<div>${esc(p.description)}</div>` : ''}</div>`
              )
              .join('')}`
          : ''
      }
    </div>`
    )
}

export const templates: Template[] = [classic, modern]

export function getTemplate(id: string): Template {
  return templates.find((t) => t.id === id) ?? templates[0]
}
