import crypto from 'node:crypto'
import fs from 'node:fs'

const IDLE_MS = 12 * 60 * 60 * 1000
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SESSIONS_PER_USER = 5

function writeJsonAtomic(file, value) {
  fs.mkdirSync(file.slice(0, Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/'))), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(temp, file)
}

function hashSid(sid) {
  return crypto.createHash('sha256').update(String(sid)).digest('hex')
}

function hashCsrf(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function validateSession(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid session record')
  if (!/^[a-f0-9]{64}$/.test(String(input.sidHash || ''))) throw new Error('invalid sid hash')
  if (!/^[a-z0-9_]+$/.test(String(input.userId || ''))) throw new Error('invalid session user')
  if (!/^[a-z0-9_]+$/.test(String(input.companyId || ''))) throw new Error('invalid session company')
  if (!['company_owner', 'company_member', 'company_viewer'].includes(input.role)) throw new Error('invalid session role')
  if (typeof input.createdAt !== 'string' || typeof input.lastSeen !== 'string') throw new Error('invalid session time')
  if (!/^[a-f0-9]{64}$/.test(String(input.csrfHash || ''))) throw new Error('invalid csrf hash')
  const csrfGen = Number.isInteger(input.csrfGen) && input.csrfGen > 0 ? input.csrfGen : 1
  return Object.freeze({
    sidHash: input.sidHash,
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    createdAt: input.createdAt,
    lastSeen: input.lastSeen,
    csrfHash: input.csrfHash,
    csrfGen,
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createSessionStore({ registry, paths, installSecret, now = Date.now, log = () => {} } = {}) {
  // CSRF token 由「每安装密钥 + sidHash + 代数」派生而非随机存明文（M5-2b 缺陷 4）：
  // 服务端只存摘要，会话接口可以重复算出同一个值，不再每次轮换导致多标签页互相作废。
  function csrfTokenFor(sidHash, gen) {
    const secret = typeof installSecret === 'function' ? installSecret().key : Buffer.alloc(0)
    return crypto.createHmac('sha256', secret).update(`csrf:${sidHash}:${gen}`).digest('base64url')
  }

  function generationOf(session) {
    return Number.isInteger(session?.csrfGen) && session.csrfGen > 0 ? session.csrfGen : 1
  }

  function fileFor(companyRef) {
    const company = registry.get(companyRef)
    if (!company) throw new Error('unknown company')
    return paths.tenantPath(company.id, 'auth', 'sessions.json')
  }

  function load(companyRef) {
    const company = registry.get(companyRef)
    if (!company) throw new Error('unknown company')
    const file = fileFor(company.id)
    if (!fs.existsSync(file)) return { company, file, sessions: [] }
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!Array.isArray(raw)) throw new Error('sessions store is not an array')
      return { company, file, sessions: raw.map((item) => validateSession(item)) }
    } catch (error) {
      log(`[auth] 会话文件损坏，按全部失效处理：${company.slug} ${String(error?.message || error)}`)
      return { company, file, sessions: [] }
    }
  }

  function save(bundle, sessions) {
    writeJsonAtomic(bundle.file, sessions)
    return sessions.map((item) => validateSession(item))
  }

  function prune(list, nowMs) {
    return list.filter((item) => {
      const createdAt = Date.parse(item.createdAt)
      const lastSeen = Date.parse(item.lastSeen)
      return Number.isFinite(createdAt) && Number.isFinite(lastSeen) && nowMs - createdAt <= ABSOLUTE_MS && nowMs - lastSeen <= IDLE_MS
    })
  }

  function createSession({ companyId, userId, role, currentSid } = {}) {
    const bundle = load(companyId)
    const nowIso = new Date(now()).toISOString()
    const next = prune(bundle.sessions.map((item) => clone(item)), now()).filter((item) => item.sidHash !== hashSid(currentSid || ''))
    const sid = crypto.randomBytes(32).toString('base64url')
    const sidHash = hashSid(sid)
    const csrfGen = 1
    const csrf = csrfTokenFor(sidHash, csrfGen)
    next.push({
      sidHash,
      userId,
      companyId,
      role,
      createdAt: nowIso,
      lastSeen: nowIso,
      csrfHash: hashCsrf(csrf),
      csrfGen,
    })
    const kept = []
    const userSessions = next.filter((item) => item.userId === userId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const overflow = Math.max(0, userSessions.length - MAX_SESSIONS_PER_USER)
    const drop = new Set(userSessions.slice(0, overflow).map((item) => item.sidHash))
    for (const item of next) if (!drop.has(item.sidHash)) kept.push(item)
    save(bundle, kept)
    return { sid, csrf }
  }

  function getSession(companyRef, sid, { touch = true } = {}) {
    if (!sid) return null
    const bundle = load(companyRef)
    const nowMs = now()
    const kept = prune(bundle.sessions.map((item) => clone(item)), nowMs)
    const sidHash = hashSid(sid)
    const session = kept.find((item) => item.sidHash === sidHash) || null
    if (touch && session) session.lastSeen = new Date(nowMs).toISOString()
    if (kept.length !== bundle.sessions.length || (touch && session)) save(bundle, kept)
    return session ? clone(session) : null
  }

  function revokeSid(companyRef, sid) {
    if (!sid) return false
    const bundle = load(companyRef)
    const sidHash = hashSid(sid)
    const kept = bundle.sessions.filter((item) => item.sidHash !== sidHash).map((item) => clone(item))
    if (kept.length === bundle.sessions.length) return false
    save(bundle, kept)
    return true
  }

  function revokeSidHash(companyRef, sidHash) {
    const bundle = load(companyRef)
    const kept = bundle.sessions.filter((item) => item.sidHash !== sidHash).map((item) => clone(item))
    if (kept.length === bundle.sessions.length) return false
    save(bundle, kept)
    return true
  }

  function revokeAllForUser(companyRef, userId, { exceptSidHash = null } = {}) {
    const bundle = load(companyRef)
    const kept = bundle.sessions.filter((item) => item.userId !== userId || (exceptSidHash && item.sidHash === exceptSidHash)).map((item) => clone(item))
    if (kept.length === bundle.sessions.length) return 0
    save(bundle, kept)
    return bundle.sessions.length - kept.length
  }

  function revokeAllForCompany(companyRef) {
    const bundle = load(companyRef)
    if (bundle.sessions.length === 0) return 0
    save(bundle, [])
    return bundle.sessions.length
  }

  // 只在登录成功与改口令成功时轮换：代数 +1 后旧 token 校验失败。
  function rotateCsrf(companyRef, sid) {
    const bundle = load(companyRef)
    const sidHash = hashSid(sid)
    const next = bundle.sessions.map((item) => clone(item))
    const session = next.find((item) => item.sidHash === sidHash)
    if (!session) return null
    session.csrfGen = generationOf(session) + 1
    const csrf = csrfTokenFor(sidHash, session.csrfGen)
    session.csrfHash = hashCsrf(csrf)
    session.lastSeen = new Date(now()).toISOString()
    save(bundle, next)
    return csrf
  }

  // 供会话接口重复返回「当前有效」的 token：从存储的代数重新派生，不轮换、不存明文。
  function csrfFor(companyRef, sid) {
    const session = getSession(companyRef, sid, { touch: false })
    if (!session) return null
    return csrfTokenFor(session.sidHash, generationOf(session))
  }

  return Object.freeze({
    createSession,
    getSession,
    revokeSid,
    revokeSidHash,
    revokeAllForUser,
    revokeAllForCompany,
    rotateCsrf,
    csrfFor,
    hashSid,
    hashCsrf,
    IDLE_MS,
    ABSOLUTE_MS,
  })
}
