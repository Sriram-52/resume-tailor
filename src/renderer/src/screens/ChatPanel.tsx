import { useEffect, useRef, useState } from 'react'
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
  hero = false
}: {
  resume: MasterResume
  /** The full master resume (superset) so the agent can pull back trimmed content. */
  master: MasterResume
  jd: string
  /** Current ATS analysis, so the agent can prioritize raising the score. */
  gap: KeywordGap | null
  onResume: (r: MasterResume) => void
  /** When true, the panel fills its container and the log grows to fit (chat-as-hero). */
  hero?: boolean
}): React.JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
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
      await window.api.startChat(resume, jd, gap, master)
      setReady(true)
    })()

    unsub = window.api.onChatEvent((e) => {
      if (e.kind === 'text') {
        setMessages((m) => appendToAssistant(m, e.text))
      } else if (e.kind === 'status') {
        setStatus(e.text)
      } else if (e.kind === 'resume') {
        onResume(e.resume)
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
    if (ready) window.api.setChatGap(gap)
  }, [gap, ready])

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy || !ready) return
    setInput('')
    setBusy(true)
    setStatus('')
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])
    // Collapse the input back to one line now that it's cleared.
    requestAnimationFrame(autosize)
    await window.api.sendChat(text)
  }

  function cancel(): void {
    window.api.cancelChat()
    setBusy(false)
    setStatus('')
  }

  return (
    <div className={`panel chat ${hero ? 'chat-hero' : ''}`}>
      <div className="row space">
        <h3>Chat with your resume</h3>
        {!ready && <span className="muted">connecting…</span>}
      </div>
      <p className="muted">
        Ask for anything: "tighten the summary to 3 sentences". Edits apply live.
      </p>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">Type a request below to start editing by conversation.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            {m.role === 'assistant' ? (
              m.text ? (
                <Markdown text={m.text} />
              ) : busy ? (
                <span className="caret">▍</span>
              ) : (
                ''
              )
            ) : (
              m.text
            )}
          </div>
        ))}
        {status && (
          <div className="chat-status">
            <Spinner text={status} />
          </div>
        )}
      </div>

      <div className="chat-input">
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="chat-actions">
          {busy ? (
            <Button variant="danger" onClick={cancel}>
              Stop
            </Button>
          ) : (
            <Button onClick={send} disabled={!ready || !input.trim()}>
              Send
            </Button>
          )}
          <span className="muted chat-hint">⌘↵ to send</span>
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
