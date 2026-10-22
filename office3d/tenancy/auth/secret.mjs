import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// 每安装一份的 HMAC 密钥（M5-2b 缺陷 3）：限速的来源摘要与 CSRF 派生都用它。
// 用 crypto.randomBytes(32) 而不是「数据目录 + 月份」这类可推材料，避免任何能读到
// 限速文件的人对来源 IP 空间枚举还原。密钥只在首次需要时生成，功能关闭时不落盘。
const SECRET_BYTES = 32
const SECRET_PATTERN = /^[a-f0-9]{64}$/

function secretFile(dir) {
  return path.join(dir, 'multitenant', 'auth-secret.key')
}

function auditFile(dir) {
  return path.join(dir, 'multitenant', 'auth-secret-audit.jsonl')
}

// 原子写入：先写同目录临时文件再 rename，避免半截文件被当成有效密钥。
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, text, { mode: 0o600 })
  fs.renameSync(temp, file)
}

// Windows 下尽量只给当前用户读权限。失败不阻断运行，由 /platform/tenancy 报警。
function restrictPermissions(file) {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(file, 0o600)
      return true
    } catch {
      return false
    }
  }
  try {
    const user = process.env.USERNAME || process.env.USERDOMAIN
    if (!user) return false
    const result = spawnSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:R`], { timeout: 5000, windowsHide: true, stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

export function createInstallSecretLoader({ dir, now = Date.now, log = () => {} } = {}) {
  const file = secretFile(dir)
  let cached = null

  // 密钥审计：只记「何时、为何重新生成」，绝不写密钥内容。
  function record(event, reason) {
    try {
      fs.mkdirSync(path.dirname(auditFile(dir)), { recursive: true })
      fs.appendFileSync(auditFile(dir), JSON.stringify({ at: new Date(now()).toISOString(), event, reason: reason || null }) + '\n')
    } catch (error) {
      log(`[auth] 密钥审计写入失败：${String(error?.message || error)}`)
    }
  }

  function load() {
    if (cached) return cached
    let reason = 'missing'
    try {
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, 'utf8').trim()
        if (SECRET_PATTERN.test(text)) {
          cached = Object.freeze({ key: Buffer.from(text, 'hex'), file, regenerated: false, hardened: null })
          return cached
        }
        reason = 'corrupt'
        log('[auth] 认证密钥文件损坏，重新生成')
      }
    } catch (error) {
      reason = 'corrupt'
      log(`[auth] 认证密钥读取失败，重新生成：${String(error?.message || error)}`)
    }
    const key = crypto.randomBytes(SECRET_BYTES)
    writeAtomic(file, key.toString('hex') + '\n')
    const hardened = restrictPermissions(file)
    if (!hardened) log('[auth] 认证密钥权限收紧失败，请手工限制 multitenant/auth-secret.key 的访问')
    record('auth_secret_regenerated', reason)
    cached = Object.freeze({ key, file, regenerated: true, hardened })
    return cached
  }

  return Object.freeze({
    load,
    // 供 /platform/tenancy 报警：尚未生成时返回 null，不触发落盘。
    status() {
      return cached ? { regenerated: cached.regenerated, hardened: cached.hardened } : null
    },
  })
}
