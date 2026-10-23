import fs from 'node:fs'
const LOG = process.env.VIS3_NET_LOG || ''
const ALLOWED = new Set(String(process.env.VIS3_ALLOWED_PORTS || '').split(',').filter(Boolean).map(Number))
const original = globalThis.fetch
globalThis.fetch = async function (input, init) {
  let url
  try { url = new URL(typeof input === 'string' ? input : input?.url) } catch { return original(input, init) }
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (!local || !ALLOWED.has(Number(url.port))) {
    try { if (LOG) fs.appendFileSync(LOG, JSON.stringify({ blocked: url.origin + url.pathname, at: new Date().toISOString() }) + '\n') } catch {}
    throw new Error('VIS3_NETWORK_BLOCKED ' + url.origin)
  }
  return original(input, init)
}
