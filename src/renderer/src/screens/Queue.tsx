import { useEffect, useMemo, useState } from 'react'
import type { Application } from '../../../shared/application'
import type { ResumeProfile } from '../../../shared/resume'
import { isActive, type QueueItem, type QueueStatus } from '../../../shared/queue'
import { Area, Button, Spinner } from '../ui'

const STATUS_LABEL: Record<QueueStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching posting…',
  tailoring: 'Tailoring resume…',
  scoring: 'Scoring match…',
  done: 'Ready',
  error: 'Failed'
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function Queue({
  profiles,
  activeId,
  apps,
  onOpenApplication
}: {
  profiles: ResumeProfile[]
  activeId: string
  apps: Application[]
  /** Open a finished item in the Tailor workspace. */
  onOpenApplication: (a: Application) => void
}): React.JSX.Element {
  const [items, setItems] = useState<QueueItem[]>([])
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    window.api.queueList().then(setItems)
    return window.api.onQueueEvent(setItems)
  }, [])

  const urls = useMemo(
    () =>
      text
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s)),
    [text]
  )
  const active = items.filter((i) => isActive(i.status)).length
  const finished = items.length - active
  const baseName = profiles.find((p) => p.id === activeId)?.name ?? 'current profile'

  async function add(): Promise<void> {
    if (!urls.length || adding) return
    setAdding(true)
    setItems(await window.api.queueAdd(urls, activeId))
    setText('')
    setAdding(false)
  }

  function openItem(it: QueueItem): void {
    const a = apps.find((x) => x.id === it.appId)
    if (a) onOpenApplication(a)
  }

  return (
    <div className="screen queue">
      <div className="screen-head">
        <h2>Queue</h2>
        <span className="muted">
          {active > 0 ? `${active} in progress` : 'Idle'}
          {finished > 0 ? ` · ${finished} finished` : ''}
        </span>
      </div>
      <p className="muted">
        Paste posting links, one per line. Each one is fetched, tailored from{' '}
        <strong>{baseName}</strong>, scored, and saved as a draft in Applications while you do
        something else. Two run at a time.
      </p>

      <Area
        value={text}
        onChange={setText}
        rows={5}
        placeholder={'https://jobs.ashbyhq.com/…\nhttps://job-boards.greenhouse.io/…\nhttps://…'}
      />
      <div className="row wrap-row">
        <Button onClick={add} disabled={!urls.length || adding}>
          {adding ? (
            <Spinner text="Adding…" />
          ) : (
            `Add ${urls.length || ''} ${urls.length === 1 ? 'link' : 'links'} to queue`
          )}
        </Button>
        {finished > 0 && (
          <Button variant="ghost" onClick={() => window.api.queueClearFinished().then(setItems)}>
            Clear finished
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <table className="apps-table queue-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>ATS</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={`q-${it.status}`}>
                <td>
                  {it.company || <span className="muted">{hostOf(it.url)}</span>}
                  <a className="posting-link" href={it.url} target="_blank" rel="noreferrer">
                    ↗ posting
                  </a>
                </td>
                <td>{it.role || <span className="muted">…</span>}</td>
                <td>
                  {typeof it.matchScore === 'number' ? (
                    <span
                      className={`ats-cell score-${
                        it.matchScore >= 75 ? 'hi' : it.matchScore >= 50 ? 'mid' : 'lo'
                      }`}
                    >
                      {it.matchScore}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {isActive(it.status) ? (
                    <Spinner text={STATUS_LABEL[it.status]} />
                  ) : it.status === 'error' ? (
                    <span className="q-error" title={it.error}>
                      {STATUS_LABEL.error}: {it.error}
                    </span>
                  ) : (
                    <span className="q-done">{STATUS_LABEL.done}</span>
                  )}
                </td>
                <td className="row-actions">
                  {it.status === 'done' && it.appId && (
                    <Button onClick={() => openItem(it)}>Open</Button>
                  )}
                  {it.status === 'error' && (
                    <Button variant="ghost" onClick={() => window.api.queueRetry(it.id).then(setItems)}>
                      Retry
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => window.api.queueRemove(it.id).then(setItems)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
