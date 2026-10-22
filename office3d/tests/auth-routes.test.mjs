import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createTenancy } from '../tenancy/index.mjs'
import { hashPassword } from '../tenancy/auth/password.mjs'

const HOST = 'office.localhost:3200'
const ORIGIN = 'http://office.localhost:3200'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-routes-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

function setup(t, { enabled = true, authEnabled = true, log = () => {} } = {}) {
  const dir = tempDir(t)
  const companyIdFile = path.join(dir, 'company-id.txt')
  fs.writeFileSync(companyIdFile, '1a8d32a6-f9e9-4b9f-b39d-1765cc140326\n')
  fs.writeFileSync(path.join(dir, 'multitenant.json'), JSON.stringify({ enabled, auth: { enabled: authEnabled } }, null, 2))
  let nowMs = Date.parse('2026-10-20T10:00:00.000Z')
  const tenancy = createTenancy({
    dir,
    companyIdFile,
    paperclipBaseUrl: 'http://127.0.0.1:3100',
    now: () => nowMs,
    log,
  })
  const companyA = tenancy.registry.create({ slug: 'khmerx', displayName: 'KhmerX', kind: 'simulated', status: 'active', paperclipCompanyId: null })
  const companyB = tenancy.registry.create({ slug: 'drlife', displayName: 'DRLife', kind: 'simulated', status: 'active', paperclipCompanyId: null })
  const hostOk = (host) => host === HOST
  const originOk = (origin) => origin === ORIGIN

  async function createUser({
    company = companyA,
    username = 'owner.one',
    password = 'OwnerPassword123',
    role = 'company_owner',
    mustChangePassword = false,
  } = {}) {
    return tenancy.auth.accounts.createAccount({
      company: company.id,
      username,
      role,
      passwordRecord: await hashPassword(password),
      mustChangePassword,
    })
  }

  async function call({
    method = 'GET',
    pathname = '/',
    body = undefined,
    headers = {},
    remoteAddress = '10.0.0.9',
  } = {}) {
    const req = {
      method,
      headers: {
        host: HOST,
        ...headers,
      },
    }
    if (body !== undefined) req.bodyText = typeof body === 'string' ? body : JSON.stringify(body)
    return tenancy.auth.router.handle(req, new URL(`${ORIGIN}${pathname}`), { remoteAddress, hostOk, originOk })
  }

  return {
    dir,
    tenancy,
    companyA,
    companyB,
    createUser,
    call,
    setNow(value) {
      nowMs = typeof value === 'number' ? value : Date.parse(value)
    },
  }
}

// ── 浏览器 cookie 罐模拟（M5-2b 缺陷 1）：纯函数，按 RFC 6265 决定 cookie 该不该随请求发出 ──
function parseSetCookie(header) {
  const parts = String(header || '').split(';')
  const first = parts.shift() || ''
  const splitAt = first.indexOf('=')
  const name = splitAt > 0 ? first.slice(0, splitAt).trim() : ''
  const value = splitAt > 0 ? first.slice(splitAt + 1).trim() : ''
  const attributes = {}
  for (const part of parts) {
    const at = part.indexOf('=')
    const key = (at > 0 ? part.slice(0, at) : part).trim().toLowerCase()
    if (key) attributes[key] = at > 0 ? part.slice(at + 1).trim() : true
  }
  return { name, value, attributes }
}

// RFC 6265 §5.1.4 default-path
function defaultPath(requestPath) {
  const raw = String(requestPath || '')
  if (!raw.startsWith('/')) return '/'
  const lastSlash = raw.lastIndexOf('/')
  if (lastSlash === 0) return '/'
  return raw.slice(0, lastSlash)
}

// RFC 6265 §5.1.4 path-match
function pathMatches(cookiePath, requestPath) {
  const target = String(requestPath || '')
  const prefix = String(cookiePath || '')
  if (!target.startsWith(prefix)) return false
  if (prefix === '/') return true
  if (prefix.endsWith('/')) return true
  return target.charAt(prefix.length) === '/'
}

// Max-Age <= 0 / 过期的 Expires 表示删除 cookie，浏览器不会再发它。
function cookieExpired(setCookieHeader, nowMs = Date.now()) {
  const { attributes } = parseSetCookie(setCookieHeader)
  if (attributes['max-age'] !== undefined) {
    const seconds = Number(attributes['max-age'])
    if (!Number.isFinite(seconds) || seconds <= 0) return true
  }
  if (attributes.expires !== undefined) {
    const at = Date.parse(String(attributes.expires))
    if (Number.isFinite(at) && at <= nowMs) return true
  }
  return false
}

function cookieSentTo(setCookieHeader, requestPath, { sameSite = true, nowMs = Date.now() } = {}) {
  const { name, attributes } = parseSetCookie(setCookieHeader)
  if (!name) return false
  if (cookieExpired(setCookieHeader, nowMs)) return false
  if (String(attributes.samesite || '').toLowerCase() === 'strict' && sameSite === false) return false
  const cookiePath = typeof attributes.path === 'string' && attributes.path.startsWith('/') ? attributes.path : defaultPath(requestPath)
  return pathMatches(cookiePath, requestPath)
}

function createCookieJar() {
  const store = new Map()
  return {
    // 浏览器收到 Set-Cookie 就按名字覆盖；Max-Age=0 视为删除。
    accept(setCookieHeader) {
      const { name } = parseSetCookie(setCookieHeader)
      if (!name) return
      if (cookieExpired(setCookieHeader)) {
        store.delete(name)
        return
      }
      store.set(name, setCookieHeader)
    },
    headerFor(requestPath, options) {
      const pairs = []
      for (const [name, header] of store) {
        if (!cookieSentTo(header, requestPath, options)) continue
        pairs.push(`${name}=${parseSetCookie(header).value}`)
      }
      return pairs.join('; ')
    },
    names() {
      return [...store.keys()]
    },
  }
}

function bodyOf(reply) {
  return JSON.parse(reply.body)
}

function cookiePair(setCookie) {
  return String(setCookie || '').split(';', 1)[0]
}

function cookieValue(setCookie) {
  const match = String(setCookie || '').match(/^[^=]+=([^;]+)/)
  return match ? match[1] : ''
}

async function login(call, {
  company = 'khmerx',
  username = 'owner.one',
  password = 'OwnerPassword123',
  headers = {},
  remoteAddress = '10.0.0.9',
} = {}) {
  return call({
    method: 'POST',
    pathname: '/auth/login',
    body: { company, username, password, companyId: 'ignored', extra: true },
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-company': 'ignored',
      ...headers,
    },
    remoteAddress,
  })
}

// 需要会话 cookie 的接口都在 /c/<slug>/auth/… 之下（M5-2b 缺陷 1 方案 A）
test('auth router only matches the five task routes and disappears when disabled', (t) => {
  const enabled = setup(t)
  const match = enabled.tenancy.auth.router.match.bind(enabled.tenancy.auth.router)
  // 5 个精确模式：/auth/login + /c/:slug/auth/(session|logout|change-password) + /c/:slug/whoami
  assert.deepEqual(match('POST', '/auth/login'), { name: 'login' })
  assert.deepEqual(match('GET', '/c/khmerx/auth/session'), { name: 'session', slug: 'khmerx' })
  assert.deepEqual(match('POST', '/c/khmerx/auth/logout'), { name: 'logout', slug: 'khmerx' })
  assert.deepEqual(match('POST', '/c/khmerx/auth/change-password'), { name: 'change-password', slug: 'khmerx' })
  assert.deepEqual(match('GET', '/c/khmerx/whoami'), { name: 'whoami', slug: 'khmerx' })
  // 旧路径（cookie Path 覆盖不到，M5-2b 缺陷 1）不再被放行
  for (const [method, pathname] of [
    ['GET', '/auth/session'],
    ['POST', '/auth/logout'],
    ['POST', '/auth/change-password'],
    ['GET', '/state'],
    ['POST', '/auth/register'],
    ['GET', '/c/khmerx/state'],
    ['GET', '/c/khmerx/auth/'],
    ['POST', '/c/khmerx/auth/session'],
    ['GET', '/c/khmerx/auth/logout'],
    ['GET', '/c/khmerx/whoami/extra'],
    ['GET', '/c/khmerx/auth/session/extra'],
    ['GET', '/c/khmerx/auth/sessions'],
  ]) {
    assert.equal(match(method, pathname), null, `${method} ${pathname}`)
  }

  const disabled = setup(t, { enabled: true, authEnabled: false })
  for (const [method, pathname] of [['POST', '/auth/login'], ['GET', '/c/khmerx/auth/session'], ['GET', '/auth/session'], ['GET', '/c/khmerx/whoami']]) {
    assert.equal(disabled.tenancy.auth.router.match(method, pathname), null)
  }
})

test('login issues contract cookies, rotates sid and persists only hashes', async (t) => {
  const { tenancy, createUser, call, companyA } = setup(t)
  await createUser()

  const first = await login(call)
  assert.equal(first.status, 200)
  const firstBody = bodyOf(first)
  const firstCookie = first.headers['Set-Cookie']
  const sid1 = cookieValue(firstCookie)
  assert.equal(firstBody.ok, true)
  assert.equal(firstBody.role, 'company_owner')
  assert.equal(firstBody.displayName, 'owner.one')
  assert.match(firstCookie, /^vao_sid_khmerx=/)
  assert.match(firstCookie, /Path=\/c\/khmerx\//)
  assert.match(firstCookie, /HttpOnly/)
  assert.match(firstCookie, /SameSite=Strict/)
  assert.match(firstCookie, /Max-Age=604800/)
  assert.doesNotMatch(firstCookie, /Domain=/)
  assert.doesNotMatch(firstCookie, /Secure/)

  const session = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie: cookiePair(firstCookie) } })
  assert.equal(session.status, 200)
  assert.equal(bodyOf(session).company, 'khmerx')

  const second = await login(call, { headers: { cookie: cookiePair(firstCookie) } })
  const sid2 = cookieValue(second.headers['Set-Cookie'])
  assert.notEqual(sid1, sid2)

  const oldWhoami = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: cookiePair(firstCookie) } })
  assert.equal(oldWhoami.status, 401)

  const newWhoami = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: cookiePair(second.headers['Set-Cookie']) } })
  assert.equal(newWhoami.status, 200)
  assert.deepEqual(bodyOf(newWhoami), { role: 'company_owner', username: 'owner.one', company: 'khmerx' })

  const sessionsFile = tenancy.paths.tenantPath(companyA.id, 'auth', 'sessions.json')
  const stored = fs.readFileSync(sessionsFile, 'utf8')
  assert.doesNotMatch(stored, new RegExp(sid1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(stored, new RegExp(sid2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(stored, /sidHash/)
  assert.match(stored, /csrfHash/)
})

test('must-change-password flow blocks whoami, rotates csrf and revokes other sessions', async (t) => {
  const { createUser, call } = setup(t)
  await createUser({ mustChangePassword: true })

  const first = await login(call)
  const firstCookieHeader = first.headers['Set-Cookie']
  const firstCookiePair = cookiePair(firstCookieHeader)
  const second = await login(call, { remoteAddress: '10.0.0.10' })
  const secondCookieHeader = second.headers['Set-Cookie']
  const secondCookiePair = cookiePair(secondCookieHeader)

  const whoamiBlocked = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: secondCookiePair } })
  assert.equal(whoamiBlocked.status, 403)
  assert.equal(bodyOf(whoamiBlocked).error, '需先修改口令')

  const session = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie: secondCookiePair } })
  const csrf = bodyOf(session).csrf
  assert.ok(csrf)

  const changed = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: {
      cookie: secondCookiePair,
      origin: 'http://office.localhost:3200',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': csrf,
    },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'OwnerPassword456' },
  })
  assert.equal(changed.status, 200)
  assert.ok(bodyOf(changed).csrf)

  const oldSession = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie: firstCookiePair } })
  assert.equal(oldSession.status, 401)

  const currentWhoami = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: secondCookiePair } })
  assert.equal(currentWhoami.status, 200)
  assert.equal(bodyOf(currentWhoami).username, 'owner.one')
})

test('csrf checks reject missing origin, cross-site, wrong content type and oversized json with one response shape', async (t) => {
  const { createUser, call } = setup(t)
  await createUser()

  const loggedIn = await login(call)
  const cookie = cookiePair(loggedIn.headers['Set-Cookie'])
  const session = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie } })
  const csrf = bodyOf(session).csrf

  const missingOrigin = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/logout',
    headers: {
      cookie,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': csrf,
    },
  })
  const crossSite = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/logout',
    headers: {
      cookie,
      origin: 'http://office.localhost:3200',
      'content-type': 'application/json',
      'sec-fetch-site': 'cross-site',
      'x-csrf-token': csrf,
    },
  })
  const wrongType = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: {
      cookie,
      origin: 'http://office.localhost:3200',
      'content-type': 'text/plain',
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': csrf,
    },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'OwnerPassword456' },
  })
  const tooLarge = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: {
      cookie,
      origin: 'http://office.localhost:3200',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': csrf,
    },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'x'.repeat(9000) },
  })
  for (const reply of [missingOrigin, crossSite, wrongType, tooLarge]) {
    assert.equal(reply.status, 403)
    assert.deepEqual(bodyOf(reply), { error: '拒绝' })
  }
})

test('login failures stay uniform, account and source limits lock then recover, and digests hide IPs', async (t) => {
  const { dir, createUser, call, setNow } = setup(t)
  await createUser()

  const wrongDurations = []
  const missingDurations = []
  for (let i = 0; i < 3; i++) {
    let started = process.hrtime.bigint()
    const wrong = await login(call, { password: 'WrongPassword123', remoteAddress: `10.0.0.${20 + i}` })
    wrongDurations.push(Number(process.hrtime.bigint() - started))
    started = process.hrtime.bigint()
    const missing = await login(call, { username: `ghost${i}.x`, password: 'WrongPassword123', remoteAddress: `10.0.0.${30 + i}` })
    missingDurations.push(Number(process.hrtime.bigint() - started))
    assert.equal(wrong.status, 401)
    assert.equal(missing.status, 401)
    assert.deepEqual(bodyOf(wrong), bodyOf(missing))
  }
  wrongDurations.sort((a, b) => a - b)
  missingDurations.sort((a, b) => a - b)
  const wrongMedian = wrongDurations[Math.floor(wrongDurations.length / 2)]
  const missingMedian = missingDurations[Math.floor(missingDurations.length / 2)]
  const ratio = wrongMedian > missingMedian ? wrongMedian / missingMedian : missingMedian / wrongMedian
  assert.ok(ratio < 2.5, `login timing ratio too large: ${ratio}`)

  setNow('2026-10-20T10:16:10.000Z')
  for (let i = 0; i < 5; i++) {
    const reply = await login(call, { password: 'WrongPassword123', remoteAddress: '10.0.0.50' })
    assert.equal(reply.status, 401)
  }
  const sixth = await login(call, { password: 'WrongPassword123', remoteAddress: '10.0.0.50' })
  assert.equal(sixth.status, 429)
  assert.deepEqual(bodyOf(sixth), { error: '凭据无效或暂不可登录' })

  setNow('2026-10-20T10:32:20.000Z')
  const recovered = await login(call, { remoteAddress: '10.0.0.50' })
  assert.equal(recovered.status, 200)

  setNow('2026-10-20T10:48:30.000Z')
  for (let i = 0; i < 20; i++) {
    const reply = await login(call, { username: `ghost${i}.x`, password: 'WrongPassword123', remoteAddress: '10.0.0.77' })
    assert.equal(reply.status, 401)
  }
  const sourceLocked = await login(call, { username: 'ghost-cap.x', password: 'WrongPassword123', remoteAddress: '10.0.0.77' })
  assert.equal(sourceLocked.status, 429)

  const limiterFile = path.join(dir, 'multitenant', 'auth-rate-limit.json')
  const limiter = fs.readFileSync(limiterFile, 'utf8')
  assert.doesNotMatch(limiter, /10\.0\.0\./)
  assert.match(limiter, /[a-f0-9]{64}/)
})

test('sessions cap at five, expire on idle or company pause, and cross-company probes return 404', async (t) => {
  const { tenancy, companyA, createUser, call, setNow } = setup(t)
  await createUser()

  const cookies = []
  for (let i = 0; i < 6; i++) {
    const reply = await login(call, { remoteAddress: `10.0.0.${100 + i}` })
    assert.equal(reply.status, 200)
    cookies.push(cookiePair(reply.headers['Set-Cookie']))
  }
  assert.equal(cookies.length, 6)

  const oldest = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: cookies[0] } })
  const newest = await call({ method: 'GET', pathname: '/c/khmerx/whoami', headers: { cookie: cookies[5] } })
  assert.equal(oldest.status, 401)
  assert.equal(newest.status, 200)

  const crossCompany = await call({ method: 'GET', pathname: '/c/drlife/whoami', headers: { cookie: cookies[5] } })
  assert.equal(crossCompany.status, 404)
  assert.deepEqual(bodyOf(crossCompany), { error: 'not found' })

  setNow('2026-10-20T22:00:00.001Z')
  const idleExpired = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie: cookies[5] } })
  assert.equal(idleExpired.status, 401)

  const relogin = await login(call, { remoteAddress: '10.0.0.250' })
  const activeCookie = cookiePair(relogin.headers['Set-Cookie'])
  const activeAccount = tenancy.auth.accounts.getAccount(companyA.id, 'owner.one').account
  tenancy.registry.transition(companyA.id, 'paused', { expectedVersion: companyA.version })
  const paused = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie: activeCookie } })
  assert.equal(paused.status, 401)
  assert.ok(activeAccount)
})

test('browser cookie jar reaches every session route and stops at company boundaries', async (t) => {
  const { createUser, call } = setup(t)
  await createUser({ mustChangePassword: true })
  const jar = createCookieJar()
  const addr = '10.3.0.9'

  const loginReply = await call({
    method: 'POST',
    pathname: '/auth/login',
    body: { company: 'khmerx', username: 'owner.one', password: 'OwnerPassword123' },
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    remoteAddress: addr,
  })
  assert.equal(loginReply.status, 200)
  const setCookie = loginReply.headers['Set-Cookie']
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  assert.match(setCookie, /Path=\/c\/khmerx\//)
  jar.accept(setCookie)

  const probes = [
    ['POST', '/auth/login'],
    ['GET', '/c/khmerx/auth/session'],
    ['GET', '/c/khmerx/whoami'],
    ['POST', '/c/khmerx/auth/change-password'],
    ['POST', '/c/khmerx/auth/logout'],
    ['GET', '/auth/session'],
    ['POST', '/auth/logout'],
    ['POST', '/auth/change-password'],
    ['GET', '/c/drlife/auth/session'],
    ['GET', '/c/drlife/whoami'],
  ]
  console.log('cookie jar report（M5-2b 缺陷 1 方案 A）')
  for (const [method, pathname] of probes) console.log(`  ${method} ${pathname} -> ${jar.headerFor(pathname) ? 'cookie sent' : 'no cookie'}`)

  // 需要会话的接口，cookie 罐都必须把 cookie 发出去（旧路径发不出去，跨公司也发不出去）
  for (const pathname of ['/c/khmerx/auth/session', '/c/khmerx/whoami', '/c/khmerx/auth/change-password', '/c/khmerx/auth/logout']) {
    assert.notEqual(jar.headerFor(pathname), '', `cookie missing for ${pathname}`)
  }
  for (const pathname of ['/auth/session', '/auth/logout', '/auth/change-password', '/c/drlife/auth/session', '/c/drlife/whoami']) {
    assert.equal(jar.headerFor(pathname), '', `cookie leaked to ${pathname}`)
  }

  const sessionReply = await call({
    method: 'GET',
    pathname: '/c/khmerx/auth/session',
    headers: { cookie: jar.headerFor('/c/khmerx/auth/session') },
    remoteAddress: addr,
  })
  assert.equal(sessionReply.status, 200)
  const csrf = bodyOf(sessionReply).csrf

  // mustChangePassword：改口令之前 whoami 仍然 403
  const blocked = await call({
    method: 'GET',
    pathname: '/c/khmerx/whoami',
    headers: { cookie: jar.headerFor('/c/khmerx/whoami') },
    remoteAddress: addr,
  })
  assert.equal(blocked.status, 403)

  const changed = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: {
      cookie: jar.headerFor('/c/khmerx/auth/change-password'),
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': csrf,
    },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'OwnerPassword456' },
    remoteAddress: addr,
  })
  assert.equal(changed.status, 200)

  const whoami = await call({
    method: 'GET',
    pathname: '/c/khmerx/whoami',
    headers: { cookie: jar.headerFor('/c/khmerx/whoami') },
    remoteAddress: addr,
  })
  assert.equal(whoami.status, 200)
  assert.equal(bodyOf(whoami).username, 'owner.one')

  const logout = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/logout',
    headers: {
      cookie: jar.headerFor('/c/khmerx/auth/logout'),
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': bodyOf(changed).csrf,
    },
    remoteAddress: addr,
  })
  assert.equal(logout.status, 200)
  assert.equal(cookieSentTo(logout.headers['Set-Cookie'], '/c/khmerx/whoami'), false)
  jar.accept(logout.headers['Set-Cookie'])
  assert.equal(jar.headerFor('/c/khmerx/whoami'), '')
  assert.deepEqual(jar.names(), [])
})

test('change-password old-password failures share the login account limiter and recover', async (t) => {
  const { tenancy, companyA, createUser, call, setNow } = setup(t)
  await createUser({ username: 'owner.one' })
  await createUser({ username: 'other.one' })

  const started = await login(call, { username: 'owner.one', remoteAddress: '10.4.0.9' })
  const cookie = cookiePair(started.headers['Set-Cookie'])
  const csrf = bodyOf(started).csrf

  const attempt = ({ oldPassword, newPassword = 'OwnerPassword456', remoteAddress = '10.4.0.9' }) => call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: { oldPassword, newPassword },
    remoteAddress,
  })

  for (let i = 0; i < 5; i++) {
    const reply = await attempt({ oldPassword: `WrongPassword${i}xx` })
    assert.equal(reply.status, 401)
    assert.deepEqual(bodyOf(reply), { error: '凭据无效或暂不可登录' })
  }
  const sixth = await attempt({ oldPassword: 'WrongPassword5xx' })
  assert.equal(sixth.status, 429)
  assert.deepEqual(bodyOf(sixth), { error: '凭据无效或暂不可登录' })

  // 锁定期内正确旧口令也一样 429（与登录同一个按账号限速器）
  assert.equal((await attempt({ oldPassword: 'OwnerPassword123' })).status, 429)

  // 不影响其它账号：另一个账号、另一个来源照常能改口令
  const otherStarted = await login(call, { username: 'other.one', remoteAddress: '10.4.0.10' })
  assert.equal(otherStarted.status, 200)
  const otherChanged = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: {
      cookie: cookiePair(otherStarted.headers['Set-Cookie']),
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': bodyOf(otherStarted).csrf,
    },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'OtherPassword456' },
    remoteAddress: '10.4.0.10',
  })
  assert.equal(otherChanged.status, 200)

  const auditDir = tenancy.paths.tenantPath(companyA.id, 'audit')
  const auditText = fs.readdirSync(auditDir).filter((name) => name.startsWith('auth-')).map((name) => fs.readFileSync(path.join(auditDir, name), 'utf8')).join('\n')
  assert.match(auditText, /password_change_fail/)
  assert.match(auditText, /login_locked/)
  assert.doesNotMatch(auditText, /WrongPassword/)
  assert.doesNotMatch(auditText, /OwnerPassword/)

  // 15 分钟窗口过后自动恢复
  setNow('2026-10-20T10:20:00.000Z')
  const recovered = await attempt({ oldPassword: 'OwnerPassword123', newPassword: 'OwnerPassword789' })
  assert.equal(recovered.status, 200)
})

test('session returns the same csrf token for both tabs and rotates only on password change', async (t) => {
  const { createUser, call } = setup(t)
  await createUser()
  const started = await login(call)
  const cookie = cookiePair(started.headers['Set-Cookie'])
  const loginCsrf = bodyOf(started).csrf

  const tabA = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie } })
  const tabB = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie } })
  assert.equal(tabA.status, 200)
  assert.equal(tabB.status, 200)
  const csrfA = bodyOf(tabA).csrf
  assert.equal(csrfA, bodyOf(tabB).csrf)
  assert.equal(csrfA, loginCsrf)

  const changed = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/change-password',
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-csrf-token': csrfA },
    body: { oldPassword: 'OwnerPassword123', newPassword: 'OwnerPassword456' },
  })
  assert.equal(changed.status, 200)
  const rotated = bodyOf(changed).csrf
  assert.notEqual(rotated, csrfA)

  const staleWrite = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/logout',
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-csrf-token': csrfA },
  })
  assert.equal(staleWrite.status, 403)
  const freshWrite = await call({
    method: 'POST',
    pathname: '/c/khmerx/auth/logout',
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-csrf-token': rotated },
  })
  assert.equal(freshWrite.status, 200)

  const afterLogout = await call({ method: 'GET', pathname: '/c/khmerx/auth/session', headers: { cookie } })
  assert.equal(afterLogout.status, 401)
})

test('login rejects cross-site and non-json posts without consuming the account failure budget', async (t) => {
  const { createUser, call } = setup(t)
  await createUser()
  const addr = '10.5.0.9'
  const body = { company: 'khmerx', username: 'owner.one', password: 'WrongPassword123' }

  const crossSite = await call({ method: 'POST', pathname: '/auth/login', body, headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, remoteAddress: addr })
  const noOrigin = await call({ method: 'POST', pathname: '/auth/login', body, headers: { 'content-type': 'application/json' }, remoteAddress: addr })
  const formPost = await call({ method: 'POST', pathname: '/auth/login', body: 'company=khmerx&username=owner.one&password=WrongPassword123', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, remoteAddress: addr })
  for (const reply of [crossSite, noOrigin, formPost]) {
    assert.equal(reply.status, 403)
    assert.deepEqual(bodyOf(reply), { error: '拒绝' })
  }

  // 三次被拒的跨站请求没有烧掉账号额度：5 次真实错口令仍 401，第 6 次才 429
  for (let i = 0; i < 5; i++) {
    assert.equal((await login(call, { password: 'WrongPassword123', remoteAddress: addr })).status, 401)
  }
  assert.equal((await login(call, { password: 'WrongPassword123', remoteAddress: addr })).status, 429)
})

test('source digests are install scoped and cannot be derived from the data path or month', async (t) => {
  const logs = []
  const first = setup(t, { log: (line) => logs.push(String(line)) })
  const second = setup(t)
  const addr = '10.6.0.9'
  const keyFile = path.join(first.dir, 'multitenant', 'auth-secret.key')

  // 还没用到之前不落盘（关闭状态零写入）
  assert.equal(fs.existsSync(keyFile), false)
  const firstDigest = first.tenancy.auth.limiter.sourceDigest(addr)
  const secretHex = fs.readFileSync(keyFile, 'utf8').trim()
  assert.match(secretHex, /^[a-f0-9]{64}$/)

  assert.equal(first.tenancy.auth.limiter.sourceDigest(addr), firstDigest)
  assert.notEqual(first.tenancy.auth.limiter.sourceDigest('10.6.0.10'), firstDigest)
  assert.notEqual(second.tenancy.auth.limiter.sourceDigest(addr), firstDigest)

  // 旧公式（数据目录 + 月份）不再能推出摘要
  const legacy = crypto.createHmac('sha256', `${first.dir}:2026-10:source`).update(addr).digest('hex')
  assert.notEqual(firstDigest, legacy)

  await login(first.call, { password: 'WrongPassword123', remoteAddress: addr })
  const limiterText = fs.readFileSync(path.join(first.dir, 'multitenant', 'auth-rate-limit.json'), 'utf8')
  assert.doesNotMatch(limiterText, new RegExp(legacy))
  assert.doesNotMatch(limiterText, /10\.6\.0\.9/)

  // 密钥不出现在日志、密钥审计与限速文件里
  const auditText = fs.readFileSync(path.join(first.dir, 'multitenant', 'auth-secret-audit.jsonl'), 'utf8')
  assert.match(auditText, /auth_secret_regenerated/)
  for (const text of [logs.join('\n'), auditText]) {
    assert.doesNotMatch(text, new RegExp(secretHex))
    assert.doesNotMatch(text, /[a-f0-9]{64}/)
  }
  assert.equal(typeof first.tenancy.platformView().auth.alerts.secret.permissionHardened, 'boolean')
  assert.equal(typeof second.tenancy.platformView().auth.alerts.secret.permissionHardened, 'boolean')
  assert.equal(second.tenancy.platformView().auth.alerts.secret.regeneratedThisRun, true)
})

test('local unlock clears one account limiter without touching anything else', async (t) => {
  const { tenancy, companyA, createUser, call } = setup(t)
  await createUser()
  const addr = '10.7.0.9'
  for (let i = 0; i < 5; i++) {
    assert.equal((await login(call, { password: 'WrongPassword123', remoteAddress: addr })).status, 401)
  }
  assert.equal((await login(call, { password: 'WrongPassword123', remoteAddress: addr })).status, 429)
  assert.equal((await login(call, { remoteAddress: addr })).status, 429)

  assert.equal(tenancy.auth.limiter.unlock({ companyId: companyA.id, username: 'Owner.One' }).cleared, true)
  assert.equal(tenancy.auth.limiter.unlock({ companyId: companyA.id, username: 'owner.one' }).cleared, false)
  assert.equal((await login(call, { remoteAddress: addr })).status, 200)
})
