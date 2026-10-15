import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import type { MasterResume } from '../../../shared/resume'
import type { KeywordGap } from '../../../shared/application'
import { Button, Spinner } from '../ui'
import { Markdown } from '../markdown'

interface Msg {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Conversational editor. The user types plain-English requests ("make the summary
 * 3 sentences", "retitle Acme to Staff Engineer"); the agent edits the resume
 * through tools and streams what it's doing. Applied edits arrive as 'resume'
 * events and are pushed up so the live preview updates.
 */
export function ChatPanel({
  resume,
  master,
  jd,
  gap,
  onResume,
  company = '',
  role = '',
  cover = '',
  onCover,
  hero = false,
  seed = null,
  chatKey,
  onBusyChange
}: {
  resume: MasterResume
  /** The full master resume (superset) so the agent can pull back trimmed content. */
  master: MasterResume
  jd: string
  /** Current ATS analysis, so the agent can prioritize raising the score. */
  gap: KeywordGap | null
  onResume: (r: MasterResume) => void
  /** Target company/role, so the agent can frame a cover letter written in chat. */
  company?: string
  role?: string
  /** Current cover-letter draft, kept in sync so chat edits build on it. */
  cover?: string
  /** Called when the agent writes/updates the cover letter through chat. */
  onCover?: (text: string) => void
  /** When true, the panel fills its container and the log grows to fit (chat-as-hero). */
  hero?: boolean
  /** A message to send on the user's behalf, e.g. from the ATS panel. */
  seed?: { text: string; token: number } | null
  /** Which workspace this chat belongs to. Sessions are keyed by it in main. */
  chatKey: string
  /** Reports whether a turn is in flight, so the tab strip can show it. */
  onBusyChange?: (key: string, busy: boolean) => void
}): React.JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const lastSeed = useRef(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Grow the input to fit its content (up to a cap), so it never needs manual resizing.
  function autosize(): void {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // Start a fresh agent session for this resume, and subscribe to its stream.
  useEffect(() => {
    let unsub = (): void => {}
    ;(async () => {
      await window.api.startChat(chatKey, resume, jd, gap, master, company, role, cover)
      setReady(true)
    })()

    unsub = window.api.onChatEvent((key, e) => {
      // Every workspace streams on the same channel; ignore other tabs'.
      if (key !== chatKey) return
      if (e.kind === 'text') {
        setMessages((m) => appendToAssistant(m, e.text))
      } else if (e.kind === 'status') {
        setStatus(e.text)
      } else if (e.kind === 'resume') {
        onResume(e.resume)
      } else if (e.kind === 'cover') {
        onCover?.(e.cover)
      } else if (e.kind === 'turn-done') {
        setBusy(false)
        setStatus('')
      } else if (e.kind === 'error') {
        setMessages((m) => appendToAssistant(m, `\n\n⚠️ ${e.error}`))
        setBusy(false)
        setStatus('')
      }
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, status])

  // Keep the agent's view of the ATS score current as the user re-scans.
  useEffect(() => {
    if (ready) window.api.setChatGap(chatKey, gap)
  }, [gap, ready])

  // Keep the agent's view of the cover-letter draft current (e.g. after the
  // one-click Generate button, or manual edits), so chat refinements build on it.
  useEffect(() => {
    if (ready) window.api.setChatCover(chatKey, cover)
  }, [cover, ready])

  useEffect(() => {
    onBusyChange?.(chatKey, busy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, chatKey])

  async function sendText(raw: string): Promise<void> {
    const text = raw.trim()
    if (!text || busy || !ready) return
    setInput('')
    setBusy(true)
    setStatus('')
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])
    // Collapse the input back to one line now that it's cleared.
    requestAnimationFrame(autosize)
    await window.api.sendChat(chatKey, text)
  }

  function send(): void {
    void sendText(input)
  }

  /**
   * A request drafted elsewhere (the ATS panel's Optimize button). It lands in
   * the composer rather than being sent, so it can be read and edited first —
   * the agent is about to rewrite a resume from it.
   *
   * Keyed by a token so the same text can be drafted twice in a row.
   */
  useEffect(() => {
    if (!seed || seed.token === lastSeed.current) return
    lastSeed.current = seed.token
    setInput(seed.text)
    requestAnimationFrame(() => {
      autosize()
      inputRef.current?.focus()
      // Put the caret at the end so typing continues the draft.
      const len = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(len, len)
    })
  }, [seed])

  function cancel(): void {
    window.api.cancelChat(chatKey)
    setBusy(false)
    setStatus('')
  }

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border bg-card',
        !hero && 'mt-4'
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-surface px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] font-semibold">Chat with your resume</h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-faint">
            Ask for anything — &ldquo;tighten the summary to three sentences&rdquo;. Edits apply live.
          </p>
        </div>
        <div className="flex-1" />
        {!ready && <Spinner text="connecting…" />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 [&>*]:shrink-0" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="m-auto max-w-sm text-center text-[12.5px] leading-relaxed text-faint text-pretty">
            Nothing yet. Ask for a change to this resume and it is applied to the draft as the
            answer streams in.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[88%] whitespace-pre-wrap break-words rounded-[10px] px-3 py-2 text-[12.5px] leading-relaxed',
              m.role === 'user'
                ? 'self-end bg-primary font-medium text-primary-foreground'
                : 'md self-start whitespace-normal border border-border bg-card-muted'
            )}
          >
            {m.role === 'assistant' ? (
              m.text ? (
                <Markdown text={m.text} />
              ) : busy ? (
                <span className="animate-pulse opacity-50">▍</span>
              ) : (
                ''
              )
            ) : (
              m.text
            )}
          </div>
        ))}
        {status && (
          <div className="self-start px-1 py-0.5">
            <Spinner text={status} />
          </div>
        )}
      </div>

      {/* Composer pinned to the bottom of the column, full width. */}
      <div className="border-t border-surface bg-card-muted p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            autosize()
          }}
          placeholder={ready ? 'Message the agent…' : 'Connecting…'}
          rows={1}
          disabled={!ready}
          className="max-h-48 min-h-[40px] w-full resize-none rounded-[8px] border border-border bg-card px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground placeholder:text-faint focus-visible:border-primary-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="mt-2 flex items-center gap-2.5">
          {busy ? (
            <Button variant="danger" onClick={cancel}>
              Stop
            </Button>
          ) : (
            <Button onClick={send} disabled={!ready || !input.trim()}>
              Send
            </Button>
          )}
          <span className="text-[11px] text-faint">⌘↵ to send</span>
        </div>
      </div>
    </div>
  )
}
function appendToAssistant(msgs: Msg[], chunk: string): Msg[] {
  if (msgs.length === 0) return [{ role: 'assistant', text: chunk }]
  const last = msgs[msgs.length - 1]
  if (last.role !== 'assistant') return [...msgs, { role: 'assistant', text: chunk }]
  const copy = msgs.slice()
  copy[copy.length - 1] = { ...last, text: last.text + chunk }
  return copy
}
