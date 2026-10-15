import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
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
    <div className="mt-4 rounded-[12px] border border-border bg-card p-4 flex min-w-0 flex-1 flex-col">
      <p className="text-[13px] text-muted-foreground">
        Describe real changes and they&apos;re applied to the fields below and saved automatically:
        &quot;I built a project called PromptForge&quot;, &quot;add my AWS Solutions Architect
        cert&quot;, &quot;I started a new role at Acme in March&quot;, &quot;rewrite my summary to
        emphasize AI work&quot;.
      </p>

      <div className="mt-2.5 flex max-h-[40vh] min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 [&>*]:shrink-0" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="px-1 py-4 text-[13px] text-muted-foreground">Tell the assistant what to add or change.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn(
            'max-w-[92%] break-words rounded-[10px] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap',
            m.role === 'user'
              ? 'self-end bg-primary font-medium text-primary-foreground'
              : 'self-start whitespace-normal border border-border bg-surface'
          )}>
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
          <div className="self-start px-1 py-0.5 text-[12px] text-muted-foreground">
            <Spinner text={status} />
          </div>
        )}
      </div>

      <div className="mt-2.5">
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
          <span className="text-[13px] text-muted-foreground text-[11px]">⌘↵ to send</span>
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
