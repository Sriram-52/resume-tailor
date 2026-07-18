import { useEffect, useMemo, useRef, useState } from 'react'
import type { MasterResume } from '../../../shared/resume'
import type { Application } from '../../../shared/application'
import type { JobLead, JobSearchFilters } from '../../../shared/jobs'
import { defaultFilters } from '../../../shared/jobs'
import { Button, Field, Spinner } from '../ui'

const scoreClass = (n: number): string => (n >= 75 ? 'hi' : n >= 50 ? 'mid' : 'lo')
const matchLabel = (n: number): string =>
  n >= 90 ? 'Strong match' : n >= 75 ? 'Good match' : n >= 50 ? 'Fair match' : 'Low match'

/** Prefill keywords with just the active profile's job title. */
function profileTitle(r: MasterResume): string {
  return (r.basics.label || r.work[0]?.position || '').trim()
}

/** Relative "3 days ago" if the date parses; otherwise the raw string. */
function postedAgo(s: string): string {
  if (!s) return ''
  const t = Date.parse(s)
  if (Number.isNaN(t)) return s
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

/** A circular match-score gauge. */
function ScoreRing({ score }: { score: number }): React.JSX.Element {
  const r = 30
  const circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(100, score)) / 100)
  return (
    <div className={`ring score-${scoreClass(score)}`}>
      <svg viewBox="0 0 72 72">
        <circle className="ring-track" cx="36" cy="36" r={r} />
        <circle
          className="ring-value"
          cx="36"
          cy="36"
          r={r}
          strokeDasharray={circ}
          strokeDashoffset={off}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div className="ring-num">{score}%</div>
    </div>
  )
}

const icon = {
  pin: 'M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z M12 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10',
  clock: 'M12 7v5l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'
}
const Ic = ({ d }: { d: string }): React.JSX.Element => (
  <svg className="mini-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d={d} />
  </svg>
)

/** Find the tracker application (if any) matching a lead — by URL, else company+title. */
function matchedApp(apps: Application[], lead: JobLead): Application | undefined {
  const url = lead.url.trim().toLowerCase()
  const key = `${lead.title}::${lead.company}`.toLowerCase().trim()
  return apps.find(
    (a) =>
      (a.jobUrl && a.jobUrl.trim().toLowerCase() === url && url !== '') ||
      `${a.role}::${a.company}`.toLowerCase().trim() === key
  )
}

/**
 * Discover: opt-in job search from the active profile (Dice via Apify), styled
 * as a job feed with a match gauge per result. Aware of your tracker — jobs you
 * already saved/applied to are marked and can be hidden. Results are the hero;
 * filters live in a popover.
 */
export function Discover({
  resume,
  apps,
  onTailorLead,
  onOpenSettings
}: {
  resume: MasterResume
  /** Tracker applications, so already-applied jobs are marked / hidden. */
  apps: Application[]
  onTailorLead: (lead: JobLead) => void
  /** Jump to the Settings tab (e.g. to add a missing Apify token). */
  onOpenSettings: () => void
}): React.JSX.Element {
  const [filters, setFilters] = useState<JobSearchFilters>(() => ({
    ...defaultFilters(),
    keywords: profileTitle(resume)
  }))
  const [leads, setLeads] = useState<JobLead[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hideTracked, setHideTracked] = useState(true)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      const saved = await window.api.loadJobResults()
      if (saved) {
        setFilters(saved.filters)
        setLeads(saved.leads)
      } else {
        setFiltersOpen(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!filtersOpen) return
    const onDown = (e: MouseEvent): void => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filtersOpen])

  function set<K extends keyof JobSearchFilters>(key: K, val: JobSearchFilters[K]): void {
    setFilters((f) => ({ ...f, [key]: val }))
  }

  async function search(): Promise<void> {
    setBusy(true)
    setError('')
    setFiltersOpen(false)
    const r = await window.api.searchJobs(filters)
    setBusy(false)
    if (!r.ok || !r.data) {
      setError(r.error ?? 'Search failed')
      return
    }
    setLeads(r.data)
    setScoring(true)
    const s = await window.api.scoreJobs(resume, r.data)
    const finalLeads = s.ok && s.data ? s.data : r.data
    setLeads(finalLeads)
    setScoring(false)
    window.api.saveJobResults({ filters, leads: finalLeads, searchedAt: new Date().toISOString() })
  }

  // Attach tracker status to each lead, and optionally hide the tracked ones.
  const decorated = useMemo(
    () => (leads ?? []).map((l) => ({ lead: l, app: matchedApp(apps, l) })),
    [leads, apps]
  )
  const trackedCount = decorated.filter((d) => d.app).length
  const visible = hideTracked ? decorated.filter((d) => !d.app) : decorated
  // The main process asks the user to add their token in Settings; when that's
  // the error, offer a one-click jump there.
  const needsToken = /apify token/i.test(error)

  const errorBox = (
    <div className="err-box">
      {error}
      {needsToken && (
        <div className="err-action">
          <Button variant="ghost" onClick={onOpenSettings}>
            Open Settings
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="screen discover">
      <div className="disco-head">
        <div>
          <h2>Discover jobs</h2>
          <p className="muted">
            Roles matching your active profile, scored against your resume. Tailor any one in a click.
          </p>
        </div>
        <div className="disco-head-actions" ref={popRef}>
          {leads && !busy && !scoring && (
            <span className="muted disco-summary">
              {visible.length} shown{trackedCount > 0 && ` · ${trackedCount} in tracker`}
            </span>
          )}
          <Button onClick={() => setFiltersOpen((v) => !v)}>Search / Filters</Button>

          {filtersOpen && (
            <div className="disco-popover">
              <Field
                label="Keywords"
                value={filters.keywords}
                onChange={(v) => set('keywords', v)}
                placeholder="Java Spring Boot AWS"
                full
              />
              <Field
                label="Location"
                value={filters.location}
                onChange={(v) => set('location', v)}
                placeholder="Remote, or a city"
                full
              />
              <div className="grid2">
                <label className="field">
                  <span>Employment type</span>
                  <select
                    value={filters.employmentType}
                    onChange={(e) =>
                      set('employmentType', e.target.value as JobSearchFilters['employmentType'])
                    }
                  >
                    <option value="contract">Contract</option>
                    <option value="fulltime">Full-time</option>
                    <option value="parttime">Part-time</option>
                    <option value="any">Any</option>
                  </select>
                </label>
                <label className="field">
                  <span>Posted within</span>
                  <select
                    value={filters.postedWithinDays}
                    onChange={(e) => set('postedWithinDays', Number(e.target.value))}
                  >
                    <option value={1}>24 hours</option>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={0}>Any time</option>
                  </select>
                </label>
                <label className="field">
                  <span>Max results</span>
                  <select
                    value={filters.maxResults}
                    onChange={(e) => set('maxResults', Number(e.target.value))}
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <label className="field checkbox pop-remote">
                  <input
                    type="checkbox"
                    checked={filters.remote}
                    onChange={(e) => set('remote', e.target.checked)}
                  />
                  <span>Remote only</span>
                </label>
              </div>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={hideTracked}
                  onChange={(e) => setHideTracked(e.target.checked)}
                />
                <span>Hide jobs already in my tracker</span>
              </label>
              <Button onClick={search} disabled={busy || !filters.keywords.trim()}>
                {busy ? <Spinner text="Searching…" /> : 'Search'}
              </Button>
              <p className="muted disco-cost">Apify bills per result (~$3 / 1,000), capped at max.</p>
              {error && errorBox}
            </div>
          )}
        </div>
      </div>

      <div className="disco-list">
        {busy && (
          <div className="disco-state">
            <Spinner text="Searching Dice…" />
          </div>
        )}
        {!busy && error && errorBox}
        {!busy && !error && leads === null && (
          <div className="disco-state muted">
            Open <b>Search / Filters</b> and run a search to see matching jobs here.
          </div>
        )}
        {!busy && leads && leads.length > 0 && visible.length === 0 && (
          <div className="disco-state muted">
            All {leads.length} results are already in your tracker. Uncheck “Hide jobs already in my
            tracker” to see them.
          </div>
        )}
        {!busy && leads?.length === 0 && (
          <div className="disco-state muted">
            No postings matched. Try broader keywords, “Any” type, or “Any time”.
          </div>
        )}

        {scoring && (
          <div className="disco-scoring">
            <Spinner text="Scoring matches against your resume…" />
          </div>
        )}

        {visible.map(({ lead: l, app }) => (
          <div className={`jcard ${app ? 'jcard-tracked' : ''}`} key={l.id}>
            <div className="jcard-logo">
              {l.logo ? (
                <img src={l.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <span>{(l.company || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="jcard-body">
              <div className="jcard-top">
                {l.postedDate && <span className="jchip">{postedAgo(l.postedDate)}</span>}
                {l.employerType && <span className="jchip">{l.employerType}</span>}
                {app && <span className="jchip applied">✓ In tracker · {app.status}</span>}
              </div>
              <div className="jcard-title">{l.title}</div>
              <div className="jcard-company">{l.company || 'Unknown company'}</div>
              <div className="jcard-meta">
                {l.location && (
                  <span>
                    <Ic d={icon.pin} />
                    {l.location}
                  </span>
                )}
                {l.remote && (
                  <span>
                    <Ic d={icon.home} />
                    Remote
                  </span>
                )}
                {l.salary && <span className="jcard-salary">{l.salary}</span>}
              </div>
              {l.matchReason && <div className="jcard-reason">{l.matchReason}</div>}
              <div className="jcard-actions">
                {app ? (
                  <span className="muted jcard-tracked-note">Already in your tracker</span>
                ) : (
                  <Button onClick={() => onTailorLead(l)}>Tailor →</Button>
                )}
                {l.url && (
                  <a className="posting-link" href={l.url} target="_blank" rel="noreferrer">
                    ↗ posting
                  </a>
                )}
              </div>
            </div>

            {typeof l.fitScore === 'number' && (
              <div className={`jcard-gauge score-${scoreClass(l.fitScore)}`}>
                <ScoreRing score={l.fitScore} />
                <div className="gauge-label">{matchLabel(l.fitScore)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
