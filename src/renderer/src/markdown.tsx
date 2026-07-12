/**
 * A tiny, dependency-free Markdown renderer for chat messages. The agent's
 * replies come back as Markdown (bold, bullet lists, inline code, etc.); the old
 * UI dumped the raw text into a <div>, so users saw literal `*` and `-`. This
 * escapes all HTML first, then applies a small, safe subset of Markdown, so the
 * agent's output can never inject markup.
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Inline formatting: code, bold, italic, links. Input must already be escaped. */
function inline(text: string): string {
  return (
    text
      // `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // **bold** / __bold__
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // *italic* / _italic_ (avoid matching bold's remnants)
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
      // [label](url) — only http(s) URLs are linkified
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  )
}

/** Convert a Markdown string to a safe HTML string. */
export function mdToHtml(src: string): string {
  const lines = escapeHtml(src).replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | null = null

  const closeList = (): void => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```
    if (/^```/.test(line.trim())) {
      closeList()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`)
      continue
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      closeList()
      const level = Math.min(h[1].length + 2, 6) // #→h3, so chat headings stay small
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      i++
      continue
    }

    // Unordered list
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      i++
      continue
    }

    // Ordered list
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      i++
      continue
    }

    // Blank line
    if (line.trim() === '') {
      closeList()
      i++
      continue
    }

    // Paragraph (merge consecutive non-empty, non-block lines)
    closeList()
    const para: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    out.push(`<p>${inline(para.join('<br>'))}</p>`)
  }

  closeList()
  return out.join('')
}

/** Render Markdown text as formatted, sanitized HTML. */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />
}
