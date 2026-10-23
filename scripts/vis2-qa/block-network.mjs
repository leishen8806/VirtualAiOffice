// VIS2-Q 隔离护栏：只允许访问 127.0.0.1/localhost 上白名单端口，其余一律阻断并记账。
// 用法: node --import scripts/vis2-qa/block-network.mjs <script>
import fs from 'node:fs'
const LOG = process.env.VIS2_NET_LOG || ''
const ALLOWED = new Set(String(process.env.VIS2_ALLOWED_PORTS || '').split(',').filter(Boolean).map(Number))
const original = globalThis.fetch
function log(entry) {
  if (!LOG) return
  try { fs.appendFileSync(LOG, JSON.stringify(entry) + '\n') } catch {}
}
globalThis.fetch = async function blockedFetch(input, init) {
  let url
  try { url = new URL(typeof input === 'string' ? input : input?.url) } catch { return original(input, init) }
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (!local || !ALLOWED.has(Number(url.port))) {
    log({ blocked: url.origin + url.pathname, at: new Date().toISOString() })
    throw new Error('VIS2_NETWORK_BLOCKED ' + url.origin + url.pathname)
  }
  return original(input, init)
}
