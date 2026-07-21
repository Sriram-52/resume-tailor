import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/settings'
import { emptySettings, MODEL_OPTIONS } from '../../../shared/settings'
import type { UsageKind, UsageState, UsageTotals } from '../../../shared/usage'
import { emptyUsage, totalTokens, USAGE_KIND_LABELS } from '../../../shared/usage'
import { Button, Spinner } from '../ui'

const fmt = new Intl.NumberFormat()

/** Read-only token-usage panel. Totals across every LLM call, broken down by feature. */
function UsagePanel(): React.JSX.Element {
  const [usage, setUsage] = useState<UsageState>(emptyUsage())
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    setUsage(await window.api.loadUsage())
    setLoaded(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function reset(): Promise<void> {
    await window.api.resetUsage()
    await refresh()
  }

  const t = usage.totals
  // byKind is keyed by UsageKind; show rows with any recorded calls, biggest first.
  const rows = (Object.entries(usage.byKind) as [UsageKind, UsageTotals][])
    .filter(([, v]) => v && v.calls > 0)
    .sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Token usage</h3>
        <Button variant="ghost" onClick={refresh}>
          Refresh
        </Button>
      </div>
      <p className="muted">
        Tokens burned across tailoring, ATS analysis, cover letters, chat, and job scoring. These
        run on your Claude Code subscription (no per-token bill); this is just for your own
        visibility. Counts are stored locally.
      </p>

      {!loaded ? (
        <Spinner text="Loading…" />
      ) : t.calls === 0 ? (
        <p className="muted">No usage recorded yet. Tailor a resume to get started.</p>
      ) : (
        <>
          <div className="usage-stats">
            <div className="usage-stat">
              <span className="usage-num">{fmt.format(totalTokens(t))}</span>
              <span className="usage-lbl">Total tokens</span>
            </div>
            <div className="usage-stat">
              <span className="usage-num">{fmt.format(t.inputTokens)}</span>
              <span className="usage-lbl">Input</span>
            </div>
            <div className="usage-stat">
              <span className="usage-num">{fmt.format(t.outputTokens)}</span>
              <span className="usage-lbl">Output</span>
            </div>
            <div className="usage-stat">
              <span className="usage-num">{fmt.format(t.cacheReadTokens)}</span>
              <span className="usage-lbl">Cache read</span>
            </div>
            <div className="usage-stat">
              <span className="usage-num">{fmt.format(t.calls)}</span>
              <span className="usage-lbl">Calls</span>
            </div>
            <div className="usage-stat">
              <span className="usage-num">${t.costUsd.toFixed(2)}</span>
              <span className="usage-lbl">Est. cost</span>
            </div>
          </div>

          <table className="usage-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Calls</th>
                <th>Input</th>
                <th>Output</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([kind, v]) => (
                <tr key={kind}>
                  <td>{USAGE_KIND_LABELS[kind] ?? kind}</td>
                  <td>{fmt.format(v.calls)}</td>
                  <td>{fmt.format(v.inputTokens)}</td>
                  <td>{fmt.format(v.outputTokens)}</td>
                  <td>{fmt.format(totalTokens(v))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="settings-actions">
            <Button variant="ghost" onClick={reset}>
              Reset usage
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Settings: where the user supplies their own API keys, stored locally on their
 * machine (userData/settings.json) — never bundled with the app. This is what
 * lets Resume Tailor ship as a DMG without embedding anyone's secrets.
 */
export function Settings(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings())
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    ;(async () => {
      setSettings(await window.api.loadSettings())
      setLoaded(true)
    })()
  }, [])

  function set<K extends keyof AppSettings>(key: K, val: AppSettings[K]): void {
    setSettings((s) => ({ ...s, [key]: val }))
    setSaved(false)
  }

  async function save(): Promise<void> {
    setSaving(true)
    await window.api.saveSettings({ ...settings, apifyToken: settings.apifyToken.trim() })
    setSaving(false)
    setSaved(true)
  }

  if (!loaded) return <div className="screen">Loading…</div>

  return (
    <div className="screen settings">
      <div className="screen-head">
        <div>
          <h2>Settings</h2>
          <p className="muted">
            Keys are stored locally on this Mac and never leave your machine or get bundled with the
            app.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Apify API token</h3>
        </div>
        <p className="muted">
          Powers job search in the <b>Discover</b> tab (Dice.com via Apify). Everything else runs on
          your Claude Code subscription and needs no key. Leave this blank if you don&apos;t use
          Discover.
        </p>

        <label className="field field-full">
          <span>Token</span>
          <input
            type={reveal ? 'text' : 'password'}
            value={settings.apifyToken}
            placeholder="apify_api_…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => set('apifyToken', e.target.value)}
          />
        </label>

        <label className="field checkbox">
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
          <span>Show token</span>
        </label>

        <p className="muted">
          Get a token from{' '}
          <a
            href="https://console.apify.com/account/integrations"
            target="_blank"
            rel="noreferrer"
          >
            console.apify.com/account/integrations
          </a>
          . Apify bills per result (~$3 / 1,000).
        </p>

      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Model</h3>
        </div>
        <p className="muted">
          Which Claude model to use for tailoring, ATS analysis, cover letters, and chat. Runs on
          your Claude Code subscription — pick a model your plan includes.
        </p>

        <label className="field field-full">
          <span>Model</span>
          <select value={settings.tailorModel} onChange={(e) => set('tailorModel', e.target.value)}>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-actions">
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner text="Saving…" /> : 'Save'}
        </Button>
        {saved && <span className="ok-badge">Saved ✓</span>}
      </div>

      <UsagePanel />
    </div>
  )
}
