import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { emptyMaster, type MasterResume, type ProfilesState } from '../shared/resume'
import type { Application } from '../shared/application'
import type { TailorDraft } from '../shared/draft'

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

// --- Draft (in-progress Tailor session) ----------------------------------

export function loadDraft(): TailorDraft | null {
  return readJson<TailorDraft | null>(draftPath(), null)
}

export function saveDraft(draft: TailorDraft): void {
  writeJson(draftPath(), draft)
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
