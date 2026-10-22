import crypto from 'node:crypto'

const OWNER_RE = /^[a-z0-9_-]{1,40}$/
const MAX_BYTES = 64 * 1024
const WINDOW_MS = 60 * 1000
const WRITE_LIMIT = 60

function json(status, value) {
  return { status, body: value }
}

function safeOwner(ownerId) {
  return typeof ownerId === 'string' && OWNER_RE.test(ownerId)
}

function sameToken(provided, expected) {
  const actual = Buffer.from(String(provided || ''))
  const target = Buffer.from(String(expected || ''))
  return actual.length === target.length && actual.length > 0 && crypto.timingSafeEqual(actual, target)
}

function localRequest(ctx) {
  if (ctx?.lanUser === true || ctx?.wallScope === true) return false
  if (typeof ctx?.isLoopback === 'function' && !ctx.isLoopback(ctx.remoteAddress)) return false
  if (ctx?.isLoopback === undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ctx?.remoteAddress)) return false
  if (typeof ctx?.hostOk === 'function' && !ctx.hostOk(ctx.host)) return false
  if (ctx?.origin && typeof ctx.originOk === 'function' && !ctx.originOk(ctx.origin)) return false
  return true
}

function writeAllowed(ctx) {
  const now = typeof ctx.now === 'function' ? ctx.now() : 0
  const recent = Array.isArray(ctx.writeTimes) ? ctx.writeTimes.filter((at) => now - at < WINDOW_MS) : []
  if (recent.length >= WRITE_LIMIT) return { ok: false, recent }
  recent.push(now)
  return { ok: true, recent }
}

export function createHomeRoutes({ enabled = false, ownerId = 'board', token, store } = {}) {
  if (!safeOwner(ownerId)) throw new Error('invalid_owner_id')
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function' || typeof store.reset !== 'function') {
    throw new Error('store_required')
  }
  const writeTimes = []

  async function handle(ctx = {}) {
    const method = String(ctx.method || 'GET').toUpperCase()
    const path = String(ctx.path || '')
    if (enabled !== true) return json(404, { error: 'not found' })
    if (!localRequest({ ...ctx, writeTimes })) return json(403, { error: '仅本机可用' })
    if (path === '/town/home/session' && method === 'GET') return json(200, { token: String(token || ''), ownerId })
    if (path === '/town/home/layout' && method === 'GET') {
      try { return json(200, store.load(ownerId)) } catch { return json(500, { error: '个人空间读取失败' }) }
    }
    if (!['/town/home/save', '/town/home/reset'].includes(path)) return null
    if (method !== 'POST') return json(405, { error: '不支持' })
    if (!String(ctx.contentType || '').toLowerCase().startsWith('application/json')) return json(415, { error: '只接受 JSON' })
    if (ctx.bodyTooLarge === true || Buffer.byteLength(String(ctx.rawBody || ''), 'utf8') > MAX_BYTES) return json(413, { error: '内容太长' })
    if (!sameToken(ctx.homeToken, token)) return json(403, { error: '令牌不对' })
    const limited = writeAllowed({ ...ctx, writeTimes })
    writeTimes.splice(0, writeTimes.length, ...limited.recent)
    if (!limited.ok) return json(429, { error: '请求过于频繁' })
    let body
    try { body = JSON.parse(String(ctx.rawBody || '')) } catch { return json(400, { error: 'JSON 格式不对' }) }
    try {
      const result = path.endsWith('/reset')
        ? await store.reset(ownerId, { expectedRevision: body?.expectedRevision })
        : await store.save(ownerId, { placements: body?.placements, expectedRevision: body?.expectedRevision })
      if (result?.ok === true) return json(200, result)
      if (result?.code === 'revision_conflict') return json(409, { error: '版本冲突', layout: result.layout })
      if (result?.code === 'invalid_layout') return json(422, { error: '布置不合法', violations: result.violations || [] })
      if (result?.code === 'too_many') return json(422, { error: '摆放数量超过上限', violations: [] })
      return json(422, { error: '布置不合法', violations: [] })
    } catch { return json(500, { error: '个人空间写入失败' }) }
  }

  return Object.freeze({ handle })
}
