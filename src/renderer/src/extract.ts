/**
 * Text extraction, done in the renderer (Chromium) because pdfjs and mammoth
 * need real browser APIs (DOMMatrix, workers) that the Node main process lacks.
 * Main hands us the file bytes as base64; we turn them into text for Claude.
 */

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function extractResumeText(ext: string, base64: string): Promise<string> {
  const bytes = base64ToBytes(base64)

  if (ext === '.txt' || ext === '.md' || ext === '.json') {
    return new TextDecoder().decode(bytes)
  }

  if (ext === '.docx') {
    type Mammoth = { extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
    const mod = (await import('mammoth/mammoth.browser.js')) as unknown as Mammoth & {
      default?: Mammoth
    }
    const mammoth = mod.default ?? mod
    const res = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer })
    return res.value
  }

  if (ext === '.pdf') {
    const pdfjs = await import('pdfjs-dist')
    // Vite turns this into a same-origin URL it can serve/bundle.
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

    const doc = await pdfjs.getDocument({ data: bytes }).promise
    let text = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      text +=
        content.items
          .map((it) => ('str' in it ? (it as { str: string }).str : ''))
          .join(' ') + '\n'
    }
    return text.trim()
  }

  throw new Error(`Unsupported file type "${ext}". Use PDF, DOCX, TXT, or MD.`)
}
