import type { MasterResume } from './resume'

/**
 * Streaming events emitted by an agent session during a chat turn.
 *
 * `key` identifies which workspace the event belongs to — several sessions run
 * at once (one per open tab), all on the same IPC channel, so the renderer
 * routes on this. The master-resume editor uses the fixed key `master`.
 */
export interface ChatEnvelope {
  key: string
  event: ChatEvent
}

export type ChatEvent =
  | { kind: 'text'; text: string }
  | { kind: 'status'; text: string }
  | { kind: 'resume'; resume: MasterResume }
  | { kind: 'cover'; cover: string }
  | { kind: 'turn-done' }
  | { kind: 'error'; error: string }
