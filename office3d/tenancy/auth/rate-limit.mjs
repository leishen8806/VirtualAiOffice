import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const WINDOW_MS = 15 * 60 * 1000
const ACCOUNT_LIMIT = 5
const SOURCE_LIMIT = 20
const MAX_BACKOFF_MS = 15 * 60 * 1000

function sha(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

function accountDigest(companyId, username) {
  return sha(`account:${companyId}:${String(username || '').toLowerCase()}`)
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(temp, file)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createRateLimiter({ dir, installSecret, now = Date.now, log = () => {} } = {}) {
  const file = path.join(dir, 'multitenant', 'auth-rate-limit.json')

  // 来源摘要用每安装一份的随机密钥（见 secret.mjs）；同一安装内稳定、不跨月轮换，
  // 因此重启后旧摘要依然命中，限速状态不会因为密钥变化而丢失。
  function secretKey() {
    return typeof installSecret === 'function' ? installSecret().key : Buffer.alloc(0)
  }

  function sourceDigest(remoteAddress) {
    return crypto.createHmac('sha256', secretKey()).update(String(remoteAddress || '')).digest('hex')
  }

  function load() {
    if (!fs.existsSync(file)) return { accounts: {}, sources: {} }
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      return {
        accounts: raw && typeof raw.accounts === 'object' ? raw.accounts : {},
        sources: raw && typeof raw.sources === 'object' ? raw.sources : {},
      }
    } catch (error) {
      log(`[auth] 限速文件损坏，按空状态处理：${String(error?.message || error)}`)
      return { accounts: {}, sources: {} }
    }
  }

  function cleanEntry(entry, nowMs) {
    const attempts = Array.isArray(entry?.attempts) ? entry.attempts.filter((ts) => Number.isFinite(ts) && nowMs - ts <= WINDOW_MS) : []
    const lockUntil = Number.isFinite(entry?.lockUntil) && entry.lockUntil > nowMs ? entry.lockUntil : 0
    return { attempts, lockUntil }
  }

  function save(state, nowMs) {
    const next = { accounts: {}, sources: {} }
    for (const [key, value] of Object.entries(state.accounts || {})) {
      const cleaned = cleanEntry(value, nowMs)
      if (cleaned.attempts.length || cleaned.lockUntil) next.accounts[key] = cleaned
    }
    for (const [key, value] of Object.entries(state.sources || {})) {
      const cleaned = cleanEntry(value, nowMs)
      if (cleaned.attempts.length || cleaned.lockUntil) next.sources[key] = cleaned
    }
    writeJsonAtomic(file, next)
  }

  function getDigests({ companyId, username, remoteAddress }) {
    const nowMs = now()
    return {
      accountKey: accountDigest(companyId, username),
      sourceKey: sourceDigest(remoteAddress),
      nowMs,
    }
  }

  function blocked(entry, nowMs) {
    const cleaned = cleanEntry(entry, nowMs)
    return cleaned.lockUntil > nowMs || cleaned.attempts.length >= ACCOUNT_LIMIT + 1
  }

  function status({ companyId, username, remoteAddress }) {
    const state = load()
    const { accountKey, sourceKey, nowMs } = getDigests({ companyId, username, remoteAddress })
    const account = cleanEntry(state.accounts[accountKey], nowMs)
    const source = cleanEntry(state.sources[sourceKey], nowMs)
    return {
      blocked: account.lockUntil > nowMs || source.lockUntil > nowMs || account.attempts.length >= ACCOUNT_LIMIT + 1 || source.attempts.length >= SOURCE_LIMIT + 1,
      accountDigest: accountKey,
      sourceDigest: sourceKey,
    }
  }

  function failure({ companyId, username, remoteAddress }) {
    const state = load()
    const { accountKey, sourceKey, nowMs } = getDigests({ companyId, username, remoteAddress })
    const account = cleanEntry(state.accounts[accountKey], nowMs)
    const source = cleanEntry(state.sources[sourceKey], nowMs)
    account.attempts.push(nowMs)
    source.attempts.push(nowMs)
    const accountOver = Math.max(0, account.attempts.length - ACCOUNT_LIMIT)
    const sourceOver = Math.max(0, source.attempts.length - SOURCE_LIMIT)
    if (accountOver > 0) account.lockUntil = nowMs + Math.min(MAX_BACKOFF_MS, 60 * 1000 * (2 ** (accountOver - 1)))
    if (sourceOver > 0) source.lockUntil = nowMs + Math.min(MAX_BACKOFF_MS, 60 * 1000 * (2 ** (sourceOver - 1)))
    state.accounts[accountKey] = account
    state.sources[sourceKey] = source
    save(state, nowMs)
    return {
      blocked: account.attempts.length >= ACCOUNT_LIMIT + 1 || source.attempts.length >= SOURCE_LIMIT + 1 || account.lockUntil > nowMs || source.lockUntil > nowMs,
      sourceDigest: sourceKey,
      accountDigest: accountKey,
    }
  }

  function success({ companyId, username, remoteAddress }) {
    const state = load()
    const { accountKey, sourceKey, nowMs } = getDigests({ companyId, username, remoteAddress })
    delete state.accounts[accountKey]
    state.sources[sourceKey] = cleanEntry(state.sources[sourceKey], nowMs)
    save(state, nowMs)
    return {
      sourceDigest: sourceKey,
      accountDigest: accountKey,
    }
  }

  // 董事会本机解锁（tools/tenancy-admin.mjs unlock）：清掉该账号的失败计数与锁定期。
  function unlock({ companyId, username }) {
    const state = load()
    const key = accountDigest(companyId, username)
    const cleared = Boolean(state.accounts[key])
    delete state.accounts[key]
    save(state, now())
    return { cleared }
  }

  return Object.freeze({
    status,
    failure,
    success,
    unlock,
    accountDigest,
    sourceDigest,
    WINDOW_MS,
    ACCOUNT_LIMIT,
    SOURCE_LIMIT,
    blocked,
  })
}
