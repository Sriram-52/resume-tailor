import type { MasterResume } from './resume'
import type { KeywordGap } from './application'

/** The in-progress Tailor session, persisted so quitting/reloading never loses work. */
export interface TailorDraft {
  jd: string
  company: string
  role: string
  jobUrl: string
  templateId: string
  baseId: string
  tailored: MasterResume | null
  gap: KeywordGap | null
  cover: string | null
  /** When continuing a saved application, its id — so re-saving updates it in place. */
  appId?: string
  /** The saved application's original created date, preserved across updates. */
  appCreatedAt?: string
}
