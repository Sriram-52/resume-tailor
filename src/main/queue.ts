import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { Application, KeywordGap } from '../shared/application'
import type { MasterResume } from '../shared/resume'
import { isActive, type QueueItem } from '../shared/queue'
import { loadProfiles, loadQueue, saveApplication, saveQueue } from './store'
import { fetchJobPosting } from './jobFetch'
import { runClaudeJson } from './claude'
import { keywordGapPrompt, tailorPrompt } from './prompts'
import { getTailorModel } from './config'

/** How many postings are processed at once. Each step is a separate CLI call. */
const CONCURRENCY = 2

/**
 * Background runner for the tailoring queue. Items live in queue.json so a
 * restart picks up where it left off; anything mid-flight when the app quit is
 * simply re-queued. Progress is pushed to the renderer over `queue:event`, and
 * every finished item is saved as a draft Application (pushed over
 * `apps:changed`) so it shows up in the tracker immediately.
 */
export class QueueRunner {
  private items: QueueItem[]
  private running = 0
  private win: BrowserWindow | null = null

  constructor() {
    this.items = loadQueue().map((i) =>
      isActive(i.status) ? { ...i, status: 'queued' as const, error: undefined } : i
    )
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

  add(urls: string[], baseId: string): QueueItem[] {
    const now = new Date().toISOString()
    const seen = new Set(this.items.filter((i) => isActive(i.status)).map((i) => i.url))
    for (const raw of urls) {
      const url = raw.trim()
      if (!url || seen.has(url)) continue
      seen.add(url)
      this.items.unshift({
        id: randomUUID(),
        url,
        baseId,
        status: 'queued',
        company: '',
        role: '',
        matchScore: null,
        createdAt: now,
        updatedAt: now
      })
    }
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
    while (this.running < CONCURRENCY) {
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

      this.update(it, { status: 'fetching' })
      const fetched = await fetchJobPosting(it.url)
      if (!this.stillWanted(it.id)) return
      if (!fetched.ok || !fetched.data) {
        this.update(it, { status: 'error', error: fetched.error ?? 'Could not fetch the posting.' })
        return
      }
      const posting = fetched.data
      this.update(it, { status: 'tailoring', company: posting.company, role: posting.role })

      const model = getTailorModel()
      const tailored = await runClaudeJson<MasterResume>(tailorPrompt(base, posting.description), {
        model,
        kind: 'tailor'
      })
      if (!this.stillWanted(it.id)) return
      if (!tailored.ok || !tailored.data) {
        this.update(it, { status: 'error', error: tailored.error ?? 'Tailoring failed.' })
        return
      }

      this.update(it, { status: 'scoring' })
      const gap = await runClaudeJson<KeywordGap>(
        keywordGapPrompt(tailored.data, posting.description),
        { model, kind: 'keywordgap' }
      )
      if (!this.stillWanted(it.id)) return

      const record: Application = {
        id: randomUUID(),
        company: posting.company || 'Unknown',
        role: posting.role || tailored.data.basics.label || 'Unknown',
        createdAt: new Date().toISOString(),
        status: 'draft',
        jobUrl: it.url,
        jobDescription: posting.description,
        baseId: it.baseId,
        tailored: tailored.data,
        keywordGap: gap.ok && gap.data ? gap.data : null,
        coverLetter: null,
        template: 'classic',
        files: {},
        notes: posting.location ? `Location: ${posting.location}` : ''
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
