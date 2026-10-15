import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { Application, KeywordGap } from '../shared/application'
import type { MasterResume } from '../shared/resume'
import type { JobrightJob } from '../shared/jobright'
import { DEFAULT_CONCURRENCY, isActive, type QueueItem } from '../shared/queue'
import { loadApplications, loadProfiles, loadQueue, saveApplication, saveQueue } from './store'
import { assembleJd } from './jobDescription'
import { runClaudeJson } from './claude'
import { keywordGapPrompt, tailorPrompt } from './prompts'
import { getTailorModel } from './config'

/**
 * Background runner for the tailoring queue. Items live in queue.json so a
 * restart picks up where it left off; anything mid-flight when the app quit is
 * simply re-queued. Progress is pushed to the renderer over `queue:event`, and
 * every finished item is saved as a draft Application (pushed over
 * `apps:changed`) so it shows up on the board immediately.
 *
 * Identity is Jobright's `jobId`, not a URL: the same posting reposted across
 * three locations is one job, and there is no URL normalisation to get wrong.
 */
export class QueueRunner {
  private items: QueueItem[]
  private running = 0
  private win: BrowserWindow | null = null
  private concurrency = DEFAULT_CONCURRENCY

  constructor() {
    this.items = loadQueue()
      // Items written before the queue keyed on Jobright ids carry a bare URL and
      // no job snapshot. There is nothing to re-run them from, and the renderer
      // reads `job.title`, so they are dropped rather than migrated.
      .filter((i) => !!i?.job?.jobId)
      .map((i) => (isActive(i.status) ? { ...i, status: 'queued' as const, error: undefined } : i))
    this.persist()
  }

  attach(win: BrowserWindow): void {
    this.win = win
    this.emit()
    this.pump()
  }

  list(): QueueItem[] {
    return this.items
  }

  /**
   * Queue a batch of jobs. Anything already queued, already finished in this
   * list, or already saved as an application is skipped, so re-selecting a
   * page of the feed is harmless.
   */
  add(jobs: JobrightJob[], baseId: string): QueueItem[] {
    const now = new Date().toISOString()
    const seen = new Set(this.items.map((i) => i.jobId))
    for (const a of loadApplications()) if (a.jobId) seen.add(a.jobId)
    const added: QueueItem[] = []
    for (const job of jobs) {
      if (!job?.jobId || seen.has(job.jobId)) continue
      seen.add(job.jobId)
      added.push({
        id: randomUUID(),
        jobId: job.jobId,
        job,
        baseId,
        status: 'queued',
        matchScore: null,
        jdSource: null,
        jdNote: '',
        createdAt: now,
        updatedAt: now
      })
    }
    // Queue order matches selection order, so the top of the feed is tailored first.
    this.items.unshift(...added)
    this.persist()
    this.emit()
    this.pump()
    return this.items
  }

  remove(id: string): QueueItem[] {
    // A running item cannot be cancelled mid-call; it simply is not saved when it finishes.
    this.items = this.items.filter((i) => i.id !== id)
    this.persist()
    this.emit()
    return this.items
  }

  retry(id: string): QueueItem[] {
    const it = this.items.find((i) => i.id === id)
    if (it && it.status === 'error') {
      this.update(it, { status: 'queued', error: undefined })
      this.pump()
    }
    return this.items
  }

  clearFinished(): QueueItem[] {
    this.items = this.items.filter((i) => isActive(i.status))
    this.persist()
    this.emit()
    return this.items
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, Math.min(6, Math.round(n)))
    this.pump()
  }

  // ---- internals -----------------------------------------------------------

  private persist(): void {
    saveQueue(this.items)
  }

  private emit(): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('queue:event', this.items)
  }

  private emitApps(apps: Application[]): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('apps:changed', apps)
  }

  private update(it: QueueItem, patch: Partial<QueueItem>): void {
    Object.assign(it, patch, { updatedAt: new Date().toISOString() })
    this.persist()
    this.emit()
  }

  private stillWanted(id: string): boolean {
    return this.items.some((i) => i.id === id)
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const next = this.items.find((i) => i.status === 'queued')
      if (!next) return
      this.running++
      this.process(next).finally(() => {
        this.running--
        this.pump()
      })
    }
  }

  private async process(it: QueueItem): Promise<void> {
    try {
      const base = this.baseResume(it.baseId)
      if (!base) {
        this.update(it, { status: 'error', error: 'The base resume profile no longer exists.' })
        return
      }
      const job = it.job

      // Assembling the description never fails: Jobright's structured version is
      // always there, so a dead apply link degrades the result instead of the item.
      this.update(it, { status: 'fetching' })
      const jd = await assembleJd(job)
      if (!this.stillWanted(it.id)) return
      this.update(it, { status: 'tailoring', jdSource: jd.source, jdNote: jd.note })

      const model = getTailorModel()
      const tailored = await runClaudeJson<MasterResume>(tailorPrompt(base, jd.text), {
        model,
        kind: 'tailor'
      })
      if (!this.stillWanted(it.id)) return
      if (!tailored.ok || !tailored.data) {
        this.update(it, { status: 'error', error: tailored.error ?? 'Tailoring failed.' })
        return
      }

      this.update(it, { status: 'scoring' })
      const gap = await runClaudeJson<KeywordGap>(keywordGapPrompt(tailored.data, jd.text), {
        model,
        kind: 'keywordgap'
      })
      if (!this.stillWanted(it.id)) return

      const record: Application = {
        id: randomUUID(),
        jobId: job.jobId,
        fit: job.fit,
        source: 'jobright',
        jdSource: jd.source,
        workModel: job.workModel || undefined,
        location: job.location || undefined,
        company: job.company || 'Unknown',
        role: job.title || tailored.data.basics.label || 'Unknown',
        createdAt: new Date().toISOString(),
        status: 'draft',
        jobUrl: job.applyUrl,
        jobDescription: jd.text,
        baseId: it.baseId,
        tailored: tailored.data,
        keywordGap: gap.ok && gap.data ? gap.data : null,
        coverLetter: null,
        template: 'classic',
        files: {},
        notes: job.location ? `Location: ${job.location}` : ''
      }
      const apps = saveApplication(record)
      this.emitApps(apps)
      this.update(it, {
        status: 'done',
        appId: record.id,
        matchScore: record.keywordGap?.matchScore ?? null
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (this.stillWanted(it.id)) this.update(it, { status: 'error', error: msg })
    }
  }

  private baseResume(baseId: string): MasterResume | null {
    const { profiles, activeId } = loadProfiles()
    const p = profiles.find((x) => x.id === baseId) ?? profiles.find((x) => x.id === activeId)
    return p?.resume ?? null
  }
}
