import fs from 'node:fs'
import path from 'node:path'

import { createTenantAuth } from './auth/index.mjs'
import { createTenantContextMonitor } from './tenant-context.mjs'
import { paperclipLoopbackOnly } from './paperclip-gateway.mjs'
import { createTenantPaths } from './tenant-paths.mjs'
import { createTenantRegistry } from './tenant-registry.mjs'

const FLAG_MAX_AGE_MS = 5000

function readConfig(file, log) {
  if (!fs.existsSync(file)) return { config: null, error: null, reason: 'missing' }
  try {
    return { config: JSON.parse(fs.readFileSync(file, 'utf8')), error: null, reason: 'ok' }
  } catch (error) {
    log(`[tenancy] 多租户开关损坏，按关闭处理：${String(error?.message || error)}`)
    return { config: null, error, reason: 'corrupt' }
  }
}

export function createTenancy({ dir, now = Date.now, log = () => {}, paperclipBaseUrl, companyIdFile } = {}) {
  const flagFile = path.join(dir, 'multitenant.json')
  const registry = createTenantRegistry({ dir, now, log, companyIdFile })
  const context = createTenantContextMonitor()
  const paths = createTenantPaths({ dir, registry })
  let cachedConfig = null
  let cachedAt = 0

  function config() {
    const current = now()
    if (cachedConfig && current - cachedAt <= FLAG_MAX_AGE_MS) return cachedConfig
    cachedAt = current
    cachedConfig = readConfig(flagFile, log)
    return cachedConfig
  }

  function flag() {
    const current = config()
    if (current.reason === 'missing') return { enabled: false, reason: 'missing' }
    if (current.reason === 'corrupt') return { enabled: false, reason: 'corrupt' }
    return current.config?.enabled === true ? { enabled: true, reason: 'on' } : { enabled: false, reason: 'off' }
  }

  function authFlag() {
    const root = flag()
    if (!root.enabled) return { enabled: false, reason: root.reason === 'on' ? 'parent_off' : root.reason }
    const current = config()
    const authEnabled = current.config?.auth?.enabled
    return authEnabled === true ? { enabled: true, reason: 'on' } : { enabled: false, reason: 'off' }
  }

  function effectiveFlag() {
    const current = flag()
    if (current.enabled && !paperclipLoopbackOnly(paperclipBaseUrl)) return { enabled: false, reason: 'paperclip_not_loopback' }
    return current
  }

  function warnIfPaperclipNotLoopback() {
    if (!paperclipLoopbackOnly(paperclipBaseUrl)) log(`[tenancy] 警告：PAPERCLIP 不是回环地址：${paperclipBaseUrl}`)
  }

  const auth = createTenantAuth({
    dir,
    registry,
    paths,
    now,
    log,
    authFlag,
  })

  function platformView() {
    const current = effectiveFlag()
    const list = registry.list().map((item) => ({
      id: item.id,
      slug: item.slug,
      displayName: item.displayName,
      kind: item.kind,
      status: item.status,
      paperclipCompanyId8: item.paperclipCompanyId ? item.paperclipCompanyId.slice(0, 8) : null,
    }))
    return {
      enabled: current.enabled,
      reason: current.reason,
      companies: list,
      gateway: { paperclipLoopbackOnly: paperclipLoopbackOnly(paperclipBaseUrl) },
      ignoredClientHints: context.stats().ignoredClientHints,
      registry: {
        corrupt: registry.meta().corrupt,
        missing: registry.meta().missing,
        legacyPaperclipMissing: !registry.meta().paperclipCompanyId,
      },
      auth: auth.summary(),
    }
  }

  return Object.freeze({
    flag,
    effectiveFlag,
    platformView,
    registry,
    paths,
    auth,
    resolveTenantContext(req) {
      return context.resolve(req, { flag: effectiveFlag, registry })
    },
    warnIfPaperclipNotLoopback,
  })
}
