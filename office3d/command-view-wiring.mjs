import { createLiveSource } from './command-view-live.mjs'
import { sensitiveValue, validateCommandView } from './command-view-validate.mjs'

export function commandLiveConfig(value) {
  const live = value?.live
  return Object.freeze({
    enabled: value?.enabled === true && live?.enabled === true,
    projectName: typeof live?.projectName === 'string' && live.projectName.trim() ? live.projectName.trim() : 'KhmerX',
    rangeDays: Number.isInteger(live?.rangeDays) && live.rangeDays > 0 ? Math.min(14, live.rangeDays) : 14,
    owners: Object.freeze({ acceptor: '董事会', budgetAuthorizer: '董事会', sampleReviewer: '董事会' }),
  })
}
// Never clone the full state: it contains operation tokens and unrelated private content.
export function commandStateSnapshot(value) {
  const tasks = Array.isArray(value?._schedulerSource?.schedulerTasks) ? value._schedulerSource.schedulerTasks : value?.assigned || []
  const array = (rows) => Array.isArray(rows) ? rows : Array.isArray(rows?.items) ? rows.items : []
  return {
    at: value?.at,
    projects: array(value?.projects).map(row => ({ id: row.id, name: row.name })),
    assigned: { at: value?.at, complete: false, items: array(tasks).slice(0, 200).map(row => ({
      id: row.id, issueId: row.issueId || row.id, projectId: row.projectId, title: row.title,
      status: row.status, agentId: row.assigneeAgentId || row.agentId, createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.at, completedAt: row.completedAt,
    })) },
    agents: { at: value?.at, complete: false, items: array(value?.agents).slice(0, 200).map(row => ({
      id: row.id, model: row.model,
    })) },
    waiting: array(value?.waiting).slice(0, 200).map(row => ({ kind: row.kind, issueId: row.issueId })),
  }
}
const reply = (status, body) => ({ status, body })
const empty = reason => reply(200, { kind: 'empty', data: null, reason })
const invalid = () => reply(400, { error: 'INVALID_PARAMETERS' })
export function createCommandLiveWiring({ config, routes, get, readState, company, now, validate = validateCommandView, makeSource = createLiveSource }) {
  const settings = commandLiveConfig(config)
  const audit = { count: 0, concurrent: 0, maxConcurrent: 0 }
  const countedGet = async (...args) => {
    audit.count++
    audit.concurrent++
    audit.maxConcurrent = Math.max(audit.maxConcurrent, audit.concurrent)
    try { return await get(...args) } finally { audit.concurrent-- }
  }
  const source = settings.enabled ? makeSource({ get: countedGet, now, ...settings }) : null
  let saved = null, savedAt = 0, flight = null
  const capture = (value) => {
    if (!settings.enabled) return
    // Existing /state traffic must not refresh the live range cache key on every poll.
    try {
      if (saved && now() - savedAt < 60000) return
      saved = commandStateSnapshot(value)
      savedAt = now()
    } catch { saved = null }
  }
  const snapshot = async () => {
    if (saved && now() - savedAt >= 0 && now() - savedAt < 60000) return structuredClone(saved)
    if (!flight) flight = Promise.resolve().then(readState).then(value => {
      capture(value)
      return structuredClone(saved)
    }).finally(() => { flight = null })
    return flight
  }
  async function handle(input) {
    if (input.path !== '/command-view') return null
    const query = new URLSearchParams(input.query)
    if ((query.get('mode') ?? 'live') !== 'live') return null
    const keys = [...query.keys()]
    if (keys.some(key => !['mode', 'taskId'].includes(key)) || new Set(keys).size !== keys.length) return invalid()
    const taskId = query.get('taskId')
    if (taskId !== null && (!/^[a-zA-Z0-9_-]{1,160}$/.test(taskId) || sensitiveValue.test(taskId))) return invalid()
    if (input.wallScope) return reply(403, { error: 'FORBIDDEN' })
    if (input.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    if (config?.enabled !== true) return empty('SOURCE_DISABLED')
    // Reuse the C3 method/clock/rate guard without changing its demo behavior.
    const guard = routes?.handle({ ...input, query: 'mode=live' })
    if (!guard || guard.status !== 200) return guard
    if (!settings.enabled) return empty('SOURCE_DISABLED')
    if (input.principal !== 'local_full' || input.wallScope) return empty('NO_AUTHORIZED_LIVE_SCOPE')
    try {
      const state = await snapshot()
      const list = await source.load({ principal: 'local_full', company, state })
      if (list?.kind === 'empty') return empty(['SOURCE_FAILED', 'SOURCE_DISABLED', 'NO_AUTHORIZED_LIVE_SCOPE'].includes(list.reason) ? list.reason : 'SOURCE_FAILED')
      if (list?.mode !== 'live' || validate(list)?.ok !== true) return reply(500, { error: 'COMMAND_VIEW_UNAVAILABLE' })
      if (taskId && !list.queue.some(row => row.taskId === taskId)) return invalid()
      const body = taskId ? await source.load({ principal: 'local_full', company, state, taskId }) : list
      if (body?.kind === 'empty') return empty('SOURCE_FAILED')
      if (body?.mode !== 'live' || validate(body)?.ok !== true) return reply(500, { error: 'COMMAND_VIEW_UNAVAILABLE' })
      return reply(200, JSON.parse(JSON.stringify(body)))
    } catch { return empty('SOURCE_FAILED') }
  }
  return Object.freeze({ capture, handle, metrics: () => ({ ...audit }) })
}
