import fs from 'node:fs'
import { performance } from 'node:perf_hooks'

const credential = key => /token|password|passphrase|secret|credential|authorization|cookie|csrf|jwt|bearer|access.?(code|key)|api.?key|访问码|令牌|口令|密钥/i.test(key)
export function stripStateCredentials(value) {
  if (Array.isArray(value)) return value.map(stripStateCredentials)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).filter(key => !credential(key)).map(key => [key, stripStateCredentials(value[key])]))
}

export function createLastGoodState({ file, now = Date.now, log = console.log, timeoutMs = 5000, backgroundMs = 0, staleAfterMs = 60000, logFile = null, persistMinMs = 0 }) {
  let saved = null, degraded = false, flight = null, flightStartedAt = 0, refreshAt = 0, failures = 0, backgroundTimer = null, writes = Promise.resolve(), pendingPersist = null, persistRunning = false, lastPersistAt = 0, lastRequestAt = 0, closing = false, interruptPersistWait = null
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (value && !Array.isArray(value) && typeof value === 'object' && Number.isFinite(Date.parse(value.at)) &&
        Array.isArray(value.agents) && value.tasks && !value.stale?.active) saved = stripStateCredentials(value)
  } catch {}
  const persist = snapshot => {
    pendingPersist = snapshot
    if (persistRunning) return writes
    persistRunning = true
    writes = (async () => {
      while (pendingPersist) {
        const next = pendingPersist
        pendingPersist = null
        const wait = Math.max(0, persistMinMs - (Date.now() - lastPersistAt))
        if (!closing && lastPersistAt && wait) await new Promise(resolve => {
          const timer = setTimeout(() => { interruptPersistWait = null; resolve() }, wait)
          interruptPersistWait = () => { clearTimeout(timer); interruptPersistWait = null; resolve() }
        })
        const temp = file + '.tmp'
        try {
          await fs.promises.writeFile(temp, JSON.stringify(next), { mode: 0o600 })
          await fs.promises.rename(temp, file)
          lastPersistAt = Date.now()
        } catch {
          await fs.promises.unlink(temp).catch(() => {})
          log('[state] 快照持久化失败，保留内存快照')
        }
      }
    })().finally(() => { persistRunning = false })
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
    return { ...structuredClone(saved), stale: {
      active: true, since: saved.at, ageMs, reason: ageMs > 30 * 60000 ? 'STALE_DATA' : 'UPSTREAM_UNAVAILABLE',
    } }
  }
  const clone = value => {
    const copy = structuredClone(value)
    if (value?._schedulerSource) Object.defineProperty(copy, '_schedulerSource', { value: structuredClone(value._schedulerSource), enumerable: false })
    return copy
  }
  const rollingFailure = (durationMs, error) => {
    const message = `[state-refresh] component=state durationMs=${Math.round(durationMs)} error=${String(error?.message || error).replace(/[\r\n]+/g, ' ').slice(0, 240)}`
    log(message)
    if (!logFile) return
    try {
      fs.appendFileSync(logFile, message + '\n', { encoding: 'utf8' })
      const text = fs.readFileSync(logFile, 'utf8')
      if (text.length > 200000) fs.writeFileSync(logFile, text.slice(-180000))
    } catch {}
  }
  const start = build => {
    if (flight) return flight
    flightStartedAt = now(); refreshAt = flightStartedAt
    flight = (async () => {
      const started = flightStartedAt
      try {
        const out = await build()
        const snapshot = stripStateCredentials(out)
        delete snapshot.stale
        saved = snapshot; failures = 0
        await persist(snapshot)
        if (degraded) log('[state] 恢复')
        degraded = false
        return out
      } catch (error) {
        failures++
        if (backgroundMs > 0) rollingFailure(now() - started, error)
        return fallback()
      }
    })().finally(() => { flight = null; flightStartedAt = 0 })
    return flight
  }
  return {
    async run(build) {
      const idleResume = lastRequestAt > 0 && now() - lastRequestAt > 90000
      lastRequestAt = now()
      if (backgroundMs > 0 && !backgroundTimer) {
        backgroundTimer = setInterval(() => { if (saved && !flight && lastRequestAt && now() - lastRequestAt <= 90000) start(build) }, backgroundMs)
        backgroundTimer.unref?.()
      }
      if (backgroundMs > 0 && saved) {
        if (idleResume) {
          const pending = start(build)
          let timer
          const timeout = new Promise((resolve, reject) => {
            timer = setTimeout(() => { try { resolve(fallback()) } catch (error) { reject(error) } }, timeoutMs)
          })
          const value = await Promise.race([pending, timeout]).finally(() => clearTimeout(timer))
          return clone(value)
        }
        if (!flight && now() - refreshAt >= backgroundMs) start(build)
        const ageMs = Math.max(0, now() - refreshAt)
        if (failures < 3 && ageMs <= staleAfterMs) return clone(saved)
        return clone({ ...structuredClone(saved), stale: { active: true, since: saved.at, ageMs, reason: failures >= 3 ? 'UPSTREAM_UNAVAILABLE' : 'STALE_DATA' } })
      }
      // 首次无快照时给后台刷新一次完整机会；超时才返回 503，避免把冷启动误报成已降级。
      if (backgroundMs > 0 && !saved) {
        const pending = start(build)
        const waitMs = Math.min(timeoutMs, 5000)
        let timer
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => { try { resolve(fallback()) } catch (error) { reject(error) } }, waitMs)
        })
        const value = await Promise.race([pending, timeout]).finally(() => clearTimeout(timer))
        return clone(value)
      }
      start(build)
      const remaining = Math.max(0, timeoutMs - (now() - flightStartedAt))
      if (remaining === 0) return clone(fallback())
      let timer
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => { try { resolve(fallback()) } catch (error) { reject(error) } }, remaining)
      })
      const value = await Promise.race([flight, timeout]).finally(() => clearTimeout(timer))
      return clone(value)
    },
    async close() {
      closing = true
      interruptPersistWait?.()
      if (backgroundTimer) {
        clearInterval(backgroundTimer)
        backgroundTimer = null
      }
      if (flight) await flight.catch(() => {})
      await writes.catch(() => {})
    },
  }
}

export async function loadStateComponents({ get, company, backlog, timings = null }) {
  const base = `/api/companies/${company}`
  const entries = [
    ['agents', `${base}/agents`, 'agents'], ['dashboard', `${base}/dashboard`, null],
    ['issues', `${base}/issues?status=todo,in_progress,in_review,blocked`, 'issues'],
    ['runs', `${base}/heartbeat-runs?limit=40&summary=true`, 'runs'],
    ['approvals', `${base}/approvals?status=pending`, 'approvals'],
    ['activity', `${base}/activity?limit=200`, 'activity'],
    ['approvalsAll', `${base}/approvals`, 'approvals'], ['backlog', null, null],
  ]
  const gaps = [], values = {}
  await Promise.all(entries.map(async ([name, route, arrayKey]) => {
    const started = performance.now()
    try {
      const raw = await (route ? get(route) : backlog())
      const rows = arrayKey ? (Array.isArray(raw) ? raw : raw?.[arrayKey]) : raw
      if (arrayKey ? !Array.isArray(rows) : name === 'backlog' ? !Array.isArray(rows) : !rows || !rows.tasks) throw new Error('INVALID_SOURCE')
      values[name] = rows
      timings?.({ name, ok: true, ms: performance.now() - started })
    } catch (error) {
      values[name] = []
      gaps.push({ source: name, reason: 'UPSTREAM_UNAVAILABLE' })
      timings?.({ name, ok: false, ms: performance.now() - started, error: String(error?.message || error).slice(0, 120) })
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
  const collection = p => /^\/api\/companies\/[^/]+\/(agents|issues|projects|heartbeat-runs|activity)(?:\?|$)/.test(p)
  const ttl = p => {
    try { const url = new URL(p, 'http://snapshot.local'); return url.pathname.endsWith('/activity') ? 60 * 1000 : (url.searchParams.get('limit') === '1000' ? 10 * 60 * 1000 : 45000) } catch { return 45000 }
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
    let changed = false
    for (const run of fresh) if (run) {
      const id = key(run)
      const old = byId.get(id)
      if (!old || old.status !== run.status || old.finishedAt !== run.finishedAt || old.updatedAt !== run.updatedAt) changed = true
      byId.set(id, run)
    }
    const cutoff = now() - 24 * 3600000
    const next = [...byId.values()].filter(run => runAt(run) >= cutoff).sort((a, b) => runAt(b) - runAt(a))
    if (next.length !== runs.length || next.some((run, i) => {
      const old = runs[i]
      return !old || run.id !== old.id || run.status !== old.status || run.updatedAt !== old.updatedAt || run.finishedAt !== old.finishedAt
    })) changed = true
    if (changed) { runs = next; persist() }
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
