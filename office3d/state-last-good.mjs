import fs from 'node:fs'

const credential = key => /token|password|passphrase|secret|credential|authorization|cookie|csrf|jwt|bearer|access.?(code|key)|api.?key|访问码|令牌|口令|密钥/i.test(key)
export function stripStateCredentials(value) {
  if (Array.isArray(value)) return value.map(stripStateCredentials)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).filter(key => !credential(key)).map(key => [key, stripStateCredentials(value[key])]))
}

export function createLastGoodState({ file, now = Date.now, log = console.log }) {
  let saved = null, degraded = false, flight = null, writes = Promise.resolve()
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (value && !Array.isArray(value) && typeof value === 'object' && Number.isFinite(Date.parse(value.at)) &&
        Array.isArray(value.agents) && value.tasks && !value.stale?.active) saved = stripStateCredentials(value)
  } catch {}
  const persist = snapshot => {
    writes = writes.then(async () => {
      const temp = file + '.tmp'
      try {
        await fs.promises.writeFile(temp, JSON.stringify(snapshot), { mode: 0o600 })
        await fs.promises.rename(temp, file)
      } catch {
        await fs.promises.unlink(temp).catch(() => {})
        log('[state] 快照持久化失败，保留内存快照')
      }
    })
    return writes
  }
  const fallback = () => {
    if (!saved) {
      const error = new Error('STATE_UNAVAILABLE_NO_SNAPSHOT')
      error.status = 503
      error.reason = 'UPSTREAM_UNAVAILABLE'
      throw error
    }
    const ageMs = Math.max(0, now() - Date.parse(saved.at))
    if (!degraded) log(`[state] 降级：上游不可用，使用 ${Math.floor(ageMs / 60000)} 分钟前的快照`)
    degraded = true
    return { ...structuredClone(saved), actToken: '', stale: {
      active: true, since: saved.at, ageMs, reason: ageMs > 30 * 60000 ? 'STALE_DATA' : 'UPSTREAM_UNAVAILABLE',
    } }
  }
  return {
    async run(build) {
      if (!flight) flight = (async () => {
        let out
        try { out = await build() } catch { return fallback() }
        const snapshot = stripStateCredentials(out)
        delete snapshot.stale
        saved = snapshot
        await persist(snapshot)
        if (degraded) log('[state] 恢复')
        degraded = false
        return out
      })().finally(() => { flight = null })
      const value = await flight
      const copy = structuredClone(value)
      if (value._schedulerSource) Object.defineProperty(copy, '_schedulerSource', { value: structuredClone(value._schedulerSource), enumerable: false })
      return copy
    },
  }
}

export async function loadStateComponents({ get, company, backlog }) {
  const base = `/api/companies/${company}`
  const entries = [
    ['agents', `${base}/agents`, 'agents'], ['dashboard', `${base}/dashboard`, null],
    ['issues', `${base}/issues?status=todo,in_progress,in_review,blocked`, 'issues'],
    ['runs', `${base}/heartbeat-runs?limit=40`, 'runs'],
    ['approvals', `${base}/approvals?status=pending`, 'approvals'],
    ['activity', `${base}/activity?limit=500`, 'activity'],
    ['approvalsAll', `${base}/approvals`, 'approvals'], ['backlog', null, null],
  ]
  const gaps = [], values = {}
  await Promise.all(entries.map(async ([name, route, arrayKey], index) => {
    try {
      const raw = await (route ? get(route) : backlog())
      const rows = arrayKey ? (Array.isArray(raw) ? raw : raw?.[arrayKey]) : raw
      if (arrayKey ? !Array.isArray(rows) : name === 'backlog' ? !Array.isArray(rows) : !rows || !rows.tasks) throw new Error('INVALID_SOURCE')
      values[name] = rows
    } catch (error) {
      if (index < 3) throw error
      values[name] = []
      gaps.push({ source: name, reason: 'UPSTREAM_UNAVAILABLE' })
    }
  }))
  gaps.sort((a, b) => entries.findIndex(row => row[0] === a.source) - entries.findIndex(row => row[0] === b.source))
  return { ...values, gaps }
}

export function createBackgroundHealth({ get, company, buildHealth, schedule, now = Date.now, timeoutMs = 20000 }) {
  let report = null, refreshedAt = 0, attemptedAt = null, failed = false, flight = null
  function refresh() {
    if (flight || (attemptedAt !== null && now() - attemptedAt < 30000)) return flight
    attemptedAt = now()
    const controller = new AbortController()
    flight = (async () => {
      let timer
      try {
        const data = await Promise.race([
          Promise.all([
            get(`/api/companies/${company}/agents`, { signal: controller.signal }),
            get(`/api/companies/${company}/heartbeat-runs?limit=1000`, { signal: controller.signal }),
          ]),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('HEALTH_TIMEOUT')) }, timeoutMs) }),
        ])
        const agents = Array.isArray(data[0]) ? data[0] : data[0]?.agents
        const runs = Array.isArray(data[1]) ? data[1] : data[1]?.runs
        if (!Array.isArray(agents) || !Array.isArray(runs)) throw new Error('INVALID_SOURCE')
        report = buildHealth({ now: new Date(now()), agents, runs, schedule: schedule() })
        refreshedAt = now(); failed = false
      } catch { failed = true; controller.abort() }
      finally { clearTimeout(timer) }
    })().finally(() => { flight = null })
    return flight
  }
  return {
    refresh,
    read() {
      refresh()
      if (!report) return { at: null, level: 'warn', text: '健康数据暂不可用', stale: { active: true, since: null, ageMs: null, reason: 'NOT_LOADED' } }
      if (!failed && now() - refreshedAt < 30000) return structuredClone(report)
      return { ...structuredClone(report), stale: { active: true, since: report.at, ageMs: Math.max(0, now() - refreshedAt), reason: failed ? 'UPSTREAM_UNAVAILABLE' : 'STALE_DATA' } }
    },
  }
}
