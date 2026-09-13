import type { JobrightJob } from '../../shared/jobright'
import type { Application } from '../../shared/application'
import type { QueueItem } from '../../shared/queue'
import { emptyMaster } from '../../shared/resume'
import { emptySettings } from '../../shared/settings'
import { emptyUsage } from '../../shared/usage'

/**
 * Browser-mode stub for the preload bridge.
 *
 * The renderer is an ordinary Vite page, so `pnpm dev` serves it at
 * localhost:5173 and it opens in a normal browser — but `window.api` only
 * exists inside Electron, so every data call throws and the page goes blank.
 * This installs a fixture-backed stand-in when that bridge is missing, which
 * makes the UI inspectable (and screenshottable) outside the app.
 *
 * It is only ever reached when `window.api` is absent, so the packaged app can
 * never pick it up. Nothing here touches the network or real data.
 */

/** A filled-in resume, so the tailoring workspace has something to render. */
function fixtureResume(): ReturnType<typeof emptyMaster> {
  return {
    ...emptyMaster(),
    basics: {
      name: 'Sri Ram Mohan Nyshadham',
      label: 'Senior Full Stack Engineer',
      email: 'dev@example.com',
      phone: '000-000-0000',
      location: 'Marietta, GA',
      website: '',
      linkedin: 'linkedin.com/in/example',
      github: 'github.com/example',
      summary:
        'Full stack engineer with six years building production web applications in TypeScript, React and Node.js, most recently a HIPAA-compliant clinical platform serving patients, doctors and support staff.'
    },
    work: [
      {
        company: 'Atelia Software Inc',
        position: 'Lead Full Stack Engineer',
        location: 'Remote',
        startDate: 'Aug 2023',
        endDate: '',
        current: true,
        highlights: [
          'Own the full stack of a HIPAA-compliant clinical platform built in TypeScript, React, Next.js, React Native and NestJS',
          'Architected an agentic AI system on Vertex with multi-agent routing, checkpointed state and human-in-the-loop interrupts',
          'Delivered client-facing AI features including LLM chat, live scribe and RAG documentation agents'
        ],
        tech: ['TypeScript', 'React', 'Next.js', 'NestJS', 'PostgreSQL']
      }
    ],
    education: [
      {
        institution: 'Kennesaw State University',
        area: 'Computer Science',
        studyType: 'Master of Science',
        startDate: '2022-08',
        endDate: '2024-05',
        gpa: '3.88',
        highlights: []
      }
    ],
    skills: [
      { category: 'Languages', items: ['TypeScript', 'JavaScript', 'Python', 'SQL'] },
      { category: 'Frontend', items: ['React', 'Next.js', 'React Native', 'Redux'] },
      { category: 'Backend', items: ['Node.js', 'NestJS', 'Express', 'PostgreSQL'] }
    ]
  }
}

function job(over: Partial<JobrightJob> & { jobId: string; title: string; company: string }): JobrightJob {
  return {
    companyLogo: '',
    industries: ['Software'],
    location: 'Remote',
    workModel: 'Remote',
    seniority: 'Senior Level',
    employmentType: 'Full-time',
    minYearsExperience: 5,
    salaryDesc: '',
    minSalary: null,
    maxSalary: null,
    applyUrl: 'https://example.com/apply',
    isCompanySiteLink: true,
    postedDesc: '1 day ago',
    postedAt: Date.now(),
    applicantsDesc: '< 25 applicants',
    fit: 85,
    fitRank: 'Strong Match',
    fitBreakdown: { experience: 94, skills: 100, industry: 39 },
    summary: '',
    responsibilities: [],
    requiredSkills: [],
    preferredSkills: [],
    education: [],
    benefits: [],
    skillTags: [],
    h1bSponsor: true,
    isAgency: false,
    citizenOnly: false,
    clearanceRequired: false,
    applyStatus: null,
    appliedAt: null,
    ...over
  }
}

const JOBS: JobrightJob[] = [
  job({
    jobId: 'dev-1',
    title: 'Senior Full Stack Engineer',
    company: 'Bilt',
    industries: ['Finance', 'FinTech', 'Growth Stage'],
    location: 'New York, NY',
    workModel: 'Onsite',
    salaryDesc: '$175K/yr - $250K/yr',
    minYearsExperience: 6,
    postedDesc: '4 hours ago',
    fit: 87,
    summary:
      'Owns projects end-to-end and architects scalable web applications serving millions of members. Backend in Node.js (NestJS, Hono, Express), frontend in Next.js, React and React Native, with PostgreSQL schema design and observability practices.',
    responsibilities: [
      'Own projects end-to-end, from technical scoping and architecture through deployment and production support',
      'Architect and build scalable web applications and services that serve millions of members',
      'Develop and maintain backend services using Node.js frameworks (NestJS, Hono, Express)',
      'Build performant frontend experiences using Next.js, React and React Native'
    ],
    requiredSkills: [
      '6+ years of professional software development experience',
      'Strong proficiency in React, TypeScript and modern JavaScript',
      'Hands-on Node.js backend development with NestJS, Express or Hono'
    ],
    preferredSkills: ['Relational data modeling and query optimization (PostgreSQL preferred)'],
    benefits: ['Equity and performance bonus', 'Health insurance from day one', 'Unlimited PTO'],
    skillTags: ['React', 'TypeScript', 'Node.js', 'NestJS', 'Next.js', 'PostgreSQL', 'CI/CD']
  }),
  job({
    jobId: 'dev-2',
    title: 'Software Engineer, Full Stack',
    company: 'Gamma',
    industries: ['Artificial Intelligence', 'Growth Stage'],
    location: 'San Francisco, CA',
    workModel: 'Hybrid',
    salaryDesc: '$180K/yr - $310K/yr',
    minYearsExperience: 3,
    seniority: 'Mid Level',
    fit: 88,
    fitBreakdown: { experience: 100, skills: 64, industry: 81 },
    summary:
      'Design and implement AI features that integrate into the product surface, working directly with product, design and engineering.',
    responsibilities: ['Ship end-user-facing model interactions rather than infrastructure'],
    skillTags: ['React', 'TypeScript', 'Python']
  }),
  job({
    jobId: 'dev-3',
    title: 'Senior Full Stack Engineer',
    company: 'Nourish',
    industries: ['Artificial Intelligence', 'Apps'],
    location: 'United States',
    fit: 89,
    fitBreakdown: { experience: 100, skills: 100, industry: 42 },
    summary:
      'Shape the core platform of a fast-growing health product, driving development of critical features and owning the long-term health of the codebase.',
    skillTags: ['React', 'Node.js']
  })
]

function app(over: Partial<Application> & { id: string; company: string; role: string }): Application {
  return {
    createdAt: new Date().toISOString(),
    status: 'draft',
    jobDescription: [
      'Software Engineer II, Fullstack at Pinterest',
      'United States · Remote · Full-time · Mid Level',
      '$124K/yr - $255K/yr',
      '3+ years experience',
      '',
      'Pinterest is a visual discovery engine that helps people discover creative ideas and plan meaningful experiences. The company is seeking a Software Engineer II, Fullstack to design and implement user-facing features, collaborate cross-functionally, and own products from ideation through release.',
      '',
      'Responsibilities',
      '- Design and implement full-stack, user-facing features setting the course for the next generation of inspiration and discovery',
      '- Lead and contribute at every phase, from brainstorming and rapid prototyping to A/B testing and scalable implementation',
      '- Partner with design, product, and backend teams to launch end-to-end solutions',
      '- Use automated testing and best practices to deliver reliable, high-quality code',
      '- Work with world-class peers on high-impact projects that foster your growth as an engineer',
      '',
      'Required',
      '- Bachelor\u2019s degree in Computer Science, a related field or equivalent experience',
      '- 3+ years of industry full-stack development experience, building consumer or business facing products',
      '- Strong proficiency in React, TypeScript and modern JavaScript',
      '- Experience with CI/CD (GitHub Actions) and reliable, maintainable code practices'
    ].join('\n'),
    notes: 'Location: United States',
    tailored: emptyMaster(),
    keywordGap: null,
    coverLetter: null,
    template: 'classic',
    files: {},
    ...over
  }
}

const daysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString()

const APPS: Application[] = [
  app({ id: 'a1', jobId: 'dev-2', company: 'Gamma', role: 'Software Engineer, Full Stack', fit: 88, status: 'draft', keywordGap: { matchScore: 74, matched: [], missing: [], terminology: [], notes: [] } }),
  app({ id: 'a2', company: 'JPMorganChase', role: 'Software Engineer III', fit: 92, status: 'applied', appliedAt: daysAgo(0), keywordGap: { matchScore: 77, matched: [], missing: [], terminology: [], notes: [] } }),
  ...Array.from({ length: 12 }, (_, i) =>
    app({
      id: `hist-${i}`,
      company: `Company ${i}`,
      role: 'Software Engineer',
      status: 'applied',
      fit: 80 + (i % 10),
      appliedAt: daysAgo(i < 5 ? 0 : i < 10 ? 1 : 2),
      createdAt: daysAgo(i < 5 ? 0 : i < 10 ? 1 : 2)
    })
  ),
  app({ id: 'a3', company: 'Humana', role: 'Senior Full-Stack Engineer', fit: 80, status: 'applied' }),
  app({ id: 'a4', company: 'Blink', role: 'Full Stack Engineer', fit: 95, status: 'interviewing', keywordGap: { matchScore: 81, matched: [], missing: [], terminology: [], notes: [] } }),
  app({ id: 'a5', company: 'Oakmont Consulting', role: 'Full Stack Engineer', fit: 68, status: 'rejected' }),
  app({ id: 'a6', company: 'Micron', role: 'Full Stack Developer', fit: 64, status: 'archived' })
]

const QUEUE: QueueItem[] = [
  {
    id: 'q1',
    jobId: 'dev-3',
    job: JOBS[2],
    baseId: 'p1',
    status: 'tailoring',
    matchScore: null,
    jdSource: 'posting',
    jdNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'q2',
    jobId: 'dev-9',
    job: job({ jobId: 'dev-9', title: 'Full Stack Developer', company: 'Fiserv' }),
    baseId: 'p1',
    status: 'done',
    matchScore: 69,
    jdSource: 'jobright',
    jdNote: 'The posting page renders with JavaScript, so it was tailored from the Jobright summary.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

const ok = <T,>(data: T): { ok: true; data: T } => ({ ok: true, data })
const noop = async (): Promise<boolean> => true

/** Install the stand-in. No-op inside Electron, where the real bridge exists. */
export function installDevApi(): void {
  const w = window as unknown as { api?: unknown }
  if (w.api) return
  let apps = [...APPS]
  let queue = [...QUEUE]
  console.info('[dev] window.api is absent — running with fixture data.')
  w.api = {
    loadProfiles: async () => ({
      profiles: [{ id: 'p1', name: 'Sri_Ram_master', resume: fixtureResume() }],
      activeId: 'p1'
    }),
    saveProfiles: noop,
    loadApplications: async () => apps,
    deleteApplication: async (id: string) => (apps = apps.filter((a) => a.id !== id)),
    saveDraft: noop,
    setApplicationStatus: async (id: string, status: Application['status']) => {
      apps = apps.map((a) => (a.id === id ? { ...a, status } : a))
      return { ok: true, apps, synced: true }
    },
    queueList: async () => queue,
    queueAdd: async () => queue,
    queueRemove: async (id: string) => (queue = queue.filter((q) => q.id !== id)),
    queueRetry: async () => queue,
    queueClearFinished: async () => queue,
    queueSetConcurrency: noop,
    onAppsChanged: () => () => {},
    onQueueEvent: () => () => {},
    jobrightStatus: async () => ({
      connected: true,
      needsLogin: false,
      email: 'dev@example.com',
      readOnly: true,
      checkedAt: new Date().toISOString()
    }),
    jobrightLogin: async () => ({
      connected: true,
      needsLogin: false,
      email: 'dev@example.com',
      readOnly: true,
      checkedAt: new Date().toISOString()
    }),
    jobrightRecommended: async () => ok(JOBS),
    jobrightApplied: async () => ok([]),
    jobrightIgnore: async () => ok(undefined),
    jobrightImportUrl: async () => ok({ taskId: 'dev' }),
    jobrightSavedFilters: async () => ok([]),
    jobrightSaveFilter: async () => ok(undefined),
    jobrightBackfill: async () => ok({ fetched: 212, matched: 40, created: 172, statusUpdated: 8 }),
    openExternal: noop,
    loadSettings: async () => ({ ...emptySettings(), dailyGoal: 5 }),
    saveSettings: noop,
    loadUsage: async () => emptyUsage(),
    resetUsage: noop,

    // Enough of the tailoring surface to open the workspace in a browser.
    loadDraft: async () => ({
      jd: 'Fixture job description.',
      company: 'Commure',
      role: 'Senior Fullstack Engineer, Ambient AI',
      jobUrl: 'https://example.com/posting',
      templateId: 'classic',
      baseId: 'p1',
      tailored: fixtureResume(),
      gap: {
        matchScore: 78,
        matched: ['React', 'TypeScript', 'Node.js'],
        missing: [
          'Amplitude',
          'Data-driven experimentation / A-B testing',
          'Analytics collaboration (explicit)',
          'Interviewing/hiring involvement',
          'Estimation and project planning (explicit mention)'
        ],
        terminology: [
          { from: 'Lead Full Stack Engineer', to: 'Senior Full Stack Engineer' },
          { from: 'HIPAA-compliant digital health platform', to: 'core platform / health system' },
          { from: 'unit tests covering every money path', to: 'write clean, fully-tested code' }
        ],
        notes: [
          "Add 'Amplitude' or any product analytics tool used, even peripherally, since it is explicitly named in the required stack.",
          "Surface any A/B testing, feature-flagging or experimentation work to match 'data-driven experimentation culture'.",
          'Call out any involvement in technical interviewing or hiring, even informal.'
        ]
      },
      cover: null,
      appId: 'a1',
      appCreatedAt: new Date().toISOString()
    }),
    tailor: async () => ({ ok: true, data: fixtureResume() }),
    keywordGap: async () => ({ ok: true, data: null }),
    coverLetter: async () => ({ ok: true, data: { coverLetter: '' } }),
    fetchJobPosting: async () => ({ ok: false, error: 'Not available in browser mode.' }),
    saveApplication: async () => apps,
    exportPdf: async () => ({ ok: false, cancelled: true }),
    startChat: async () => true,
    sendChat: noop,
    cancelChat: noop,
    setChatGap: noop,
    setChatCover: noop,
    onChatEvent: () => () => {}
  }
}
