/**
 * Plain text extractor: txt / md / csv / json / html.
 *
 * HTML is stripped to tag-free text via two regex passes only. No parser
 * dependency – if a user uploads a malicious HTML, the downstream model
 * boundary caps chars anyway. CSV is left verbatim (the TSV format is
 * readable by LLMs); JSON is pretty-printed for readability.
 *
 * @param {Buffer} buf
 * @param {{ext:string, mime:string}} opts
 * @returns {Array<{n:number,text:string}>}
 */
export function extractPlain(buf, { ext = '', mime = '' } = {}) {
  let text
  try {
    text = buf.toString('utf8')
  } catch (e) {
    throw new Error(`文本解码失败：${e.message}`)
  }
  if (/json/.test(mime) || ext === '.json') {
    try {
      const parsed = JSON.parse(text)
      text = JSON.stringify(parsed, null, 2)
    } catch {
      // Leave as-is for malformed JSON – raw text is still useful.
    }
  }
  if (/html/.test(mime) || ext === '.html' || ext === '.htm') {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  }
  const normalised = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const CHUNK = 3000
  const out = []
  for (let i = 0, n = 1; i < normalised.length; i += CHUNK, n++) {
    out.push({ n, text: normalised.slice(i, i + CHUNK) })
  }
  if (!out.length) out.push({ n: 1, text: '' })
  return out
}
