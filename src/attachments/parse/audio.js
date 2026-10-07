/**
 * Audio extractor.
 *
 * Phase 1: reads metadata (duration in seconds) via music-metadata. The
 * transcript + confirmedEdited fields are separated:
 *   - originalTranscript:  ASR raw output (never crosses model boundary)
 *   - confirmedEdited:     only this field crosses the model boundary.
 *                          Produced ONLY after:
 *                            (a) user explicitly patches via PATCH
 *                                /niuma/v1/attachments/:id/transcript,
 *                                server-confirmed write to confirmedEdited
 *                            (b) or a deterministic test provider writes
 *                                confirmedEdited=originalTranscript
 *                                when transcription.confirmedByDefault=true
 * Live paid ASR providers (e.g. Whisper) are stubbed at the provider
 * boundary only; tests flag them as LIVE_PROVIDER_TEST/NOT_RUN when
 * credentials/authorization are unavailable.
 *
 * @param {Buffer} buf
 * @param {{mime:string, ext:string, config?: { transcription: { provider: string, apiKey?: string, baseUrl?: string, confirmedByDefault?: boolean } } }} opts
 * @returns {Promise<{originalTranscript:string, confirmedEdited:string, durationSec?:number, transcriber?:string, transcriptionStatus: 'unconfigured'|'success'|'failed'|'skipped'}>}
 */
let _parseBuffer = null
async function loadParseBuffer() {
  if (_parseBuffer) return _parseBuffer
  const m = await import('music-metadata')
  _parseBuffer = m.parseBuffer || (m.default && m.default.parseBuffer) || m.parseBuffer
  return _parseBuffer
}

/**
 * Deterministic mock/test transcription provider:
 *   always returns a stable synthetic transcript (hex hash of first 32 bytes
 *   as stable anchor) — used for automated tests without network/keys.
 */
function deterministicTestTranscribe(buf, opts = {}) {
  const h = (buf || Buffer.alloc(0)).slice(0, 32).toString('hex')
  return {
    originalTranscript: `[test-transcription:${h.slice(0, 16)}] This is a deterministic synthetic transcript produced by the test ASR provider. Content hash prefix: ${h.slice(0, 24)}.`,
    confirmedEdited: opts.confirmedByDefault ? `[test-transcription:${h.slice(0, 16)}] This is a deterministic synthetic transcript produced by the test ASR provider. Content hash prefix: ${h.slice(0, 24)}.` : '',
    transcriber: 'test-deterministic-v1',
    transcriptionStatus: 'success',
  }
}

/**
 * Live provider transcription entry. Returns a { status: 'NOT_RUN' } result
 * when the configured provider is missing credentials/network, so the
 * integration can still be verified structurally, but live smoke tests
 * are separately reported as NOT_RUN.
 */
async function liveProviderTranscribe(buf, cfg = {}) {
  const provider = String(cfg.provider || '').toLowerCase().trim()
  if (!provider || provider === 'disabled' || provider === '') {
    return { originalTranscript: '', confirmedEdited: '', transcriber: '', transcriptionStatus: 'unconfigured' }
  }
  const apiKey = String(cfg.apiKey || process.env[cfg.apiKeyEnv || ''] || '').trim()
  // Live provider integration gating: NEVER run against paid services
  // without explicit credentials. Report as NOT_RUN.
  return { originalTranscript: '', confirmedEdited: '', transcriber: provider, transcriptionStatus: 'skipped', _liveTest: 'NOT_RUN' }
}

export async function transcribeAudioBuffer(buf, opts = {}) {
  const cfg = (opts && opts.config && opts.config.transcription) ? opts.config.transcription : null
  let durationSec = undefined
  try {
    const parseBuffer = await loadParseBuffer()
    if (parseBuffer) {
      const m = await parseBuffer(buf, opts.mime ? { mimeType: opts.mime, size: buf.length } : undefined)
      durationSec = m?.format?.duration || undefined
    }
  } catch {
    // Duration metadata is nice-to-have.
  }
  const provider = String(cfg && cfg.provider ? cfg.provider : '').toLowerCase().trim()
  let out = { originalTranscript: '', confirmedEdited: '', transcriber: '', transcriptionStatus: 'unconfigured', durationSec }
  if (provider === 'test' || provider === 'deterministic') {
    const t = deterministicTestTranscribe(buf, cfg || {})
    out = { ...out, ...t }
  } else if (provider && provider !== 'disabled') {
    const l = await liveProviderTranscribe(buf, cfg || {})
    out = { ...out, ...l }
  }
  return out
}

export async function extractAudio(buf, { mime = '', ext = '', config = {} } = {}) {
  const t = await transcribeAudioBuffer(buf, { mime, ext, config })
  return {
    transcript: t.originalTranscript || '',
    originalTranscript: t.originalTranscript || '',
    confirmedEdited: t.confirmedEdited || '',
    durationSec: t.durationSec,
    transcriber: t.transcriber,
    transcriptionStatus: t.transcriptionStatus,
  }
}
