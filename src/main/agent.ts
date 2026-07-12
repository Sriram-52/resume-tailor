import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { MasterResume } from '../shared/resume'
import type { KeywordGap } from '../shared/application'
import type { ChatEvent } from '../shared/chat'
import * as ops from './resumeOps'
import { findClaudeBinary } from './claudeBin'

const CLAUDE_BIN = findClaudeBinary()

/**
 * A conversational resume-editing agent, one per chat session. It runs on the
 * user's Claude Code subscription via the Agent SDK. The agent edits an in-memory
 * working resume through custom tools; every applied edit is streamed to the
 * renderer so the live preview updates as it works. Conversation memory is kept
 * across turns by resuming the SDK session id.
 */

const TOOL_NAMES = [
  'get_resume',
  'set_summary',
  'set_headline',
  'retitle_role',
  'edit_bullet',
  'add_bullet',
  'remove_bullet',
  'set_skills',
  'set_role_tech',
  'set_contact',
  'add_project',
  'remove_project',
  'edit_project'
]

/**
 * Built-in Claude Code tools we auto-allow alongside the resume tools. Listing a
 * tool here bypasses the interactive permission prompt — which the app has no way
 * to answer in this headless Electron context, so an unlisted tool call just comes
 * back as "permissions not granted". These let the agent research a company or
 * read a job/portfolio URL the user pastes.
 */
const WEB_TOOLS = ['WebSearch', 'WebFetch']

function cleanCwd(): string {
  return join(app.getPath('userData'), 'claude-cwd')
}

export class AgentSession {
  private resume: MasterResume
  private jd: string
  private gap: KeywordGap | null
  private win: BrowserWindow
  private sessionId: string | null = null
  private cancelled = false
  private busy = false

  constructor(win: BrowserWindow, resume: MasterResume, jd: string, gap: KeywordGap | null = null) {
    this.win = win
    this.resume = resume
    this.jd = jd
    this.gap = gap
  }

  getResume(): MasterResume {
    return this.resume
  }

  /** Update the ATS analysis the agent sees (e.g. after a re-scan). */
  setGap(gap: KeywordGap | null): void {
    this.gap = gap
  }

  private emit(e: ChatEvent): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('chat:event', e)
  }

  cancel(): void {
    this.cancelled = true
  }

  private applied(r: ops.EditResult): { content: { type: 'text'; text: string }[] } {
    if (r.changed) {
      this.resume = r.resume
      this.emit({ kind: 'resume', resume: this.resume })
    }
    return { content: [{ type: 'text', text: r.description }] }
  }

  private buildServer(): ReturnType<typeof createSdkMcpServer> {
    const s = this
    return createSdkMcpServer({
      name: 'resume',
      version: '1.0.0',
      tools: [
        tool('get_resume', 'Return the current working resume as JSON.', {}, async () => ({
          content: [{ type: 'text', text: JSON.stringify(s.resume) }]
        })),
        tool(
          'set_summary',
          'Replace the professional summary with new text.',
          { text: z.string().describe('The new summary text.') },
          async (a) => s.applied(ops.setSummary(s.resume, a.text))
        ),
        tool(
          'set_headline',
          'Set the headline/title shown under the name (e.g. "Senior Gen AI Engineer").',
          { text: z.string() },
          async (a) => s.applied(ops.setHeadline(s.resume, a.text))
        ),
        tool(
          'retitle_role',
          'Change the job title of a role, located by company name.',
          { company: z.string(), title: z.string() },
          async (a) => s.applied(ops.retitleRole(s.resume, a.company, a.title))
        ),
        tool(
          'edit_bullet',
          'Replace one experience bullet under a role. Match the existing bullet by its text.',
          {
            company: z.string(),
            before: z.string().describe('Existing bullet text (may be a distinctive substring).'),
            after: z.string().describe('The rewritten bullet.')
          },
          async (a) => s.applied(ops.editBullet(s.resume, a.company, a.before, a.after))
        ),
        tool(
          'add_bullet',
          'Add a new experience bullet to a role.',
          { company: z.string(), text: z.string() },
          async (a) => s.applied(ops.addBullet(s.resume, a.company, a.text))
        ),
        tool(
          'remove_bullet',
          'Remove an experience bullet from a role, matched by text.',
          { company: z.string(), match: z.string() },
          async (a) => s.applied(ops.removeBullet(s.resume, a.company, a.match))
        ),
        tool(
          'set_skills',
          'Replace the items in a skill group (creates the group if missing).',
          { category: z.string(), items: z.array(z.string()) },
          async (a) => s.applied(ops.setSkillGroup(s.resume, a.category, a.items))
        ),
        tool(
          'set_role_tech',
          'Replace the technology tags/chips shown under a role (located by company). Use this to fix stale tech keywords, e.g. swap "GKE, Vertex AI" for "AWS, Spring Boot".',
          {
            company: z.string(),
            items: z.array(z.string()).describe('The full new list of tech tags for this role.')
          },
          async (a) => s.applied(ops.setRoleTech(s.resume, a.company, a.items))
        ),
        tool(
          'set_contact',
          'Set a header/contact field: website, linkedin, github, email, phone, or location.',
          {
            field: z
              .enum(['website', 'linkedin', 'github', 'email', 'phone', 'location'])
              .describe('Which contact field to set.'),
            value: z.string().describe('The new value (a full URL for website/linkedin/github).')
          },
          async (a) => s.applied(ops.setContact(s.resume, a.field, a.value))
        ),
        tool(
          'add_project',
          'Add a new project to the Projects section.',
          {
            name: z.string(),
            description: z.string().optional(),
            tech: z.array(z.string()).optional().describe('Technologies used.'),
            url: z.string().optional(),
            highlights: z.array(z.string()).optional().describe('Bullet points for the project.')
          },
          async (a) => s.applied(ops.addProject(s.resume, a))
        ),
        tool(
          'remove_project',
          'Remove a project from the Projects section, matched by name.',
          { name: z.string() },
          async (a) => s.applied(ops.removeProject(s.resume, a.name))
        ),
        tool(
          'edit_project',
          'Update fields on an existing project (located by name). Only the fields you pass change; omit the rest.',
          {
            name: z.string().describe('The name of the project to edit (used to locate it).'),
            newName: z.string().optional().describe('A new name for the project, if renaming.'),
            description: z.string().optional(),
            tech: z.array(z.string()).optional(),
            url: z.string().optional(),
            highlights: z.array(z.string()).optional()
          },
          async (a) =>
            s.applied(
              ops.editProject(s.resume, a.name, {
                name: a.newName,
                description: a.description,
                tech: a.tech,
                url: a.url,
                highlights: a.highlights
              })
            )
        )
      ]
    })
  }

  private atsSection(): string {
    const g = this.gap
    if (!g) return ''
    const missing = g.missing.length ? g.missing.join(', ') : 'none'
    const terms = g.terminology.length
      ? g.terminology.map((t) => `"${t.from}" → "${t.to}"`).join('; ')
      : 'none'
    return `

Current ATS analysis of this resume against the job description:
- Match score: ${g.matchScore}/100
- Missing or weak keywords: ${missing}
- Terminology to align (say it the way the JD says it): ${terms}

When the user asks to improve the match or raise the score, prioritize working these missing keywords and terminology into real, existing experience. Never invent experience to hit a keyword. This score reflects the last scan; it updates when the user re-scans.`
  }

  private systemPrompt(): string {
    return `You are an expert resume editor embedded in a desktop app. You help the user tailor and refine their resume through conversation.

- Call get_resume whenever you need to see the current content before editing.
- Make the edits the user asks for using the provided tools. Prefer targeted edits (edit_bullet, set_summary, retitle_role, etc.).
- You can edit every part of the resume: summary, headline, role titles, bullets, skill groups, a role's tech tags/chips (set_role_tech), header contact links — website/linkedin/github/email/phone/location (set_contact), and projects (add_project, remove_project, edit_project). Never tell the user you can't reach one of these — use the matching tool.
- You have web access: use WebSearch to research a company or role, and WebFetch to read a job posting, portfolio, or GitHub URL the user gives you (e.g. to confirm a project's real tech stack before writing it up). Prefer fetching a URL the user provides over guessing.
- Never fabricate employers, dates, or degrees. You may rewrite wording, retitle roles, adjust tech tags, and add skills/bullets/projects the user asks for.
- Keep your chat replies short and to the point: say what you changed, not a wall of text. The user sees edits reflected live.

The job description the user is targeting:
"""
${this.jd || '(none provided)'}
"""${this.atsSection()}`
  }

  /** Run one user turn. Streams text + edits; resolves when the turn completes. */
  async send(userText: string): Promise<void> {
    if (this.busy) {
      this.emit({ kind: 'error', error: 'Still working on the previous message.' })
      return
    }
    this.busy = true
    this.cancelled = false
    const server = this.buildServer()

    try {
      const iterator = query({
        prompt: userText,
        options: {
          includePartialMessages: true,
          mcpServers: { resume: server },
          allowedTools: [...TOOL_NAMES.map((n) => `mcp__resume__${n}`), ...WEB_TOOLS],
          systemPrompt: this.systemPrompt(),
          maxTurns: 40,
          cwd: cleanCwd(),
          ...(CLAUDE_BIN ? { pathToClaudeCodeExecutable: CLAUDE_BIN } : {}),
          ...(this.sessionId ? { resume: this.sessionId } : {})
        }
      })

      for await (const m of iterator) {
        if (this.cancelled) break
        if (m.type === 'stream_event') {
          const ev = m.event
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            this.emit({ kind: 'text', text: ev.delta.text })
          } else if (
            ev.type === 'content_block_start' &&
            ev.content_block?.type === 'tool_use'
          ) {
            this.emit({ kind: 'status', text: friendlyTool(ev.content_block.name) })
          }
        } else if (m.type === 'result') {
          this.sessionId = m.session_id ?? this.sessionId
        }
      }
      this.emit({ kind: 'turn-done' })
    } catch (err) {
      this.emit({ kind: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      this.busy = false
    }
  }
}

function friendlyTool(name: string): string {
  const base = name.replace(/^mcp__resume__/, '')
  const map: Record<string, string> = {
    get_resume: 'Reading the resume…',
    set_summary: 'Rewriting the summary…',
    set_headline: 'Updating the headline…',
    retitle_role: 'Retitling a role…',
    edit_bullet: 'Editing a bullet…',
    add_bullet: 'Adding a bullet…',
    remove_bullet: 'Removing a bullet…',
    set_skills: 'Updating skills…',
    set_role_tech: 'Updating tech tags…',
    set_contact: 'Updating contact info…',
    add_project: 'Adding a project…',
    remove_project: 'Removing a project…',
    edit_project: 'Editing a project…',
    WebSearch: 'Searching the web…',
    WebFetch: 'Reading a page…'
  }
  return map[base] ?? `Using ${base}…`
}
