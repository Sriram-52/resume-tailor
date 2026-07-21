/**
 * Token-usage tracking for every LLM call — both the headless `claude` CLI
 * (tailoring, ATS, cover letters, scoring) and the Agent SDK (chat). The user
 * runs on their Claude Code subscription so there's no per-token bill, but the
 * CLI and SDK still report tokens/cost, which we aggregate locally (usage.json)
 * and surface in Settings. See [[settings]] for where this is shown.
 */

/** A category of LLM call, so usage can be broken down by feature. */
export type UsageKind =
  | 'tailor'
  | 'keywordgap'
  | 'suggest'
  | 'cover'
  | 'score'
  | 'import'
  | 'chat'
  | 'masterchat'
  | 'ping'

/** Human labels for each kind, used in the Usage breakdown. */
export const USAGE_KIND_LABELS: Record<UsageKind, string> = {
  tailor: 'Tailoring',
  keywordgap: 'ATS analysis',
  suggest: 'Suggestions',
  cover: 'Cover letters',
  score: 'Job scoring',
  import: 'Resume import',
  chat: 'Chat / refine',
  masterchat: 'Master edits',
  ping: 'Connection check'
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

/** One recorded LLM call. */
export interface UsageEntry extends TokenCounts {
  /** ISO timestamp (stamped in the main process, where Date is fine). */
  ts: string
  kind: UsageKind
  /** Model id actually used, or '' when the app default was used. */
  model: string
  /** Cost reported by the CLI/SDK in USD (informational — subscription-billed). */
  costUsd: number
}

/** Rolled-up counts for the whole app, or one kind. */
export interface UsageTotals extends TokenCounts {
  calls: number
  costUsd: number
}

export interface UsageState {
  totals: UsageTotals
  /** Per-kind breakdown, keyed by UsageKind. */
  byKind: Partial<Record<UsageKind, UsageTotals>>
  /** Most recent calls, newest first (capped for size). */
  recent: UsageEntry[]
}

export function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0
  }
}

export function emptyUsage(): UsageState {
  return { totals: emptyTotals(), byKind: {}, recent: [] }
}

/** Total tokens across input, output, and cache reads/writes. */
export function totalTokens(t: TokenCounts): number {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheCreationTokens
}
