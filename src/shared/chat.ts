import type { MasterResume } from './resume'

/** Streaming events emitted by the agent session to the renderer during a chat turn. */
export type ChatEvent =
  | { kind: 'text'; text: string }
  | { kind: 'status'; text: string }
  | { kind: 'resume'; resume: MasterResume }
  | { kind: 'turn-done' }
  | { kind: 'error'; error: string }
