import { contextBridge, ipcRenderer } from 'electron'
import type { MasterResume, ProfilesState } from '../shared/resume'
import type { Application, KeywordGap, Suggestion } from '../shared/application'
import type { ChatEvent } from '../shared/chat'
import type { TailorDraft } from '../shared/draft'

export interface ClaudeResult {
  ok: boolean
  text: string
  error?: string
  durationMs?: number
}

export interface JsonResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface ExportResult {
  ok: boolean
  path?: string
  error?: string
  cancelled?: boolean
}

const api = {
  pingClaude: (): Promise<ClaudeResult> => ipcRenderer.invoke('claude:ping'),

  loadProfiles: (): Promise<ProfilesState> => ipcRenderer.invoke('profiles:load'),
  saveProfiles: (state: ProfilesState): Promise<boolean> =>
    ipcRenderer.invoke('profiles:save', state),
  importResume: (text: string): Promise<JsonResult<MasterResume>> =>
    ipcRenderer.invoke('master:import', text),
  pickResumeFile: (): Promise<{
    ok: boolean
    cancelled?: boolean
    fileName?: string
    ext?: string
    base64?: string
  }> => ipcRenderer.invoke('file:pickResume'),

  loadDraft: (): Promise<TailorDraft | null> => ipcRenderer.invoke('draft:load'),
  saveDraft: (d: TailorDraft): Promise<boolean> => ipcRenderer.invoke('draft:save', d),

  loadApplications: (): Promise<Application[]> => ipcRenderer.invoke('apps:load'),
  saveApplication: (a: Application): Promise<Application[]> => ipcRenderer.invoke('apps:save', a),
  deleteApplication: (id: string): Promise<Application[]> => ipcRenderer.invoke('apps:delete', id),

  tailor: (m: MasterResume, jd: string): Promise<JsonResult<MasterResume>> =>
    ipcRenderer.invoke('tailor:run', m, jd),
  keywordGap: (m: MasterResume, jd: string): Promise<JsonResult<KeywordGap>> =>
    ipcRenderer.invoke('keywordgap:run', m, jd),
  suggest: (
    m: MasterResume,
    jd: string,
    missing: string[],
    instructions?: string
  ): Promise<JsonResult<{ suggestions: Suggestion[] }>> =>
    ipcRenderer.invoke('suggest:run', m, jd, missing, instructions),
  coverLetter: (
    m: MasterResume,
    jd: string,
    company: string,
    role: string
  ): Promise<JsonResult<{ coverLetter: string }>> =>
    ipcRenderer.invoke('coverletter:run', m, jd, company, role),

  exportPdf: (html: string, defaultName: string): Promise<ExportResult> =>
    ipcRenderer.invoke('pdf:export', html, defaultName),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),

  // Conversational agent
  startChat: (m: MasterResume, jd: string, gap: KeywordGap | null): Promise<boolean> =>
    ipcRenderer.invoke('chat:start', m, jd, gap),
  setChatGap: (gap: KeywordGap | null): Promise<boolean> =>
    ipcRenderer.invoke('chat:setGap', gap),
  sendChat: (text: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:send', text),
  cancelChat: (): Promise<boolean> => ipcRenderer.invoke('chat:cancel'),
  getChatResume: (): Promise<MasterResume | null> => ipcRenderer.invoke('chat:getResume'),
  /** Subscribe to streaming chat events. Returns an unsubscribe function. */
  onChatEvent: (cb: (e: ChatEvent) => void): (() => void) => {
    const handler = (_e: unknown, data: ChatEvent): void => cb(data)
    ipcRenderer.on('chat:event', handler)
    return () => ipcRenderer.removeListener('chat:event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
