import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, extname } from 'path'
import { mkdirSync, appendFileSync } from 'fs'
import { homedir } from 'os'
import { readFile } from 'fs/promises'
import * as jobright from './jobright'
import { JobrightAuthError } from './jobright'
import { backfillFromJobright, pushStatus } from './sync'
import type { JobrightJob, SavedFilter } from '../shared/jobright'
import type { JobrightReply } from '../shared/ipc'

/**
 * Build variant, baked in by electron.vite.config (`__APP_VARIANT__`). A packaged
 * 'dev' build — and any unpackaged run (`pnpm dev`) — is renamed and pointed at a
 * separate userData dir so it can live beside the prod install without sharing its
 * settings, applications, or usage ledger. Must run before anything reads a path.
 */
declare const __APP_VARIANT__: string
const VARIANT = app.isPackaged ? __APP_VARIANT__ : 'dev'
if (VARIANT === 'dev') {
  app.setName('Resume Tailor Dev')
  app.setPath('userData', join(app.getPath('appData'), 'Resume Tailor Dev'))
}

// --- Crash diagnostics: capture anything that would silently kill the process.
const CRASH_LOG = join(homedir(), 'resume-tailor-crash.log')
function logCrash(kind: string, detail: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}: ${
    detail instanceof Error ? (detail.stack ?? detail.message) : String(detail)
  }\n`
  try {
    appendFileSync(CRASH_LOG, line)
  } catch {
    /* ignore */
  }
  console.error(line)
}
process.on('uncaughtException', (e) => logCrash('uncaughtException', e))
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e))
import { runClaude, runClaudeJson } from './claude'
import { fetchJobPosting } from './jobFetch'
import { QueueRunner } from './queue'
import {
  loadProfiles,
  saveProfiles,
  loadApplications,
  saveApplication, saveApplications,
  deleteApplication,
  loadDraft, loadDrafts, deleteDraft,
  saveDraft,
  loadJobResults,
  saveJobResults,
  loadSettings,
  saveSettings,
  loadUsage,
  resetUsage
} from './store'
import {
  importPrompt,
  tailorPrompt,
  keywordGapPrompt,
  coverLetterPrompt,
  suggestPrompt
} from './prompts'
import { exportHtmlToPdf } from './pdf'
import { AgentSession } from './agent'
import { getTailorModel } from './config'
import { searchDice, scoreJobLeads } from './jobs'
import type { MasterResume, ProfilesState } from '../shared/resume'
import type { Application, KeywordGap, ApplicationStatus } from '../shared/application'
import type { TailorDraft } from '../shared/draft'
import type { JobLead, JobResultsState, JobSearchFilters } from '../shared/jobs'
import type { AppSettings } from '../shared/settings'

/** Defensively strip a stray ``` code fence around plain-text model output. */
function stripCoverFences(s: string): string {
  const t = s.trim()
  const m = t.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/)
  return m ? m[1] : t
}

/**
 * Drop a conversational lead-in line the model sometimes emits before the letter
 * (e.g. "Here is your cover letter:", "Sure! Here's a draft:") despite the prompt
 * forbidding it. Only removes a first line that is clearly a preamble, so a real
 * greeting/opening is never touched.
 */
function stripCoverPreamble(s: string): string {
  const t = s.trim()
  const nl = t.indexOf('\n')
  const firstLine = (nl === -1 ? t : t.slice(0, nl)).trim()
  const preamble =
    /^(sure|certainly|of course|absolutely|here('?s| is| you go)|below is|i('| ?a|'?ve| ?have)\b.*|this is)\b.*/i
  // A genuine letter opens with a greeting or a sentence, not a colon-terminated
  // lead-in. Treat a short first line that matches the markers (and typically
  // ends in ":") as a preamble to remove.
  if (nl !== -1 && preamble.test(firstLine) && firstLine.length < 120) {
    return t.slice(nl + 1).trim()
  }
  return t
}

let mainWindow: BrowserWindow | null = null
let queue: QueueRunner | null = null
/**
 * One agent session per open workspace, keyed by application id. Several run at
 * once — that is the whole point of the tabs — so a session is never replaced
 * implicitly; closing a tab is what ends one.
 */
const chatSessions = new Map<string, AgentSession>()
let masterSession: AgentSession | null = null

function ensureDirs(): void {
  mkdirSync(join(app.getPath('userData'), 'claude-cwd'), { recursive: true })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: app.getName(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function attachQueue(win: BrowserWindow): void {
  const q = queue
  if (!q) return
  win.webContents.once('did-finish-load', () => q.attach(win))
}

function registerIpc(): void {
  // App settings (API keys entered from the UI)
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    saveSettings(settings)
    return true
  })

  // Token usage tracking
  ipcMain.handle('usage:load', () => loadUsage())
  ipcMain.handle('usage:reset', () => {
    resetUsage()
    return true
  })

  // Connection check
  ipcMain.handle('claude:ping', () =>
    runClaude('Reply with ONLY this JSON and nothing else: {"ok": true, "from": "claude"}', {
      kind: 'ping'
    })
  )

  // Master resume profiles
  ipcMain.handle('profiles:load', () => loadProfiles())
  ipcMain.handle('profiles:save', (_e, state: ProfilesState) => {
    saveProfiles(state)
    return true
  })
  ipcMain.handle('master:import', (_e, resumeText: string) =>
    runClaudeJson<MasterResume>(importPrompt(resumeText), { model: getTailorModel(), kind: 'import' })
  )
  // Pick a resume file and return its raw bytes; the renderer extracts text
  // (pdfjs/mammoth need a real DOM, which Chromium provides but Node does not).
  ipcMain.handle('file:pickResume', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose your resume',
      properties: ['openFile'],
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'txt', 'md', 'json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, cancelled: true }
    const filePath = res.filePaths[0]
    const buf = await readFile(filePath)
    return {
      ok: true,
      fileName: basename(filePath),
      ext: extname(filePath).toLowerCase(),
      base64: buf.toString('base64')
    }
  })

  // Draft (in-progress Tailor session)
  ipcMain.handle('draft:load', (_e, key: string) => loadDraft(key))
  ipcMain.handle('draft:loadAll', () => loadDrafts())
  ipcMain.handle('draft:save', (_e, key: string, draft: TailorDraft) => {
    saveDraft(key, draft)
    return true
  })
  ipcMain.handle('draft:delete', (_e, key: string) => {
    deleteDraft(key)
    return true
  })

  // Applications
  ipcMain.handle('apps:load', () => loadApplications())
  ipcMain.handle('apps:save', (_e, appRecord: Application) => saveApplication(appRecord))
  ipcMain.handle('apps:delete', (_e, id: string) => deleteApplication(id))

  // Tailoring queue
  ipcMain.handle('queue:list', () => queue?.list() ?? [])
  ipcMain.handle('queue:add', (_e, jobs: JobrightJob[], baseId: string) => queue?.add(jobs, baseId) ?? [])
  ipcMain.handle('queue:setConcurrency', (_e, n: number) => {
    queue?.setConcurrency(n)
    return true
  })
  ipcMain.handle('queue:remove', (_e, id: string) => queue?.remove(id) ?? [])
  ipcMain.handle('queue:retry', (_e, id: string) => queue?.retry(id) ?? [])
  ipcMain.handle('queue:clearFinished', () => queue?.clearFinished() ?? [])

  // Jobright: the primary job source and the owner of application status.
  // Every handler funnels auth failures into a single `needsLogin` shape so the
  // renderer can show one "Reconnect" banner rather than per-call error text.
  const jr = async <T>(fn: () => Promise<T>): Promise<JobrightReply<T>> => {
    try {
      return { ok: true, data: await fn() }
    } catch (e) {
      if (e instanceof JobrightAuthError) return { ok: false, needsLogin: true, error: e.message }
      return { ok: false, needsLogin: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  ipcMain.handle('jobright:status', () => jobright.status())
  ipcMain.handle('jobright:login', () => jobright.login(mainWindow))
  ipcMain.handle('jobright:signOut', () => jobright.signOut())
  ipcMain.handle('jobright:recommended', (_e, pages?: number) =>
    jr(async () => jobright.applyLocalFilter(await jobright.listRecommended(pages), loadSettings().localFilter))
  )
  ipcMain.handle('jobright:applied', () => jr(() => jobright.listApplied()))
  ipcMain.handle('jobright:ignore', (_e, jobId: string) => jr(() => jobright.ignore(jobId)))
  ipcMain.handle('jobright:importUrl', (_e, url: string) => jr(() => jobright.importByUrl(url)))
  ipcMain.handle('jobright:savedFilters', () => jr(() => jobright.listSavedFilters()))
  ipcMain.handle('jobright:saveFilter', (_e, f: SavedFilter) =>
    jr(() => jobright.createSavedFilter(f))
  )
  ipcMain.handle('jobright:backfill', () => jr(() => backfillFromJobright()))

  /**
   * Move a board card. The local record is written first so the UI never waits
   * on the network; the push to Jobright follows and reports separately, so a
   * dead session shows as "not synced" rather than losing the move.
   */
  ipcMain.handle('apps:setStatus', async (_e, id: string, status: ApplicationStatus) => {
    const all = loadApplications()
    const appRecord = all.find((a) => a.id === id)
    if (!appRecord) return { ok: false, apps: all, synced: false, error: 'No such application.' }
    appRecord.status = status
    // Stamp the moment it became an application, once, so the daily goal and
    // streak count the day it went out rather than the day it was tailored.
    if (status !== 'draft' && !appRecord.appliedAt) appRecord.appliedAt = new Date().toISOString()
    saveApplications(all)
    try {
      const synced = await pushStatus(appRecord, status)
      return { ok: true, apps: all, synced }
    } catch (e) {
      const needsLogin = e instanceof JobrightAuthError
      return {
        ok: true,
        apps: all,
        synced: false,
        needsLogin,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  })

  /**
   * Open a posting in the real browser. Applying happens there — the app never
   * fills a form or submits anything on the user's behalf.
   */
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false
    void shell.openExternal(url)
    return true
  })

  // Job posting fetch (URL -> company/role/description)
  ipcMain.handle('job:fetch', (_e, url: string) => fetchJobPosting(url))

  // AI features
  ipcMain.handle('tailor:run', (_e, master: MasterResume, jd: string) =>
    runClaudeJson<MasterResume>(tailorPrompt(master, jd), { model: getTailorModel(), kind: 'tailor' })
  )
  ipcMain.handle('keywordgap:run', (_e, master: MasterResume, jd: string) =>
    runClaudeJson(keywordGapPrompt(master, jd), { model: getTailorModel(), kind: 'keywordgap' })
  )
  ipcMain.handle(
    'suggest:run',
    (_e, current: MasterResume, jd: string, missing: string[], instructions?: string) =>
      runClaudeJson(suggestPrompt(current, jd, missing, instructions), {
        model: getTailorModel(),
        kind: 'suggest'
      })
  )
  ipcMain.handle(
    'coverletter:run',
    async (_e, master: MasterResume, jd: string, company: string, role: string) => {
      // Cover letters are freeform prose — return plain text, not JSON (long
      // letters with newlines/quotes break JSON.parse).
      const r = await runClaude(coverLetterPrompt(master, jd, company, role), {
        model: getTailorModel(),
        kind: 'cover'
      })
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true, data: { coverLetter: stripCoverPreamble(stripCoverFences(r.text)) } }
    }
  )

  // Conversational agent (chat)
  ipcMain.handle(
    'chat:start',
    (
      _e,
      key: string,
      resume: MasterResume,
      jd: string,
      gap: KeywordGap | null,
      master: MasterResume,
      company?: string,
      role?: string,
      cover?: string
    ) => {
      if (!mainWindow) return false
      // Reopening a tab that already has a live session must not restart it, or
      // an in-flight turn is lost and its edits never arrive.
      const existing = chatSessions.get(key)
      if (existing) {
        existing.setGap(gap ?? null)
        existing.setCover(cover ?? '')
        return true
      }
      const session = new AgentSession(
        mainWindow,
        resume,
        jd,
        gap ?? null,
        master ?? resume,
        'tailor',
        key
      )
      session.setJobMeta(company ?? '', role ?? '')
      session.setCover(cover ?? '')
      chatSessions.set(key, session)
      return true
    }
  )
  ipcMain.handle('chat:setGap', (_e, key: string, gap: KeywordGap | null) => {
    chatSessions.get(key)?.setGap(gap ?? null)
    return true
  })
  ipcMain.handle('chat:setCover', (_e, key: string, cover: string) => {
    chatSessions.get(key)?.setCover(cover ?? '')
    return true
  })
  ipcMain.handle('chat:send', async (_e, key: string, text: string) => {
    const session = chatSessions.get(key)
    if (!session) return { ok: false, error: 'No chat session. Tailor a resume first.' }
    await session.send(text)
    return { ok: true }
  })
  ipcMain.handle('chat:cancel', (_e, key: string) => {
    chatSessions.get(key)?.cancel()
    return true
  })
  /** Close a workspace: end its session and stop tracking it. */
  ipcMain.handle('chat:close', (_e, key: string) => {
    chatSessions.get(key)?.cancel()
    chatSessions.delete(key)
    return true
  })
  /** Which workspaces currently have a turn in flight, for the header pill. */
  ipcMain.handle('chat:busyKeys', () =>
    [...chatSessions.entries()].filter(([, s]) => s.isBusy()).map(([k]) => k)
  )
  ipcMain.handle('chat:getResume', (_e, key: string) => chatSessions.get(key)?.getResume() ?? null)

  // Conversational agent for the MASTER resume (separate session + channel so it
  // never collides with the tailoring chat, which stays mounted on another tab).
  ipcMain.handle('masterchat:start', (_e, master: MasterResume) => {
    if (!mainWindow) return false
    masterSession = new AgentSession(mainWindow, master, '', null, master, 'master')
    return true
  })
  ipcMain.handle('masterchat:send', async (_e, text: string, master: MasterResume) => {
    if (!masterSession) return { ok: false, error: 'No master session. Open the Master resume tab.' }
    // Re-seed with the latest master each turn, in case the user hand-edited the
    // form since the last message.
    if (master) masterSession.setResume(master)
    await masterSession.send(text)
    return { ok: true }
  })
  ipcMain.handle('masterchat:cancel', () => {
    masterSession?.cancel()
    return true
  })
  ipcMain.handle('masterchat:getResume', () => masterSession?.getResume() ?? null)

  // Job discovery
  ipcMain.handle('jobs:search', (_e, filters: JobSearchFilters) => searchDice(filters))
  ipcMain.handle('jobs:score', (_e, resume: MasterResume, leads: JobLead[]) =>
    scoreJobLeads(resume, leads)
  )
  ipcMain.handle('jobs:results:load', () => loadJobResults())
  ipcMain.handle('jobs:results:save', (_e, state: JobResultsState) => {
    saveJobResults(state)
    return true
  })

  // PDF export
  ipcMain.handle('pdf:export', (_e, html: string, defaultName: string) =>
    exportHtmlToPdf(html, defaultName)
  )

  // Open a file/folder in the OS
  ipcMain.handle('shell:showItem', (_e, path: string) => {
    shell.showItemInFolder(path)
  })
}

app.whenReady().then(() => {
  logCrash('lifecycle', 'app ready')
  ensureDirs()
  registerIpc()
  mainWindow = createWindow()
  queue = new QueueRunner()
  // Start pumping once the renderer is listening, so no progress event is lost.
  attachQueue(mainWindow)
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    logCrash('render-process-gone', JSON.stringify(d))
  )
  /**
   * A renderer exception paints a blank window and leaves no trace anywhere the
   * user can reach, so mirror its console into the crash log. Warnings and
   * errors only — info would drown the file.
   */
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level < 2) return
    logCrash('renderer', `${message} (${sourceId}:${line})`)
  })
  app.on('child-process-gone', (_e, d) => logCrash('child-process-gone', JSON.stringify(d)))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // A fresh window after the last one was closed: point the runner at it so
      // progress keeps flowing to the UI the user is actually looking at.
      mainWindow = createWindow()
      attachQueue(mainWindow)
    }
  })
})

app.on('will-quit', () => logCrash('lifecycle', 'will-quit'))
app.on('window-all-closed', () => {
  logCrash('lifecycle', 'window-all-closed')
  if (process.platform !== 'darwin') app.quit()
})
