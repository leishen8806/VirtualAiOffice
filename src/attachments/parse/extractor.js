import fs from 'node:fs'
import { ATTACHMENT_KIND, ATTACHMENT_STATUS } from '../types.js'
import { extractPdf } from './pdf.js'
import { extractDocx } from './docx.js'
import { extractXlsx } from './xlsx.js'
import { extractPlain } from './plain.js'
import { extractAudio } from './audio.js'

/**
 * Attachment extractor dispatcher.
 *
 * Extractors run AFTER the upload is finalised (bytes on disk, index row
 * in status STORED). They mutate the row.extract field in place and
 * transition status → EXTRACTED on success or leave an error field on
 * failure. A failed extract still leaves the raw blob available for
 * download (preview route), but the model boundary will skip it.
 *
 * All parsers are defensive: never trust bytes on disk, wrap every
 * library call in try/catch, and enforce output-size caps so a malicious
 * PDF can't blow up the process memory.
 *
 * Dispatch is by (kind, mime, ext) triple with a safe fallback.
 */

const PAGE_CHARS_CAP = 8000
const TOTAL_CHARS_CAP = 60_000

/**
 * @param {import('../store.js').AttachmentStore} store
 * @param {string} id
 * @param {object} [opts]
 * @param {(row) => void} [opts.onUpdate]  optional hook for coordinator progress events
 * @returns {Promise<void>}
 */
export async function runExtract(store, id, opts = {}) {
  const row = store.get(id)
  if (!row) return
  store.update(id, { status: ATTACHMENT_STATUS.EXTRACTING })
  opts.onUpdate?.(store.get(id))
  try {
    const extract = await dispatchExtract(row)
    store.update(id, { extract, status: ATTACHMENT_STATUS.EXTRACTED })
  } catch (e) {
    store.update(id, {
      status: ATTACHMENT_STATUS.EXTRACTED,
      extract: { error: String(e.message || e) },
      error: String(e.message || e),
    })
  } finally {
    opts.onUpdate?.(store.get(id))
  }
}

function extOf(filename) {
  const dot = String(filename || '').lastIndexOf('.')
  return dot > 0 ? String(filename).slice(dot).toLowerCase() : ''
}

function readBlob(storagePath, maxBytes) {
  const s = fs.statSync(storagePath)
  if (s.size > maxBytes) throw new Error(`blob exceeds extract cap of ${maxBytes} bytes`)
  return fs.readFileSync(storagePath)
}

function truncatePages(pages) {
  const out = []
  let total = 0
  for (const p of pages) {
    let text = String(p.text || '')
    if (text.length > PAGE_CHARS_CAP) text = text.slice(0, PAGE_CHARS_CAP) + '…（本页截断）'
    if (total + text.length > TOTAL_CHARS_CAP) {
      const room = Math.max(0, TOTAL_CHARS_CAP - total)
      text = text.slice(0, room) + '…（剩余页面跳过，附件过大）'
      out.push({ n: p.n, text })
      break
    }
    total += text.length
    out.push({ n: p.n, text })
  }
  return { pages: out, pageCount: out.length }
}

async function dispatchExtract(row) {
  const ext = extOf(row.sanitizedName)
  const blobPath = row.storagePath
  switch (row.kind) {
    case ATTACHMENT_KIND.DOCUMENT: {
      if (row.mimeType === 'application/pdf' || ext === '.pdf') {
        const buf = readBlob(blobPath, 100 * 1024 * 1024)
        const raw = await extractPdf(buf)
        return truncatePages(raw.pages.map((text, i) => ({ n: i + 1, text })))
      }
      if (ext === '.docx' || row.mimeType.includes('wordprocessingml')) {
        const buf = readBlob(blobPath, 100 * 1024 * 1024)
        const raw = await extractDocx(buf)
        return truncatePages(splitBySeparator(raw.text, row.mimeType))
      }
      if (ext === '.xlsx' || row.mimeType.includes('spreadsheetml')) {
        const buf = readBlob(blobPath, 100 * 1024 * 1024)
        const raw = await extractXlsx(buf)
        return truncatePages(raw.sheets.flatMap((s) => s.rows.map((text, i) => ({ n: s._pageBase + i + 1, text }))))
      }
      const buf = readBlob(blobPath, 50 * 1024 * 1024)
      const raw = extractPlain(buf, { ext, mime: row.mimeType })
      return truncatePages(raw)
    }
    case ATTACHMENT_KIND.IMAGE: {
      const buf = readBlob(blobPath, 30 * 1024 * 1024)
      return { dataUrl: `data:${row.mimeType};base64,${buf.toString('base64')}` }
    }
    case ATTACHMENT_KIND.AUDIO: {
      const buf = readBlob(blobPath, 60 * 1024 * 1024)
      const out = await extractAudio(buf, { mime: row.mimeType, ext })
      if (out.durationSec && out.durationSec > 10 * 60) {
        throw new Error(`音频超过 10 分钟上限（${Math.round(out.durationSec)} 秒）`)
      }
      return out
    }
    default:
      return {}
  }
}

function splitBySeparator(text, mime) {
  const raw = String(text || '')
  const pages = []
  // Fallback: every ~3000 chars becomes a synthetic page so we can still
  // emit `[att#N p.M]` references. Page ordinal is 1-indexed.
  const CHUNK = 3000
  for (let i = 0, n = 1; i < raw.length; i += CHUNK, n++) {
    pages.push({ n, text: raw.slice(i, i + CHUNK) })
  }
  if (!pages.length) pages.push({ n: 1, text: '' })
  return pages
}
