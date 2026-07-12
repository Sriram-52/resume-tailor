import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'

/**
 * Render a full HTML document to a PDF using an offscreen BrowserWindow and
 * Chromium's printToPDF. The renderer builds the HTML (template + data) and
 * hands us the string; we paginate it to Letter with sane margins.
 */

function tmpDir(): string {
  const dir = join(app.getPath('userData'), 'tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface ExportResult {
  ok: boolean
  path?: string
  error?: string
  /** True if the user cancelled the save dialog. */
  cancelled?: boolean
}

export async function exportHtmlToPdf(html: string, defaultFileName: string): Promise<ExportResult> {
  const save = await dialog.showSaveDialog({
    title: 'Save PDF',
    defaultPath: defaultFileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (save.canceled || !save.filePath) return { ok: false, cancelled: true }

  const htmlPath = join(tmpDir(), `render-${defaultFileName.replace(/\W+/g, '_')}.html`)
  writeFileSync(htmlPath, html, 'utf-8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true }
  })

  try {
    await win.loadFile(htmlPath)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    writeFileSync(save.filePath, pdf)
    return { ok: true, path: save.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}
