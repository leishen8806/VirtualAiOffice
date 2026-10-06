/**
 * Audio extractor.
 *
 * Phase 1: reads metadata (duration in seconds) via music-metadata. The
 * transcript + confirmedEdited fields are left empty because server-side
 * ASR is not wired in yet.
 *
 * Model boundary contract:
 *   Only the `confirmedEdited` field EVER crosses into a model prompt
 *   for audio. If confirmedEdited is blank, the coordinator should
 *   surface a UI step asking the user to confirm/edit a transcript
 *   before attaching the audio to a message – or the model boundary
 *   will emit a placeholder asking the user to listen themselves.
 *
 * music-metadata is lazy-loaded because the underlying WASM + codec
 * modules add measurable startup cost for callers that never upload audio.
 *
 * @param {Buffer} buf
 * @param {{mime:string, ext:string}} opts
 * @returns {Promise<{transcript:string, confirmedEdited:string, durationSec?:number}>}
 */
let _parseBuffer = null
async function loadParseBuffer() {
  if (_parseBuffer) return _parseBuffer
  const m = await import('music-metadata')
  _parseBuffer = m.parseBuffer || (m.default && m.default.parseBuffer) || m.parseBuffer
  return _parseBuffer
}

export async function extractAudio(buf, { mime = '', ext = '' } = {}) {
  let durationSec = undefined
  try {
    const parseBuffer = await loadParseBuffer()
    if (parseBuffer) {
      const m = await parseBuffer(buf, mime ? { mimeType: mime, size: buf.length } : undefined)
      durationSec = m?.format?.duration || undefined
    }
  } catch {
    // Duration metadata is nice-to-have; we still surface the file so
    // the user can manually confirm the length is within 10 min later.
  }
  return {
    transcript: '',
    confirmedEdited: '',
    durationSec,
  }
}
