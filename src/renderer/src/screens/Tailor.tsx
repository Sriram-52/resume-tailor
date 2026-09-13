import { useEffect, useMemo, useRef, useState } from 'react'
import { IconButton } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu'
import { Check, ChevronDown, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import type { MasterResume, ResumeProfile } from '../../../shared/resume'
import { emptyMaster } from '../../../shared/resume'
import type { Application, ApplicationStatus, KeywordGap } from '../../../shared/application'
import { getTemplate, renderCoverLetter, templates } from '../templates'
import { ChatPanel } from './ChatPanel'
import { DiffView } from './DiffView'
import { Area, Button, Field, Spinner } from '../ui'
import { pdfFileName } from '../../../shared/filename'

type Panel = 'preview' | 'ats' | 'cover' | 'job' | 'diff'

export function Tailor({
  profiles,
  activeId,
  apps,
  onSelectProfile,
  onSaved,
  onUpdateProfile,
  onClose,
  chatKey,
  onBusyChange
}: {
  profiles: ResumeProfile[]
  /** Saved applications, so the workspace can show and change the status of the one it is editing. */
  apps: Application[]
  /** The globally selected profile (sidebar). This is the single source of truth. */
  activeId: string
  /** Change the global profile selection. */
  onSelectProfile: (id: string) => void
  onSaved: (apps: Application[]) => void
  /** Overwrite an existing profile's resume — used to promote the tailored one to its base. */
  onUpdateProfile: (id: string, resume: MasterResume) => void
  onClose: () => void
  /** The application this workspace edits. Drafts and the agent session key off it. */
  chatKey: string
  onBusyChange?: (key: string, busy: boolean) => void
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
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  // Which secondary panel (if any) is open alongside the chat hero.
  const [panel, setPanel] = useState<Panel>('preview')
  /**
   * Which ATS findings the user has ticked, as stable keys (`kw:…`, `term:…`,
   * `note:…`). Cleared whenever a re-scan replaces the analysis, since the
   * indices behind those keys no longer refer to the same findings.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** A message handed to the chat panel to send on the user's behalf. */
  const [seed, setSeed] = useState<{ text: string; token: number } | null>(null)

  // A re-scan replaces the findings, so the ticked indices stop meaning anything.
  // This has to sit with the other hooks: the component returns early for the
  // intake state, and a hook below that return changes the hook count per render.
  useEffect(() => {
    setPicked(new Set())
  }, [gap])
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
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function restoreDraft(): Promise<void> {
    // A pending autosave from the previous session must not overwrite the draft
    // we are about to load, and nothing may autosave until the restore is applied.
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    draftReady.current = false
    const d = await window.api.loadDraft(chatKey)
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
      setPanel('preview')
      // Remount the chat with a fresh session for the (re)loaded resume.
      if (d.tailored) setTailorVersion((v) => v + 1)
    }
    draftReady.current = true
  }

  useEffect(() => {
    restoreDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftReady.current) return
    const t = setTimeout(() => {
      autosaveTimer.current = null
      window.api.saveDraft(chatKey, {
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
    autosaveTimer.current = t
    return () => clearTimeout(t)
  }, [jd, company, role, jobUrl, templateId, activeId, tailored, gap, cover, appId, appCreatedAt])

  /** Pull company, role, and description from the job posting URL. */
  async function fetchFromUrl(): Promise<void> {
    const url = jobUrl.trim()
    if (!url || busy || fetching) return
    setError('')
    setSavedMsg('')
    setFetching(true)
    const r = await window.api.fetchJobPosting(url)
    if (!r.ok || !r.data) {
      setError(r.error ?? 'Could not fetch that posting.')
    } else {
      if (r.data.company) setCompany(r.data.company)
      if (r.data.role) setRole(r.data.role)
      if (r.data.description) setJd(r.data.description)
      const via =
        r.data.source === 'page' ? 'the page' : r.data.source === 'linkedin' ? 'LinkedIn' : r.data.source
      setSavedMsg(
        `Filled from ${via}${r.data.location ? ` · ${r.data.location}` : ''}. Check the fields, then tailor.`
      )
    }
    setFetching(false)
  }

  /** The saved application this draft came from, if any. */
  const linkedApp = appId ? apps.find((a) => a.id === appId) ?? null : null

  async function changeStatus(status: ApplicationStatus): Promise<void> {
    if (!linkedApp || linkedApp.status === status) return
    const r = await window.api.setApplicationStatus(linkedApp.id, status)
    onSaved(r.apps)
    if (r.needsLogin) toast.warning(`Marked as ${status} here, but the Jobright session expired.`)
    else if (!r.synced && r.error) toast.warning(`Marked as ${status} here only: ${r.error}`)
    else toast.success(`Marked as ${status}.`)
  }

  /** Just opens the posting. Marking it applied is what Save as applied is for. */
  function openPosting(): void {
    const url = jobUrl.trim()
    if (url) void window.api.openExternal(url)
  }

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
    setPanel('preview')

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
    const name = pdfFileName(tailored?.basics.name, company, role || tailored?.basics.label)
    const r = await window.api.exportPdf(html, name)
    if (r.ok && r.path) setSavedMsg(`Saved PDF to ${r.path}`)
    else if (!r.cancelled) setError(r.error ?? 'Export failed')
  }

  /** Copy the cover letter text — for pasting into an ATS form or email body. */
  async function copyCover(): Promise<void> {
    if (!cover) return
    try {
      await navigator.clipboard.writeText(cover)
      setError('')
      setSavedMsg('Cover letter copied to clipboard.')
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  /** Export the cover letter as a PDF — for attaching / uploading. */
  async function exportCoverPdf(): Promise<void> {
    if (!cover) return
    setError('')
    setSavedMsg('')
    const base = tailored ?? master
    const html = renderCoverLetter(base, cover, {
      company,
      role,
      date: new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    })
    const name = pdfFileName(base.basics.name, company, role || base.basics.label, 'cover')
    const r = await window.api.exportPdf(html, name)
    if (r.ok && r.path) setSavedMsg(`Saved cover letter PDF to ${r.path}`)
    else if (!r.cancelled) setError(r.error ?? 'Export failed')
  }

  /**
   * Save and close. `status` is what the card becomes on the way out — saving
   * from here almost always means you just applied, so that is the default and
   * the dropdown carries the exceptions.
   */
  async function saveToTracker(status?: ApplicationStatus): Promise<void> {
    if (!tailored) return
    // Update the record this draft came from; failing that, one with the same
    // posting URL, so re-saving never creates a duplicate.
    const url = jobUrl.trim()
    const existing =
      (appId ? apps.find((a) => a.id === appId) : undefined) ??
      (url ? apps.find((a) => a.jobUrl && a.jobUrl.trim() === url) : undefined)
    const record: Application = {
      // Carry the whole existing record forward first. Listing fields
      // explicitly silently dropped jobId, fit, source, appliedAt, workModel
      // and location on every save — and without jobId nothing can ever sync
      // back to Jobright.
      ...(existing ?? {}),
      id: existing?.id ?? crypto.randomUUID(),
      company: company || 'Unknown',
      role: role || tailored.basics.label || 'Unknown',
      createdAt: existing?.createdAt ?? appCreatedAt ?? new Date().toISOString(),
      status: status ?? existing?.status ?? 'draft',
      jobUrl: url || undefined,
      jobDescription: jd,
      baseId: activeId,
      tailored,
      keywordGap: gap,
      coverLetter: cover,
      template: templateId,
      files: existing?.files ?? {},
      notes: existing?.notes ?? ''
    }
    const updated = await window.api.saveApplication(record)
    onSaved(updated)

    // The local write above already carries the new status; this second call is
    // what pushes it to Jobright, and reports honestly when it cannot.
    if (status && status !== existing?.status) {
      const r = await window.api.setApplicationStatus(record.id, status)
      onSaved(r.apps)
      if (r.needsLogin) toast.warning(`Saved as ${status} here — the Jobright session expired.`)
      else if (!r.synced && r.error) toast.warning(`Saved as ${status} here only: ${r.error}`)
      else toast.success(`Saved as ${status}.`)
    } else {
      toast.success('Saved.')
    }
    // Close rather than reset: this workspace is opened from a specific card, so
    // dumping the user back on a blank intake form is never what they wanted.
    onClose()
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

  function toggle(p: Panel): void {
    setPanel(p)
  }

  if (!hasMaster) {
    return (
      <div className="mx-auto w-full max-w-[1100px] flex-1 overflow-y-auto px-7 py-6">
        <h2>Tailor</h2>
        <div className="mt-4 rounded-[12px] border border-border bg-card p-4">
          <p>You need a master resume first. Go to the Master resume tab and import or fill it in.</p>
        </div>
      </div>
    )
  }

  // ---- Intake: the setup form shown before a resume has been tailored. -------
  if (!tailored) {
    return (
      <div className="mx-auto w-full max-w-[1100px] flex-1 overflow-y-auto px-7 py-6 max-w-[720px]">
        <div className="mt-2 rounded-[14px] border border-border bg-card p-6">
          <h2>Tailor to a job</h2>
          <p className="text-[13px] text-muted-foreground">
            Paste a job posting link or the description itself and Resume Tailor rewrites your
            resume to match. Then you refine it by chatting: the resume, ATS score, and cover letter
            are one click away.
          </p>
          {profiles.length > 1 && (
            <label className="flex flex-col gap-1.5 w-full">
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
          <div className="grid grid-cols-2 gap-x-3.5">
            <Field label="Company" value={company} onChange={setCompany} placeholder="Acme Inc" />
            <Field label="Role" value={role} onChange={setRole} placeholder="Senior Engineer" />
          </div>
          <div className="flex w-full items-end gap-2">
            <Field
              label="Job posting URL"
              value={jobUrl}
              onChange={setJobUrl}
              placeholder="Paste a posting link and press Fetch to fill the fields below"
              full
              onEnter={fetchFromUrl}
            />
            <Button
              variant="ghost"
              onClick={fetchFromUrl}
              disabled={!!busy || fetching || !jobUrl.trim()}
            >
              {fetching ? <Spinner text="Fetching…" /> : 'Fetch'}
            </Button>
          </div>
          <Area
            label="Job description"
            value={jd}
            onChange={setJd}
            placeholder="Paste the full job description here…"
            rows={12}
          />
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <Button onClick={runAll} disabled={!!busy || !jd.trim()}>
              {busy ? <Spinner text={busy} /> : 'Tailor + analyze'}
            </Button>
            <Button variant="ghost" onClick={genCover} disabled={!!busy || !jd.trim()}>
              Cover letter
            </Button>
          </div>
          {error && <div className="mt-2.5 whitespace-pre-wrap rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
          {savedMsg && <div className="mt-2.5 break-words rounded-[8px] border border-ok/30 bg-ok/10 px-3 py-2 text-[13px] text-ok">{savedMsg}</div>}
        </div>
      </div>
    )
  }

  function togglePick(key: string): void {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /**
   * Turn the ticked findings into one instruction for the chat agent.
   *
   * Only what the user ticked is sent — the checkboxes are the filter, so the
   * prompt itself stays a plain instruction rather than arguing with it.
   */
  function optimizePicked(): void {
    if (!gap || picked.size === 0) return
    const kws = gap.missing.filter((_, i) => picked.has(`kw:${i}`))
    const terms = gap.terminology.filter((_, i) => picked.has(`term:${i}`))
    const notes = gap.notes.filter((_, i) => picked.has(`note:${i}`))
    const parts: string[] = [
      'Revise the resume to close these specific ATS gaps.'
    ]
    if (kws.length) parts.push(`\nKeywords to work in:\n${kws.map((k) => `- ${k}`).join('\n')}`)
    if (terms.length) {
      parts.push(
        `\nRephrase to match the posting's wording:\n${terms
          .map((t) => `- "${t.from}" -> "${t.to}"`)
          .join('\n')}`
      )
    }
    if (notes.length) parts.push(`\nAlso address:\n${notes.map((n) => `- ${n}`).join('\n')}`)
    setSeed({ text: parts.join('\n'), token: Date.now() })
    setPicked(new Set())
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
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card-muted px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2>{company || 'Your resume'}</h2>
          {role && <span className="whitespace-nowrap text-[13px] text-muted-foreground">{role}</span>}
          {typeof score === 'number' && (
            <button
              className={cn(
                    'rounded-[20px] border-0 px-2.5 py-1 text-[12px] font-bold',
                    score >= 75
                      ? 'bg-ok/12 text-ok'
                      : score >= 50
                        ? 'bg-warn/12 text-warn'
                        : 'bg-danger/12 text-danger'
                  )}
              onClick={() => toggle('ats')}
              title="ATS match score"
            >
              ATS {score}
            </button>
          )}
          {jobUrl.trim() && (
            <button
              className="ml-2 inline-block whitespace-nowrap text-[12.5px] text-primary hover:underline"
              onClick={openPosting}
              title="Open the job posting"
            >
              ↗ posting
            </button>
          )}
          {linkedApp && (
            <select
              className="rounded-[20px] border border-border bg-card-muted px-2 py-1 text-[12px]"
              value={linkedApp.status}
              onChange={(e) => changeStatus(e.target.value as ApplicationStatus)}
              title="Application status"
            >
              {(['draft', 'applied', 'interviewing', 'offer', 'rejected', 'archived'] as ApplicationStatus[]).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {profiles.length > 1 && (
            <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground" title="The selected resume profile (shared with the sidebar)">
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
          <div className="flex items-stretch">
            <Button
              variant="ghost"
              className="rounded-r-none border-r-0"
              onClick={() => saveToTracker('applied')}
              title="Save and mark this applied"
            >
              Save as applied
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="rounded-l-none px-2" title="Save as…">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(
                  [
                    ['draft', 'Save as tailored'],
                    ['interviewing', 'Save as interviewing'],
                    ['offer', 'Save as offer'],
                    ['rejected', 'Save as rejected'],
                    ['archived', 'Save as archived']
                  ] as [ApplicationStatus, string][]
                ).map(([st, label]) => (
                  <DropdownMenuItem key={st} onClick={() => saveToTracker(st)}>
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => saveToTracker()}>
                  Save, keep current status
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button onClick={exportPdf}>Export PDF</Button>
        </div>
        <IconButton onClick={onClose} title="Close the workspace (esc)">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {savedMsg && <div className="mx-5 mt-2.5 break-words rounded-[8px] border border-ok/30 bg-ok/10 px-3 py-2 text-[13px] text-ok">{savedMsg}</div>}
      {error && <div className="mx-5 mt-2.5 whitespace-pre-wrap rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1 gap-4 p-4 px-5">
        <div className="flex w-[44%] min-w-[360px] shrink-0">
          <ChatPanel
            key={tailorVersion}
            resume={tailored}
            master={master}
            jd={jd}
            gap={gap}
            onResume={setTailored}
            company={company}
            role={role}
            cover={cover ?? ''}
            onCover={setCover}
            hero
            seed={seed}
            chatKey={chatKey}
            onBusyChange={onBusyChange}
          />
        </div>

        <aside className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border bg-card">
            <div className="flex items-center border-b border-surface px-3 py-2">
        <div className="flex gap-1 rounded-[10px] border border-border bg-surface p-[3px]">
          {(['preview', 'diff', 'ats', 'cover', 'job'] as Panel[]).map((p) => (
            <button
              key={p}
              className={cn(
                'rounded-[7px] px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground',
                panel === p && 'bg-card font-semibold text-foreground'
              )}
              onClick={() => toggle(p)}
            >
              {panelTitle[p].replace(' preview', '').replace(' match', '').replace(' description', '')}
            </button>
          ))}
        </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {panel === 'preview' && (
                <div className="preview-frame">
                  <iframe title="preview" srcDoc={html} />
                </div>
              )}

              {panel === 'diff' && <DiffView base={master} tailored={tailored} />}

              {panel === 'ats' && (
                <>
                  {gap ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                      'rounded-[10px] px-3 py-0.5 text-[26px] font-extrabold',
                      gap.matchScore >= 75
                        ? 'bg-ok/12 text-ok'
                        : gap.matchScore >= 50
                          ? 'bg-warn/12 text-warn'
                          : 'bg-danger/12 text-danger'
                    )}
                          >
                            {gap.matchScore}
                          </span>
                          {prevScore !== null && prevScore !== gap.matchScore && (
                            <span className="text-[12px] text-muted-foreground line-through">was {prevScore}</span>
                          )}
                          <span className="text-[13px] text-muted-foreground">match score</span>
                        </div>
                        <Button onClick={rescan} disabled={!!busy}>
                          {busy === 'Re-scanning…' ? <Spinner text="Re-scanning…" /> : 'Re-scan ATS'}
                        </Button>
                      </div>
                      {gap.missing.length > 0 && (
                        <div className="mt-3 text-[13px]">
                          <strong>Missing keywords</strong>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {gap.missing.map((m, i) => (
                              <PickChip
                                key={i}
                                on={picked.has(`kw:${i}`)}
                                tone="danger"
                                onClick={() => togglePick(`kw:${i}`)}
                              >
                                {m}
                              </PickChip>
                            ))}
                          </div>
                        </div>
                      )}
                      {gap.terminology.length > 0 && (
                        <div className="mt-3 text-[13px]">
                          <strong>Terminology to align</strong>
                          <div className="mt-1.5 flex flex-col gap-1">
                            {gap.terminology.map((t, i) => (
                              <PickRow
                                key={i}
                                on={picked.has(`term:${i}`)}
                                onClick={() => togglePick(`term:${i}`)}
                              >
                                <span className="text-muted-foreground">{t.from}</span> &rarr;{' '}
                                <span className="font-semibold text-primary">{t.to}</span>
                              </PickRow>
                            ))}
                          </div>
                        </div>
                      )}
                      {gap.notes.length > 0 && (
                        <div className="mt-3 text-[13px]">
                          <strong>Suggestions</strong>
                          <div className="mt-1.5 flex flex-col gap-1">
                            {gap.notes.map((n, i) => (
                              <PickRow
                                key={i}
                                on={picked.has(`note:${i}`)}
                                onClick={() => togglePick(`note:${i}`)}
                              >
                                <span className="text-muted-foreground">{n}</span>
                              </PickRow>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No ATS analysis yet.</p>
                  )}
                </>
              )}

              {panel === 'cover' && (
                <>
                  {cover ? (
                    <>
                      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                        <Button variant="ghost" onClick={copyCover}>
                          Copy text
                        </Button>
                        <Button variant="ghost" onClick={exportCoverPdf}>
                          Export PDF
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={genCover}
                          disabled={!!busy || !jd.trim()}
                        >
                          {busy === 'Writing cover letter…' ? (
                            <Spinner text="Rewriting…" />
                          ) : (
                            'Regenerate'
                          )}
                        </Button>
                      </div>
                      <Area value={cover} onChange={setCover} rows={20} />
                    </>
                  ) : (
                    <div>
                      <p className="text-[13px] text-muted-foreground">No cover letter yet.</p>
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
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-2 gap-x-3.5">
                    <Field label="Company" value={company} onChange={setCompany} />
                    <Field label="Role" value={role} onChange={setRole} />
                  </div>
                  <div className="flex w-full items-end gap-2">
                    <Field
                      label="Job posting URL"
                      value={jobUrl}
                      onChange={setJobUrl}
                      full
                      onEnter={fetchFromUrl}
                    />
                    <Button
                      variant="ghost"
                      onClick={fetchFromUrl}
                      disabled={!!busy || fetching || !jobUrl.trim()}
                    >
                      {fetching ? <Spinner text="Fetching…" /> : 'Fetch'}
                    </Button>
                  </div>
                  <Area label="Job description" value={jd} onChange={setJd} rows={16} />
                  <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                    <Button onClick={runAll} disabled={!!busy || !jd.trim()}>
                      {busy ? <Spinner text={busy} /> : 'Re-tailor from scratch'}
                    </Button>
                  </div>
                  <p className="text-[13px] text-muted-foreground" style={{ marginTop: 8 }}>
                    Re-tailoring rebuilds the resume from your base and starts a fresh chat. To make
                    small changes, just ask in the chat instead.
                  </p>
                </div>
              )}
            </div>
            {panel === 'ats' && gap && (
              <div className="flex shrink-0 items-center gap-2.5 border-t border-surface bg-card-muted px-4 py-3">
                <button
                  className="text-[12px] font-medium text-primary"
                  onClick={() => {
                    const all = new Set<string>()
                    gap.missing.forEach((_, i) => all.add(`kw:${i}`))
                    gap.terminology.forEach((_, i) => all.add(`term:${i}`))
                    gap.notes.forEach((_, i) => all.add(`note:${i}`))
                    setPicked(picked.size === all.size ? new Set() : all)
                  }}
                >
                  {picked.size ===
                  gap.missing.length + gap.terminology.length + gap.notes.length
                    ? 'Clear all'
                    : 'Select all'}
                </button>
                <span className="text-[12px] text-faint">
                  {picked.size === 0
                    ? 'Tick what you want addressed'
                    : `${picked.size} selected`}
                </span>
                <div className="flex-1" />
                <Button onClick={optimizePicked} disabled={picked.size === 0 || !!busy}>
                  Draft in chat
                </Button>
              </div>
            )}
        </aside>
      </div>
    </div>
  )
}

/** A tickable keyword chip. Selected state has to survive on a dark panel too. */
function PickChip({
  on,
  tone,
  onClick,
  children
}: {
  on: boolean
  tone: 'danger'
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[20px] px-2.5 py-1 text-left text-[12px] transition-colors',
        on
          ? 'bg-primary text-primary-foreground'
          : tone === 'danger'
            ? 'bg-danger/12 text-danger hover:bg-danger/20'
            : 'bg-card-muted'
      )}
    >
      <span
        className={cn(
          'grid h-3 w-3 shrink-0 place-items-center rounded-[3px] border',
          on ? 'border-current bg-current/20' : 'border-current/40'
        )}
      >
        {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      {children}
    </button>
  )
}

/** A tickable line, for terminology swaps and longer suggestions. */
function PickRow({
  on,
  onClick,
  children
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] leading-relaxed transition-colors',
        on ? 'bg-primary-soft ring-1 ring-primary-line' : 'hover:bg-card-muted'
      )}
    >
      <span
        className={cn(
          'mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'
        )}
      >
        {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0 text-pretty">{children}</span>
    </button>
  )
}
