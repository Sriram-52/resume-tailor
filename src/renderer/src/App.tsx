import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  FileText,
  ListOrdered,
  MonitorSmartphone,
  Moon,
  Loader2,
  PanelsTopLeft,
  Search,
  Settings as SettingsIcon,
  Sun,
  X
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import type { MasterResume, ProfilesState, ResumeProfile } from '../../shared/resume'
import type { Application, ApplicationStatus } from '../../shared/application'
import type { JobrightFeed, JobrightJob, JobrightStatus } from '../../shared/jobright'
import type { QueueItem } from '../../shared/queue'
import { isActive } from '../../shared/queue'
import type { AppSettings } from '../../shared/settings'
import { emptySettings } from '../../shared/settings'
import { useTheme } from './useTheme'
import { cn } from './lib/utils'
import { Button } from './components/ui/button'
import { Badge, Kbd } from './components/ui/badge'
import { Input } from './components/ui/input'
import { Notice } from './components/ui/panel'
import { TooltipProvider } from './components/ui/tooltip'
import { MasterEditor } from './screens/MasterEditor'
import { Tailor } from './screens/Tailor'
import { Board, emptyBoardView, type BoardView } from './screens/Board'
import { Jobs } from './screens/Jobs'
import { Settings } from './screens/Settings'

/**
 * Shell and state.
 *
 * Three rail destinations (Jobs, Resume, Settings) and four Jobs tabs. The tabs
 * carry Cmd-1..4 because they are the per-session navigation; the rail is a
 * weekly visit and takes Cmd-5/6.
 *
 * Tailor is not a destination any more: it opens from a board card, as a
 * workspace over the app.
 */

type Rail = 'jobs' | 'resume' | 'settings'
const FEEDS: { key: JobrightFeed; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'applied', label: 'Applied' },
  { key: 'external', label: 'External' }
]
const RAIL: { key: Rail; label: string; icon: typeof Briefcase; hint: string }[] = [
  { key: 'jobs', label: 'Jobs', icon: Briefcase, hint: '⌘1–3' },
  { key: 'resume', label: 'Resume', icon: FileText, hint: '⌘4' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, hint: '⌘5' }
]

export default function App(): React.JSX.Element {
  const [rail, setRail] = useState<Rail>('jobs')
  const [feed, setFeed] = useState<JobrightFeed>('recommended')
  const [profiles, setProfiles] = useState<ResumeProfile[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [apps, setApps] = useState<Application[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tailorOpen, setTailorOpen] = useState(false)
  /**
   * Open tailoring workspaces, like browser tabs. Every one stays MOUNTED while
   * open — only hidden — so its agent session, chat log and draft survive being
   * switched away from or the whole overlay being closed. Closing a tab is the
   * only thing that ends a session.
   */
  const [tabs, setTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [busyTabs, setBusyTabs] = useState<Record<string, boolean>>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [search, setSearch] = useState('')
  /**
   * Board search, filters and sort live here rather than in the Board so they
   * survive leaving the tab and coming back — the board unmounts on a tab
   * switch, and losing a filter you set thirty seconds ago is infuriating.
   */
  const [boardView, setBoardView] = useState<BoardView>(emptyBoardView())
  const [settings, setSettings] = useState<AppSettings>(emptySettings())
  useTheme(settings.theme)

  const [jr, setJr] = useState<JobrightStatus | null>(null)
  const [jobs, setJobs] = useState<Record<JobrightFeed, JobrightJob[]>>({
    recommended: [],
    applied: [],
    external: []
  })
  const [feedLoading, setFeedLoading] = useState(false)
  /**
   * Which feeds have been fetched. Keyed explicitly rather than inferred from
   * `jobs[feed].length`, because a feed with genuinely zero results never
   * satisfies that test and re-fetches on every render — an endless request
   * loop against Jobright, and a spinner that never stops.
   */
  const [loadedFeeds, setLoadedFeeds] = useState<Partial<Record<JobrightFeed, boolean>>>({})
  /**
   * Errors are per-feed. A single shared string meant a 400 on Liked also
   * blanked Recommended, which was still holding 52 perfectly good jobs.
   */
  const [feedError, setFeedError] = useState<Partial<Record<JobrightFeed, string>>>({})

  useEffect(() => {
    void (async () => {
      const [state, a, q, s, cfg] = await Promise.all([
        window.api.loadProfiles(),
        window.api.loadApplications(),
        window.api.queueList(),
        window.api.jobrightStatus(),
        window.api.loadSettings()
      ])
      setProfiles(state.profiles)
      setActiveId(state.activeId)
      setApps(a)
      setQueue(q)
      setJr(s)
      setSettings(cfg)
      setLoaded(true)
    })()
    const offApps = window.api.onAppsChanged(setApps)
    const offQueue = window.api.onQueueEvent(setQueue)
    return () => {
      offApps()
      offQueue()
    }
  }, [])

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]

  // ---- Jobright ----------------------------------------------------------

  /** One place decides the session died, so there is only ever one banner. */
  const handleReply = useCallback(
    <T,>(r: { ok: boolean; data?: T; needsLogin?: boolean; error?: string }): T | null => {
      if (r.ok) return (r.data ?? null) as T | null
      if (r.needsLogin) setJr((s) => (s ? { ...s, connected: false, needsLogin: true } : s))
      else if (r.error) toast.error(r.error)
      return null
    },
    []
  )

  const loadFeed = useCallback(
    async (which: JobrightFeed): Promise<void> => {
      if (which !== 'recommended') return
      setFeedLoading(true)
      setLoadedFeeds((f) => ({ ...f, [which]: true }))
      setFeedError((e) => ({ ...e, [which]: undefined }))
      const reply = await window.api.jobrightRecommended()
      const data = handleReply<JobrightJob[]>(reply)
      if (data) setJobs((prev) => ({ ...prev, [which]: data }))
      else setFeedError((e) => ({ ...e, [which]: reply.ok ? '' : reply.error }))
      setFeedLoading(false)
    },
    [handleReply]
  )

  // Load a feed the first time it is opened. Never polls in the background.
  useEffect(() => {
    if (rail !== 'jobs' || !jr?.connected) return
    if (loadedFeeds[feed]) return
    void loadFeed(feed)
  }, [rail, feed, jr?.connected, loadedFeeds, loadFeed])

  async function connect(): Promise<void> {
    const s = await window.api.jobrightLogin()
    setJr(s)
    if (s.connected) {
      toast.success('Jobright connected')
      void loadFeed(feed)
    }
  }

  /** Optimistic: the feed should answer the click, not the network. */
  async function ignore(job: JobrightJob): Promise<void> {
    setJobs((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next) as JobrightFeed[]) {
        next[k] = next[k].filter((j) => j.jobId !== job.jobId)
      }
      return next
    })
    handleReply(await window.api.jobrightIgnore(job.jobId))
  }

  /**
   * Open the posting in the browser. Status is never changed here — the status
   * controls (Save as applied, the board, the detail panel) own that, so opening
   * a link to read it cannot silently move a card.
   */
  function applyTo(job: JobrightJob): void {
    if (job.applyUrl) void window.api.openExternal(job.applyUrl)
  }

  async function moveCard(id: string, status: ApplicationStatus): Promise<void> {
    const r = await window.api.setApplicationStatus(id, status)
    setApps(r.apps)
    if (r.needsLogin) {
      setJr((s) => (s ? { ...s, connected: false, needsLogin: true } : s))
      toast.warning('Moved here, but not on Jobright — the session expired.')
    } else if (!r.synced && r.error) {
      toast.warning(`Moved here, but Jobright did not accept it: ${r.error}`)
    }
  }

  function queueJobs(list: JobrightJob[], baseId: string): void {
    void window.api.queueAdd(list, baseId).then(setQueue)
    setDrawerOpen(true)
  }

  // ---- profiles / tailor -------------------------------------------------

  function persist(next: ProfilesState): void {
    setProfiles(next.profiles)
    setActiveId(next.activeId)
    void window.api.saveProfiles(next)
  }
  function setActiveResume(resume: MasterResume): void {
    setProfiles((ps) => ps.map((p) => (p.id === activeId ? { ...p, resume } : p)))
  }
  async function saveActive(): Promise<void> {
    await window.api.saveProfiles({ profiles, activeId })
  }
  function updateProfileResume(id: string, resume: MasterResume): void {
    persist({
      profiles: profiles.map((p) => (p.id === id ? { ...p, resume: structuredClone(resume) } : p)),
      activeId
    })
  }
  function duplicateProfile(): void {
    if (!active) return
    persist({
      profiles: [
        ...profiles,
        {
          id: crypto.randomUUID(),
          name: `${active.name} copy`,
          resume: structuredClone(active.resume)
        }
      ],
      activeId
    })
  }
  function renameProfile(name: string): void {
    persist({ profiles: profiles.map((p) => (p.id === activeId ? { ...p, name } : p)), activeId })
  }
  function deleteProfile(): void {
    if (profiles.length <= 1) return
    const remaining = profiles.filter((p) => p.id !== activeId)
    persist({ profiles: remaining, activeId: remaining[0].id })
  }

  /** Open (or focus) a tailoring workspace for this application. */
  async function openApplication(a: Application): Promise<void> {
    // Already open: just bring it forward, and never re-seed — that would throw
    // away edits the agent has already applied in that tab.
    if (tabs.includes(a.id)) {
      setActiveTab(a.id)
      setTailorOpen(true)
      return
    }
    await window.api.saveDraft(a.id, {
      jd: a.jobDescription,
      company: a.company,
      role: a.role,
      jobUrl: a.jobUrl ?? '',
      templateId: a.template,
      baseId: a.baseId ?? '',
      tailored: a.tailored,
      gap: a.keywordGap,
      cover: a.coverLetter,
      appId: a.id,
      appCreatedAt: a.createdAt
    })
    if (a.baseId && profiles.some((p) => p.id === a.baseId))
      persist({ profiles, activeId: a.baseId })
    setTabs((t) => [...t, a.id])
    setActiveTab(a.id)
    setTailorOpen(true)
  }

  /** Close a workspace for good: end its agent session and drop its draft. */
  function closeTab(id: string): void {
    void window.api.closeChat(id)
    setTabs((prev) => {
      const next = prev.filter((t) => t !== id)
      setActiveTab((cur) => (cur === id ? (next[next.length - 1] ?? null) : cur))
      if (!next.length) setTailorOpen(false)
      return next
    })
    setBusyTabs(({ [id]: _drop, ...rest }) => rest)
  }

  const busyCount = Object.values(busyTabs).filter(Boolean).length
  const tabLabel = (id: string): { company: string; role: string } => {
    const a = apps.find((x) => x.id === id)
    return { company: a?.company ?? 'Untitled', role: a?.role ?? '' }
  }

  // ---- keyboard ----------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && tailorOpen) {
        setTailorOpen(false)
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      const go = (f: JobrightFeed) => (): void => {
        setRail('jobs')
        setFeed(f)
      }
      const map: Record<string, () => void> = {
        '1': go('recommended'),
        '2': go('applied'),
        '3': go('external'),
        '4': () => setRail('resume'),
        '5': () => setRail('settings'),
        '0': () => setDrawerOpen((v) => !v),
        k: () => document.getElementById('global-search')?.focus()
      }
      const fn = map[e.key.toLowerCase()]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tailorOpen])

  const queueCount = useMemo(() => queue.filter((q) => isActive(q.status)).length, [queue])

  if (!loaded || !active) {
    return <div className="grid h-screen place-items-center text-muted-foreground">Loading…</div>
  }

  const counts: Record<JobrightFeed, number | null> = {
    recommended: jobs.recommended.length || null,
    applied: apps.length || null,
    external: jobs.external.length || null
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen bg-background text-foreground">
        <aside className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3.5">
          <div className="mb-4 grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-primary text-white">
            <Briefcase className="h-4 w-4" strokeWidth={2.2} />
          </div>
          {RAIL.map((r) => (
            <button
              key={r.key}
              onClick={() => setRail(r.key)}
              className={cn(
                'flex w-14 flex-col items-center gap-1 rounded-[10px] py-2 text-muted-foreground hover:bg-border',
                rail === r.key && 'bg-card text-primary shadow-[0_1px_2px_rgba(28,26,23,0.06)]'
              )}
            >
              <r.icon className="h-[19px] w-[19px]" strokeWidth={1.8} />
              <span className="text-[10px] font-medium">{r.label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            title={`Appearance: ${settings.theme}`}
            onClick={() => {
              const order: AppSettings['theme'][] = ['system', 'light', 'dark']
              const next = order[(order.indexOf(settings.theme) + 1) % order.length]
              const updated = { ...settings, theme: next }
              setSettings(updated)
              void window.api.saveSettings(updated)
            }}
            className="flex w-14 flex-col items-center gap-1 rounded-[10px] py-2 text-muted-foreground hover:bg-border"
          >
            {settings.theme === 'dark' ? (
              <Moon className="h-[17px] w-[17px]" strokeWidth={1.8} />
            ) : settings.theme === 'light' ? (
              <Sun className="h-[17px] w-[17px]" strokeWidth={1.8} />
            ) : (
              <MonitorSmartphone className="h-[17px] w-[17px]" strokeWidth={1.8} />
            )}
            <span className="text-[9.5px] font-medium capitalize">{settings.theme}</span>
          </button>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {jr?.readOnly && jr.connected && (
            <div className="flex items-center gap-2 border-b border-warn-line bg-warn-soft px-5 py-1.5 text-[11.5px] text-warn">
              <b className="font-semibold">Dev build</b>
              <span>reading your live Jobright feed, but never writing to it.</span>
            </div>
          )}
          {jr && !jr.connected && (
            <Notice className="rounded-none border-x-0 border-t-0 px-5">
              <b className="font-semibold">Jobright is not connected.</b>
              <span>The feed and your application status both come from your Jobright account.</span>
              <div className="flex-1" />
              <Button onClick={connect}>Connect Jobright</Button>
            </Notice>
          )}

          {rail === 'jobs' && (
            <>
              <div className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card-muted px-5">
                <div className="flex gap-0.5">
                  {FEEDS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFeed(f.key)}
                      className={cn(
                        'flex items-center gap-2 rounded-[8px] px-3 py-1.5 font-medium text-muted-foreground hover:bg-surface',
                        feed === f.key &&
                          'bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(28,26,23,0.07)]'
                      )}
                    >
                      {f.label}
                      {counts[f.key] !== null && <Badge tone="count">{counts[f.key]}</Badge>}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <div className="relative w-[250px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <Input
                    id="global-search"
                    value={search}
                    placeholder="Search title or company"
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-11"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    <Kbd>⌘K</Kbd>
                  </span>
                </div>
                {!!tabs.length && (
                  <Button
                    variant="subtle"
                    onClick={() => setTailorOpen(true)}
                    title="Reopen your tailoring workspaces"
                  >
                    {busyCount > 0 ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PanelsTopLeft className="h-3.5 w-3.5" />
                    )}
                    {busyCount > 0 ? `Working ${busyCount}` : `Tabs ${tabs.length}`}
                  </Button>
                )}
                <Button variant="subtle" onClick={() => setDrawerOpen((v) => !v)}>
                  <ListOrdered className="h-3.5 w-3.5" />
                  Queue {queueCount > 0 ? queueCount : ''}
                </Button>
              </div>

              {feed === 'applied' ? (
                <Board
                  apps={apps}
                  onMove={moveCard}
                  onOpen={openApplication}
                  onDelete={(id) => void window.api.deleteApplication(id).then(setApps)}
                  view={boardView}
                  onView={setBoardView}
                  dailyGoal={settings.dailyGoal}
                />
              ) : feed === 'external' ? (
                <div className="grid flex-1 place-items-center p-10 text-center text-muted-foreground">
                  Dice imports land here. Import a posting URL from Settings to give it a Jobright
                  id, a fit score and status tracking.
                </div>
              ) : (
                <Jobs
                  tab={feed}
                  jobs={jobs[feed]}
                  loading={feedLoading}
                  error={feedError[feed] ?? ''}
                  apps={apps}
                  queue={queue}
                  profiles={profiles}
                  activeId={activeId}
                  drawerOpen={drawerOpen}
                  onCloseDrawer={() => setDrawerOpen(false)}
                  onQueue={queueJobs}
                  onIgnore={ignore}
                  onApply={applyTo}
                  onRetry={(id) => void window.api.queueRetry(id).then(setQueue)}
                  onRemoveQueued={(id) => void window.api.queueRemove(id).then(setQueue)}
                  onClearFinished={() => void window.api.queueClearFinished().then(setQueue)}
                  search={search}
                />
              )}
            </>
          )}

          {rail === 'resume' && (
            <MasterEditor
              key={active.id}
              master={active.resume}
              setMaster={setActiveResume}
              onSave={saveActive}
              onAiEdit={(r) => updateProfileResume(active.id, r)}
              profileName={active.name}
              canDelete={profiles.length > 1}
              onRename={renameProfile}
              onDuplicate={duplicateProfile}
              onDelete={deleteProfile}
            />
          )}

          {rail === 'settings' && <Settings onSaved={setSettings} />}
        </main>

        {/*
          Tailoring workspaces. Every open tab stays mounted for as long as it is
          open — hidden, never unmounted — so its agent keeps working while you
          are on another tab or back on the board. `hidden` on the wrapper is what
          makes that true; rendering only the active one would kill the rest.
        */}
        {!!tabs.length && (
          <div
            className="fixed inset-0 z-40 flex flex-col bg-background"
            hidden={!tailorOpen}
          >
            <div className="flex h-10 shrink-0 items-stretch gap-1 border-b border-border bg-surface px-2">
              {tabs.map((id) => {
                const { company, role } = tabLabel(id)
                return (
                  <div
                    key={id}
                    onClick={() => setActiveTab(id)}
                    role="presentation"
                    className={cn(
                      'group flex max-w-[230px] min-w-0 cursor-pointer items-center gap-2 self-end rounded-t-[8px] px-3 py-1.5 text-[12px]',
                      activeTab === id
                        ? 'bg-background font-semibold'
                        : 'text-muted-foreground hover:bg-background/50'
                    )}
                    title={`${company} — ${role}`}
                  >
                    {busyTabs[id] && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                    )}
                    <span className="truncate">{company}</span>
                    <span className="truncate text-faint">{role}</span>
                    <button
                      className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(id)
                      }}
                      title="Close this workspace and stop its agent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              <div className="flex-1" />
              <button
                className="self-center rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-background"
                onClick={() => setTailorOpen(false)}
                title="Back to the board — everything keeps running"
              >
                Back to board
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              {tabs.map((id) => (
                <div key={id} className="absolute inset-0" hidden={activeTab !== id}>
                  <Tailor
                    profiles={profiles}
                    activeId={activeId}
                    apps={apps}
                    onSelectProfile={(pid) => persist({ profiles, activeId: pid })}
                    onSaved={setApps}
                    onUpdateProfile={updateProfileResume}
                    onClose={() => closeTab(id)}
                    chatKey={id}
                    onBusyChange={(k, busy) => setBusyTabs((b) => ({ ...b, [k]: busy }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
