import { useEffect, useState } from 'react'
import type {
  MasterResume,
  WorkItem,
  EducationItem,
  ProjectItem,
  SkillGroup,
  CertificationItem,
  PublicationItem
} from '../../../shared/resume'
import { Area, Button, CsvField, Field, LinesArea, Spinner } from '../ui'
import { extractResumeText } from '../extract'
import { MasterChatPanel } from './MasterChatPanel'
import { getTemplate, templates } from '../templates'

export function MasterEditor({
  master,
  setMaster,
  onSave,
  onAiEdit,
  profileName,
  canDelete,
  onRename,
  onDuplicate,
  onDelete
}: {
  master: MasterResume
  setMaster: (m: MasterResume) => void
  onSave: () => Promise<void>
  /** Persist an AI-applied edit immediately (auto-save from the chat panel). */
  onAiEdit: (m: MasterResume) => void
  profileName: string
  canDelete: boolean
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [saved, setSaved] = useState(false)
  // id of a just-added item to scroll to and briefly highlight
  const [flash, setFlash] = useState<string | null>(null)
  // PDF export (same templates/pipeline as the tailored-resume export)
  const [templateId, setTemplateId] = useState('classic')
  const [exportMsg, setExportMsg] = useState('')
  const [exportErr, setExportErr] = useState('')

  useEffect(() => {
    if (!flash) return
    const el = document.getElementById(flash)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [flash])

  function patch(p: Partial<MasterResume>): void {
    setMaster({ ...master, ...p })
    setSaved(false)
  }
  function patchBasics(k: keyof MasterResume['basics'], v: string): void {
    patch({ basics: { ...master.basics, [k]: v } })
  }

  async function runImport(): Promise<void> {
    if (!importText.trim()) return
    setImporting(true)
    setImportError('')
    const r = await window.api.importResume(importText)
    if (r.ok && r.data) {
      setMaster(r.data)
      setImportText('')
    } else {
      setImportError(r.error ?? 'Import failed')
    }
    setImporting(false)
  }

  async function runImportFile(): Promise<void> {
    setImportError('')
    const picked = await window.api.pickResumeFile()
    if (picked.cancelled) return
    if (!picked.ok || !picked.base64 || !picked.ext) {
      setImportError('Could not read that file.')
      return
    }
    setImporting(true)
    let text: string
    try {
      text = await extractResumeText(picked.ext, picked.base64)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
      setImporting(false)
      return
    }
    if (!text.trim()) {
      setImportError('No text found in that file (a scanned image PDF has no selectable text).')
      setImporting(false)
      return
    }
    const r = await window.api.importResume(text)
    if (r.ok && r.data) {
      setMaster(r.data)
      setImportText('')
    } else {
      setImportError(r.error ?? 'Import failed')
    }
    setImporting(false)
  }

  async function save(): Promise<void> {
    await onSave()
    setSaved(true)
  }

  async function exportPdf(): Promise<void> {
    setExportMsg('')
    setExportErr('')
    const html = getTemplate(templateId).render(master)
    const name = `${(master.basics.name || 'resume').replace(/\s+/g, '_')}_master.pdf`
    const r = await window.api.exportPdf(html, name)
    if (r.ok && r.path) setExportMsg(`Saved PDF to ${r.path}`)
    else if (!r.cancelled) setExportErr(r.error ?? 'Export failed')
  }

  // Generic list helpers (null-safe for resumes saved before a section existed)
  function updateList<T>(key: keyof MasterResume, idx: number, item: T): void {
    const list = [...((master[key] as unknown as T[]) ?? [])]
    list[idx] = item
    patch({ [key]: list } as unknown as Partial<MasterResume>)
  }
  function addTo<T>(key: keyof MasterResume, blank: T): void {
    const cur = (master[key] as unknown as T[]) ?? []
    patch({ [key]: [...cur, blank] } as unknown as Partial<MasterResume>)
    setFlash(`${String(key)}-${cur.length}`)
  }
  function removeFrom(key: keyof MasterResume, idx: number): void {
    const list = [...((master[key] as unknown as unknown[]) ?? [])]
    list.splice(idx, 1)
    patch({ [key]: list } as unknown as Partial<MasterResume>)
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Master resume</h2>
        <div className="row">
          {saved && <span className="ok-badge">Saved</span>}
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            title="PDF template"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={exportPdf}>
            Export PDF
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
      <p className="muted">
        Your full career superset. Tailoring picks and rewrites from this. Import once, then keep it
        updated.
      </p>
      {exportMsg && <div className="ok-box">{exportMsg}</div>}
      {exportErr && <div className="err-box">{exportErr}</div>}

      <div className="profile-bar">
        <Field label="Profile name" value={profileName} onChange={onRename} />
        <div className="row">
          <Button variant="ghost" onClick={onDuplicate}>
            Duplicate
          </Button>
          {canDelete && (
            <Button variant="danger" onClick={onDelete}>
              Delete profile
            </Button>
          )}
        </div>
      </div>

      {/* AI assistant */}
      <details className="panel" open={!!master.basics.name}>
        <summary>✨ Ask AI to update this resume</summary>
        <MasterChatPanel master={master} onApply={onAiEdit} />
      </details>

      {/* Import */}
      <details className="panel" open={!master.basics.name}>
        <summary>Import from an existing resume</summary>
        <p className="muted">
          Import your resume file (PDF, Word, or text) — Claude parses it into the fields below. Or
          paste the text manually.
        </p>
        <div className="row">
          <Button onClick={runImportFile} disabled={importing}>
            {importing ? <Spinner text="Reading & parsing…" /> : 'Import file (PDF, Word…)'}
          </Button>
          <span className="muted">PDF · DOCX · TXT · MD</span>
        </div>
        {importError && <div className="err-box">{importError}</div>}

        <details className="paste-fallback">
          <summary>…or paste text instead</summary>
          <Area
            value={importText}
            onChange={setImportText}
            placeholder="Paste your resume text here..."
            rows={8}
          />
          <Button onClick={runImport} disabled={importing || !importText.trim()}>
            {importing ? <Spinner text="Parsing…" /> : 'Parse pasted text'}
          </Button>
        </details>
      </details>

      {/* Basics */}
      <section className="panel">
        <h3>Basics</h3>
        <div className="grid2">
          <Field label="Name" value={master.basics.name} onChange={(v) => patchBasics('name', v)} />
          <Field label="Headline" value={master.basics.label} onChange={(v) => patchBasics('label', v)} />
          <Field label="Email" value={master.basics.email} onChange={(v) => patchBasics('email', v)} />
          <Field label="Phone" value={master.basics.phone} onChange={(v) => patchBasics('phone', v)} />
          <Field label="Location" value={master.basics.location} onChange={(v) => patchBasics('location', v)} />
          <Field label="Website" value={master.basics.website} onChange={(v) => patchBasics('website', v)} />
          <Field label="LinkedIn" value={master.basics.linkedin} onChange={(v) => patchBasics('linkedin', v)} />
          <Field label="GitHub" value={master.basics.github} onChange={(v) => patchBasics('github', v)} />
        </div>
        <Area label="Summary" value={master.basics.summary} onChange={(v) => patchBasics('summary', v)} rows={3} />
      </section>

      {/* Work */}
      <section className="panel">
        <div className="panel-head">
          <h3>Experience</h3>
          <Button
            variant="ghost"
            onClick={() =>
              addTo<WorkItem>('work', {
                company: '',
                position: '',
                location: '',
                startDate: '',
                endDate: '',
                current: false,
                highlights: [],
                tech: []
              })
            }
          >
            + Add role
          </Button>
        </div>
        {master.work.map((w, i) => (
          <div className={`sub-item ${flash === `work-${i}` ? 'flash' : ''}`} id={`work-${i}`} key={i}>
            <div className="grid2">
              <Field label="Position" value={w.position} onChange={(v) => updateList('work', i, { ...w, position: v })} />
              <Field label="Company" value={w.company} onChange={(v) => updateList('work', i, { ...w, company: v })} />
              <Field label="Location" value={w.location} onChange={(v) => updateList('work', i, { ...w, location: v })} />
              <Field label="Start" value={w.startDate} onChange={(v) => updateList('work', i, { ...w, startDate: v })} />
              <Field label="End" value={w.endDate} onChange={(v) => updateList('work', i, { ...w, endDate: v })} />
              <label className="field checkbox">
                <span>Current</span>
                <input
                  type="checkbox"
                  checked={w.current}
                  onChange={(e) => updateList('work', i, { ...w, current: e.target.checked })}
                />
              </label>
            </div>
            <LinesArea
              label="Highlights (one bullet per line)"
              value={w.highlights}
              onChange={(v) => updateList('work', i, { ...w, highlights: v })}
              rows={4}
            />
            <CsvField
              label="Tech (comma-separated)"
              value={w.tech}
              onChange={(v) => updateList('work', i, { ...w, tech: v })}
            />
            <Button variant="danger" onClick={() => removeFrom('work', i)}>
              Remove role
            </Button>
          </div>
        ))}
      </section>

      {/* Projects */}
      <section className="panel">
        <div className="panel-head">
          <h3>Projects</h3>
          <Button
            variant="ghost"
            onClick={() =>
              addTo<ProjectItem>('projects', { name: '', description: '', highlights: [], tech: [], url: '' })
            }
          >
            + Add project
          </Button>
        </div>
        {master.projects.map((p, i) => (
          <div className={`sub-item ${flash === `projects-${i}` ? 'flash' : ''}`} id={`projects-${i}`} key={i}>
            <div className="grid2">
              <Field label="Name" value={p.name} onChange={(v) => updateList('projects', i, { ...p, name: v })} />
              <Field label="URL" value={p.url} onChange={(v) => updateList('projects', i, { ...p, url: v })} />
            </div>
            <Field label="Description" value={p.description} onChange={(v) => updateList('projects', i, { ...p, description: v })} full />
            <LinesArea
              label="Highlights (one per line)"
              value={p.highlights}
              onChange={(v) => updateList('projects', i, { ...p, highlights: v })}
              rows={3}
            />
            <CsvField label="Tech (comma-separated)" value={p.tech} onChange={(v) => updateList('projects', i, { ...p, tech: v })} />
            <Button variant="danger" onClick={() => removeFrom('projects', i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      {/* Skills */}
      <section className="panel">
        <div className="panel-head">
          <h3>Skills</h3>
          <Button variant="ghost" onClick={() => addTo<SkillGroup>('skills', { category: '', items: [] })}>
            + Add group
          </Button>
        </div>
        {master.skills.map((s, i) => (
          <div className={`sub-item ${flash === `skills-${i}` ? 'flash' : ''}`} id={`skills-${i}`} key={i}>
            <div className="grid2">
              <Field label="Category" value={s.category} onChange={(v) => updateList('skills', i, { ...s, category: v })} />
            </div>
            <CsvField label="Items (comma-separated)" value={s.items} onChange={(v) => updateList('skills', i, { ...s, items: v })} />
            <Button variant="danger" onClick={() => removeFrom('skills', i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      {/* Education */}
      <section className="panel">
        <div className="panel-head">
          <h3>Education</h3>
          <Button
            variant="ghost"
            onClick={() =>
              addTo<EducationItem>('education', {
                institution: '',
                area: '',
                studyType: '',
                startDate: '',
                endDate: '',
                gpa: '',
                highlights: []
              })
            }
          >
            + Add
          </Button>
        </div>
        {master.education.map((e, i) => (
          <div className={`sub-item ${flash === `education-${i}` ? 'flash' : ''}`} id={`education-${i}`} key={i}>
            <div className="grid2">
              <Field label="Institution" value={e.institution} onChange={(v) => updateList('education', i, { ...e, institution: v })} />
              <Field label="Degree" value={e.studyType} onChange={(v) => updateList('education', i, { ...e, studyType: v })} />
              <Field label="Field" value={e.area} onChange={(v) => updateList('education', i, { ...e, area: v })} />
              <Field label="GPA" value={e.gpa} onChange={(v) => updateList('education', i, { ...e, gpa: v })} />
              <Field label="Start" value={e.startDate} onChange={(v) => updateList('education', i, { ...e, startDate: v })} />
              <Field label="End" value={e.endDate} onChange={(v) => updateList('education', i, { ...e, endDate: v })} />
            </div>
            <Button variant="danger" onClick={() => removeFrom('education', i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      {/* Certifications */}
      <section className="panel">
        <div className="panel-head">
          <h3>Certifications</h3>
          <Button
            variant="ghost"
            onClick={() => addTo<CertificationItem>('certifications', { name: '', issuer: '', date: '' })}
          >
            + Add
          </Button>
        </div>
        {master.certifications.map((c, i) => (
          <div className={`sub-item ${flash === `certifications-${i}` ? 'flash' : ''}`} id={`certifications-${i}`} key={i}>
            <div className="grid2">
              <Field label="Name" value={c.name} onChange={(v) => updateList('certifications', i, { ...c, name: v })} />
              <Field label="Issuer" value={c.issuer} onChange={(v) => updateList('certifications', i, { ...c, issuer: v })} />
              <Field label="Date" value={c.date} onChange={(v) => updateList('certifications', i, { ...c, date: v })} />
            </div>
            <Button variant="danger" onClick={() => removeFrom('certifications', i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      {/* Publications */}
      <section className="panel">
        <div className="panel-head">
          <h3>Publications</h3>
          <Button
            variant="ghost"
            onClick={() =>
              addTo<PublicationItem>('publications', {
                title: '',
                venue: '',
                date: '',
                url: '',
                description: ''
              })
            }
          >
            + Add
          </Button>
        </div>
        {(master.publications ?? []).map((p, i) => (
          <div className={`sub-item ${flash === `publications-${i}` ? 'flash' : ''}`} id={`publications-${i}`} key={i}>
            <Field label="Title" value={p.title} onChange={(v) => updateList('publications', i, { ...p, title: v })} full />
            <div className="grid2">
              <Field label="Venue (journal/conference)" value={p.venue} onChange={(v) => updateList('publications', i, { ...p, venue: v })} />
              <Field label="Date" value={p.date} onChange={(v) => updateList('publications', i, { ...p, date: v })} />
            </div>
            <Field label="URL" value={p.url} onChange={(v) => updateList('publications', i, { ...p, url: v })} full />
            <Field label="Description" value={p.description} onChange={(v) => updateList('publications', i, { ...p, description: v })} full />
            <Button variant="danger" onClick={() => removeFrom('publications', i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>
    </div>
  )
}
