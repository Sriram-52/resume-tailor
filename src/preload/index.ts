import { contextBridge, ipcRenderer } from 'electron'
import type { MasterResume, ProfilesState } from '../shared/resume'
import type { Application, KeywordGap, Suggestion } from '../shared/application'
import type { ChatEnvelope, ChatEvent } from '../shared/chat'
import type { TailorDraft } from '../shared/draft'
import type { JobLead, JobResultsState, JobSearchFilters } from '../shared/jobs'
import type { JobPosting } from '../shared/jobPosting'
import type { QueueItem } from '../shared/queue'
import type { JobrightJob, JobrightStatus, SavedFilter } from '../shared/jobright'
import type { BackfillResult, JobrightReply, SetStatusReply } from '../shared/ipc'
import type { ApplicationStatus } from '../shared/application'
import type { AppSettings } from '../shared/settings'
import type { UsageState } from '../shared/usage'

export interface ClaudeResult {
  ok: boolean
  text: string
  error?: string
  durationMs?: number
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    costUsd: number
  }
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

  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings): Promise<boolean> =>
    ipcRenderer.invoke('settings:save', settings),

  loadUsage: (): Promise<UsageState> => ipcRenderer.invoke('usage:load'),
  resetUsage: (): Promise<boolean> => ipcRenderer.invoke('usage:reset'),

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

  loadDraft: (key: string): Promise<TailorDraft | null> => ipcRenderer.invoke('draft:load', key),
  loadDrafts: (): Promise<Record<string, TailorDraft>> => ipcRenderer.invoke('draft:loadAll'),
  deleteDraft: (key: string): Promise<boolean> => ipcRenderer.invoke('draft:delete', key),
  saveDraft: (key: string, d: TailorDraft): Promise<boolean> =>
    ipcRenderer.invoke('draft:save', key, d),

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

  /** Open a posting in the default browser. */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),

  // Jobright — the job source, and the owner of application status.
  jobrightStatus: (): Promise<JobrightStatus> => ipcRenderer.invoke('jobright:status'),
  jobrightLogin: (): Promise<JobrightStatus> => ipcRenderer.invoke('jobright:login'),
  jobrightSignOut: (): Promise<JobrightStatus> => ipcRenderer.invoke('jobright:signOut'),
  jobrightRecommended: (pages?: number): Promise<JobrightReply<JobrightJob[]>> =>
    ipcRenderer.invoke('jobright:recommended', pages),
  jobrightApplied: (): Promise<JobrightReply<JobrightJob[]>> =>
    ipcRenderer.invoke('jobright:applied'),
  jobrightIgnore: (jobId: string): Promise<JobrightReply<void>> =>
    ipcRenderer.invoke('jobright:ignore', jobId),
  jobrightImportUrl: (url: string): Promise<JobrightReply<{ taskId: string }>> =>
    ipcRenderer.invoke('jobright:importUrl', url),
  jobrightSavedFilters: (): Promise<JobrightReply<SavedFilter[]>> =>
    ipcRenderer.invoke('jobright:savedFilters'),
  jobrightSaveFilter: (f: SavedFilter): Promise<JobrightReply<void>> =>
    ipcRenderer.invoke('jobright:saveFilter', f),
  jobrightBackfill: (): Promise<JobrightReply<BackfillResult>> =>
    ipcRenderer.invoke('jobright:backfill'),

  /** Move a board card. Writes locally first, then pushes to Jobright. */
  setApplicationStatus: (id: string, status: ApplicationStatus): Promise<SetStatusReply> =>
    ipcRenderer.invoke('apps:setStatus', id, status),

  // Tailoring queue
  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:list'),
  queueAdd: (jobs: JobrightJob[], baseId: string): Promise<QueueItem[]> =>
    ipcRenderer.invoke('queue:add', jobs, baseId),
  queueSetConcurrency: (n: number): Promise<boolean> =>
    ipcRenderer.invoke('queue:setConcurrency', n),
  queueRemove: (id: string): Promise<QueueItem[]> => ipcRenderer.invoke('queue:remove', id),
  queueRetry: (id: string): Promise<QueueItem[]> => ipcRenderer.invoke('queue:retry', id),
  queueClearFinished: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:clearFinished'),
  /** Subscribe to queue progress (full item list each time). Returns an unsubscribe function. */
  onQueueEvent: (cb: (items: QueueItem[]) => void): (() => void) => {
    const handler = (_e: unknown, data: QueueItem[]): void => cb(data)
    ipcRenderer.on('queue:event', handler)
    return () => ipcRenderer.removeListener('queue:event', handler)
  },
  /** Fired when the main process saves applications on its own (queue results). */
  onAppsChanged: (cb: (apps: Application[]) => void): (() => void) => {
    const handler = (_e: unknown, data: Application[]): void => cb(data)
    ipcRenderer.on('apps:changed', handler)
    return () => ipcRenderer.removeListener('apps:changed', handler)
  },

  fetchJobPosting: (url: string): Promise<JsonResult<JobPosting>> =>
    ipcRenderer.invoke('job:fetch', url),

  exportPdf: (html: string, defaultName: string): Promise<ExportResult> =>
    ipcRenderer.invoke('pdf:export', html, defaultName),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),

  // Conversational agent
  startChat: (
    /** The workspace this session belongs to (an application id). */
    key: string,
    m: MasterResume,
    jd: string,
    gap: KeywordGap | null,
    master: MasterResume,
    company?: string,
    role?: string,
    cover?: string
  ): Promise<boolean> =>
    ipcRenderer.invoke('chat:start', key, m, jd, gap, master, company, role, cover),
  setChatGap: (key: string, gap: KeywordGap | null): Promise<boolean> =>
    ipcRenderer.invoke('chat:setGap', key, gap),
  setChatCover: (key: string, cover: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:setCover', key, cover),

  // Job discovery
  searchJobs: (
    filters: JobSearchFilters
  ): Promise<{ ok: boolean; data?: JobLead[]; error?: string }> =>
    ipcRenderer.invoke('jobs:search', filters),
  scoreJobs: (
    resume: MasterResume,
    leads: JobLead[]
  ): Promise<{ ok: boolean; data?: JobLead[]; error?: string }> =>
    ipcRenderer.invoke('jobs:score', resume, leads),
  loadJobResults: (): Promise<JobResultsState | null> => ipcRenderer.invoke('jobs:results:load'),
  saveJobResults: (state: JobResultsState): Promise<boolean> =>
    ipcRenderer.invoke('jobs:results:save', state),
  sendChat: (key: string, text: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:send', key, text),
  cancelChat: (key: string): Promise<boolean> => ipcRenderer.invoke('chat:cancel', key),
  /** End a workspace's session for good (closing its tab). */
  closeChat: (key: string): Promise<boolean> => ipcRenderer.invoke('chat:close', key),
  /** Workspaces with a turn in flight right now. */
  busyChatKeys: (): Promise<string[]> => ipcRenderer.invoke('chat:busyKeys'),
  getChatResume: (key: string): Promise<MasterResume | null> =>
    ipcRenderer.invoke('chat:getResume', key),
  /**
   * Subscribe to streaming chat events for every workspace. The envelope's `key`
   * says which one, since all sessions share this channel.
   */
  onChatEvent: (cb: (key: string, e: ChatEvent) => void): (() => void) => {
    const handler = (_e: unknown, data: ChatEnvelope): void => cb(data.key, data.event)
    ipcRenderer.on('chat:event', handler)
    return () => ipcRenderer.removeListener('chat:event', handler)
  },

  // Conversational agent for the master resume
  startMasterChat: (master: MasterResume): Promise<boolean> =>
    ipcRenderer.invoke('masterchat:start', master),
  sendMasterChat: (text: string, master: MasterResume): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('masterchat:send', text, master),
  cancelMasterChat: (): Promise<boolean> => ipcRenderer.invoke('masterchat:cancel'),
  getMasterChatResume: (): Promise<MasterResume | null> =>
    ipcRenderer.invoke('masterchat:getResume'),
  /** Subscribe to streaming master-chat events. Returns an unsubscribe function. */
  onMasterChatEvent: (cb: (e: ChatEvent) => void): (() => void) => {
    // The master editor is still a single session; unwrap its envelope for it.
    const handler = (_e: unknown, data: ChatEnvelope): void => cb(data.event)
    ipcRenderer.on('masterchat:event', handler)
    return () => ipcRenderer.removeListener('masterchat:event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
