import { useEffect, useRef, useState } from 'react'
import type { MasterResume } from '../../../shared/resume'
import { Button, Spinner } from '../ui'
import { Markdown } from '../markdown'

interface Msg {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Conversational editor for the MASTER resume. The user describes real changes
 * ("I built a project called X", "add my AWS cert", "I started a job at Y") and
 * the agent edits the master through tools, streaming what it does. Each applied
 * edit arrives as a 'resume' event and is pushed up via onApply, which persists
 * it immediately (auto-save). Runs on a separate agent session/channel from the
 * tailoring chat, so the two never interfere.
 */
export function MasterChatPanel({
  master,
  onApply
}: {
  master: MasterResume
  /** Persist an AI-applied edit to the active profile (auto-save). */
  onApply: (r: MasterResume) => void
}): React.JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep the latest master + callback in refs so the once-subscribed event
  // handler and send() never close over stale values.
  const masterRef = useRef(master)
  const onApplyRef = useRef(onApply)
  useEffect(() => {
    masterRef.current = master
  }, [master])
  useEffect(() => {
    onApplyRef.current = onApply
  }, [onApply])

  function autosize(): void {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    ;(async () => {
      await window.api.startMasterChat(masterRef.current)
      setReady(true)
    })()

    const unsub = window.api.onMasterChatEvent((e) => {
      if (e.kind === 'text') {
        setMessages((m) => appendToAssistant(m, e.text))
      } else if (e.kind === 'status') {
        setStatus(e.text)
      } else if (e.kind === 'resume') {
        onApplyRef.current(e.resume)
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

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy || !ready) return
    setInput('')
    setBusy(true)
    setStatus('')
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])
    requestAnimationFrame(autosize)
    // Pass the current master so the agent always edits the latest saved copy.
    await window.api.sendMasterChat(text, masterRef.current)
  }

  function cancel(): void {
    window.api.cancelMasterChat()
    setBusy(false)
    setStatus('')
  }

  return (
    <div className="panel chat">
      <p className="muted">
        Describe real changes and they&apos;re applied to the fields below and saved automatically:
        &quot;I built a project called PromptForge&quot;, &quot;add my AWS Solutions Architect
        cert&quot;, &quot;I started a new role at Acme in March&quot;, &quot;rewrite my summary to
        emphasize AI work&quot;.
      </p>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">Tell the assistant what to add or change.</div>
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
          placeholder={ready ? 'Tell the assistant what to update…' : 'Connecting…'}
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
