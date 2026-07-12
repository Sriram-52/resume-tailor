import { app } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'

/**
 * Locate the Agent SDK's bundled `claude` binary for this platform.
 *
 * A packaged Electron app launched from Finder inherits only a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), which almost never contains the user's
 * `claude` install — so spawning a bare `"claude"` fails with ENOENT. The SDK
 * ships a self-contained `claude` binary as a platform-specific optional package;
 * we resolve it explicitly and hand its absolute path to both the Agent SDK
 * (via pathToClaudeCodeExecutable) and our headless CLI bridge (claude.ts).
 *
 * Cached after the first successful lookup.
 */
let cached: string | undefined | null = null

export function findClaudeBinary(): string | undefined {
  if (cached !== null) return cached
  const platform = `${process.platform}-${process.arch}`
  const rel = ['@anthropic-ai', `claude-agent-sdk-${platform}`, 'claude']

  // Candidate node_modules roots: packaged (asar-unpacked) first, then dev.
  const roots = [
    process.resourcesPath && join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    join(app.getAppPath(), 'node_modules')
  ].filter((r): r is string => Boolean(r))

  for (const root of roots) {
    // Flat layout (npm / pnpm node-linker=hoisted).
    const flat = join(root, ...rel)
    if (existsSync(flat)) return (cached = flat)
    // pnpm store layout.
    const pnpmDir = join(root, '.pnpm')
    if (existsSync(pnpmDir)) {
      const prefix = `@anthropic-ai+claude-agent-sdk-${platform}@`
      const entry = readdirSync(pnpmDir).find((d) => d.startsWith(prefix))
      if (entry) {
        const p = join(pnpmDir, entry, 'node_modules', ...rel)
        if (existsSync(p)) return (cached = p)
      }
    }
  }
  cached = undefined
  return undefined
}
