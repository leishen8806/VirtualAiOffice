import fs from 'node:fs'
import path from 'node:path'

function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, line + '\n')
}

function normalizeReason(reason) {
  if (!reason) return null
  return String(reason).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 240) || null
}

export function createAuthEventLog({ paths, now = Date.now, log = () => {} } = {}) {
  const state = { writeFailures: 0 }

  function fileFor(companyId) {
    const stamp = new Date(now()).toISOString().slice(0, 7)
    const base = paths.tenantPath(companyId, 'audit', `auth-${stamp}.jsonl`)
    if (!fs.existsSync(base)) return base
    const stat = fs.statSync(base)
    if (stat.size <= 5 * 1024 * 1024) return base
    return paths.tenantPath(companyId, 'audit', `auth-${stamp}-2.jsonl`)
  }

  function append({ companyId, event, userId = null, sourceDigest, result, reason = null } = {}) {
    const line = {
      at: new Date(now()).toISOString(),
      event,
      companyId,
      userId,
      sourceDigest: String(sourceDigest || '').slice(0, 64),
      result: String(result || 'unknown').slice(0, 32),
    }
    const normalizedReason = normalizeReason(reason)
    if (normalizedReason) line.reason = normalizedReason
    const encoded = JSON.stringify(line)
    const safeLine = encoded.length > 1024 ? JSON.stringify({ ...line, reason: normalizeReason(reason).slice(0, 80) }) : encoded
    try {
      appendLine(fileFor(companyId), safeLine)
      return true
    } catch (error) {
      state.writeFailures++
      log(`[auth] 审计写入失败：${String(error?.message || error)}`)
      return false
    }
  }

  return Object.freeze({
    append,
    summary() {
      return { writeFailures: state.writeFailures }
    },
  })
}
