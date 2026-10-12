/**
 * XLSX extractor via SheetJS (xlsx).
 *
 * Sheets are flattened into synthetic "pages": one page per sheet,
 * rendered as a TSV-style text block with the sheet name as the first
 * line. Caller slices further by character count via the shared
 * truncatePages helper. Lazy-loaded to avoid startup cost.
 *
 * @param {Buffer} buf
 * @returns {Promise<{sheets:Array<{name:string, rows:string[], _pageBase:number}>}>}
 */
let _xlsx = null
async function loadXlsx() {
  if (_xlsx) return _xlsx
  const m = await import('xlsx')
  _xlsx = m.default || m
  return _xlsx
}

export async function extractXlsx(buf) {
  try {
    const XLSX = await loadXlsx()
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const sheets = []
    let pageBase = 0
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      const tsv = XLSX.utils.sheet_to_tsv(ws, { blankrows: false, raw: false })
      const header = `工作表：${name}`
      const body = normalise(tsv)
      const rows = body ? [`${header}\n${body}`] : [header]
      sheets.push({ name, rows, _pageBase: pageBase })
      pageBase += rows.length
    }
    if (!sheets.length) sheets.push({ name: '(空工作簿)', rows: ['（空工作簿）'], _pageBase: 0 })
    return { sheets }
  } catch (e) {
    throw new Error(`XLSX 解析失败：${e.message}`)
  }
}

function normalise(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
