/**
 * DOCX extractor via mammoth.
 *
 * Mammoth converts docx to semantic HTML; we strip tags to plain text
 * while preserving paragraph breaks so the page-chunker downstream gets
 * sensible split points. Lazy-loaded to avoid startup cost for callers
 * that never upload a docx.
 *
 * @param {Buffer} buf
 * @returns {Promise<{text:string}>}
 */
let _mammoth = null
async function loadMammoth() {
  if (_mammoth) return _mammoth
  const m = await import('mammoth')
  _mammoth = m.default || m
  return _mammoth
}

export async function extractDocx(buf) {
  try {
    const mammoth = await loadMammoth()
    const result = await mammoth.extractRawText({ buffer: buf })
    return { text: normalise(result.value || '') }
  } catch (e) {
    throw new Error(`DOCX 解析失败：${e.message}`)
  }
}

function normalise(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
