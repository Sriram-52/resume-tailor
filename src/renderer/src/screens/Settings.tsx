import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/settings'
import { emptySettings, MODEL_OPTIONS } from '../../../shared/settings'
import { Button, Spinner } from '../ui'

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
    </div>
  )
}
