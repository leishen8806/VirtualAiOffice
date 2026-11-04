import fs from 'node:fs'

const credential = key => /token|password|passphrase|secret|credential|authorization|cookie|csrf|jwt|bearer|access.?(code|key)|api.?key|访问码|令牌|口令|密钥/i.test(key)
export function stripStateCredentials(value) {
  if (Array.isArray(value)) return value.map(stripStateCredentials)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).filter(key => !credential(key)).map(key => [key, stripStateCredentials(value[key])]))
}

export function createLastGoodState({ file, now = Date.now, log = console.log, timeoutMs = 5000 }) {
  let saved = null, degraded = false, flight = null, flightStartedAt = 0, writes = Promise.resolve()
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
      if (!flight) {
        flightStartedAt = now()
        flight = (async () => {
        let out
        try { out = await build() } catch { return fallback() }
        const snapshot = stripStateCredentials(out)
        delete snapshot.stale
        saved = snapshot
        await persist(snapshot)
        if (degraded) log('[state] 恢复')
        degraded = false
        return out
        })().finally(() => { flight = null; flightStartedAt = 0 })
      }
      const remaining = Math.max(0, timeoutMs - (now() - flightStartedAt))
      if (remaining === 0) {
        const value = fallback()
        const copy = structuredClone(value)
        if (value._schedulerSource) Object.defineProperty(copy, '_schedulerSource', { value: structuredClone(value._schedulerSource), enumerable: false })
        return copy
      }
      let timer
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          try { resolve(fallback()) } catch (error) { reject(error) }
        }, remaining)
      })
      const value = await Promise.race([flight, timeout]).finally(() => clearTimeout(timer))
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
    ['runs', `${base}/heartbeat-runs?limit=40&summary=true`, 'runs'],
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

export function createSnapshotGet({ get, now = Date.now }) {
  const cache = new Map(), modules = new Map()
  const freeze = (value, seen = new Set()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value
    seen.add(value)
    for (const child of Object.values(value)) freeze(child, seen)
    return Object.freeze(value)
  }
  const cacheKey = p => {
    try {
      const url = new URL(p, 'http://snapshot.local')
      url.searchParams.sort()
      return `${url.pathname}${url.search}`
    } catch { return p }
  }
  const collection = p => /^\/api\/companies\/[^/]+\/(agents|issues|projects|heartbeat-runs)(?:\?|$)/.test(p)
  const ttl = p => {
    try { return new URL(p, 'http://snapshot.local').searchParams.get('limit') === '1000' ? 10 * 60 * 1000 : 45000 } catch { return 45000 }
  }
  const mark = (module, key) => {
    const row = modules.get(module) || { requests: 0, hits: 0, upstream: 0 }
    row[key]++; modules.set(module, row)
  }
  async function read(module, p, options = {}) {
    mark(module, 'requests')
    if (!collection(p) || options.signal) { mark(module, 'upstream'); return get(p, options) }
    const key = cacheKey(p)
    const old = cache.get(key), age = old ? now() - old.at : Infinity
    if (old?.value && age < ttl(p)) { mark(module, 'hits'); return old.value }
    if (old?.flight) { mark(module, 'hits'); return await old.flight }
    mark(module, 'upstream')
    const flight = Promise.resolve(get(p)).then(value => {
      // 缓存结果只读共享，避免每个读取方为 MB 级快照重复 structuredClone。
      const shared = freeze(structuredClone(value))
      cache.set(key, { at: now(), value: shared })
      return shared
    }).catch(error => { cache.delete(key); throw error })
    cache.set(key, { at: old?.at || 0, flight })
    return await flight
  }
  return { forModule: module => (p, options) => read(module, p, options), counts: () => Object.fromEntries([...modules].map(([name, row]) => [name, { ...row }])) }
}

export function createBackgroundHealth({ get, company, buildHealth, schedule, now = Date.now, timeoutMs = 20000, file = null, log = console.log }) {
  let report = null, refreshedAt = 0, attemptedAt = null, failed = false, flight = null, runs = [], gapFetchAt = 0
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Array.isArray(saved?.runs)) runs = saved.runs
  } catch {}
  const runAt = run => Date.parse(run.finishedAt || run.updatedAt || run.startedAt || run.createdAt || 0) || 0
  const persist = () => {
    if (!file) return
    const temp = file + '.tmp'
    try { fs.writeFileSync(temp, JSON.stringify({ runs })); fs.renameSync(temp, file) } catch { try { fs.unlinkSync(temp) } catch {} }
  }
  const mergeRuns = fresh => {
    const key = run => run.id || `${run.agentId || ''}|${run.finishedAt || run.updatedAt || run.startedAt || run.createdAt || ''}|${run.status || ''}`
    const byId = new Map(runs.map(run => [key(run), run]))
    for (const run of fresh) if (run) byId.set(key(run), run)
    const cutoff = now() - 24 * 3600000
    runs = [...byId.values()].filter(run => runAt(run) >= cutoff).sort((a, b) => runAt(b) - runAt(a))
    persist()
  }
  function refresh() {
    if (flight || (attemptedAt !== null && now() - attemptedAt < 10 * 60 * 1000)) return flight
    attemptedAt = now()
    flight = (async () => {
      let timer
      try {
        const routineLimit = runs.length ? 100 : 1000
        const data = await Promise.race([
          Promise.all([
            get(`/api/companies/${company}/agents`),
            get(`/api/companies/${company}/heartbeat-runs?limit=${routineLimit}&summary=true`),
          ]),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('HEALTH_TIMEOUT')), timeoutMs) }),
        ])
        const agents = Array.isArray(data[0]) ? data[0] : data[0]?.agents
        let fresh = Array.isArray(data[1]) ? data[1] : data[1]?.runs
        if (!Array.isArray(agents) || !Array.isArray(fresh)) throw new Error('INVALID_SOURCE')
        const freshOldest = fresh.length ? Math.min(...fresh.map(runAt)) : 0
        const localLatest = runs.length ? Math.max(...runs.map(runAt)) : 0
        const possibleGap = runs.length && fresh.length >= routineLimit && freshOldest > localLatest
        if (possibleGap && now() - gapFetchAt >= 10 * 60 * 1000) {
          gapFetchAt = now()
          try {
            const full = await Promise.race([
              get(`/api/companies/${company}/heartbeat-runs?limit=1000&summary=true`),
              new Promise((_, reject) => setTimeout(() => reject(new Error('HEALTH_GAP_TIMEOUT')), timeoutMs)),
            ])
            const rows = Array.isArray(full) ? full : full?.runs
            if (Array.isArray(rows)) {
              fresh = rows
              log('[health] 运行窗口可能有缺口，已补取完整快照')
            } else log('[health] 运行窗口可能有缺口，完整快照补取失败')
          } catch { log('[health] 运行窗口可能有缺口，完整快照补取失败') }
        }
        mergeRuns(fresh)
        report = buildHealth({ now: new Date(now()), agents, runs, schedule: schedule() })
        refreshedAt = now(); failed = false
      } catch { failed = true }
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
