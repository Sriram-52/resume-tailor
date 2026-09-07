import { useState } from 'react'
import type { Application, ApplicationStatus } from '../../../shared/application'
import { getTemplate, renderCoverLetter } from '../templates'
import { Button } from '../ui'
import { pdfFileName } from '../../../shared/filename'

const COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'applied', label: 'Applied' },
  { status: 'interviewing', label: 'Interviewing' },
  { status: 'offer', label: 'Offer' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'archived', label: 'Archived' }
]

function scoreClass(n: number): string {
  return n >= 75 ? 'hi' : n >= 50 ? 'mid' : 'lo'
}

/** "2026-09-06" -> "Sep 6" so it fits a narrow card. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Applications({
  apps,
  setApps,
  onContinueDraft
}: {
  apps: Application[]
  setApps: (a: Application[]) => void
  /** Seed the Tailor draft and jump to it; the base id re-selects that profile globally. */
  onContinueDraft: (baseId?: string) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Application | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<ApplicationStatus | null>(null)
  const [sort, setSort] = useState<'score' | 'date'>(() => {
    try {
      return (localStorage.getItem('apps.sort') as 'score' | 'date') || 'score'
    } catch {
      return 'score'
    }
  })

  function changeSort(v: 'score' | 'date'): void {
    setSort(v)
    try {
      localStorage.setItem('apps.sort', v)
    } catch {
      /* ignore */
    }
  }

  /** Highest ATS first (unscored last), or newest first. Ties fall back to the other key. */
  function order(list: Application[]): Application[] {
    const score = (a: Application): number => a.keywordGap?.matchScore ?? -1
    return [...list].sort((a, b) =>
      sort === 'score'
        ? score(b) - score(a) || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt) || score(b) - score(a)
    )
  }

  /** Reopen a saved application in the Tailor workspace by seeding its draft. */
  async function openInTailor(a: Application): Promise<void> {
    await window.api.saveDraft({
      jd: a.jobDescription,
      company: a.company,
      role: a.role,
      jobUrl: a.jobUrl ?? '',
      templateId: a.template,
      baseId: a.baseId ?? '',
      tailored: a.tailored,
      gap: a.keywordGap,
      cover: a.coverLetter,
      appId: a.id,
      appCreatedAt: a.createdAt
    })
    onContinueDraft(a.baseId)
  }

  async function setStatus(a: Application, status: ApplicationStatus): Promise<void> {
    if (a.status === status) return
    const updated = await window.api.saveApplication({ ...a, status })
    setApps(updated)
  }

  async function remove(a: Application): Promise<void> {
    const updated = await window.api.deleteApplication(a.id)
    setApps(updated)
    if (selected?.id === a.id) setSelected(null)
  }

  async function exportOne(a: Application): Promise<void> {
    const html = getTemplate(a.template).render(a.tailored)
    await window.api.exportPdf(html, pdfFileName(a.tailored.basics.name, a.company, a.role))
  }

  async function exportCover(a: Application): Promise<void> {
    if (!a.coverLetter) return
    const html = renderCoverLetter(a.tailored, a.coverLetter, {
      company: a.company,
      role: a.role,
      date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    })
    await window.api.exportPdf(html, pdfFileName(a.tailored.basics.name, a.company, a.role, 'cover'))
  }

  function onDrop(status: ApplicationStatus, e: React.DragEvent): void {
    // Prefer the id carried by the drag itself; state can lag behind fast drags.
    const id = e.dataTransfer.getData('text/plain') || dragId
    const a = apps.find((x) => x.id === id)
    setDragId(null)
    setOverCol(null)
    if (a) void setStatus(a, status)
  }

  if (apps.length === 0) {
    return (
      <div className="screen">
        <h2>Applications</h2>
        <div className="panel">
          <p className="muted">Nothing yet. Tailor a resume and click "Save to tracker", or add links in Queue.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen apps">
      <div className="screen-head">
        <h2>Applications</h2>
        <div className="row">
          <span className="muted">Drag a card between columns to change its status.</span>
          <label className="sort-ctl">
            <span className="muted">Sort</span>
            <select value={sort} onChange={(e) => changeSort(e.target.value as 'score' | 'date')}>
              <option value="score">ATS score</option>
              <option value="date">Newest</option>
            </select>
          </label>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => {
          const cards = order(apps.filter((a) => a.status === col.status))
          return (
            <div
              key={col.status}
              className={`kcol ${overCol === col.status ? 'drop-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                if (overCol !== col.status) setOverCol(col.status)
              }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                onDrop(col.status, e)
              }}
            >
              <div className={`kcol-head status-${col.status}`}>
                <span>{col.label}</span>
                <span className="kcount">{cards.length}</span>
              </div>
              {cards.map((a) => (
                <div
                  key={a.id}
                  className={`kcard ${dragId === a.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDragId(a.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', a.id)
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverCol(null)
                  }}
                  onDoubleClick={() => openInTailor(a)}
                  title="Double-click to open in Tailor"
                >
                  <div className="kcard-title">{a.company}</div>
                  <div className="kcard-role">{a.role}</div>
                  <div className="kcard-meta">
                    {typeof a.keywordGap?.matchScore === 'number' ? (
                      <span className={`ats-cell score-${scoreClass(a.keywordGap.matchScore)}`} title="ATS match">
                        {a.keywordGap.matchScore}
                      </span>
                    ) : (
                      <span className="muted" title="No ATS score yet">—</span>
                    )}
                    <span className="muted" title={a.createdAt.slice(0, 10)}>{shortDate(a.createdAt)}</span>
                    {a.jobUrl && (
                      <a className="posting-link" href={a.jobUrl} target="_blank" rel="noreferrer" title="Open the job posting">
                        ↗ posting
                      </a>
                    )}
                  </div>
                  <div className="kcard-actions">
                    <Button variant="ghost" onClick={() => openInTailor(a)} title="Open in Tailor">
                      Open
                    </Button>
                    <Button variant="ghost" onClick={() => setSelected(a)} title="Preview">
                      View
                    </Button>
                    <Button variant="ghost" onClick={() => exportOne(a)} title="Export resume PDF">
                      PDF
                    </Button>
                    <Button variant="danger" onClick={() => remove(a)} title="Delete">
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="kempty">Drop here</div>}
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="drawer" onClick={() => setSelected(null)}>
          <div className="drawer-body" onClick={(e) => e.stopPropagation()}>
            <div className="row space">
              <h3>
                {selected.company} · {selected.role}
              </h3>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
            <div className="drawer-preview">
              <iframe title="app-preview" srcDoc={getTemplate(selected.template).render(selected.tailored)} />
            </div>
            {selected.coverLetter && (
              <>
                <div className="row space">
                  <h4>Cover letter</h4>
                  <Button variant="ghost" onClick={() => exportCover(selected)}>
                    Export PDF
                  </Button>
                </div>
                <pre className="cover-pre">{selected.coverLetter}</pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
