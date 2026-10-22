import { sameOriginWriteOk } from './csrf.mjs'
import { hashPassword, validatePassword, verifyPasswordOrDummy } from './password.mjs'

const MAX_JSON_BYTES = 8 * 1024
const AUTH_ERROR = Object.freeze({ error: '凭据无效或暂不可登录' })

function json(status, payload, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(payload),
  }
}

function cookieName(slug) {
  return `vao_sid_${slug}`
}

function buildSessionCookie(slug, sid, maxAge = 604800) {
  return `${cookieName(slug)}=${sid}; HttpOnly; SameSite=Strict; Path=/c/${slug}/; Max-Age=${maxAge}`
}

function clearSessionCookie(slug) {
  return `${cookieName(slug)}=; HttpOnly; SameSite=Strict; Path=/c/${slug}/; Max-Age=0`
}

function parseCookies(header) {
  const out = new Map()
  for (const part of String(header || '').split(/;\s*/)) {
    const splitAt = part.indexOf('=')
    if (splitAt <= 0) continue
    out.set(part.slice(0, splitAt), part.slice(splitAt + 1))
  }
  return out
}

async function readRawBody(req, maxBytes = MAX_JSON_BYTES) {
  if (typeof req.bodyText === 'string') {
    if (Buffer.byteLength(req.bodyText, 'utf8') > maxBytes) throw Object.assign(new Error('body too large'), { status: 413 })
    return req.bodyText
  }
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw Object.assign(new Error('body too large'), { status: 413 })
  }
  return raw
}

async function readJsonBody(req, maxBytes = MAX_JSON_BYTES) {
  const raw = await readRawBody(req, maxBytes)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw Object.assign(new Error('invalid json'), { status: 400 })
  }
}

// 需要会话 cookie 的三个接口必须落在 cookie 的 Path=/c/<slug>/ 作用域内（M5-2b 缺陷 1 方案 A）：
// RFC 6265 只把 cookie 发给 /c/<slug>/ 之下的请求，原来的 /auth/session、/auth/logout、
// /auth/change-password 在真实浏览器里根本收不到 cookie。这里仍然只放行精确的 5 个模式，
// 其余 /c/… 路径一律不放行。
const SCOPED_AUTH_ACTIONS = Object.freeze({ session: 'GET', logout: 'POST', 'change-password': 'POST' })

function matchRoute(method, pathname) {
  if (method === 'POST' && pathname === '/auth/login') return { name: 'login' }
  const scoped = pathname.match(/^\/c\/([a-z0-9-]+)\/auth\/(session|logout|change-password)$/)
  if (scoped && SCOPED_AUTH_ACTIONS[scoped[2]] === method) return { name: scoped[2], slug: scoped[1] }
  const whoami = pathname.match(/^\/c\/([a-z0-9-]+)\/whoami$/)
  if (method === 'GET' && whoami) return { name: 'whoami', slug: whoami[1] }
  return null
}

// 登录也是 POST：缺 Content-Type / 同源 Origin 这层，跨站表单能触发「登录 CSRF」并烧掉限速额度。
// 失败统一 403，且在读体与限速之前返回，因此不会计入账号失败次数。
function sameOriginJsonOk({ req, hostOk, originOk }) {
  const origin = req.headers.origin
  return Boolean(
    hostOk(req.headers.host) &&
    typeof origin === 'string' &&
    originOk(origin) &&
    String(req.headers['content-type'] || '').startsWith('application/json') &&
    String(req.headers['sec-fetch-site'] || '') !== 'cross-site',
  )
}

export function createAuthRouter({
  authFlag,
  registry,
  accountStore,
  sessionStore,
  rateLimiter,
  eventLog,
  log = () => {},
} = {}) {
  function enabled() {
    return authFlag().enabled === true
  }

  function resolveSession(req, slugHint = null) {
    const cookies = parseCookies(req.headers.cookie)
    const authCookies = [...cookies.entries()].filter(([name]) => name.startsWith('vao_sid_'))
    const mismatch = slugHint ? authCookies.some(([name]) => name !== cookieName(slugHint)) : false
    if (slugHint) {
      const sid = cookies.get(cookieName(slugHint)) || ''
      const company = registry.get(slugHint)
      if (!company) return { mismatch, company: null, session: null, sid: '', account: null, slug: slugHint }
      const session = sid ? sessionStore.getSession(company.id, sid) : null
      if (!session) return { mismatch, company, session: null, sid, account: null, slug: slugHint }
      const accountInfo = accountStore.getAccountById(company.id, session.userId)
      return { mismatch, company, session, sid, account: accountInfo.account, slug: company.slug }
    }
    for (const [name, sid] of authCookies) {
      const slug = name.slice('vao_sid_'.length)
      const company = registry.get(slug)
      if (!company) continue
      const session = sessionStore.getSession(company.id, sid)
      if (!session) continue
      const accountInfo = accountStore.getAccountById(company.id, session.userId)
      return { mismatch: false, company, session, sid, account: accountInfo.account, slug: company.slug }
    }
    return { mismatch: false, company: null, session: null, sid: '', account: null, slug: slugHint || null }
  }

  function ensureActiveAccount(state, { routeName }) {
    if (!state.company || !state.session) return json(401, { error: '未登录' })
    if (state.company.status !== 'active') {
      sessionStore.revokeAllForCompany(state.company.id)
      eventLog.append({ companyId: state.company.id, event: 'session_expired', userId: state.session.userId, sourceDigest: 'session', result: 'company_inactive' })
      return json(401, { error: '未登录' })
    }
    if (!state.account || state.account.status !== 'active') {
      sessionStore.revokeSid(state.company.id, state.sid)
      eventLog.append({ companyId: state.company.id, event: 'session_expired', userId: state.session.userId, sourceDigest: 'session', result: 'account_inactive' })
      return json(401, { error: '未登录' })
    }
    if (routeName === 'whoami' && state.account.mustChangePassword) return json(403, { error: '需先修改口令' })
    return null
  }

  async function handleLogin(req, remoteAddress, hostOk, originOk) {
    if (!sameOriginJsonOk({ req, hostOk, originOk })) return json(403, { error: '拒绝' })
    let body = null
    try {
      body = await readJsonBody(req)
    } catch (error) {
      return json(error.status || 400, { error: error.status === 413 ? '内容太长' : 'JSON 格式不对' })
    }
    const companySlug = String(body?.company || '').trim().toLowerCase()
    let username = 'invalid-user'
    let usernameValid = true
    try {
      username = accountStore.normalizeUsername(String(body?.username || ''))
    } catch {
      usernameValid = false
    }
    const password = String(body?.password || '')
    const company = registry.get(companySlug)
    const companyId = company?.id || `missing_${companySlug || 'company'}`
    const status = rateLimiter.status({ companyId, username, remoteAddress })
    if (status.blocked) {
      if (company) eventLog.append({ companyId: company.id, event: 'login_locked', userId: null, sourceDigest: status.sourceDigest, result: 'blocked' })
      return json(429, AUTH_ERROR)
    }
    const lookup = company ? accountStore.getAccount(company.id, username) : { corrupt: false, account: null }
    const matches = await verifyPasswordOrDummy(password, lookup.account?.passwordRecord)
    const valid = Boolean(usernameValid && company && company.status === 'active' && !lookup.corrupt && lookup.account && lookup.account.status === 'active' && matches)
    if (!valid) {
      const failure = rateLimiter.failure({ companyId, username, remoteAddress })
      if (company) {
        eventLog.append({ companyId: company.id, event: failure.blocked ? 'login_locked' : 'login_fail', userId: lookup.account?.id || null, sourceDigest: failure.sourceDigest, result: failure.blocked ? 'blocked' : 'denied', reason: lookup.corrupt ? 'accounts_corrupt' : 'invalid_credentials' })
      }
      return json(failure.blocked ? 429 : 401, AUTH_ERROR)
    }
    const success = rateLimiter.success({ companyId: company.id, username, remoteAddress })
    const priorSid = parseCookies(req.headers.cookie).get(cookieName(company.slug)) || ''
    if (priorSid) sessionStore.revokeSid(company.id, priorSid)
    const issued = sessionStore.createSession({ companyId: company.id, userId: lookup.account.id, role: lookup.account.role, currentSid: priorSid })
    eventLog.append({ companyId: company.id, event: 'login_ok', userId: lookup.account.id, sourceDigest: success.sourceDigest, result: 'ok' })
    return json(200, {
      ok: true,
      role: lookup.account.role,
      displayName: lookup.account.username,
      mustChangePassword: lookup.account.mustChangePassword,
      csrf: issued.csrf,
    }, {
      'Set-Cookie': buildSessionCookie(company.slug, issued.sid),
    })
  }

  async function handleLogout(req, slug, remoteAddress, hostOk, originOk) {
    const state = resolveSession(req, slug)
    const failure = ensureActiveAccount(state, { routeName: 'logout' })
    if (failure) return failure
    const digests = rateLimiter.status({ companyId: state.company.id, username: state.account.username, remoteAddress })
    if (!sameOriginWriteOk({ req, hostOk, originOk, csrfHash: state.session.csrfHash })) {
      eventLog.append({ companyId: state.company.id, event: 'csrf_denied', userId: state.session.userId, sourceDigest: digests.sourceDigest, result: 'denied' })
      return json(403, { error: '拒绝' })
    }
    sessionStore.revokeSid(state.company.id, state.sid)
    eventLog.append({ companyId: state.company.id, event: 'logout', userId: state.session.userId, sourceDigest: digests.sourceDigest, result: 'ok' })
    return json(200, { ok: true }, { 'Set-Cookie': clearSessionCookie(state.slug) })
  }

  // 只回「当前有效」的 CSRF token，不轮换（M5-2b 缺陷 4）：多标签页拿到的是同一个值，
  // 不会互相作废；服务端只存摘要，token 由安装密钥 + sidHash + 代数重新派生。
  async function handleSession(req, slug) {
    const state = resolveSession(req, slug)
    const failure = ensureActiveAccount(state, { routeName: 'session' })
    if (failure) return failure
    return json(200, {
      role: state.account.role,
      username: state.account.username,
      company: state.company.slug,
      mustChangePassword: state.account.mustChangePassword,
      csrf: sessionStore.csrfFor(state.company.id, state.sid),
    })
  }

  async function handleChangePassword(req, slug, remoteAddress, hostOk, originOk) {
    const state = resolveSession(req, slug)
    const failure = ensureActiveAccount(state, { routeName: 'change-password' })
    if (failure) return failure
    const limitKey = { companyId: state.company.id, username: state.account.username, remoteAddress }
    const digests = rateLimiter.status(limitKey)
    if (!sameOriginWriteOk({ req, hostOk, originOk, csrfHash: state.session.csrfHash })) {
      eventLog.append({ companyId: state.company.id, event: 'csrf_denied', userId: state.session.userId, sourceDigest: digests.sourceDigest, result: 'denied' })
      return json(403, { error: '拒绝' })
    }
    let body = null
    try {
      body = await readJsonBody(req)
    } catch (error) {
      return json(error.status === 413 ? 403 : 400, { error: error.status === 413 ? '拒绝' : 'JSON 格式不对' })
    }
    // 旧口令校验走与登录同一个按账号限速器（M5-2b 缺陷 2）：被劫持的会话不能无限爆破真口令。
    if (digests.blocked) {
      eventLog.append({ companyId: state.company.id, event: 'login_locked', userId: state.session.userId, sourceDigest: digests.sourceDigest, result: 'blocked' })
      return json(429, AUTH_ERROR)
    }
    const oldPassword = String(body?.oldPassword || '')
    const newPassword = String(body?.newPassword || '')
    const currentOk = await verifyPasswordOrDummy(oldPassword, state.account.passwordRecord)
    if (!currentOk) {
      const failed = rateLimiter.failure(limitKey)
      eventLog.append({ companyId: state.company.id, event: failed.blocked ? 'login_locked' : 'password_change_fail', userId: state.account.id, sourceDigest: failed.sourceDigest, result: failed.blocked ? 'blocked' : 'denied', reason: 'invalid_old_password' })
      return json(failed.blocked ? 429 : 401, AUTH_ERROR)
    }
    const weak = validatePassword(newPassword, state.account.username)
    if (weak) return json(400, { error: weak })
    const passwordRecord = await hashPassword(newPassword)
    const updated = accountStore.replacePassword(state.company.id, state.account.id, passwordRecord, { mustChangePassword: false, expectedVersion: state.account.version })
    const currentHash = sessionStore.hashSid(state.sid)
    sessionStore.revokeAllForUser(state.company.id, updated.id, { exceptSidHash: currentHash })
    const csrf = sessionStore.rotateCsrf(state.company.id, state.sid)
    const cleared = rateLimiter.success({ companyId: state.company.id, username: updated.username, remoteAddress })
    eventLog.append({ companyId: state.company.id, event: 'password_changed', userId: updated.id, sourceDigest: cleared.sourceDigest, result: 'ok' })
    return json(200, { ok: true, csrf })
  }

  async function handleWhoami(req, slug, remoteAddress) {
    const state = resolveSession(req, slug)
    if (state.mismatch) {
      const company = registry.get(slug)
      if (company) eventLog.append({ companyId: company.id, event: 'cross_company_denied', userId: null, sourceDigest: 'session', result: 'denied' })
      return json(404, { error: 'not found' })
    }
    if (!state.session) return json(401, { error: '未登录' })
    if (state.company?.slug !== slug) {
      if (state.company) eventLog.append({ companyId: state.company.id, event: 'cross_company_denied', userId: state.session.userId, sourceDigest: 'session', result: 'denied' })
      return json(404, { error: 'not found' })
    }
    const failure = ensureActiveAccount(state, { routeName: 'whoami' })
    if (failure) return failure
    return json(200, {
      role: state.account.role,
      username: state.account.username,
      company: state.company.slug,
    })
  }

  return Object.freeze({
    enabled,
    match(method, pathname) {
      return enabled() ? matchRoute(method, pathname) : null
    },
    async handle(req, url, { remoteAddress = '', hostOk, originOk } = {}) {
      const route = this.match(req.method, url.pathname)
      if (!route) return null
      try {
        if (route.name === 'login') return await handleLogin(req, remoteAddress, hostOk, originOk)
        if (route.name === 'logout') return await handleLogout(req, route.slug, remoteAddress, hostOk, originOk)
        if (route.name === 'session') return await handleSession(req, route.slug)
        if (route.name === 'change-password') return await handleChangePassword(req, route.slug, remoteAddress, hostOk, originOk)
        if (route.name === 'whoami') return await handleWhoami(req, route.slug, remoteAddress)
      } catch (error) {
        log(`[auth] route failed: ${String(error?.message || error)}`)
        return json(500, { error: '认证服务失败' })
      }
      return null
    },
    cookieName,
    buildSessionCookie,
    clearSessionCookie,
  })
}
