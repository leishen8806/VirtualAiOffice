const MAX_BYTES = 8 * 1024 * 1024
const TIMEOUT_MS = 8000
const ALLOWED = Object.freeze(['issues', 'agents', 'heartbeat-runs', 'projects'])

function notFound() {
  const error = new Error('not found')
  error.status = 404
  return error
}

export function paperclipLoopbackOnly(baseUrl) {
  let parsed
  try {
    parsed = new URL(baseUrl)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  return parsed.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost' || host === '::1')
}

function validatePath(resourcePath, ownerCompanyId) {
  if (typeof resourcePath !== 'string' || !resourcePath.startsWith('/')) throw notFound()
  if (/%2e|%2f|%5c|%252e|%252f|%255c/i.test(resourcePath)) throw notFound()
  if (resourcePath.includes('..') || resourcePath.includes('//') || resourcePath.includes('\\')) throw notFound()
  const url = new URL(resourcePath, 'http://paperclip.local')
  if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === 'companyid')) throw notFound()
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'companies' || parts[2] !== ownerCompanyId || !ALLOWED.includes(parts[3])) throw notFound()
  return url.pathname + url.search
}

function assertOwnership(payload, ownerCompanyId) {
  if (Array.isArray(payload)) {
    if (payload.some((item) => !item || typeof item !== 'object' || item.companyId !== ownerCompanyId)) throw notFound()
    return payload
  }
  if (!payload || typeof payload !== 'object') return payload
  if (typeof payload.companyId === 'string' && payload.companyId !== ownerCompanyId) throw notFound()
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) assertOwnership(value, ownerCompanyId)
  }
  return payload
}

export function createGateway({ baseUrl, fetchImpl = fetch, ownerCompanyId, log = () => {} } = {}) {
  if (!paperclipLoopbackOnly(baseUrl)) throw new Error('paperclip base url must stay on loopback')
  const base = new URL(baseUrl)
  const stats = { denied: 0, ownershipRejected: 0, failures: 0 }

  async function get(resourcePath) {
    let normalized = ''
    let response
    try {
      normalized = validatePath(resourcePath, ownerCompanyId)
      response = await fetchImpl(new URL(normalized, base), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw notFound()
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength > MAX_BYTES) throw new Error('response too large')
      const payload = JSON.parse(bytes.toString('utf8'))
      return assertOwnership(payload, ownerCompanyId)
    } catch (error) {
      if (String(error?.message || error) === 'not found') {
        stats.denied++
        if (response?.ok) stats.ownershipRejected++
        throw notFound()
      }
      stats.failures++
      log(`[tenancy] gateway request failed: ${String(error?.message || error)}`)
      throw new Error('gateway unavailable')
    }
  }

  return Object.freeze({
    get,
    stats() {
      return { ...stats }
    },
  })
}
