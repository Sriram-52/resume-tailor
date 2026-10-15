import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { emptyMaster, type MasterResume, type ProfilesState } from '../shared/resume'
import type { Application } from '../shared/application'
import type { TailorDraft } from '../shared/draft'
import type { JobResultsState } from '../shared/jobs'
import type { QueueItem } from '../shared/queue'
import type { JobrightJob } from '../shared/jobright'
import { emptySettings, type AppSettings } from '../shared/settings'
import {
  emptyTotals,
  emptyUsage,
  type UsageEntry,
  type UsageState,
  type UsageTotals
} from '../shared/usage'

/**
 * Tiny file-backed store in the app's userData directory. No database, no native
 * modules — just two JSON files. Everything stays local to the user's machine.
 */

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

const masterPath = (): string => join(dataDir(), 'master.json')
const profilesPath = (): string => join(dataDir(), 'profiles.json')
const appsPath = (): string => join(dataDir(), 'applications.json')
const draftPath = (): string => join(dataDir(), 'draft.json')
const draftsPath = (): string => join(dataDir(), 'drafts.json')
const jobResultsPath = (): string => join(dataDir(), 'job-results.json')
const settingsPath = (): string => join(dataDir(), 'settings.json')
const usagePath = (): string => join(dataDir(), 'usage.json')
const queuePath = (): string => join(dataDir(), 'queue.json')

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8')
}

// --- Master resume profiles ----------------------------------------------

/** Backfill fields added after a resume was first saved (older data). */
function normalize(r: Partial<MasterResume>): MasterResume {
  return { ...emptyMaster(), ...r }
}

/**
 * Load all resume profiles. Migrates the old single master.json into a "Default"
 * profile the first time, so existing users keep their resume.
 */
export function loadProfiles(): ProfilesState {
  if (existsSync(profilesPath())) {
    const state = readJson<ProfilesState>(profilesPath(), { profiles: [], activeId: '' })
    state.profiles = state.profiles.map((p) => ({ ...p, resume: normalize(p.resume) }))
    if (state.profiles.length && !state.profiles.some((p) => p.id === state.activeId)) {
      state.activeId = state.profiles[0].id
    }
    if (state.profiles.length) return state
  }
  // Migrate legacy master.json (or start fresh).
  const legacy = existsSync(masterPath())
    ? normalize(readJson<Partial<MasterResume>>(masterPath(), {}))
    : emptyMaster()
  const state: ProfilesState = {
    profiles: [{ id: randomUUID(), name: 'Default', resume: legacy }],
    activeId: ''
  }
  state.activeId = state.profiles[0].id
  writeJson(profilesPath(), state)
  return state
}

export function saveProfiles(state: ProfilesState): void {
  writeJson(profilesPath(), state)
}

// --- Drafts (in-progress Tailor sessions, one per open workspace) ----------

/**
 * Drafts are keyed by the application they belong to, because several
 * workspaces are open at once. The legacy single draft.json is folded in the
 * first time this runs so an in-progress session is not lost on upgrade.
 */
export function loadDrafts(): Record<string, TailorDraft> {
  const drafts = readJson<Record<string, TailorDraft>>(draftsPath(), {})
  if (Object.keys(drafts).length) return drafts
  const legacy = readJson<TailorDraft | null>(draftPath(), null)
  if (legacy) {
    const key = legacy.appId ?? 'untitled'
    const migrated = { [key]: legacy }
    writeJson(draftsPath(), migrated)
    return migrated
  }
  return {}
}

export function loadDraft(key: string): TailorDraft | null {
  return loadDrafts()[key] ?? null
}

export function saveDraft(key: string, draft: TailorDraft): void {
  const all = loadDrafts()
  all[key] = draft
  writeJson(draftsPath(), all)
}

export function deleteDraft(key: string): void {
  const all = loadDrafts()
  delete all[key]
  writeJson(draftsPath(), all)
}

// --- Applications --------------------------------------------------------

export function loadApplications(): Application[] {
  return readJson<Application[]>(appsPath(), [])
}

export function saveApplication(appRecord: Application): Application[] {
  const all = loadApplications()
  const idx = all.findIndex((a) => a.id === appRecord.id)
  if (idx >= 0) all[idx] = appRecord
  else all.unshift(appRecord)
  writeJson(appsPath(), all)
  return all
}

export function deleteApplication(id: string): Application[] {
  const all = loadApplications().filter((a) => a.id !== id)
  writeJson(appsPath(), all)
  return all
}

// --- Tailoring queue -------------------------------------------------------

export function loadQueue(): QueueItem[] {
  return readJson<QueueItem[]>(queuePath(), [])
}

export function saveQueue(items: QueueItem[]): void {
  writeJson(queuePath(), items)
}

// --- Job search results (last search, cached across restarts) --------------

export function loadJobResults(): JobResultsState | null {
  return readJson<JobResultsState | null>(jobResultsPath(), null)
}

export function saveJobResults(state: JobResultsState): void {
  writeJson(jobResultsPath(), state)
}

// --- App settings (API keys etc., entered from the UI) ---------------------

export function loadSettings(): AppSettings {
  return { ...emptySettings(), ...readJson<Partial<AppSettings>>(settingsPath(), {}) }
}

export function saveSettings(settings: AppSettings): void {
  writeJson(settingsPath(), settings)
}

// --- Token usage tracking (aggregated across all LLM calls) ----------------

/** Keep only the most recent calls in the ledger; totals are never truncated. */
const RECENT_CAP = 100

export function loadUsage(): UsageState {
  const s = readJson<Partial<UsageState>>(usagePath(), {})
  return {
    totals: { ...emptyTotals(), ...s.totals },
    byKind: s.byKind ?? {},
    recent: Array.isArray(s.recent) ? s.recent : []
  }
}

function addInto(t: UsageTotals, e: UsageEntry): UsageTotals {
  return {
    calls: t.calls + 1,
    inputTokens: t.inputTokens + e.inputTokens,
    outputTokens: t.outputTokens + e.outputTokens,
    cacheReadTokens: t.cacheReadTokens + e.cacheReadTokens,
    cacheCreationTokens: t.cacheCreationTokens + e.cacheCreationTokens,
    costUsd: t.costUsd + e.costUsd
  }
}

/** Append one LLM call to the ledger, updating the running totals + breakdown. */
export function recordUsage(e: UsageEntry): void {
  const state = loadUsage()
  state.totals = addInto(state.totals, e)
  state.byKind[e.kind] = addInto(state.byKind[e.kind] ?? emptyTotals(), e)
  state.recent.unshift(e)
  if (state.recent.length > RECENT_CAP) state.recent.length = RECENT_CAP
  writeJson(usagePath(), state)
}

export function resetUsage(): void {
  writeJson(usagePath(), emptyUsage())
}

/** Replace the whole applications list (used by the Jobright backfill). */
export function saveApplications(all: Application[]): Application[] {
  writeJson(appsPath(), all)
  return all
}

// --- Externally added jobs (pasted URLs) -----------------------------------

const externalPath = (): string => join(dataDir(), 'external.json')

export function loadExternal(): JobrightJob[] {
  return readJson<JobrightJob[]>(externalPath(), [])
}

export function saveExternal(jobs: JobrightJob[]): void {
  writeJson(externalPath(), jobs)
}
