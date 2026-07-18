import { spawn } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { findClaudeBinary } from './claudeBin'

/**
 * Bridge to the Claude Code CLI in headless mode.
 *
 * We shell out to `claude -p --output-format json` so every call runs against
 * the user's logged-in Claude Code subscription (no API key, no per-token cost).
 *
 * The CLI is run from a clean, dedicated working directory (userData/claude-cwd)
 * so it never picks up unrelated project context (CLAUDE.md, git repo, etc.).
 * Everything the model needs is passed in the prompt itself.
 */

export interface ClaudeResult {
  ok: boolean
  /** The model's textual output (contents of the CLI's `result` field). */
  text: string
  /** Raw error text if the call failed. */
  error?: string
  /** Wall-clock duration reported by the CLI, if available. */
  durationMs?: number
}

/**
 * Locate the `claude` binary. An explicit override wins; otherwise use the
 * SDK's bundled binary (works in a packaged app, where PATH is minimal and a
 * bare `"claude"` would ENOENT); fall back to PATH only as a last resort.
 */
function resolveClaudeBin(): string {
  // Allow an explicit override for odd setups.
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) {
    return process.env.CLAUDE_BIN
  }
  return findClaudeBinary() ?? 'claude'
}

/** Directory the CLI is invoked from — deliberately empty of project context. */
function cleanCwd(): string {
  const dir = join(app.getPath('userData'), 'claude-cwd')
  return dir
}

export interface RunOptions {
  /** Model to pin. Defaults to a fast model suitable for resume work. */
  model?: string
  /** Abort signal to cancel a long-running call. */
  signal?: AbortSignal
  /** Timeout in ms. Default 180s. */
  timeoutMs?: number
}

/**
 * Run a single headless Claude prompt and return its text output.
 * The prompt is delivered on stdin to avoid arg-length limits.
 */
export function runClaude(prompt: string, opts: RunOptions = {}): Promise<ClaudeResult> {
  const bin = resolveClaudeBin()
  const model = opts.model ?? 'claude-sonnet-5'
  const args = ['-p', '--output-format', 'json', '--model', model]

  return new Promise<ClaudeResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(bin, args, {
      cwd: cleanCwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const finish = (r: ClaudeResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ ok: false, text: '', error: `Timed out after ${opts.timeoutMs ?? 180000}ms` })
    }, opts.timeoutMs ?? 180000)

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        child.kill('SIGKILL')
        finish({ ok: false, text: '', error: 'Cancelled' })
      })
    }

    child.on('error', (err) => {
      finish({
        ok: false,
        text: '',
        error:
          err.message.includes('ENOENT')
            ? `Could not find the "claude" CLI. Make sure Claude Code is installed and on your PATH (or set CLAUDE_BIN).`
            : err.message
      })
    })

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        finish({ ok: false, text: '', error: stderr || `claude exited with code ${code}` })
        return
      }
      try {
        const parsed = JSON.parse(stdout)
        if (parsed.is_error) {
          finish({ ok: false, text: '', error: parsed.result || 'Claude returned an error' })
          return
        }
        finish({ ok: true, text: parsed.result ?? '', durationMs: parsed.duration_ms })
      } catch {
        finish({ ok: false, text: '', error: `Could not parse CLI output: ${stdout.slice(0, 500)}` })
      }
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/**
 * Run a prompt that must return JSON, and parse it — robustly. Models sometimes
 * wrap JSON in prose or (when a prompt's input is thin) reply conversationally
 * instead of with JSON. We strip fences, extract the outermost JSON block from
 * mixed output, and retry ONCE with a stricter reminder before giving up.
 */
export async function runClaudeJson<T = unknown>(
  prompt: string,
  opts: RunOptions = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const r = await runClaude(prompt, opts)
  if (!r.ok) return { ok: false, error: r.error }

  const first = tryParseJson<T>(r.text)
  if (first.ok) return { ok: true, data: first.value }

  // Retry once, hammering home "JSON only" — handles the model asking questions.
  const retry = await runClaude(
    `${prompt}\n\nCRITICAL: Respond with ONLY the JSON. No prose, no questions, no markdown, no code fence. If information is missing, make reasonable choices — never ask.`,
    opts
  )
  if (retry.ok) {
    const second = tryParseJson<T>(retry.text)
    if (second.ok) return { ok: true, data: second.value }
  }

  return {
    ok: false,
    error: `The model didn't return usable data for this request. This often means the input (e.g. the job description) was too thin. Try again with more detail.`
  }
}

function tryParseJson<T>(text: string): { ok: true; value: T } | { ok: false } {
  const cleaned = stripFences(text)
  try {
    return { ok: true, value: JSON.parse(cleaned) as T }
  } catch {
    /* fall through to block extraction */
  }
  const block = extractJsonBlock(cleaned)
  if (block) {
    try {
      return { ok: true, value: JSON.parse(block) as T }
    } catch {
      /* give up */
    }
  }
  return { ok: false }
}

/** Extract the first balanced {...} or [...] block from mixed text. */
function extractJsonBlock(s: string): string | null {
  const start = s.search(/[{[]/)
  if (start < 0) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function stripFences(s: string): string {
  const t = s.trim()
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/
  const m = t.match(fence)
  return m ? m[1].trim() : t
}
