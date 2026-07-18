import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, extname } from 'path'
import { mkdirSync, appendFileSync } from 'fs'
import { homedir } from 'os'
import { readFile } from 'fs/promises'

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
import {
  loadProfiles,
  saveProfiles,
  loadApplications,
  saveApplication,
  deleteApplication,
  loadDraft,
  saveDraft,
  loadJobResults,
  saveJobResults
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
import { loadEnvFile } from './config'
import { searchDice, scoreJobLeads } from './jobs'
import type { MasterResume, ProfilesState } from '../shared/resume'
import type { Application, KeywordGap } from '../shared/application'
import type { TailorDraft } from '../shared/draft'
import type { JobLead, JobResultsState, JobSearchFilters } from '../shared/jobs'

const TAILOR_MODEL = process.env.TAILOR_MODEL // undefined -> claude.ts default

/** Defensively strip a stray ``` code fence around plain-text model output. */
function stripCoverFences(s: string): string {
  const t = s.trim()
  const m = t.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/)
  return m ? m[1] : t
}

let mainWindow: BrowserWindow | null = null
let chatSession: AgentSession | null = null

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
    title: 'Resume Tailor',
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

function registerIpc(): void {
  // Load .env (APIFY_TOKEN etc.) into process.env for this run.
  loadEnvFile()

  // Connection check
  ipcMain.handle('claude:ping', () =>
    runClaude('Reply with ONLY this JSON and nothing else: {"ok": true, "from": "claude"}')
  )

  // Master resume profiles
  ipcMain.handle('profiles:load', () => loadProfiles())
  ipcMain.handle('profiles:save', (_e, state: ProfilesState) => {
    saveProfiles(state)
    return true
  })
  ipcMain.handle('master:import', (_e, resumeText: string) =>
    runClaudeJson<MasterResume>(importPrompt(resumeText), { model: TAILOR_MODEL })
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
  ipcMain.handle('draft:load', () => loadDraft())
  ipcMain.handle('draft:save', (_e, draft: TailorDraft) => {
    saveDraft(draft)
    return true
  })

  // Applications
  ipcMain.handle('apps:load', () => loadApplications())
  ipcMain.handle('apps:save', (_e, appRecord: Application) => saveApplication(appRecord))
  ipcMain.handle('apps:delete', (_e, id: string) => deleteApplication(id))

  // AI features
  ipcMain.handle('tailor:run', (_e, master: MasterResume, jd: string) =>
    runClaudeJson<MasterResume>(tailorPrompt(master, jd), { model: TAILOR_MODEL })
  )
  ipcMain.handle('keywordgap:run', (_e, master: MasterResume, jd: string) =>
    runClaudeJson(keywordGapPrompt(master, jd), { model: TAILOR_MODEL })
  )
  ipcMain.handle(
    'suggest:run',
    (_e, current: MasterResume, jd: string, missing: string[], instructions?: string) =>
      runClaudeJson(suggestPrompt(current, jd, missing, instructions), { model: TAILOR_MODEL })
  )
  ipcMain.handle(
    'coverletter:run',
    async (_e, master: MasterResume, jd: string, company: string, role: string) => {
      // Cover letters are freeform prose — return plain text, not JSON (long
      // letters with newlines/quotes break JSON.parse).
      const r = await runClaude(coverLetterPrompt(master, jd, company, role), {
        model: TAILOR_MODEL
      })
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true, data: { coverLetter: stripCoverFences(r.text).trim() } }
    }
  )

  // Conversational agent (chat)
  ipcMain.handle(
    'chat:start',
    (_e, resume: MasterResume, jd: string, gap: KeywordGap | null, master: MasterResume) => {
      if (!mainWindow) return false
      chatSession = new AgentSession(mainWindow, resume, jd, gap ?? null, master ?? resume)
      return true
    }
  )
  ipcMain.handle('chat:setGap', (_e, gap: KeywordGap | null) => {
    chatSession?.setGap(gap ?? null)
    return true
  })
  ipcMain.handle('chat:send', async (_e, text: string) => {
    if (!chatSession) return { ok: false, error: 'No chat session. Tailor a resume first.' }
    await chatSession.send(text)
    return { ok: true }
  })
  ipcMain.handle('chat:cancel', () => {
    chatSession?.cancel()
    return true
  })
  ipcMain.handle('chat:getResume', () => chatSession?.getResume() ?? null)

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
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    logCrash('render-process-gone', JSON.stringify(d))
  )
  app.on('child-process-gone', (_e, d) => logCrash('child-process-gone', JSON.stringify(d)))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('will-quit', () => logCrash('lifecycle', 'will-quit'))
app.on('window-all-closed', () => {
  logCrash('lifecycle', 'window-all-closed')
  if (process.platform !== 'darwin') app.quit()
})
