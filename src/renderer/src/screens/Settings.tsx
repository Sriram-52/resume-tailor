import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Download, Flame, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Application } from '../../../shared/application'
import { goalProgress } from '../../../shared/goals'
import type { AppSettings } from '../../../shared/settings'
import { emptySettings, MODEL_OPTIONS } from '../../../shared/settings'
import type { JobrightFilter, JobrightStatus, SavedFilter } from '../../../shared/jobright'
import type { UsageKind, UsageState, UsageTotals } from '../../../shared/usage'
import { emptyUsage, totalTokens, USAGE_KIND_LABELS } from '../../../shared/usage'
import { Button } from '../components/ui/button'
import { Hint, Input, Label } from '../components/ui/input'
import { Panel, PanelBody, PanelHeader, ScreenHeader, SectionLabel } from '../components/ui/panel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { SwitchRow } from '../components/ui/switch'

const fmt = new Intl.NumberFormat()

/**
 * The app stores an empty model id to mean "use the app default", but Radix
 * reserves the empty string for a Select's cleared state and throws on an Item
 * with that value. Map across the boundary rather than changing what is stored.
 */
const DEFAULT_MODEL_VALUE = '__default__'

/** The saved filter the app writes to Jobright. Named so it never clobbers theirs. */
const FILTER_NAME = 'Resume Tailor'

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

/**
 * An editable exclusion list.
 *
 * Jobright is not consistent about these: excluded titles are plain strings,
 * excluded companies are `{companyId, companyName}` objects. Rendering an object
 * as a React child is what crashed this screen, so the list is generic — it
 * displays a label and hands back items in whatever shape it was given, keeping
 * each existing entry (and its id) untouched.
 */
function ChipList<T>({
  values,
  onChange,
  placeholder,
  labelOf,
  create
}: {
  values: T[]
  onChange: (v: T[]) => void
  placeholder: string
  labelOf: (v: T) => string
  create: (text: string) => T
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  function add(): void {
    const v = draft.trim()
    if (!v || values.some((x) => labelOf(x).toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, create(v)])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v, i) => (
        <span
          key={`${labelOf(v)}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-[20px] bg-surface px-2 py-1 text-[11.5px] text-muted-foreground"
        >
          {labelOf(v)}
          <button
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-faint hover:text-danger"
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 rounded-[20px] border border-dashed border-border-strong px-2 py-0.5">
        <Plus className="h-3 w-3 text-primary" />
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          className="w-24 border-0 bg-transparent text-[11.5px] text-foreground outline-none placeholder:text-faint"
        />
      </span>
    </div>
  )
}

/**
 * Settings: connections, tailoring, and the feed filter.
 *
 * The filter is split deliberately. Nine of the rules are written to Jobright as
 * a saved filter, so the feed arrives already filtered instead of being fetched
 * and thrown away. The two Jobright cannot express — a minimum fit score, which
 * is a sort key on their side, and the remote-or-nearby rule — are applied here.
 */
export function Settings({
  onSaved
}: {
  /**
   * Hand the saved settings back to the shell. Without this the screen writes to
   * disk and nothing else in the app knows until the next launch — which is how
   * the daily goal could be set and the board still show no meter.
   */
  onSaved?: (s: AppSettings) => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings())
  const [filter, setFilter] = useState<JobrightFilter>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [jr, setJr] = useState<JobrightStatus | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [apps, setApps] = useState<Application[]>([])
  const streak = goalProgress(apps, settings.dailyGoal)

  useEffect(() => {
    void (async () => {
      const [s, status, saved, a] = await Promise.all([
        window.api.loadSettings(),
        window.api.jobrightStatus(),
        window.api.jobrightSavedFilters(),
        window.api.loadApplications()
      ])
      setSettings(s)
      setApps(a)
      setJr(status)
      if (saved.ok) {
        const mine = saved.data?.find((f) => f.filterName === FILTER_NAME) ?? saved.data?.[0]
        if (mine) setFilter(mine.filter)
      }
      setLoaded(true)
    })()
  }, [])

  function set<K extends keyof AppSettings>(key: K, val: AppSettings[K]): void {
    setSettings((s) => ({ ...s, [key]: val }))
  }
  function setF<K extends keyof JobrightFilter>(key: K, val: JobrightFilter[K]): void {
    setFilter((f) => ({ ...f, [key]: val }))
  }

  async function save(): Promise<void> {
    setSaving(true)
    const next = { ...settings, apifyToken: settings.apifyToken.trim() }
    await window.api.saveSettings(next)
    onSaved?.(next)
    await window.api.queueSetConcurrency(next.concurrency)
    const payload: SavedFilter = {
      surveyId: '',
      filterName: FILTER_NAME,
      isActive: true,
      filter
    }
    const r = await window.api.jobrightSaveFilter(payload)
    setSaving(false)
    if (r.ok) toast.success('Saved, and the feed filter was pushed to Jobright.')
    else toast.warning(`Saved locally. Jobright did not take the filter: ${r.error}`)
  }

  async function backfill(): Promise<void> {
    setBackfilling(true)
    const r = await window.api.jobrightBackfill()
    setBackfilling(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    const d = r.data
    toast.success(
      `Pulled ${d.fetched} applications: ${d.matched} matched, ${d.created} added, ${d.statusUpdated} statuses updated.`
    )
  }

  async function importPosting(): Promise<void> {
    const url = importUrl.trim()
    if (!url) return
    const r = await window.api.jobrightImportUrl(url)
    if (r.ok) {
      toast.success('Sent to Jobright. It appears in External once they finish parsing it.')
      setImportUrl('')
    } else {
      toast.error(r.error)
    }
  }

  if (!loaded) {
    return <div className="grid flex-1 place-items-center text-muted-foreground">Loading…</div>
  }

  const nearStates = settings.localFilter.nearStates.join(', ')

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 px-7 [&>*]:shrink-0">
      <ScreenHeader
        title="Settings"
        sub="Connections, job sources, and the filter that decides what reaches your feed."
      >
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </ScreenHeader>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] gap-4">
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader>Connections</PanelHeader>
            <PanelBody>
              <div className="flex items-center gap-3 rounded-[10px] border border-surface bg-card-muted p-3">
                {jr?.connected ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
                ) : (
                  <CircleAlert className="h-4 w-4 shrink-0 text-warn" />
                )}
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">Jobright</div>
                  <Hint>
                    {jr?.connected
                      ? 'Signed in. The feed, the fit scores and your application status all come from here.'
                      : 'Not connected. Sign in to load the feed and sync application status.'}
                  </Hint>
                  {jr?.readOnly && (
                    <Hint className="mt-1 text-warn">
                      Dev build: reads are live, but nothing is ever written back to Jobright.
                    </Hint>
                  )}
                </div>
                <Button
                  variant="ghost"
                  onClick={async () => setJr(await window.api.jobrightLogin())}
                >
                  {jr?.connected ? 'Reconnect' : 'Connect'}
                </Button>
              </div>

              <div className="flex items-center gap-3 rounded-[10px] border border-surface bg-card-muted p-3">
                <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">Backfill applications</div>
                  <Hint>
                    Pull every application Jobright has ever recorded onto the board. Ones this app
                    never tailored simply have no ATS score.
                  </Hint>
                </div>
                <Button variant="ghost" onClick={backfill} disabled={backfilling || !jr?.connected}>
                  {backfilling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {backfilling ? 'Pulling…' : 'Backfill'}
                </Button>
              </div>

              <Field
                label="Apify API token"
                hint="Only used for Dice imports. Apify bills per result (~$3 / 1,000); everything else runs on your Claude Code subscription."
              >
                <div className="flex gap-2">
                  <Input
                    type={reveal ? 'text' : 'password'}
                    value={settings.apifyToken}
                    placeholder="apify_api_…"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-[11.5px]"
                    onChange={(e) => set('apifyToken', e.target.value)}
                  />
                  <Button variant="ghost" onClick={() => setReveal((v) => !v)}>
                    {reveal ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </Field>

              <Field
                label="Import a posting"
                hint="Sends the URL to Jobright so it gets a job id, a fit score and status tracking — the same identity everything else in the app uses."
              >
                <div className="flex gap-2">
                  <Input
                    value={importUrl}
                    placeholder="https://boards.greenhouse.io/…"
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void importPosting()}
                  />
                  <Button variant="ghost" onClick={importPosting} disabled={!importUrl.trim()}>
                    Import
                  </Button>
                </div>
              </Field>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>Daily goal</PanelHeader>
            <PanelBody>
              <Field
                label="Applications per day"
                hint="Shown as a progress bar on the board, with a streak for consecutive days that hit it. A day counts when an application leaves Tailored — not when it was written. Set 0 to turn it off."
              >
                <Input
                  className="tnum w-28"
                  value={settings.dailyGoal || ''}
                  placeholder="0"
                  onChange={(e) => set('dailyGoal', Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              {settings.dailyGoal > 0 && (
                <div className="flex items-center gap-2.5 rounded-[10px] border border-surface bg-card-muted p-3">
                  <Flame className="h-4 w-4 shrink-0 text-warn" />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">
                      {streak.streak > 0
                        ? `${streak.streak} day streak`
                        : 'No streak running'}
                    </div>
                    <Hint>
                      {streak.today} sent today
                      {streak.best > 0 ? ` · best run ${streak.best} days` : ''}
                    </Hint>
                  </div>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>Tailoring</PanelHeader>
            <PanelBody>
              <Field
                label="Model"
                hint="Runs on your Claude Code subscription. Two calls per job: tailor, then keyword gap."
              >
                <Select
                  value={settings.tailorModel || DEFAULT_MODEL_VALUE}
                  onValueChange={(v) => set('tailorModel', v === DEFAULT_MODEL_VALUE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value || 'default'} value={m.value || DEFAULT_MODEL_VALUE}>
                        {m.label}
                      </SelectItem>
                    ))}
                    {/* A model saved before it left the list keeps running; show it rather than a blank trigger. */}
                    {settings.tailorModel &&
                      !MODEL_OPTIONS.some((m) => m.value === settings.tailorModel) && (
                        <SelectItem value={settings.tailorModel}>
                          {settings.tailorModel} (no longer listed)
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Jobs tailored at once"
                hint="Higher finishes a batch sooner but runs more Claude calls in parallel."
              >
                <Select
                  value={String(settings.concurrency)}
                  onValueChange={(v) => set('concurrency', Number(v))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </PanelBody>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader hint="written to Jobright as a saved filter">Feed filter</PanelHeader>
            <PanelBody>
              <div className="grid grid-cols-2 gap-3.5">
                <Field label="Minimum salary">
                  <Input
                    className="tnum"
                    value={filter.annualSalaryMinimum ?? ''}
                    placeholder="150000"
                    onChange={(e) =>
                      setF('annualSalaryMinimum', Number(e.target.value) || undefined)
                    }
                  />
                </Field>
                <Field label="Posted within (days)">
                  <Input
                    className="tnum"
                    value={filter.daysAgo ?? ''}
                    placeholder="7"
                    onChange={(e) => setF('daysAgo', Number(e.target.value) || undefined)}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 rounded-[10px] border border-surface bg-card-muted p-3">
                <SwitchRow
                  label="H1B sponsors only"
                  checked={!!filter.isH1BOnly}
                  onCheckedChange={(v) => setF('isH1BOnly', v)}
                />
                <SwitchRow
                  label="Exclude staffing agencies"
                  checked={!!filter.excludeStaffingAgency}
                  onCheckedChange={(v) => setF('excludeStaffingAgency', v)}
                />
                <SwitchRow
                  label="Exclude roles requiring security clearance"
                  checked={!!filter.excludeSecurityClearance}
                  onCheckedChange={(v) => setF('excludeSecurityClearance', v)}
                />
                <SwitchRow
                  label="Exclude US-citizen-only roles"
                  checked={!!filter.excludeUsCitizen}
                  onCheckedChange={(v) => setF('excludeUsCitizen', v)}
                />
              </div>

              <Field
                label="Excluded titles"
                hint="A title containing any of these is dropped before it reaches you."
              >
                <ChipList
                  values={filter.excludedTitle ?? []}
                  onChange={(v) => setF('excludedTitle', v)}
                  placeholder="Java"
                  labelOf={(t) => t}
                  create={(t) => t}
                />
              </Field>
              <Field label="Excluded companies">
                <ChipList
                  values={filter.excludedCompanies ?? []}
                  onChange={(v) => setF('excludedCompanies', v)}
                  placeholder="Company"
                  labelOf={(c) => c.companyName}
                  create={(companyName) => ({ companyName })}
                />
              </Field>

              <div className="mt-1 border-t border-dashed border-border pt-3.5">
                <SectionLabel>
                  Applied locally
                  <span className="ml-2 font-normal normal-case tracking-normal text-faint">
                    Jobright cannot express these two
                  </span>
                </SectionLabel>
                <div className="mt-2.5 grid grid-cols-2 gap-3.5">
                  <Field
                    label="Minimum fit"
                    hint="Fit is a sort key on Jobright, not a filter, so this is applied after fetching."
                  >
                    <Input
                      className="tnum w-28"
                      value={settings.localFilter.minFit || ''}
                      placeholder="75"
                      onChange={(e) =>
                        set('localFilter', {
                          ...settings.localFilter,
                          minFit: Number(e.target.value) || 0
                        })
                      }
                    />
                  </Field>
                  <Field label="Remote, or near" hint="Two-letter state codes, comma separated.">
                    <Input
                      value={nearStates}
                      placeholder="GA, TX"
                      onChange={(e) =>
                        set('localFilter', {
                          ...settings.localFilter,
                          nearStates: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="mt-3">
                  <SwitchRow
                    label="Apply the location rule"
                    hint="Off means remote and on-site anywhere both reach the feed."
                    checked={settings.localFilter.nearOnly}
                    onCheckedChange={(v) =>
                      set('localFilter', { ...settings.localFilter, nearOnly: v })
                    }
                  />
                </div>
              </div>
            </PanelBody>
          </Panel>

          <UsagePanel />
        </div>
      </div>
    </div>
  )
}

/** Read-only token ledger. Totals across every Claude call, broken down by feature. */
function UsagePanel(): React.JSX.Element {
  const [usage, setUsage] = useState<UsageState>(emptyUsage())
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    setUsage(await window.api.loadUsage())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const t = usage.totals
  const rows = (Object.entries(usage.byKind) as [UsageKind, UsageTotals][])
    .filter(([, v]) => v && v.calls > 0)
    .sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))

  return (
    <Panel>
      <PanelHeader>
        Token usage
        <div className="flex-1" />
        <button className="text-[11px] font-medium normal-case text-primary" onClick={refresh}>
          Refresh
        </button>
      </PanelHeader>
      <PanelBody>
        {!loaded ? (
          <Hint>Loading…</Hint>
        ) : t.calls === 0 ? (
          <Hint>No usage recorded yet. Tailor a job to get started.</Hint>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Total tokens', fmt.format(totalTokens(t))],
                  ['Input', fmt.format(t.inputTokens)],
                  ['Output', fmt.format(t.outputTokens)],
                  ['Cache read', fmt.format(t.cacheReadTokens)],
                  ['Calls', fmt.format(t.calls)],
                  ['Est. cost', `$${t.costUsd.toFixed(2)}`]
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-[10px] bg-card-muted p-2.5">
                  <div className="tnum text-[15px] font-semibold">{value}</div>
                  <div className="mt-0.5 text-[10.5px] text-faint">{label}</div>
                </div>
              ))}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.07em] text-faint">
                  <th className="py-1.5 font-semibold">Feature</th>
                  <th className="py-1.5 text-right font-semibold">Calls</th>
                  <th className="py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([kind, v]) => (
                  <tr key={kind} className="border-t border-surface">
                    <td className="py-1.5 text-[12px]">{USAGE_KIND_LABELS[kind] ?? kind}</td>
                    <td className="tnum py-1.5 text-right text-[12px]">{fmt.format(v.calls)}</td>
                    <td className="tnum py-1.5 text-right text-[12px]">
                      {fmt.format(totalTokens(v))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Button
                variant="ghost"
                onClick={async () => {
                  await window.api.resetUsage()
                  await refresh()
                }}
              >
                Reset usage
              </Button>
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  )
}
