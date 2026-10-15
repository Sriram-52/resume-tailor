import { cn } from '../../lib/utils'
import type { JobrightJob } from '../../../../shared/jobright'

/**
 * Jobright's fit score and its breakdown.
 *
 * This is the *only* place the fit score is rendered, and it always sits on the
 * dark `ink` surface. The ATS score — ours, and a different measurement
 * entirely — is a petrol `Badge tone="ats"` and never appears here. Keeping them
 * on separate surfaces is what stops them being read as one number.
 */

const R = 30
const C = 2 * Math.PI * R

export function ringColor(score: number): string {
  return score >= 85 ? 'var(--ring-hi)' : score >= 70 ? 'var(--ring-mid)' : 'var(--ring-lo)'
}

export function ScoreRing({
  score,
  size = 68,
  onInk = true
}: {
  score: number
  size?: number
  onInk?: boolean
}): React.JSX.Element {
  const offset = C * (1 - Math.max(0, Math.min(100, score)) / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke={onInk ? 'var(--ink-line)' : 'var(--border)'}
          strokeWidth="7"
        />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke={ringColor(score)}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        className={cn(
          'tnum absolute inset-0 grid place-items-center font-semibold',
          onInk ? 'text-white' : 'text-foreground'
        )}
        style={{ fontSize: size / 4 }}
      >
        {score}%
      </div>
    </div>
  )
}

export function FitBreakdown({
  job,
  wide = false
}: {
  job: JobrightJob
  wide?: boolean
}): React.JSX.Element {
  const rows: [string, number | null][] = [
    ['Experience', job.fitBreakdown.experience],
    ['Skills', job.fitBreakdown.skills],
    ['Industry', job.fitBreakdown.industry]
  ]
  return (
    <div className="flex w-full flex-col gap-1.5">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2 text-[10.5px] text-ink-muted">
          <span className="flex-1">{label}</span>
          <span
            className="h-[3px] overflow-hidden rounded-full bg-ink-line"
            style={{ width: wide ? 120 : 44 }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${v ?? 0}%`,
                background: (v ?? 0) >= 60 ? 'var(--ring-hi)' : 'var(--ring-mid)'
              }}
            />
          </span>
          <em className="tnum w-7 text-right not-italic text-ink-foreground">
            {v === null ? '—' : `${v}%`}
          </em>
        </div>
      ))}
    </div>
  )
}

export function RankLabel({
  job,
  suffix
}: {
  job: JobrightJob
  suffix?: string
}): React.JSX.Element {
  return (
    <div
      className="text-[10px] font-bold tracking-[0.1em]"
      style={{ color: ringColor(job.fit) }}
    >
      {(job.fitRank || 'Fit').toUpperCase()}
      {suffix ? ` · ${suffix}` : ''}
    </div>
  )
}
