import { createAccountStore } from './accounts.mjs'
import { createAuthEventLog } from './auth-events.mjs'
import { createRateLimiter } from './rate-limit.mjs'
import { createAuthRouter } from './routes.mjs'
import { createInstallSecretLoader } from './secret.mjs'
import { createSessionStore } from './sessions.mjs'

export function createTenantAuth({ dir, registry, paths, now = Date.now, log = () => {}, authFlag } = {}) {
  const accounts = createAccountStore({ registry, paths, now, log })
  // 每安装一份的随机密钥（M5-2b 缺陷 3）：限速来源摘要与 CSRF 派生共用同一把，
  // 惰性生成——关闭状态下只看平台状态不会落盘。
  const secret = createInstallSecretLoader({ dir, now, log })
  const installSecret = () => secret.load()
  const sessions = createSessionStore({ registry, paths, installSecret, now, log })
  const limiter = createRateLimiter({ dir, installSecret, now, log })
  const events = createAuthEventLog({ paths, now, log })
  const router = createAuthRouter({
    authFlag,
    registry,
    accountStore: accounts,
    sessionStore: sessions,
    rateLimiter: limiter,
    eventLog: events,
    log,
  })

  // 密钥报警（M5-2b 缺陷 3）：只在已经生成过密钥时报告；未生成就不落盘、不报警。
  function secretAlerts() {
    const state = secret.status()
    if (!state) return null
    return { regeneratedThisRun: state.regenerated, permissionHardened: state.hardened !== false }
  }

  return Object.freeze({
    accounts,
    sessions,
    limiter,
    events,
    router,
    secret,
    summary() {
      const flag = authFlag()
      return {
        enabled: flag.enabled,
        reason: flag.reason,
        accounts: accounts.countAllAccounts(),
        alerts: { ...events.summary(), secret: secretAlerts() },
      }
    },
  })
}
