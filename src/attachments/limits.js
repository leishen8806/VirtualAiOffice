import { ATTACHMENT_KIND } from './types.js'

/**
 * Server-side enforcement of upload limits.
 *
 * All limits are applied ONLY on the POST /attachments handler. Clients
 * can never be trusted: the extractors also re-check the parsed output
 * size, and the model boundary will refuse oversized excerpts.
 *
 * Limits per user request:
 *   maxAttachmentsPerMessage = 5
 *   maxTotalBytes             = 50 MB (sum of all 5)
 *
 * Per-attachment caps:
 *   document  = 20 MB (pdf / docx / xlsx / txt / md / csv / …)
 *   image     = 10 MB (png / jpeg / webp / gif)
 *   audio     = 25 MB AND ≤ 10 minutes (whisper-class inputs)
 */

export const LIMITS = Object.freeze({
  maxAttachmentsPerMessage: 5,
  maxTotalBytes: 50 * 1024 * 1024,
  perKind: Object.freeze({
    [ATTACHMENT_KIND.DOCUMENT]: Object.freeze({ maxBytes: 20 * 1024 * 1024 }),
    [ATTACHMENT_KIND.IMAGE]: Object.freeze({ maxBytes: 10 * 1024 * 1024 }),
    [ATTACHMENT_KIND.AUDIO]: Object.freeze({ maxBytes: 25 * 1024 * 1024, maxDurationSec: 10 * 60 }),
    [ATTACHMENT_KIND.UNKNOWN]: Object.freeze({ maxBytes: 1024 }),
  }),
})

/**
 * Mapping from (declared mime, file extension, magic bytes signature) →
 * canonical kind + accepted mime list. Mime from the Content-Type header
 * alone is not trusted – we verify with magic bytes below.
 */
const MIME_TO_KIND = {
  'application/pdf': ATTACHMENT_KIND.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ATTACHMENT_KIND.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ATTACHMENT_KIND.DOCUMENT,
  'text/plain': ATTACHMENT_KIND.DOCUMENT,
  'text/markdown': ATTACHMENT_KIND.DOCUMENT,
  'text/csv': ATTACHMENT_KIND.DOCUMENT,
  'application/json': ATTACHMENT_KIND.DOCUMENT,
  'text/html': ATTACHMENT_KIND.DOCUMENT,
  'image/png': ATTACHMENT_KIND.IMAGE,
  'image/jpeg': ATTACHMENT_KIND.IMAGE,
  'image/webp': ATTACHMENT_KIND.IMAGE,
  'image/gif': ATTACHMENT_KIND.IMAGE,
  'audio/mpeg': ATTACHMENT_KIND.AUDIO,
  'audio/mp3': ATTACHMENT_KIND.AUDIO,
  'audio/mp4': ATTACHMENT_KIND.AUDIO,
  'audio/wav': ATTACHMENT_KIND.AUDIO,
  'audio/x-wav': ATTACHMENT_KIND.AUDIO,
  'audio/ogg': ATTACHMENT_KIND.AUDIO,
  'audio/webm': ATTACHMENT_KIND.AUDIO,
  'audio/flac': ATTACHMENT_KIND.AUDIO,
  'audio/x-m4a': ATTACHMENT_KIND.AUDIO,
  'audio/aac': ATTACHMENT_KIND.AUDIO,
}

const EXT_TO_KIND = {
  '.pdf': ATTACHMENT_KIND.DOCUMENT,
  '.docx': ATTACHMENT_KIND.DOCUMENT,
  '.xlsx': ATTACHMENT_KIND.DOCUMENT,
  '.txt': ATTACHMENT_KIND.DOCUMENT,
  '.md': ATTACHMENT_KIND.DOCUMENT,
  '.csv': ATTACHMENT_KIND.DOCUMENT,
  '.json': ATTACHMENT_KIND.DOCUMENT,
  '.html': ATTACHMENT_KIND.DOCUMENT,
  '.htm': ATTACHMENT_KIND.DOCUMENT,
  '.png': ATTACHMENT_KIND.IMAGE,
  '.jpg': ATTACHMENT_KIND.IMAGE,
  '.jpeg': ATTACHMENT_KIND.IMAGE,
  '.webp': ATTACHMENT_KIND.IMAGE,
  '.gif': ATTACHMENT_KIND.IMAGE,
  '.mp3': ATTACHMENT_KIND.AUDIO,
  '.wav': ATTACHMENT_KIND.AUDIO,
  '.ogg': ATTACHMENT_KIND.AUDIO,
  '.webm': ATTACHMENT_KIND.AUDIO,
  '.flac': ATTACHMENT_KIND.AUDIO,
  '.m4a': ATTACHMENT_KIND.AUDIO,
  '.aac': ATTACHMENT_KIND.AUDIO,
  '.mp4': ATTACHMENT_KIND.AUDIO,
}

/**
 * First 16 bytes → accepted mimes array. Order: most specific first.
 * Signature check happens BEFORE the first chunk is written to disk.
 */
const SIGNATURES = [
  { sig: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', mask: null },
  { sig: [0x50, 0x4B, 0x03, 0x04], mime: '__pkzip__', mask: null },
  { sig: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png', mask: null },
  { sig: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg', mask: null },
  { sig: [0x52, 0x49, 0x46, 0x46], mime: '__riff__', mask: null },
  { sig: [0x49, 0x44, 0x33], mime: 'audio/mpeg', mask: null },
  { sig: [0xFF, 0xFB], mime: 'audio/mpeg', mask: [0xFF, 0xFE] },
  { sig: [0x4F, 0x67, 0x67, 0x53], mime: 'audio/ogg', mask: null },
  { sig: [0x66, 0x74, 0x79, 0x70], mime: 'audio/mp4', mask: null, offset: 4 },
  { sig: [0x1A, 0x45, 0xDF, 0xA3], mime: 'audio/webm', mask: null },
  { sig: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif', mask: [0xFF, 0xFF, 0xFF, 0xF0] },
]

function matchesSig(chunk, entry) {
  const off = entry.offset || 0
  if (chunk.length < off + entry.sig.length) return false
  for (let i = 0; i < entry.sig.length; i++) {
    let b = chunk[off + i]
    if (entry.mask) b &= entry.mask[i]
    if (b !== entry.sig[i]) return false
  }
  return true
}

/**
 * PKZIP container: docx/xlsx. Need to peek the central directory later to
 * be 100%, but [Content_Types].xml presence is a reliable signal from the
 * local file headers. We just classify broadly here; the actual extractor
 * (pdf/docx/xlsx) will fail closed if it can't parse.
 */
function classifyPkzip(chunk, declaredMime, ext) {
  const byDeclared = /docx/.test(declaredMime) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : /spreadsheet/.test(declaredMime) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : null
  if (byDeclared) return byDeclared
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return null
}

function classifyRiff(chunk, declaredMime, ext) {
  if (chunk.length < 12) return null
  const sub = chunk.toString('ascii', 8, 12)
  if (sub === 'WAVE') return 'audio/wav'
  if (sub === 'WEBP') return 'image/webp'
  return /wav/.test(ext) ? 'audio/wav' : null
}

function classifyFtyp(chunk, declaredMime, ext) {
  if (chunk.length < 12) return null
  const brand = chunk.toString('ascii', 8, 12)
  const audioBrands = new Set(['M4A ', 'isom', 'mp42', 'mp41', 'M4V '])
  if (audioBrands.has(brand) || /mp4|m4a|aac/.test(ext)) {
    return /aac/.test(ext) ? 'audio/aac' : 'audio/mp4'
  }
  return null
}

/**
 * Sanitize a user-supplied filename into a safe display label. We do NOT
 * use the sanitized name as a storage path (storage uses the random id).
 * We just strip separators + control chars and cap length so the index
 * stays human-readable.
 */
export function sanitizeFilename(orig) {
  let s = String(orig || '')
  const last = s.lastIndexOf('/')
  if (last !== -1) s = s.slice(last + 1)
  const last2 = s.lastIndexOf('\\')
  if (last2 !== -1) s = s.slice(last2 + 1)
  s = s.replace(/[\x00-\x1F\x7F/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  if (s.length > 120) {
    const extIdx = s.lastIndexOf('.')
    if (extIdx > 0 && extIdx >= s.length - 16) {
      const ext = s.slice(extIdx)
      s = s.slice(0, Math.max(1, 120 - ext.length)) + ext
    } else {
      s = s.slice(0, 120)
    }
  }
  return s || 'unnamed'
}

export function extFromName(name) {
  const s = sanitizeFilename(name)
  const dot = s.lastIndexOf('.')
  return dot > 0 ? s.slice(dot).toLowerCase() : ''
}

/**
 * @param {Buffer} firstChunk   first ~4096 bytes (minimum we peek before
 *                              deciding whether to keep streaming to disk)
 * @param {string} declaredMime Content-Type header from busboy
 * @param {string} filename     user-supplied filename
 * @returns {{ kind:string, mime:string, accepted:boolean }}
 */
export function classify(firstChunk, declaredMime, filename) {
  const ext = extFromName(filename)
  let mime = null
  for (const entry of SIGNATURES) {
    if (!matchesSig(firstChunk, entry)) continue
    if (entry.mime === '__pkzip__') { mime = classifyPkzip(firstChunk, declaredMime, ext); break }
    if (entry.mime === '__riff__') { mime = classifyRiff(firstChunk, declaredMime, ext); break }
    if (entry.mime === 'audio/mp4' && entry.offset === 4) { mime = classifyFtyp(firstChunk, declaredMime, ext); break }
    mime = entry.mime
    break
  }
  if (!mime) {
    const fromDecl = MIME_TO_KIND[declaredMime] ? declaredMime : null
    const fromExt = EXT_TO_KIND[ext] ? declaredMime || `application/x-${ext.slice(1)}` : null
    mime = fromDecl || fromExt || (MIME_TO_KIND[declaredMime] ? declaredMime : null) || 'application/octet-stream'
  }
  const kind = MIME_TO_KIND[mime] || EXT_TO_KIND[ext] || ATTACHMENT_KIND.UNKNOWN
  const accepted = kind !== ATTACHMENT_KIND.UNKNOWN
  return { kind, mime, accepted }
}

/**
 * Check the per-kind byte cap after classification. Returns the numeric
 * limit in bytes for the given kind.
 */
export function byteLimitForKind(kind) {
  const cfg = LIMITS.perKind[kind] || LIMITS.perKind[ATTACHMENT_KIND.UNKNOWN]
  return cfg.maxBytes
}

/**
 * Enforce all pre-streaming limits before the first byte is written.
 * @throws {Error} with a user-safe message on violation.
 */
export function assertPreflight({ perMessageCounts, declaredSize, declaredMime, filename, firstChunk }) {
  const { kind, accepted } = classify(firstChunk, declaredMime, filename)
  if (!accepted) {
    throw new Error('不支持的附件类型：仅接受文档（pdf/docx/xlsx/txt/md/csv）、图片（png/jpeg/webp/gif）、音频（mp3/wav/ogg/m4a/webm/flac/aac）')
  }
  if ((perMessageCounts.count + 1) > LIMITS.maxAttachmentsPerMessage) {
    throw new Error(`每条消息最多 ${LIMITS.maxAttachmentsPerMessage} 个附件`)
  }
  const cap = byteLimitForKind(kind)
  if (declaredSize != null && declaredSize > cap) {
    throw new Error(`该类型单文件最大 ${Math.round(cap / 1024 / 1024)} MB`)
  }
  const newTotal = (perMessageCounts.totalBytes || 0) + (declaredSize || 0)
  if (declaredSize != null && newTotal > LIMITS.maxTotalBytes) {
    throw new Error(`本次上传总大小超过 ${Math.round(LIMITS.maxTotalBytes / 1024 / 1024)} MB 上限`)
  }
  return { kind }
}
