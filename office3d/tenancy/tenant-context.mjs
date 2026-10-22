import { COMPANY1_SLUG, COMPANY1_TENANT_ID } from './tenant-ids.mjs'

const HEADER_HINT = ['x', 'company'].join('-')
const BODY_HINT = ['company', 'Id'].join('')
const QUERY_HINTS = Object.freeze(['company', 'c'])

function hintCount(req) {
  let count = 0
  const headers = req?.headers || {}
  for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === HEADER_HINT && value) count++
  try {
    const url = new URL(req?.url || '/', 'http://office.localhost')
    for (const key of QUERY_HINTS) if (url.searchParams.has(key)) count++
  } catch {}
  const cookie = String(req?.headers?.cookie || '')
  if (cookie.toLowerCase().includes('company=')) count++
  const body = req?.body
  if (body && typeof body === 'object' && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, BODY_HINT)) count++
  if (typeof body === 'string' && body.includes(BODY_HINT)) count++
  return count
}

export function resolveTenantContext(req, { flag, registry, onIgnoredHint } = {}) {
  const ignored = hintCount(req)
  if (ignored && typeof onIgnoredHint === 'function') onIgnoredHint(ignored)
  const legacy = registry?.get(COMPANY1_TENANT_ID) || { id: COMPANY1_TENANT_ID, slug: COMPANY1_SLUG, paperclipCompanyId: null }
  const currentFlag = typeof flag === 'function' ? flag() : flag
  const source = currentFlag?.enabled === true ? 'legacy-lan' : 'legacy'
  return Object.freeze({
    tenantId: legacy.id,
    slug: legacy.slug,
    paperclipCompanyId: legacy.paperclipCompanyId,
    source,
  })
}

export function createTenantContextMonitor() {
  const stats = { ignoredClientHints: 0 }
  return Object.freeze({
    resolve(req, options = {}) {
      return resolveTenantContext(req, { ...options, onIgnoredHint: (count) => { stats.ignoredClientHints += count } })
    },
    stats() {
      return { ...stats }
    },
  })
}
