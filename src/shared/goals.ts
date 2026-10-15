import type { Application } from './application'

/**
 * Daily application goal and streak.
 *
 * Everything here is derived from the records rather than stored as a counter.
 * A stored streak drifts the moment anything is edited, deleted or backfilled;
 * a computed one is always exactly what the board shows.
 */

/** Local YYYY-MM-DD. Deliberately local, not UTC — a "day" is the user's day. */
export function dayKey(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The day an application counts towards, or null if it never left draft.
 * Falls back to `createdAt` for records written before `appliedAt` existed.
 */
export function appliedDay(a: Application): string | null {
  if (a.status === 'draft') return null
  const iso = a.appliedAt ?? a.createdAt
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : dayKey(d)
}

/** How many applications went out on each day. */
export function dailyCounts(apps: Application[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of apps) {
    const day = appliedDay(a)
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return counts
}

export interface GoalProgress {
  /** Applications sent today. */
  today: number
  goal: number
  /** Consecutive days meeting the goal, ending today or yesterday. */
  streak: number
  /** The longest run ever, so a broken streak still shows what you managed. */
  best: number
  /** True once today's count meets the goal. */
  metToday: boolean
}

const DAY_MS = 86_400_000

export function goalProgress(
  apps: Application[],
  goal: number,
  now: Date = new Date()
): GoalProgress {
  const counts = dailyCounts(apps)
  const today = counts.get(dayKey(now)) ?? 0
  const metToday = goal > 0 && today >= goal

  // Walk backwards day by day. Today is only allowed to break the streak once it
  // is over — a day still in progress should not read as a failure at 9am.
  let streak = 0
  if (goal > 0) {
    let cursor = new Date(now)
    if (!metToday) cursor = new Date(now.getTime() - DAY_MS)
    while ((counts.get(dayKey(cursor)) ?? 0) >= goal) {
      streak++
      cursor = new Date(cursor.getTime() - DAY_MS)
    }
  }

  // Longest run in the record, found by walking the days that have any activity.
  let best = 0
  if (goal > 0 && counts.size) {
    const days = [...counts.keys()].sort()
    let run = 0
    let prev: string | null = null
    for (const day of days) {
      if ((counts.get(day) ?? 0) < goal) {
        run = 0
        prev = day
        continue
      }
      const isNext = prev !== null && dayKey(new Date(new Date(day).getTime() - DAY_MS)) === prev
      run = isNext ? run + 1 : 1
      best = Math.max(best, run)
      prev = day
    }
  }

  return { today, goal, streak, best: Math.max(best, streak), metToday }
}

/** Date windows offered by the board's date filter. */
export type DateRange = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month'

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'all', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' }
]

/**
 * Whether a record falls in the window. Uses the applied day where there is one
 * and the created day otherwise, so drafts filter by when you tailored them.
 */
export function inDateRange(a: Application, range: DateRange, now: Date = new Date()): boolean {
  if (range === 'all') return true
  const iso = a.status === 'draft' ? a.createdAt : (a.appliedAt ?? a.createdAt)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const key = dayKey(d)
  switch (range) {
    case 'today':
      return key === dayKey(now)
    case 'yesterday':
      return key === dayKey(new Date(now.getTime() - DAY_MS))
    case '7d':
      return d.getTime() >= now.getTime() - 7 * DAY_MS
    case '30d':
      return d.getTime() >= now.getTime() - 30 * DAY_MS
    case 'month':
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    default:
      return true
  }
}
