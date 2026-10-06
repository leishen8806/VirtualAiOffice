/**
 * PDF extractor wrapper around pdf-parse.
 *
 * Lazily imports pdf-parse because its CJS entry reads a test-data PDF
 * file at import time relative to process.cwd() which breaks callers
 * whose CWD is not the repo root.
 */
let _pdfParse = null
async function loadPdfParse() {
  if (_pdfParse) return _pdfParse
  const m = await import('pdf-parse')
  _pdfParse = m.default || m
  return _pdfParse
}

export async function extractPdf(buf) {
  try {
    const pdfParse = await loadPdfParse()
    const data = await pdfParse(buf, { pagerender: null })
    const raw = String(data.text || '')
    if (!raw.trim()) return { pages: [''] }
    const split = raw.split(/\f/)
    const pages = split.length > 1
      ? split.map((p) => normalise(p))
      : [normalise(raw)]
    return { pages }
  } catch (e) {
    throw new Error(`PDF 解析失败：${e.message}`)
  }
}

function normalise(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
