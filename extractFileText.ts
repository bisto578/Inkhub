/**
 * Extracts plain text from user-picked files so InkMind can read them.
 * Supports: plain-text formats natively, PDF via pdfjs-dist, .docx via JSZip + DOMParser.
 */

/** Max file size we accept (matches Retool Storage's presigned cap generously for text). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** Max characters of extracted text we put into the chat context. */
export const MAX_TEXT_CHARS = 100_000

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm',
  'yaml', 'yml', 'log', 'rtf', 'tex', 'srt', 'vtt', 'ini', 'toml',
])

export function extensionOf(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? (parts[parts.length - 1] ?? '').toLowerCase() : ''
}

export function isSupportedFile(fileName: string): boolean {
  const ext = extensionOf(fileName)
  return TEXT_EXTENSIONS.has(ext) || ext === 'pdf' || ext === 'docx'
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text
  return text.slice(0, MAX_TEXT_CHARS) + '\n\n[... file truncated to fit the conversation]'
}

async function readAsText(file: File): Promise<string> {
  return truncate(await file.text())
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (pageText) parts.push(pageText)
    }
  } finally {
    await doc.destroy()
  }
  return truncate(parts.join('\n\n'))
}

async function readDocx(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('This .docx file has no readable document body.')

  const dom = new DOMParser().parseFromString(docXml, 'application/xml')
  const paragraphs = dom.getElementsByTagName('w:p')
  const lines: string[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    const runs = paragraphs[i]?.getElementsByTagName('w:t') ?? []
    let line = ''
    for (let j = 0; j < runs.length; j++) {
      line += runs[j]?.textContent ?? ''
    }
    lines.push(line)
  }
  return truncate(lines.join('\n').replace(/\n{3,}/g, '\n\n'))
}

/** Extract text from a supported file, or throw with a human-readable error. */
export async function extractFileText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is too large (over 20 MB).`)
  }
  const ext = extensionOf(file.name)
  if (ext === 'pdf') return readPdf(file)
  if (ext === 'docx') return readDocx(file)
  if (TEXT_EXTENSIONS.has(ext)) return readAsText(file)
  throw new Error(`"${file.name}" isn't a supported type (txt, md, pdf, docx, and other text formats).`)
}
