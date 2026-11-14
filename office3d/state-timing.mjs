import fs from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const MAX_BYTES = 20 * 1024 * 1024

export function createStateTiming({ enabled = false, file, maxBytes = MAX_BYTES, now = () => new Date().toISOString() } = {}) {
  if (!enabled) return {
    enabled: false,
    start: () => ({ measure: (_name, fn) => fn(), measureSync: (_name, fn) => fn(), record: () => {}, finish: () => {} }),
    record: () => {},
    request: () => () => {},
    close: () => {},
  }

  let activeState = null
  let stateRequests = 0
  let actRequests = 0
  const append = entry => {
    const line = JSON.stringify({ at: now(), ...entry }) + '\n'
    try {
      const size = fs.statSync(file).size
      if (size + Buffer.byteLength(line) > maxBytes) try { fs.renameSync(file, file + '.1') } catch {}
    } catch {}
    try { fs.appendFileSync(file, line, 'utf8') } catch {}
  }
  const record = (name, data = {}) => {
    const row = { name, ms: Math.round(Number(data.ms) || 0) }
    for (const key of ['ok', 'bytes', 'count', 'state', 'act']) if (data[key] !== undefined) row[key] = data[key]
    if (activeState) activeState.stages.push(row)
    else append({ stages: [row], active: { state: stateRequests, act: actRequests } })
  }
  const start = () => {
    const run = { stages: [], started: performance.now() }
    activeState = run
    const measureSync = (name, fn) => {
      const started = performance.now()
      try { return fn() } finally { record(name, { ms: performance.now() - started, ok: true }) }
    }
    const measure = async (name, fn) => {
      const started = performance.now()
      try { return await fn() } finally { record(name, { ms: performance.now() - started, ok: true }) }
    }
    return {
      measure,
      measureSync,
      record,
      finish: () => {
        if (activeState !== run) return
        activeState = null
        append({ totalMs: Math.round(performance.now() - run.started), stages: run.stages, active: { state: stateRequests, act: actRequests } })
      },
    }
  }
  const request = path => {
    if (path !== '/state' && path !== '/act') return () => {}
    if (path === '/state') stateRequests++
    else actRequests++
    let ended = false
    return () => {
      if (ended) return
      ended = true
      if (path === '/state') stateRequests--
      else actRequests--
    }
  }
  const histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()
  const interval = setInterval(() => {
    append({ eventLoopMaxMs: Math.round(histogram.max / 1e6), active: { state: stateRequests, act: actRequests } })
    histogram.reset()
  }, 10000)
  interval.unref?.()
  return { enabled: true, start, record, request, close: () => { clearInterval(interval); histogram.disable() } }
}
