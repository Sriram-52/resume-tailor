import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Link as LinkIcon,
  Loader2,
  Briefcase,
  Building2,
  Check,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  MapPin,
  Sparkles,
  Star,
  X
} from 'lucide-react'
import type { JobrightFeed, JobrightJob } from '../../../shared/jobright'
import type { Application } from '../../../shared/application'
import type { ResumeProfile } from '../../../shared/resume'
import type { QueueItem } from '../../../shared/queue'
import { BULK_WARN_THRESHOLD, isActive } from '../../../shared/queue'
import { cn } from '../lib/utils'
import { Button, IconButton } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge, Kbd } from '../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '../components/ui/dialog'
import { Hinted } from '../components/ui/tooltip'
import { SectionLabel } from '../components/ui/panel'
import { FitBreakdown, RankLabel, ScoreRing, ringColor } from '../components/ui/score'

/**
 * The Jobs screen: the ranked feed, a detail pane, bulk selection, and the
 * queue drawer. Everything a job can have done to it happens here.
 *
 * The two scores are deliberately kept apart. Fit is Jobright's and lives only
 * on the dark panel with its own breakdown; ATS is ours, only exists once a job
 * has been tailored, and shows as a petrol badge on the light side of the card.
 */

function salaryText(job: JobrightJob): string {
  if (job.salaryDesc) return job.salaryDesc
  if (job.minSalary && job.maxSalary) {
    const k = (n: number): string => `$${Math.round(n / 1000)}K`
    return `${k(job.minSalary)} – ${k(job.maxSalary)}`
  }
  return 'Not disclosed'
}

/** Company initial as a stand-in when Jobright has no logo on file. */
function Logo({ job, size = 44 }: { job: JobrightJob; size?: number }): React.JSX.Element {
  const hue = [...job.company].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  if (job.companyLogo) {
    return (
      <img
        src={job.companyLogo}
        alt=""
        className="shrink-0 rounded-[10px] object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[10px] font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `oklch(0.42 0.09 ${hue})`,
        fontSize: size / 2.6
      }}
    >
      {job.company.charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function Meta({
  icon: Icon,
  children
}: {
  icon: typeof MapPin
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
      <Icon className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.8} />
      <span className="truncate">{children}</span>
    </div>
  )
}

/**
 * Feed ordering. Jobright returns its own ranking, which is the sensible
 * default — but once a page of results is on screen the useful questions are
 * usually "what did I already tailor well for" and "what pays most".
 */
type FeedSort = 'fit' | 'ats' | 'newest' | 'salary'
const FEED_SORTS: { key: FeedSort; label: string }[] = [
  { key: 'fit', label: 'Best fit' },
  { key: 'ats', label: 'Highest ATS' },
  { key: 'newest', label: 'Most recent' },
  { key: 'salary', label: 'Highest salary' }
]

export interface JobsProps {
  tab: JobrightFeed
  jobs: JobrightJob[]
  loading: boolean
  error: string
  apps: Application[]
  queue: QueueItem[]
  profiles: ResumeProfile[]
  activeId: string
  drawerOpen: boolean
  onCloseDrawer: () => void
  onQueue: (jobs: JobrightJob[], baseId: string) => void
  onIgnore: (job: JobrightJob) => void
  onApply: (job: JobrightJob) => void
  onRetry: (id: string) => void
  onRemoveQueued: (id: string) => void
  onClearFinished: () => void
  search: string
  /** Present only on the External tab: add a job by pasting its URL. */
  onAddExternal?: (url: string) => Promise<boolean>
  /** Present only on the External tab: open a blank workspace to paste a description into. */
  onPasteDescription?: () => void
  onRemoveExternal?: (jobId: string) => void
}

export function Jobs(props: JobsProps): React.JSX.Element {
  const { jobs, apps, queue, search } = props
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [paneTab, setPaneTab] = useState<'overview' | 'company'>('overview')
  const [baseId, setBaseId] = useState(props.activeId)
  const [confirmBulk, setConfirmBulk] = useState<JobrightJob[] | null>(null)
  const [sort, setSort] = useState<FeedSort>('fit')
  const [hideApplied, setHideApplied] = useState(true)
  const lastClicked = useRef<string | null>(null)

  useEffect(() => setBaseId(props.activeId), [props.activeId])
  // A feed swap invalidates both the selection and whatever pane was open.
  useEffect(() => {
    setSelected(new Set())
    setOpenId(null)
  }, [props.tab])

  useEffect(() => {
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape' && selected.size) setSelected(new Set())
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [selected.size])

  /**
   * The application for a job, if the board already has one.
   *
   * Matched on Jobright's job id, then on company+title. The fallback matters:
   * Jobright reposts the same role under a new id, and records saved before the
   * id was preserved have none at all — without it, jobs you have already
   * applied to keep reappearing in the feed as if they were new.
   */
  const titleKey = (company: string, role: string): string =>
    `${company.toLowerCase().trim()}|${role.toLowerCase().replace(/\s+/g, ' ').trim()}`

  const appByJob = useMemo(() => {
    const byId = new Map<string, Application>()
    const byTitle = new Map<string, Application>()
    for (const a of apps) {
      if (a.jobId) byId.set(a.jobId, a)
      const k = titleKey(a.company, a.role)
      // Prefer the furthest-along record when a title collides.
      if (!byTitle.has(k) || byTitle.get(k)!.status === 'draft') byTitle.set(k, a)
    }
    return {
      get: (job: JobrightJob): Application | undefined =>
        byId.get(job.jobId) ?? byTitle.get(titleKey(job.company, job.title))
    }
  }, [apps])

  const queuedIds = useMemo(
    () => new Set(queue.filter((q) => isActive(q.status)).map((q) => q.jobId)),
    [queue]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Anything already sent is off the feed: the point of Recommended is what
    // is left to do. Tailored-but-unsent drafts stay, since they still need
    // acting on. Jobright keeps recommending applied jobs because its own
    // record of them is incomplete, so this has to be decided locally.
    const outstanding = hideApplied
      ? jobs.filter((j) => {
          const a = appByJob.get(j)
          return !a || a.status === 'draft'
        })
      : jobs
    const matched = q
      ? outstanding.filter(
          (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
        )
      : outstanding
    const atsOf = (j: JobrightJob): number => appByJob.get(j)?.keywordGap?.matchScore ?? -1
    const sorted = [...matched]
    switch (sort) {
      case 'ats':
        sorted.sort((a, b) => atsOf(b) - atsOf(a))
        break
      case 'newest':
        sorted.sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0))
        break
      case 'salary':
        sorted.sort((a, b) => (b.maxSalary ?? b.minSalary ?? -1) - (a.maxSalary ?? a.minSalary ?? -1))
        break
      default:
        // Jobright's own ranking, which is what the feed arrives in.
        sorted.sort((a, b) => (b.fitExact ?? b.fit) - (a.fitExact ?? a.fit))
    }
    return sorted
  }, [jobs, search, sort, appByJob, hideApplied])

  const open = visible.find((j) => j.jobId === openId) ?? null

  function toggle(job: JobrightJob, shiftKey: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev)
      // Shift-click takes the run between the last click and this one — how you
      // actually pick "the top twelve" without twelve clicks.
      if (shiftKey && lastClicked.current) {
        const from = visible.findIndex((j) => j.jobId === lastClicked.current)
        const to = visible.findIndex((j) => j.jobId === job.jobId)
        if (from >= 0 && to >= 0) {
          const [lo, hi] = from < to ? [from, to] : [to, from]
          for (let i = lo; i <= hi; i++) next.add(visible[i].jobId)
          lastClicked.current = job.jobId
          return next
        }
      }
      if (next.has(job.jobId)) next.delete(job.jobId)
      else next.add(job.jobId)
      lastClicked.current = job.jobId
      return next
    })
  }

  function queueSelected(): void {
    const picked = visible.filter((j) => selected.has(j.jobId))
    if (!picked.length) return
    if (picked.length > BULK_WARN_THRESHOLD) {
      setConfirmBulk(picked)
      return
    }
    props.onQueue(picked, baseId)
    setSelected(new Set())
  }

  const active = queue.filter((q) => isActive(q.status))
  const finished = queue.filter((q) => !isActive(q.status))

  return (
    <>
      {props.onAddExternal && (
        <AddByUrl onAdd={props.onAddExternal} onPaste={props.onPasteDescription} />
      )}

      <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card-muted px-5 py-2">
        <Select value={sort} onValueChange={(v) => setSort(v as FeedSort)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEED_SORTS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={hideApplied ? 'subtle' : 'ghost'}
          onClick={() => setHideApplied((v) => !v)}
          title="Jobright keeps recommending jobs you have already applied to"
        >
          {hideApplied ? 'Hiding applied' : 'Showing all'}
        </Button>
        <div className="flex-1" />
        <span className="text-[11.5px] text-faint">
          {visible.length === jobs.length ? (
            <>
              <b className="tnum text-foreground">{jobs.length}</b> jobs
            </>
          ) : (
            <>
              Showing <b className="tnum text-foreground">{visible.length}</b> of {jobs.length}
            </>
          )}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'flex flex-col gap-3 overflow-y-auto p-4 px-5 [&>*]:shrink-0',
            open ? 'w-[452px] shrink-0 border-r border-border' : 'flex-1'
          )}
        >
          {props.loading && !jobs.length ? (
            <Empty>Loading the feed…</Empty>
          ) : props.error && !jobs.length ? (
            <Empty>{props.error}</Empty>
          ) : !visible.length ? (
            <Empty>
              {search
                ? `Nothing matching “${search}”.`
                : props.onAddExternal
                  ? 'Nothing here yet. Paste a job posting URL above, or paste the description itself, to tailor it.'
                  : 'No jobs in this feed yet.'}
            </Empty>
          ) : open ? (
            visible.map((job) => (
              <MiniCard
                key={job.jobId}
                job={job}
                on={job.jobId === open.jobId}
                ats={appByJob.get(job)?.keywordGap?.matchScore ?? null}
                onClick={() => setOpenId(job.jobId)}
              />
            ))
          ) : (
            visible.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                picked={selected.has(job.jobId)}
                queued={queuedIds.has(job.jobId)}
                ats={appByJob.get(job)?.keywordGap?.matchScore ?? null}
                onToggle={(e) => toggle(job, e.shiftKey)}
                onOpen={() => setOpenId(job.jobId)}
                onIgnore={() => props.onIgnore(job)}
                onPrimary={() =>
                  appByJob.get(job) ? props.onApply(job) : props.onQueue([job], baseId)
                }
              />
            ))
          )}
        </div>

        {open && (
          <DetailPane
            job={open}
            tab={paneTab}
            setTab={setPaneTab}
            tailored={!!appByJob.get(open)}
            onClose={() => setOpenId(null)}
            onPrimary={() =>
              appByJob.get(open) ? props.onApply(open) : props.onQueue([open], baseId)
            }
          />
        )}

        {props.drawerOpen && (
          <>
            <button
              className="absolute inset-0 cursor-default bg-[#1c1a17]/20"
              onClick={props.onCloseDrawer}
              aria-label="Close queue"
            />
            <QueueDrawer
              active={active}
              finished={finished}
              onClose={props.onCloseDrawer}
              onRetry={props.onRetry}
              onRemove={props.onRemoveQueued}
              onClearFinished={props.onClearFinished}
            />
          </>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mx-5 mb-4 flex h-[60px] shrink-0 items-center gap-3 rounded-[12px] bg-ink px-4 text-ink-foreground shadow-[0_6px_20px_rgba(28,26,23,0.16)]">
          <span className="grid h-[17px] w-[17px] place-items-center rounded-[5px] bg-primary text-white">
            <Check className="h-3 w-3" strokeWidth={3.2} />
          </span>
          <b className="text-[13px]">{selected.size} selected</b>
          <span className="h-5 w-px bg-ink-line" />
          <span className="text-[12.5px] text-ink-muted">Tailor with</span>
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger tone="ink" className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={queueSelected}>
            <Sparkles className="h-3.5 w-3.5" />
            Tailor {selected.size} {selected.size === 1 ? 'job' : 'jobs'}
          </Button>
          <span className="h-5 w-px bg-ink-line" />
          <Button
            variant="ink"
            onClick={() => {
              for (const j of visible.filter((x) => selected.has(x.jobId))) props.onIgnore(j)
              setSelected(new Set())
            }}
          >
            Ignore
          </Button>
          <div className="flex-1" />
          <Button variant="ink" onClick={() => setSelected(new Set())}>
            Clear <Kbd>esc</Kbd>
          </Button>
        </div>
      )}

      {/* Tailoring is two Claude calls per job, so a big batch is worth confirming. */}
      <Dialog open={!!confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <DialogContent>
          <DialogTitle>Tailor {confirmBulk?.length} jobs?</DialogTitle>
          <DialogDescription>
            That is {(confirmBulk?.length ?? 0) * 2} Claude calls, run{' '}
            {Math.min(3, confirmBulk?.length ?? 0)} at a time. They run in the background — you can
            keep browsing while they finish.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBulk(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmBulk) props.onQueue(confirmBulk, baseId)
                setConfirmBulk(null)
                setSelected(new Set())
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Tailor them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid flex-1 place-items-center p-10 text-center text-muted-foreground">
      {children}
    </div>
  )
}

// ---- cards ----------------------------------------------------------------

function JobCard({
  job,
  picked,
  queued,
  ats,
  onToggle,
  onOpen,
  onIgnore,
  onPrimary
}: {
  job: JobrightJob
  picked: boolean
  queued: boolean
  ats: number | null
  onToggle: (e: React.MouseEvent) => void
  onOpen: () => void
  onIgnore: () => void
  onPrimary: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 overflow-hidden rounded-[12px] border border-border bg-card shadow-[0_1px_2px_rgba(28,26,23,0.04)]',
        picked && 'border-primary ring-1 ring-primary'
      )}
    >
      <div
        className={cn(
          'flex w-[38px] shrink-0 cursor-pointer justify-center border-r border-surface bg-card-muted pt-[18px]',
          picked && 'border-primary-line bg-primary-soft'
        )}
        onClick={onToggle}
        role="presentation"
      >
        <span
          className={cn(
            'grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border-strong bg-card',
            picked && 'border-primary bg-primary text-white'
          )}
        >
          {picked && <Check className="h-3 w-3" strokeWidth={3.2} />}
        </span>
      </div>

      <div
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 p-4 px-4.5"
        onClick={onOpen}
        role="presentation"
      >
        <div className="flex items-start gap-3.5">
          <Logo job={job} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11.5px] text-faint">
              {job.postedDesc}
              {job.applicantsDesc && (
                <Badge tone="ats" className="text-[10.5px] font-semibold uppercase tracking-wide">
                  {job.applicantsDesc}
                </Badge>
              )}
            </div>
            <h3 className="m-0 text-[17px] font-semibold tracking-[-0.012em]">{job.title}</h3>
            <div className="mt-1 text-[12px] text-muted-foreground">
              <b className="font-semibold text-foreground">{job.company}</b>
              {job.industries.length ? ` · ${job.industries.join(' · ')}` : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <Meta icon={MapPin}>{job.location || '—'}</Meta>
          <Meta icon={Briefcase}>{job.employmentType || '—'}</Meta>
          <Meta icon={DollarSign}>{salaryText(job)}</Meta>
          <Meta icon={Building2}>{job.workModel || '—'}</Meta>
          <Meta icon={Star}>{job.seniority || '—'}</Meta>
          <Meta icon={Clock}>
            {job.minYearsExperience ? `${job.minYearsExperience}+ years exp` : '—'}
          </Meta>
        </div>

        {job.summary && (
          <div className="border-t border-surface pt-2.5">
            <SectionLabel className="mb-1.5">Why this is a match</SectionLabel>
            <p className="m-0 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
              {job.summary}
            </p>
          </div>
        )}

        <div
          className="mt-auto flex items-center gap-2 pt-1"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {ats !== null && <Badge tone="ats">ATS {ats}</Badge>}
          {queued && <Badge tone="neutral">In queue…</Badge>}
          <div className="flex-1" />
          <Hinted tip="Not interested — removes it from the feed for good">
            <IconButton onClick={onIgnore}>
              <Ban className="h-[15px] w-[15px]" strokeWidth={1.9} />
            </IconButton>
          </Hinted>
          <Button variant={ats === null ? 'primary' : 'ghost'} onClick={onPrimary}>
            {ats === null ? (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Tailor &amp; Apply
              </>
            ) : (
              <>
                <ExternalLink className="h-3.5 w-3.5" /> Open posting
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex w-[216px] shrink-0 flex-col items-center gap-3 bg-ink p-4">
        <ScoreRing score={job.fit} />
        <RankLabel job={job} />
        <FitBreakdown job={job} />
        <div className="mt-auto flex w-full flex-col gap-1">
          {job.h1bSponsor && <InkChip>H1B Sponsor Likely</InkChip>}
          {job.clearanceRequired && <InkChip tone="warn">Clearance required</InkChip>}
          {job.isAgency && <InkChip tone="warn">Staffing agency</InkChip>}
        </div>
      </div>
    </div>
  )
}

function InkChip({
  children,
  tone = 'ok'
}: {
  children: React.ReactNode
  tone?: 'ok' | 'warn'
}): React.JSX.Element {
  const Icon = tone === 'ok' ? Check : Ban
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted">
      <Icon
        className="h-2.5 w-2.5 shrink-0"
        strokeWidth={3}
        style={{ color: tone === 'ok' ? 'var(--ring-hi)' : 'var(--ring-mid)' }}
      />
      {children}
    </div>
  )
}

function MiniCard({
  job,
  on,
  ats,
  onClick
}: {
  job: JobrightJob
  on: boolean
  ats: number | null
  onClick: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-card p-3 shadow-[0_1px_2px_rgba(28,26,23,0.04)]',
        on && 'border-primary ring-1 ring-primary'
      )}
      onClick={onClick}
      role="presentation"
    >
      <Logo job={job} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-faint">{job.postedDesc}</div>
        <div className="truncate text-[14px] font-semibold tracking-[-0.007em]">{job.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {job.company} · {job.location}
        </div>
        <div className="mt-0.5 text-[12px]">{salaryText(job)}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="tnum text-[13px] font-semibold" style={{ color: ringColor(job.fit) }}>
          {job.fit}%
        </span>
        {ats !== null && (
          <Badge tone="ats" className="px-1.5 text-[10px]">
            ATS {ats}
          </Badge>
        )}
      </div>
    </div>
  )
}

// ---- detail pane ----------------------------------------------------------

function DetailPane({
  job,
  tab,
  setTab,
  tailored,
  onClose,
  onPrimary
}: {
  job: JobrightJob
  tab: 'overview' | 'company'
  setTab: (t: 'overview' | 'company') => void
  tailored: boolean
  onClose: () => void
  onPrimary: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-card">
      <div className="flex items-center gap-3 border-b border-surface px-5 py-3.5">
        <Logo job={job} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold tracking-[-0.012em]">{job.title}</div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            <b className="font-semibold text-foreground">{job.company}</b> · {job.location} ·{' '}
            {job.workModel} · {salaryText(job)}
          </div>
        </div>
        <Button variant={tailored ? 'ghost' : 'primary'} onClick={onPrimary}>
          {tailored ? (
            <>
              <ExternalLink className="h-3.5 w-3.5" /> Open posting
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Tailor &amp; Apply
            </>
          )}
        </Button>
        <IconButton onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex gap-5 border-b border-border px-5">
        {(['overview', 'company'] as const).map((t) => (
          <button
            key={t}
            className={cn(
              'border-b-2 border-transparent pb-2 pt-2.5 text-[13px] font-medium capitalize text-muted-foreground',
              tab === t && 'border-primary font-semibold text-primary'
            )}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto p-5 [&>*]:shrink-0">
        {tab === 'overview' ? (
          <>
            <div className="flex items-center gap-4.5 rounded-[12px] bg-ink p-4 px-4.5">
              <ScoreRing score={job.fit} size={76} />
              <div className="flex-1">
                <div className="mb-2.5">
                  <RankLabel job={job} suffix="JOBRIGHT FIT" />
                </div>
                <FitBreakdown job={job} wide />
              </div>
            </div>
            {job.summary && (
              <Section title="Summary">
                <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
                  {job.summary}
                </p>
              </Section>
            )}
            <Bullets title="Responsibilities" items={job.responsibilities} />
            {!!job.skillTags.length && (
              <Section title="Skills" hint="as Jobright tagged this posting">
                <div className="flex flex-wrap gap-1.5">
                  {job.skillTags.map((s) => (
                    <span
                      key={s}
                      className="rounded-[20px] border border-primary-line bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-medium text-primary-hover"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </Section>
            )}
            <Bullets title="Required" items={job.requiredSkills} />
            <Bullets title="Preferred" items={job.preferredSkills} />
            <Bullets title="Education" items={job.education} />
            <Bullets title="Benefits" items={job.benefits} />
          </>
        ) : (
          <Section title={job.company}>
            <div className="grid grid-cols-2 gap-2">
              <Meta icon={MapPin}>{job.location || '—'}</Meta>
              <Meta icon={Building2}>{job.workModel || '—'}</Meta>
            </div>
            {!!job.industries.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.industries.map((i) => (
                  <span
                    key={i}
                    className="rounded-[20px] border border-primary-line bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-medium text-primary-hover"
                  >
                    {i}
                  </span>
                ))}
              </div>
            )}
            {job.applyUrl && (
              <p className="mt-4 break-all text-[12px] text-faint">Applies at {job.applyUrl}</p>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-2.5 text-[13px] font-semibold">
        {title}
        {hint && <span className="ml-2 text-[11px] font-normal text-faint">{hint}</span>}
      </h4>
      {children}
    </div>
  )
}

function Bullets({ title, items }: { title: string; items: string[] }): React.JSX.Element | null {
  if (!items.length) return null
  return (
    <Section title={title}>
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-4 marker:text-border-strong">
        {items.map((t, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed text-pretty">
            {t}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---- queue drawer ---------------------------------------------------------

const PROGRESS: Record<string, number> = {
  queued: 0,
  fetching: 18,
  tailoring: 62,
  scoring: 88,
  done: 100,
  error: 100
}

function QueueDrawer({
  active,
  finished,
  onClose,
  onRetry,
  onRemove,
  onClearFinished
}: {
  active: QueueItem[]
  finished: QueueItem[]
  onClose: () => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onClearFinished: () => void
}): React.JSX.Element {
  const degraded = finished.filter((q) => q.status === 'done' && q.jdSource === 'jobright').length
  const failed = finished.filter((q) => q.status === 'error').length
  return (
    <div className="absolute inset-y-0 right-0 flex w-[404px] flex-col border-l border-border bg-card shadow-[-12px_0_28px_rgba(28,26,23,0.10)]">
      <div className="flex items-center gap-2.5 border-b border-surface px-4 py-3.5">
        <b className="text-[14px]">Queue</b>
        <Badge tone="count">{active.length}</Badge>
        <div className="flex-1" />
        <IconButton onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3.5 py-2.5 [&>*]:shrink-0">
        {!active.length && !finished.length && (
          <div className="grid flex-1 place-items-center p-6 text-center text-[12.5px] text-muted-foreground">
            Nothing queued. Select jobs in the feed and tailor them in a batch.
          </div>
        )}
        {!!active.length && <SectionLabel className="mb-0.5 mt-2.5">Running</SectionLabel>}
        {active.map((q) => (
          <QueueRow key={q.id} item={q} onRetry={onRetry} onRemove={onRemove} />
        ))}
        {!!finished.length && <SectionLabel className="mb-0.5 mt-2.5">Finished</SectionLabel>}
        {finished.map((q) => (
          <QueueRow key={q.id} item={q} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-surface bg-card-muted px-4 py-3">
        <Button variant="ghost" onClick={onClearFinished}>
          Clear finished
        </Button>
        <div className="flex-1" />
        <span className="text-[11px] text-faint">
          {failed ? `${failed} failed` : ''}
          {failed && degraded ? ' · ' : ''}
          {degraded ? `${degraded} from summary only` : ''}
        </span>
      </div>
    </div>
  )
}

function QueueRow({
  item,
  onRetry,
  onRemove
}: {
  item: QueueItem
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}): React.JSX.Element {
  // A posting we could not read is not a failure: the job was still tailored,
  // just from Jobright's structured description alone.
  const summaryOnly = item.status === 'done' && item.jdSource === 'jobright'
  const tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'ats' =
    item.status === 'error'
      ? 'danger'
      : summaryOnly
        ? 'warn'
        : item.status === 'done'
          ? 'ok'
          : isActive(item.status) && item.status !== 'queued'
            ? 'ats'
            : 'neutral'
  const label =
    item.status === 'done'
      ? summaryOnly
        ? 'Summary only'
        : item.matchScore !== null
          ? `ATS ${item.matchScore}`
          : 'Done'
      : item.status[0].toUpperCase() + item.status.slice(1)
  const dot = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    ats: 'bg-primary',
    neutral: 'bg-border-strong'
  }[tone]

  return (
    <div className="flex shrink-0 items-start gap-2.5 rounded-[10px] border border-surface p-2.5">
      <span className={cn('mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full', dot)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold">{item.job.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{item.job.company}</div>
        {isActive(item.status) && (
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${PROGRESS[item.status] ?? 0}%` }}
            />
          </div>
        )}
        {(summaryOnly && item.jdNote) || item.error ? (
          <div
            className={cn(
              'mt-1.5 flex items-start gap-2 rounded-[7px] px-2 py-1.5 text-[11px] leading-relaxed',
              item.error ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
            )}
          >
            <span>{item.error ?? item.jdNote}</span>
            {item.status === 'error' && (
              <button
                className="ml-auto shrink-0 font-semibold text-primary"
                onClick={() => onRetry(item.id)}
              >
                Retry
              </button>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <Badge tone={tone === 'ats' ? 'ats' : tone}>{label}</Badge>
        <button className="text-faint hover:text-foreground" onClick={() => onRemove(item.id)}>
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

/**
 * Paste a posting URL to add a job the feed does not have — or, when there is
 * no URL to read, jump straight to a blank workspace and paste the text.
 *
 * The fetch can take a while — some hosts need the page read and the model to
 * extract from it — so the field stays disabled with a spinner rather than
 * looking idle, and only clears on success.
 */
function AddByUrl({
  onAdd,
  onPaste
}: {
  onAdd: (url: string) => Promise<boolean>
  onPaste?: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    const v = url.trim()
    if (!v || busy) return
    setBusy(true)
    const ok = await onAdd(v)
    setBusy(false)
    if (ok) setUrl('')
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card-muted px-5 py-3">
      <div className="relative flex-1">
        <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={url}
          disabled={busy}
          placeholder="Paste a job posting URL — Workday, Greenhouse, Ashby, Lever, LinkedIn or any careers page"
          className="pl-8"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </div>
      <Button onClick={submit} disabled={busy || !url.trim()}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {busy ? 'Reading posting…' : 'Add job'}
      </Button>
      {onPaste && (
        <Button
          variant="ghost"
          onClick={onPaste}
          title="No link, or the posting will not load? Paste the description text instead"
        >
          <FileText className="h-3.5 w-3.5" />
          Paste description
        </Button>
      )}
    </div>
  )
}
