import { useEffect, useState } from 'react'
import type { MasterResume, ProfilesState, ResumeProfile } from '../../shared/resume'
import { emptyMaster } from '../../shared/resume'
import type { Application } from '../../shared/application'
import { MasterEditor } from './screens/MasterEditor'
import { Tailor } from './screens/Tailor'
import { Applications } from './screens/Applications'
import { Discover } from './screens/Discover'
import { Settings } from './screens/Settings'
import type { JobLead } from '../../shared/jobs'

type Tab = 'tailor' | 'discover' | 'applications' | 'master' | 'settings'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('discover')
  const [profiles, setProfiles] = useState<ResumeProfile[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [apps, setApps] = useState<Application[]>([])
  const [loaded, setLoaded] = useState(false)
  // Bumped to tell the (always-mounted) Tailor screen to reload its draft,
  // e.g. when the user clicks "Continue" on a saved application.
  const [tailorReload, setTailorReload] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [state, a] = await Promise.all([
        window.api.loadProfiles(),
        window.api.loadApplications()
      ])
      setProfiles(state.profiles)
      setActiveId(state.activeId)
      setApps(a)
      setLoaded(true)
    })()
  }, [])

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]

  function persist(next: ProfilesState): void {
    setProfiles(next.profiles)
    setActiveId(next.activeId)
    window.api.saveProfiles(next)
  }

  // Edit the active profile's resume in memory (persisted on Save).
  function setActiveResume(resume: MasterResume): void {
    setProfiles((ps) => ps.map((p) => (p.id === activeId ? { ...p, resume } : p)))
  }
  async function saveActive(): Promise<void> {
    await window.api.saveProfiles({ profiles, activeId })
  }

  function addProfile(): void {
    const p: ResumeProfile = { id: crypto.randomUUID(), name: 'New resume', resume: emptyMaster() }
    persist({ profiles: [...profiles, p], activeId: p.id })
    setTab('master')
  }
  /** Seed the Tailor draft from a discovered job and jump to the Tailor tab. */
  async function openLeadInTailor(lead: JobLead): Promise<void> {
    await window.api.saveDraft({
      jd: lead.description,
      company: lead.company,
      role: lead.title,
      jobUrl: lead.url,
      templateId: 'classic',
      baseId: activeId,
      tailored: null,
      gap: null,
      cover: null
    })
    setTailorReload((n) => n + 1)
    setTab('tailor')
  }

  /** Overwrite an existing profile's resume (e.g. promote a tailored resume to its base). */
  function updateProfileResume(id: string, resume: MasterResume): void {
    persist({
      profiles: profiles.map((p) => (p.id === id ? { ...p, resume: structuredClone(resume) } : p)),
      activeId
    })
  }

  function duplicateProfile(): void {
    if (!active) return
    const p: ResumeProfile = {
      id: crypto.randomUUID(),
      name: `${active.name} copy`,
      resume: structuredClone(active.resume)
    }
    persist({ profiles: [...profiles, p], activeId: p.id })
  }
  function renameProfile(name: string): void {
    persist({ profiles: profiles.map((p) => (p.id === activeId ? { ...p, name } : p)), activeId })
  }
  function deleteProfile(): void {
    if (profiles.length <= 1) return
    const remaining = profiles.filter((p) => p.id !== activeId)
    persist({ profiles: remaining, activeId: remaining[0].id })
  }

  if (!loaded || !active) {
    return <div className="loading">Loading…</div>
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Resume Tailor</div>
        <nav>
          <button className={tab === 'tailor' ? 'active' : ''} onClick={() => setTab('tailor')}>
            Tailor
          </button>
          <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
            Discover
          </button>
          <button
            className={tab === 'applications' ? 'active' : ''}
            onClick={() => setTab('applications')}
          >
            Applications {apps.length > 0 && <span className="count">{apps.length}</span>}
          </button>
          <button className={tab === 'master' ? 'active' : ''} onClick={() => setTab('master')}>
            Master resume
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            Settings
          </button>
        </nav>

        <div className="profile-box">
          <label className="profile-label">Resume profile</label>
          <select value={activeId} onChange={(e) => persist({ profiles, activeId: e.target.value })}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="profile-add" onClick={addProfile}>
            + New profile
          </button>
        </div>

        <div className="sidebar-foot">via your Claude Code subscription</div>
      </aside>

      <main className="main">
        {/* Tailor stays mounted across tabs so its chat session and messages survive. */}
        <div hidden={tab !== 'tailor'} className="tab-pane">
          <Tailor
            profiles={profiles}
            activeId={activeId}
            onSelectProfile={(id) => persist({ profiles, activeId: id })}
            onSaved={setApps}
            onUpdateProfile={updateProfileResume}
            reloadToken={tailorReload}
          />
        </div>
        {/* Discover stays mounted so search results (which cost money) survive tab switches. */}
        <div hidden={tab !== 'discover'} className="tab-pane">
          <Discover
            resume={active.resume}
            apps={apps}
            onTailorLead={openLeadInTailor}
            onOpenSettings={() => setTab('settings')}
          />
        </div>
        {tab === 'applications' && (
          <Applications
            apps={apps}
            setApps={setApps}
            onContinueDraft={(baseId) => {
              // Restore the profile this application was tailored from (global selection).
              if (baseId && profiles.some((p) => p.id === baseId)) {
                persist({ profiles, activeId: baseId })
              }
              setTailorReload((n) => n + 1)
              setTab('tailor')
            }}
          />
        )}
        {tab === 'settings' && <Settings />}
        {tab === 'master' && (
          <MasterEditor
            master={active.resume}
            setMaster={setActiveResume}
            onSave={saveActive}
            profileName={active.name}
            canDelete={profiles.length > 1}
            onRename={renameProfile}
            onDuplicate={duplicateProfile}
            onDelete={deleteProfile}
          />
        )}
      </main>
    </div>
  )
}
