import { useState } from 'react'
import type { Application, ApplicationStatus } from '../../../shared/application'
import { getTemplate } from '../templates'
import { Button } from '../ui'

const STATUSES: ApplicationStatus[] = [
  'draft',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'archived'
]

export function Applications({
  apps,
  setApps,
  onContinueDraft
}: {
  apps: Application[]
  setApps: (a: Application[]) => void
  /** Seed the Tailor draft and jump to it (used to resume editing a draft application). */
  onContinueDraft: () => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Application | null>(null)

  /** Reopen a saved application in the Tailor workspace by seeding its draft. */
  async function continueInTailor(a: Application): Promise<void> {
    await window.api.saveDraft({
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
    onContinueDraft()
  }

  async function setStatus(a: Application, status: ApplicationStatus): Promise<void> {
    const updated = await window.api.saveApplication({ ...a, status })
    setApps(updated)
  }

  async function remove(a: Application): Promise<void> {
    const updated = await window.api.deleteApplication(a.id)
    setApps(updated)
    if (selected?.id === a.id) setSelected(null)
  }

  async function exportOne(a: Application): Promise<void> {
    const html = getTemplate(a.template).render(a.tailored)
    const name = `${a.tailored.basics.name.replace(/\s+/g, '_')}_${a.company.replace(/\s+/g, '_')}.pdf`
    await window.api.exportPdf(html, name)
  }

  if (apps.length === 0) {
    return (
      <div className="screen">
        <h2>Applications</h2>
        <div className="panel">
          <p className="muted">Nothing yet. Tailor a resume and click "Save to tracker".</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <h2>Applications</h2>
      <table className="apps-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Role</th>
            <th>ATS</th>
            <th>Date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.id}>
              <td>
                {a.company}
                {a.jobUrl && (
                  <a className="posting-link" href={a.jobUrl} target="_blank" rel="noreferrer">
                    ↗ posting
                  </a>
                )}
              </td>
              <td>{a.role}</td>
              <td>
                {typeof a.keywordGap?.matchScore === 'number' ? (
                  <span
                    className={`ats-cell score-${
                      a.keywordGap.matchScore >= 75
                        ? 'hi'
                        : a.keywordGap.matchScore >= 50
                          ? 'mid'
                          : 'lo'
                    }`}
                  >
                    {a.keywordGap.matchScore}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{a.createdAt.slice(0, 10)}</td>
              <td>
                <select
                  value={a.status}
                  onChange={(e) => setStatus(a, e.target.value as ApplicationStatus)}
                  className={`status status-${a.status}`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td className="row-actions">
                {a.status === 'draft' && (
                  <Button variant="ghost" onClick={() => continueInTailor(a)}>
                    Continue
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setSelected(a)}>
                  View
                </Button>
                <Button variant="ghost" onClick={() => exportOne(a)}>
                  PDF
                </Button>
                <Button variant="danger" onClick={() => remove(a)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="drawer" onClick={() => setSelected(null)}>
          <div className="drawer-body" onClick={(e) => e.stopPropagation()}>
            <div className="row space">
              <h3>
                {selected.company} — {selected.role}
              </h3>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
            <div className="drawer-preview">
              <iframe title="app-preview" srcDoc={getTemplate(selected.template).render(selected.tailored)} />
            </div>
            {selected.coverLetter && (
              <>
                <h4>Cover letter</h4>
                <pre className="cover-pre">{selected.coverLetter}</pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
