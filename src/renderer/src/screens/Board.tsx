import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Flame, MoreHorizontal, Search, Sparkles, X } from 'lucide-react'
import type { Application, ApplicationStatus } from '../../../shared/application'
import {
  DATE_RANGES,
  goalProgress,
  inDateRange,
  type DateRange,
  type GoalProgress
} from '../../../shared/goals'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button, IconButton } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu'

/**
 * The application board. Five of the six columns are Jobright's own statuses —
 * so the counts here reconcile exactly with what Jobright shows — plus
 * "Tailored", which is local-only: a resume exists for the job but nothing has
 * been sent, so there is nothing to tell Jobright about yet.
 *
 * Moving a card out of Tailored is what marks the job applied on their side.
 */

const COLUMNS: { key: ApplicationStatus; label: string; dot: string }[] = [
  { key: 'draft', label: 'Tailored', dot: 'var(--primary)' },
  { key: 'applied', label: 'Applied', dot: '#2f6f8a' },
  { key: 'interviewing', label: 'Interviewing', dot: '#7a5cc4' },
  { key: 'offer', label: 'Offer', dot: 'var(--ok)' },
  { key: 'rejected', label: 'Rejected', dot: 'var(--danger)' },
  { key: 'archived', label: 'Archived', dot: 'var(--faint)' }
]

const THRESHOLDS = [90, 85, 80, 75, 70, 60] as const

/**
 * Card order within a column. Date is the default because the board is mostly a
 * timeline, but once a column holds a hundred cards you want to find the ones
 * worth acting on — which is a score question, not a date one.
 */
type SortKey = 'newest' | 'oldest' | 'fit' | 'ats' | 'company'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'fit', label: 'Highest fit' },
  { key: 'ats', label: 'Highest ATS' },
  { key: 'company', label: 'Company A–Z' }
]

/** Records with no score sort last rather than as a zero. */
function compare(a: Application, b: Application, by: SortKey): number {
  const score = (x: Application): number | null => x.keywordGap?.matchScore ?? null
  switch (by) {
    case 'oldest':
      return a.createdAt.localeCompare(b.createdAt)
    case 'fit':
      return (b.fit ?? -1) - (a.fit ?? -1)
    case 'ats':
      return (score(b) ?? -1) - (score(a) ?? -1)
    case 'company':
      return a.company.localeCompare(b.company, undefined, { sensitivity: 'base' })
    default:
      return b.createdAt.localeCompare(a.createdAt)
  }
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

/** Board filter state. Held by the shell so it survives a tab switch. */
export interface BoardView {
  query: string
  /** '' = no threshold; 'none' on ATS = show only records never tailored. */
  fit: string
  ats: string
  sort: SortKey
  date: DateRange
}

export function emptyBoardView(): BoardView {
  return { query: '', fit: '', ats: '', sort: 'newest', date: 'all' }
}

export function Board({
  apps,
  onMove,
  onOpen,
  onDelete,
  view,
  onView,
  dailyGoal
}: {
  apps: Application[]
  onMove: (id: string, status: ApplicationStatus) => void
  onOpen: (app: Application) => void
  onDelete: (id: string) => void
  view: BoardView
  onView: (v: BoardView) => void
  /** Applications per day to aim for. 0 hides the goal bar entirely. */
  dailyGoal: number
}): React.JSX.Element {
  const { query, fit, ats, sort, date } = view
  const setQuery = (query: string): void => onView({ ...view, query })
  const setFit = (fit: string): void => onView({ ...view, fit })
  const setAts = (ats: string): void => onView({ ...view, ats })
  const setSort = (sort: SortKey): void => onView({ ...view, sort })
  const setDate = (date: DateRange): void => onView({ ...view, date })

  // Progress is measured against every record, not the filtered view — a date
  // filter is for looking around, and must not appear to reset today's count.
  const progress = useMemo(() => goalProgress(apps, dailyGoal), [apps, dailyGoal])
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null)
  const [detail, setDetail] = useState<Application | null>(null)

  // Keep the open panel in step with the board (a status move rewrites the record).
  const openRecord = detail ? (apps.find((a) => a.id === detail.id) ?? null) : null
  useEffect(() => {
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  /**
   * Search spans the whole record, not just the title — the job description is
   * where "postgres" or "HIPAA" actually appears, and that is usually what you
   * are trying to find again months later.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => {
      if (!inDateRange(a, date)) return false
      if (fit && (a.fit ?? -1) < Number(fit)) return false
      const score = a.keywordGap?.matchScore ?? null
      if (ats === 'none' && score !== null) return false
      if (ats && ats !== 'none' && (score ?? -1) < Number(ats)) return false
      if (!q) return true
      return (
        a.company.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.notes ?? '').toLowerCase().includes(q) ||
        (a.jobDescription ?? '').toLowerCase().includes(q)
      )
    })
  }, [apps, query, fit, ats, date])

  const byStatus = useMemo(() => {
    const m = new Map<ApplicationStatus, Application[]>()
    for (const c of COLUMNS) m.set(c.key, [])
    for (const a of filtered) m.get(a.status)?.push(a)
    for (const list of m.values()) list.sort((x, y) => compare(x, y, sort))
    return m
  }, [filtered, sort])

  return (
    <>
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card-muted px-5 py-2">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            placeholder="Search company, role, notes, description"
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={fit || 'any'} onValueChange={(v) => setFit(v === 'any' ? '' : v)}>
          <SelectTrigger className="w-[118px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Fit: any</SelectItem>
            {THRESHOLDS.map((t) => (
              <SelectItem key={t} value={String(t)}>
                Fit ≥ {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ats || 'any'} onValueChange={(v) => setAts(v === 'any' ? '' : v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">ATS: any</SelectItem>
            {THRESHOLDS.map((t) => (
              <SelectItem key={t} value={String(t)}>
                ATS ≥ {t}
              </SelectItem>
            ))}
            <SelectItem value="none">Not tailored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={date} onValueChange={(v) => setDate(v as DateRange)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {dailyGoal > 0 && <GoalMeter progress={progress} />}
        <span className="text-[11.5px] text-faint">
          Showing <b className="tnum text-foreground">{filtered.length}</b> of {apps.length}
          {query ? ` · matching “${query}”` : ''}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 px-5">
        {COLUMNS.map((col) => {
          const list = byStatus.get(col.key) ?? []
          return (
            <div
              key={col.key}
              className={cn(
                'flex w-[300px] shrink-0 flex-col rounded-[12px] border border-border bg-surface',
                dragOver === col.key && 'border-primary bg-primary-soft'
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(col.key)
              }}
              onDragLeave={() => setDragOver((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                const id = e.dataTransfer.getData('text/plain')
                if (id) onMove(id, col.key)
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] font-semibold">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: col.dot }}
                />
                <span className="truncate">{col.label}</span>
                <Badge tone="count" className="ml-auto bg-card">
                  {list.length}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 [&>*]:shrink-0">
                {!list.length && (
                  <div className="rounded-[10px] border border-dashed border-border-strong px-1 py-3.5 text-center text-[11.5px] text-faint">
                    Nothing here
                  </div>
                )}
                {list.map((a) => {
                  const score = a.keywordGap?.matchScore ?? null
                  return (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
                      onClick={() => setDetail(a)}
                      role="presentation"
                      className={cn(
                        'group shrink-0 cursor-grab rounded-[10px] border border-border bg-card p-2.5 shadow-[0_1px_2px_rgba(28,26,23,0.04)]',
                        score === null && 'opacity-60'
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] text-muted-foreground">
                            {a.company}
                          </div>
                          <div className="text-[12.5px] font-semibold leading-snug text-pretty">
                            {a.role}
                          </div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} role="presentation">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="opacity-0 transition-opacity group-hover:opacity-100">
                              <MoreHorizontal className="h-3.5 w-3.5 text-faint" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetail(a)}>
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpen(a)}>
                                Open in Tailor
                              </DropdownMenuItem>
                              {a.jobUrl && (
                                <DropdownMenuItem
                                  onClick={() => void window.api.openExternal(a.jobUrl as string)}
                                >
                                  Open posting
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onClick={() => onDelete(a.id)}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {a.fit != null && (
                          <Badge tone="ok" className="px-1.5 text-[10px]">
                            Fit {a.fit}
                          </Badge>
                        )}
                        {score !== null ? (
                          <Badge tone="ats" className="px-1.5 text-[10px]">
                            ATS {score}
                          </Badge>
                        ) : (
                          <Badge tone="neutral" className="px-1.5 text-[10px] font-normal">
                            no ATS
                          </Badge>
                        )}
                        <span className="tnum ml-auto text-[10.5px] text-faint">
                          {shortDate(a.createdAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {openRecord && (
        <ApplicationDetail
          app={openRecord}
          onClose={() => setDetail(null)}
          onOpenTailor={() => {
            const a = openRecord
            setDetail(null)
            onOpen(a)
          }}
          onMove={onMove}
        />
      )}
    </>
  )
}

/**
 * The detail slide-over: what this job was, what the tailoring found, and the
 * two things you might want to do next. Read-only apart from the status move —
 * editing the resume is what the Tailor workspace is for.
 */
function ApplicationDetail({
  app,
  onClose,
  onOpenTailor,
  onMove
}: {
  app: Application
  onClose: () => void
  onOpenTailor: () => void
  onMove: (id: string, status: ApplicationStatus) => void
}): React.JSX.Element {
  const score = app.keywordGap?.matchScore ?? null
  const gap = app.keywordGap
  return (
    <>
      <button
        className="fixed inset-0 z-30 cursor-default bg-[#1c1a17]/30"
        onClick={onClose}
        aria-label="Close details"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-[560px] max-w-[92vw] flex-col border-l border-border bg-card shadow-[-12px_0_28px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3 border-b border-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-muted-foreground">{app.company}</div>
            <h2 className="m-0 mt-0.5 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-pretty">
              {app.role}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {app.fit != null && <Badge tone="ok">Fit {app.fit}</Badge>}
              {score !== null ? (
                <Badge tone="ats">ATS {score}</Badge>
              ) : (
                <Badge tone="neutral" className="font-normal">
                  never tailored
                </Badge>
              )}
              {app.jdSource === 'jobright' && (
                <Badge tone="warn" className="font-normal">
                  summary only
                </Badge>
              )}
              <span className="tnum text-[11px] text-faint">{shortDate(app.createdAt)}</span>
            </div>
          </div>
          <IconButton onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="flex items-center gap-2 border-b border-surface bg-card-muted px-5 py-2.5">
          <Select value={app.status} onValueChange={(v) => onMove(app.id, v as ApplicationStatus)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {app.jobUrl && (
            <Button
              variant="ghost"
              title="Open the job posting"
              onClick={() => void window.api.openExternal(app.jobUrl as string)}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Posting
            </Button>
          )}
          <Button onClick={onOpenTailor}>
            <Sparkles className="h-3.5 w-3.5" /> Open in Tailor
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 [&>*]:shrink-0">
          {gap && (gap.missing.length > 0 || gap.matched.length > 0) && (
            <section>
              <h3 className="mb-2 text-[12px] font-semibold">Keyword gap</h3>
              {gap.missing.length > 0 && (
                <>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">
                    Missing
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {gap.missing.map((k) => (
                      <span
                        key={k}
                        className="rounded-[20px] bg-danger-soft px-2 py-0.5 text-[11.5px] text-danger"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {gap.matched.length > 0 && (
                <>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">
                    Matched
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gap.matched.map((k) => (
                      <span
                        key={k}
                        className="rounded-[20px] bg-ok-soft px-2 py-0.5 text-[11.5px] text-ok"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[12px] font-semibold">Job description</h3>
            {app.jobDescription?.trim() ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-muted-foreground">
                {app.jobDescription}
              </pre>
            ) : (
              <p className="m-0 text-[12.5px] leading-relaxed text-faint text-pretty">
                No description stored. This one was imported from your Jobright history rather than
                tailored here, so only the posting itself has the full text.
              </p>
            )}
          </section>

          {app.notes?.trim() && (
            <section>
              <h3 className="mb-2 text-[12px] font-semibold">Notes</h3>
              <p className="m-0 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                {app.notes}
              </p>
            </section>
          )}
        </div>
      </aside>
    </>
  )
}

/**
 * Today's progress against the daily goal, plus the streak.
 *
 * The streak only counts days that met the goal, and today is never allowed to
 * break it while it is still in progress — a run should not read as broken at
 * nine in the morning.
 */
function GoalMeter({ progress }: { progress: GoalProgress }): React.JSX.Element {
  const pct = Math.min(100, Math.round((progress.today / progress.goal) * 100))
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="tnum text-[12px] font-semibold">
          {progress.today}
          <span className="text-faint"> / {progress.goal}</span>
        </span>
        <span className="text-[11px] text-faint">today</span>
      </div>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500',
            progress.metToday ? 'bg-ok' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      {progress.streak > 0 && (
        <span
          className="flex items-center gap-1 rounded-[20px] bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn"
          title={`${progress.streak} day streak · best ${progress.best}`}
        >
          <Flame className="h-3 w-3" />
          <span className="tnum">{progress.streak}</span>
        </span>
      )}
    </div>
  )
}
