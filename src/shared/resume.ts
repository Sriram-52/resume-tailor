/**
 * The "master resume" — a superset of everything the user has done.
 * The tailoring step selects and rewrites from this; it is never the output itself.
 * Shape is loosely aligned with the JSON Resume standard for familiarity.
 */

export interface Basics {
  name: string
  /** Headline / title, e.g. "Senior Software Engineer". */
  label: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  /** A long-form professional summary; tailoring trims it per job. */
  summary: string
}

export interface WorkItem {
  company: string
  position: string
  location: string
  /** Free-form date strings, e.g. "Jan 2022". */
  startDate: string
  endDate: string
  current: boolean
  /** Superset of every accomplishment bullet for this role. */
  highlights: string[]
  /** Technologies used, for keyword matching. */
  tech: string[]
}

export interface EducationItem {
  institution: string
  area: string
  studyType: string
  startDate: string
  endDate: string
  gpa: string
  highlights: string[]
}

export interface SkillGroup {
  category: string
  items: string[]
}

export interface ProjectItem {
  name: string
  description: string
  highlights: string[]
  tech: string[]
  url: string
}

export interface CertificationItem {
  name: string
  issuer: string
  date: string
}

export interface PublicationItem {
  title: string
  /** Journal, conference, or publisher. */
  venue: string
  date: string
  url: string
  description: string
}

export interface MasterResume {
  basics: Basics
  work: WorkItem[]
  education: EducationItem[]
  skills: SkillGroup[]
  projects: ProjectItem[]
  certifications: CertificationItem[]
  publications: PublicationItem[]
}

/** A named master resume. Users can keep several (e.g. "Gen AI", "Full Stack"). */
export interface ResumeProfile {
  id: string
  name: string
  resume: MasterResume
}

export interface ProfilesState {
  profiles: ResumeProfile[]
  activeId: string
}

export function emptyMaster(): MasterResume {
  return {
    basics: {
      name: '',
      label: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
      summary: ''
    },
    work: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    publications: []
  }
}
