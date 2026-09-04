const IMAGE_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
])

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml',
  '.yaml', '.yml', '.html', '.htm', '.ts',
  '.js', '.py', '.sh', '.log',
])

const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type AttachmentType = 'image' | 'pdf' | 'docx' | 'text' | 'unsupported'

function detectType(mimetype: string, originalname: string): AttachmentType {
  if (IMAGE_MIMETYPES.has(mimetype)) return 'image'
  if (mimetype === 'application/pdf') return 'pdf'

  const ext = originalname.toLowerCase().slice(originalname.lastIndexOf('.'))
  if (mimetype === DOCX_MIMETYPE || ext === '.docx') return 'docx'
  if (mimetype.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'

  return 'unsupported'
}

export interface ProcessedFile {
  type: AttachmentType
  originalname: string
  mimeType?: string
  /** Base64 image data — set for images only */
  base64?: string
  /** Extracted plain text — set for pdf and text files */
  text?: string
}

export async function processFile(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<ProcessedFile> {
  const type = detectType(mimetype, originalname)

  if (type === 'image') {
    return { type, originalname, mimeType: mimetype, base64: buffer.toString('base64') }
  }

  if (type === 'text') {
    return { type, originalname, text: buffer.toString('utf-8') }
  }

  if (type === 'pdf') {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return { type, originalname, text: text.trim() }
  }

  if (type === 'docx') {
    const mammoth = await import('mammoth')
    const { value: text } = await mammoth.extractRawText({ buffer })
    return { type, originalname, text: text.trim() }
  }

  return { type, originalname }
}

/**
 * Build the user-facing message text to store in the DB.
 * For text/pdf, the extracted content is prepended so the AI has full context.
 * For images, a short label is prepended (the actual bytes go to the vision model separately).
 */
export function buildMessageContent(userText: string, file?: ProcessedFile): string {
  if (!file) return userText

  if (file.type === 'image') {
    return `[Image: ${file.originalname}]\n\n${userText}`
  }

  if (file.type === 'pdf' || file.type === 'docx' || file.type === 'text') {
    return `[File: ${file.originalname}]\n\n${file.text}\n\n---\n\n${userText}`
  }

  return userText
}
