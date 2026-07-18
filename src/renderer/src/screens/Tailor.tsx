import { useEffect, useMemo, useRef, useState } from 'react'
import type { MasterResume, ResumeProfile } from '../../../shared/resume'
import { emptyMaster } from '../../../shared/resume'
import type { Application, KeywordGap } from '../../../shared/application'
import { getTemplate, templates } from '../templates'
import { ChatPanel } from './ChatPanel'
import { DiffView } from './DiffView'
import { Area, Button, Field, Spinner } from '../ui'

type Panel = 'preview' | 'ats' | 'cover' | 'job' | 'diff'

export function Tailor({
  profiles,
  activeId,
  onSelectProfile,
  onSaved,
  onUpdateProfile,
  reloadToken
}: {
  profiles: ResumeProfile[]
  /** The globally selected profile (sidebar). This is the single source of truth. */
  activeId: string
  /** Change the global profile selection. */
  onSelectProfile: (id: string) => void
  onSaved: (apps: Application[]) => void
  /** Overwrite an existing profile's resume — used to promote the tailored one to its base. */
  onUpdateProfile: (id: string, resume: MasterResume) => void
  /** Bumped by the parent to force a draft reload (e.g. Continue from Applications). */
  reloadToken: number
}): React.JSX.Element {
  const [jd, setJd] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [templateId, setTemplateId] = useState('classic')

  // The base resume is the globally-selected profile — no separate local state.
  const master = profiles.find((p) => p.id === activeId)?.resume ?? emptyMaster()

  const [tailored, setTailored] = useState<MasterResume | null>(null)
  const [gap, setGap] = useState<KeywordGap | null>(null)
  const [prevScore, setPrevScore] = useState<number | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  // Bumped on each re-tailor to remount the chat panel with a fresh session.
  const [tailorVersion, setTailorVersion] = useState(0)

  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  // Which secondary panel (if any) is open alongside the chat hero.
  const [panel, setPanel] = useState<Panel | null>(null)
  // When continuing a saved application, its id + created date, so re-saving
  // updates that row in place instead of creating a duplicate.
  const [appId, setAppId] = useState<string | null>(null)
  const [appCreatedAt, setAppCreatedAt] = useState<string | null>(null)

  const hasMaster = !!master.basics.name || master.work.length > 0
  const html = useMemo(
    () => (tailored ? getTemplate(templateId).render(tailored) : ''),
    [tailored, templateId]
  )

  // --- Draft auto-save: restore the in-progress session, then persist changes.
  const draftReady = useRef(false)
  async function restoreDraft(): Promise<void> {
    const d = await window.api.loadDraft()
    if (d) {
      setJd(d.jd)
      setCompany(d.company)
      setRole(d.role)
      setJobUrl(d.jobUrl ?? '')
      setTemplateId(d.templateId || 'classic')
      setTailored(d.tailored)
      setGap(d.gap)
      setCover(d.cover)
      setAppId(d.appId ?? null)
      setAppCreatedAt(d.appCreatedAt ?? null)
      setPanel(null)
      // Remount the chat with a fresh session for the (re)loaded resume.
      if (d.tailored) setTailorVersion((v) => v + 1)
    }
    draftReady.current = true
  }

  useEffect(() => {
    restoreDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload when the parent bumps the token (e.g. "Continue" seeded a new draft).
  useEffect(() => {
    if (reloadToken > 0) restoreDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken])

  useEffect(() => {
    if (!draftReady.current) return
    const t = setTimeout(() => {
      window.api.saveDraft({
        jd,
        company,
        role,
        jobUrl,
        templateId,
        baseId: activeId,
        tailored,
        gap,
        cover,
        appId: appId ?? undefined,
        appCreatedAt: appCreatedAt ?? undefined
      })
    }, 500)
    return () => clearTimeout(t)
  }, [jd, company, role, jobUrl, templateId, activeId, tailored, gap, cover, appId, appCreatedAt])

  async function runAll(): Promise<void> {
    if (!jd.trim()) return
    setError('')
    setSavedMsg('')
    setBusy('Tailoring resume…')
    const t = await window.api.tailor(master, jd)
    if (!t.ok || !t.data) {
      setError(t.error ?? 'Tailoring failed')
      setBusy('')
      return
    }
    setTailored(t.data)
    setPrevScore(null)
    setTailorVersion((v) => v + 1)
    setPanel(null)

    setBusy('Analyzing keyword gap…')
    const g = await window.api.keywordGap(t.data, jd)
    if (g.ok && g.data) setGap(g.data)

    setBusy('')
  }

  async function rescan(): Promise<void> {
    if (!tailored || busy) return
    setError('')
    setSavedMsg('')
    setBusy('Re-scanning…')
    const prev = gap?.matchScore ?? null
    setPrevScore(prev)
    const g = await window.api.keywordGap(tailored, jd)
    if (g.ok && g.data) {
      setGap(g.data)
      setSavedMsg(
        prev !== null && g.data.matchScore === prev
          ? `ATS re-scanned — score unchanged at ${g.data.matchScore}.`
          : `ATS re-scanned — score is now ${g.data.matchScore}.`
      )
    } else {
      setError(g.error ?? 'Re-scan failed. Try again.')
    }
    setBusy('')
  }

  async function genCover(): Promise<void> {
    if (!jd.trim()) return
    setBusy('Writing cover letter…')
    const c = await window.api.coverLetter(master, jd, company, role)
    if (c.ok && c.data) setCover(c.data.coverLetter)
    else setError(c.error ?? 'Cover letter failed')
    setBusy('')
  }

  async function exportPdf(): Promise<void> {
    if (!html) return
    const name = `${(tailored?.basics.name || 'resume').replace(/\s+/g, '_')}_${(company || 'role').replace(/\s+/g, '_')}.pdf`
    const r = await window.api.exportPdf(html, name)
    if (r.ok && r.path) setSavedMsg(`Saved PDF to ${r.path}`)
    else if (!r.cancelled) setError(r.error ?? 'Export failed')
  }

  async function saveToTracker(): Promise<void> {
    if (!tailored) return
    const record: Application = {
      id: appId ?? crypto.randomUUID(),
      company: company || 'Unknown',
      role: role || tailored.basics.label || 'Unknown',
      createdAt: appCreatedAt ?? new Date().toISOString(),
      status: 'draft',
      jobUrl: jobUrl.trim() || undefined,
      jobDescription: jd,
      baseId: activeId,
      tailored,
      keywordGap: gap,
      coverLetter: cover,
      template: templateId,
      files: {},
      notes: ''
    }
    const wasUpdate = appId !== null
    const apps = await window.api.saveApplication(record)
    onSaved(apps)
    resetTailor()
    setSavedMsg(
      wasUpdate
        ? 'Updated the saved application — started a fresh resume. Reopen it anytime from the Applications tab.'
        : 'Saved to Applications — started a fresh resume. Reopen it anytime from the Applications tab.'
    )
  }

  /** Promote the current tailored resume to its base profile, overwriting it. */
  function updateBase(): void {
    if (!tailored) return
    const base = profiles.find((p) => p.id === activeId)
    const ok = window.confirm(
      `Replace your base resume${base ? ` "${base.name}"` : ''} with this tailored version?\n\n` +
        `Future tailoring will start from this version. This overwrites the base you tailored from and can't be undone.`
    )
    if (!ok) return
    onUpdateProfile(activeId, tailored)
    setError('')
    setSavedMsg(
      `Updated your base resume${base ? ` "${base.name}"` : ''}. Future tailoring starts from this version.`
    )
  }

  /** Clear the workspace back to an empty intake, so the next tailor starts fresh. */
  function resetTailor(): void {
    setJd('')
    setCompany('')
    setRole('')
    setJobUrl('')
    setTailored(null)
    setGap(null)
    setPrevScore(null)
    setCover(null)
    setPanel(null)
    setError('')
    setAppId(null)
    setAppCreatedAt(null)
    // Persist the cleared state immediately (don't wait for the debounced save).
    window.api.saveDraft({
      jd: '',
      company: '',
      role: '',
      jobUrl: '',
      templateId,
      baseId: activeId,
      tailored: null,
      gap: null,
      cover: null
    })
  }

  function toggle(p: Panel): void {
    setPanel((cur) => (cur === p ? null : p))
  }

  if (!hasMaster) {
    return (
      <div className="screen">
        <h2>Tailor</h2>
        <div className="panel">
          <p>You need a master resume first. Go to the Master resume tab and import or fill it in.</p>
        </div>
      </div>
    )
  }

  // ---- Intake: the setup form shown before a resume has been tailored. -------
  if (!tailored) {
    return (
      <div className="screen intake">
        <div className="intake-card">
          <h2>Tailor to a job</h2>
          <p className="muted">
            Paste a job description and Resume Tailor rewrites your resume to match. Then you refine
            it by chatting — the resume, ATS score, and cover letter are one click away.
          </p>
          {profiles.length > 1 && (
            <label className="field field-full">
              <span>Base resume</span>
              <select value={activeId} onChange={(e) => onSelectProfile(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid2">
            <Field label="Company" value={company} onChange={setCompany} placeholder="Acme Inc" />
            <Field label="Role" value={role} onChange={setRole} placeholder="Senior Engineer" />
          </div>
          <Field
            label="Job posting URL (optional)"
            value={jobUrl}
            onChange={setJobUrl}
            placeholder="https://…"
            full
          />
          <Area
            label="Job description"
            value={jd}
            onChange={setJd}
            placeholder="Paste the full job description here…"
            rows={12}
          />
          <div className="row wrap-row">
            <Button onClick={runAll} disabled={!!busy || !jd.trim()}>
              {busy ? <Spinner text={busy} /> : 'Tailor + analyze'}
            </Button>
            <Button variant="ghost" onClick={genCover} disabled={!!busy || !jd.trim()}>
              Cover letter
            </Button>
          </div>
          {error && <div className="err-box">{error}</div>}
          {savedMsg && <div className="ok-box">{savedMsg}</div>}
        </div>
      </div>
    )
  }

  // ---- Workspace: chat is the hero; everything else opens on demand. ---------
  const score = gap?.matchScore
  const panelTitle: Record<Panel, string> = {
    preview: 'Resume preview',
    ats: 'ATS match',
    diff: 'Changes',
    cover: 'Cover letter',
    job: 'Job description'
  }

  return (
    <div className="workspace">
      <div className="ws-head">
        <div className="ws-title">
          <h2>{company || 'Your resume'}</h2>
          {role && <span className="ws-role">{role}</span>}
          {typeof score === 'number' && (
            <button
              className={`ws-scorechip score-${score >= 75 ? 'hi' : score >= 50 ? 'mid' : 'lo'}`}
              onClick={() => toggle('ats')}
              title="ATS match score"
            >
              ATS {score}
            </button>
          )}
        </div>

        <div className="ws-tabs">
          {(['preview', 'diff', 'ats', 'cover', 'job'] as Panel[]).map((p) => (
            <button
              key={p}
              className={`ws-tab ${panel === p ? 'active' : ''}`}
              onClick={() => toggle(p)}
            >
              {panelTitle[p].replace(' preview', '').replace(' match', '').replace(' description', '')}
            </button>
          ))}
        </div>

        <div className="ws-actions">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {profiles.length > 1 && (
            <label className="ws-base" title="The selected resume profile (shared with the sidebar)">
              <span>Base</span>
              <select value={activeId} onChange={(e) => onSelectProfile(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            variant="ghost"
            onClick={updateBase}
            title={`Save these edits into “${profiles.find((p) => p.id === activeId)?.name ?? 'base'}” so future tailoring starts from them`}
          >
            Update base
          </Button>
          <Button variant="ghost" onClick={saveToTracker}>
            Save
          </Button>
          <Button onClick={exportPdf}>Export PDF</Button>
        </div>
      </div>

      {savedMsg && <div className="ok-box ws-msg">{savedMsg}</div>}
      {error && <div className="err-box ws-msg">{error}</div>}

      <div className={`ws-body ${panel ? 'has-panel' : ''}`}>
        <div className="ws-chat">
          <ChatPanel
            key={tailorVersion}
            resume={tailored}
            master={master}
            jd={jd}
            gap={gap}
            onResume={setTailored}
            hero
          />
        </div>

        {panel && (
          <aside className="ws-drawer">
            <div className="ws-drawer-head">
              <h3>{panelTitle[panel]}</h3>
              <Button variant="ghost" onClick={() => setPanel(null)}>
                Close
              </Button>
            </div>
            <div className="ws-drawer-body">
              {panel === 'preview' && (
                <div className="preview-frame">
                  <iframe title="preview" srcDoc={html} />
                </div>
              )}

              {panel === 'diff' && <DiffView base={master} tailored={tailored} />}

              {panel === 'ats' && (
                <>
                  {gap ? (
                    <div className="gap">
                      <div className="gap-head">
                        <div className="score-wrap">
                          <span
                            className={`score score-${gap.matchScore >= 75 ? 'hi' : gap.matchScore >= 50 ? 'mid' : 'lo'}`}
                          >
                            {gap.matchScore}
                          </span>
                          {prevScore !== null && prevScore !== gap.matchScore && (
                            <span className="score-was">was {prevScore}</span>
                          )}
                          <span className="muted">match score</span>
                        </div>
                        <Button onClick={rescan} disabled={!!busy}>
                          {busy === 'Re-scanning…' ? <Spinner text="Re-scanning…" /> : 'Re-scan ATS'}
                        </Button>
                      </div>
                      {gap.missing.length > 0 && (
                        <div className="gap-block">
                          <strong>Missing keywords</strong>
                          <div className="chips">
                            {gap.missing.map((m, i) => (
                              <span className="chip chip-miss" key={i}>
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {gap.terminology.length > 0 && (
                        <div className="gap-block">
                          <strong>Terminology to align</strong>
                          <ul className="term-list">
                            {gap.terminology.map((t, i) => (
                              <li key={i}>
                                <span className="from">{t.from}</span> →{' '}
                                <span className="to">{t.to}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {gap.notes.length > 0 && (
                        <ul className="notes">
                          {gap.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="muted">No ATS analysis yet.</p>
                  )}
                </>
              )}

              {panel === 'cover' && (
                <>
                  {cover ? (
                    <Area value={cover} onChange={setCover} rows={20} />
                  ) : (
                    <div>
                      <p className="muted">No cover letter yet.</p>
                      <Button onClick={genCover} disabled={!!busy || !jd.trim()}>
                        {busy === 'Writing cover letter…' ? (
                          <Spinner text="Writing…" />
                        ) : (
                          'Generate cover letter'
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {panel === 'job' && (
                <div className="job-edit">
                  <div className="grid2">
                    <Field label="Company" value={company} onChange={setCompany} />
                    <Field label="Role" value={role} onChange={setRole} />
                  </div>
                  <Field label="Job posting URL" value={jobUrl} onChange={setJobUrl} full />
                  <Area label="Job description" value={jd} onChange={setJd} rows={16} />
                  <div className="row wrap-row">
                    <Button onClick={runAll} disabled={!!busy || !jd.trim()}>
                      {busy ? <Spinner text={busy} /> : 'Re-tailor from scratch'}
                    </Button>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Re-tailoring rebuilds the resume from your base and starts a fresh chat. To make
                    small changes, just ask in the chat instead.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
