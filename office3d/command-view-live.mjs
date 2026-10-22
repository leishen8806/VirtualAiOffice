import { projectCommandView } from './command-view-data.mjs'
import { isIso, isNumber, isObject, sensitiveValue, validateCommandView } from './command-view-validate.mjs'

const DAY = 86400000
const empty = (reason) => ({ kind: 'empty', data: null, reason })
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value) && !sensitiveValue.test(value) ? value : null
const hidden = (value) => String(value ?? '').replace(/https?:\/\/\S+|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|\[[0-9a-f:]+\](?::\d+)?|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+|[\w.-]+\.(?:internal|local|localhost)\b/gi, '[已隐藏]')
const snap = (items, at, complete = false, reason = 'PARTIAL_PAGE') => ({ items, at: isIso(at) ? at : null, complete, reason: complete ? null : reason })
const rowsOf = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.[key]) ? value[key] : null
const partial = (value, rows) => value?.complete === false || Boolean(value?.nextCursor || value?.hasMore) || rows.length >= 200 ||
  (isNumber(value?.total) && value.total > rows.length)
function sameCompany(value, companyId) {
  const stack = [value], seen = new Set()
  while (stack.length) {
    const row = stack.pop()
    if (!row || typeof row !== 'object' || seen.has(row)) continue
    seen.add(row)
    if ((row.companyId != null && row.companyId !== companyId) || (row.company?.id != null && row.company.id !== companyId)) return false
    for (const child of Object.values(row)) if (child && typeof child === 'object') stack.push(child)
  }
  return true
}
function task(row, companyId, owners) {
  return {
    id: id(row.issueId || row.id), companyId, projectId: id(row.projectId),
    title: hidden(row.title), status: row.status || 'unknown',
    assigneeAgentId: id(row.assigneeAgentId || row.agentId),
    createdAt: isIso(row.createdAt) ? row.createdAt : null,
    updatedAt: isIso(row.updatedAt || row.at) ? row.updatedAt || row.at : null,
    completedAt: isIso(row.completedAt) ? row.completedAt : null,
    parentId: id(row.parentId), dependencyKnown: Array.isArray(row.blockedBy),
    blockedBy: Array.isArray(row.blockedBy) ? row.blockedBy.slice(0, 200).map((dep) => ({
      id: id(dep.id || dep.issueId), status: dep.status || 'unknown', assigneeAgentId: id(dep.assigneeAgentId),
    })) : [],
    awaitingBoard: row.awaitingBoard === true,
    executorBlocked: row.executorBlocked === true,
    boardActorId: owners.sampleReviewer, budgetActorId: owners.budgetAuthorizer, reviewerId: owners.acceptor,
  }
}
function run(row, companyId) {
  let usage = row.usage ?? row.usageJson
  if (typeof usage === 'string') { try { usage = JSON.parse(usage) } catch { usage = null } }
  const total = isNumber(usage) ? usage : isNumber(usage?.totalTokens) ? usage.totalTokens
    : isNumber(usage?.inputTokens) && isNumber(usage?.outputTokens) ? usage.inputTokens + usage.outputTokens : null
  return {
    id: id(row.id || row.runId), companyId,
    taskId: id(row.taskId || row.issueId || row.contextSnapshot?.issueId || row.contextSnapshot?.taskId),
    agentId: id(row.agentId), status: row.status || 'unknown',
    startedAt: isIso(row.startedAt) ? row.startedAt : null,
    finishedAt: isIso(row.finishedAt) ? row.finishedAt : null,
    model: typeof row.model === 'string' ? hidden(row.model) : null, usage: total,
    ...(row.cost?.confirmed === true && isNumber(row.cost.amount) ? { cost: { amount: row.cost.amount, currency: row.cost.currency, confirmed: true } } : {}),
    errorCode: ['login', 'environment', 'worktree_lock', 'provider_quota', 'upstream'].includes(row.errorCode) ? row.errorCode : null,
  }
}

/** get(path, { method, signal, timeoutMs }) must honor cancellation; now returns injected ISO or epoch milliseconds.
 * load({ principal, company, state, taskId?, evidenceVersion?, range? }) returns CommandViewData or an empty envelope.
 * state.projects/assigned/agents may be arrays or {items,at,complete,reason}; missing completeness remains unknown.
 */
export function createLiveSource({ get, projectName = 'KhmerX', rangeDays = 14, now, owners = {} } = {}) {
  const days = Number.isInteger(rangeDays) && rangeDays > 0 ? Math.min(rangeDays, 14) : 14
  const handlers = Object.fromEntries(['acceptor', 'budgetAuthorizer', 'sampleReviewer'].map((key) => [key, owners[key] === '董事会' ? owners[key] : '董事会']))
  const cache = new Map(), flights = new Map(), waiting = []
  let active = 0
  const clock = () => {
    const value = typeof now === 'function' ? now() : now
    return isIso(value) ? Date.parse(value) : Number.isFinite(value) && value >= 0 ? value : null
  }
  async function acquire() {
    if (active >= 4) await new Promise((resolve) => waiting.push(resolve))
    else active++
  }
  function release() {
    if (waiting.length) waiting.shift()()
    else active--
  }
  async function request(path, key, normalize, context) {
    const at = clock()
    const cached = cache.get(key)
    if (cached && at !== null && at >= cached.ms && at - cached.ms < cached.ttl) return structuredClone(cached.result)
    if (flights.has(key)) return structuredClone(await flights.get(key))
    if (++context.requests > 20 || waiting.length >= 200) return { ok: false, reason: 'SOURCE_FAILED' }
    const promise = (async () => {
      await acquire()
      const signal = AbortSignal.timeout(5000)
      let started
      let onAbort
      try {
        const aborted = new Promise((resolve) => {
          onAbort = () => resolve({ ok: false, reason: 'SOURCE_FAILED' })
          signal.addEventListener('abort', onAbort, { once: true })
        })
        // A timed-out non-cooperative get retains its slot until it actually settles.
        started = Promise.resolve().then(() => get(path, { method: 'GET', signal, timeoutMs: 5000 })).then((raw) => {
          const status = typeof raw?.status === 'number' ? raw.status : null
          if (status && (status < 200 || status >= 300)) return { ok: false, reason: status === 404 ? 'SOURCE_DISABLED' : 'SOURCE_FAILED' }
          const body = status ? raw.body : raw
          if (!sameCompany(body, context.companyId)) return { ok: false, reason: 'SOURCE_FAILED' }
          return { ok: true, value: normalize(body), at: new Date(at).toISOString() }
        }).catch(() => ({ ok: false, reason: 'SOURCE_FAILED' })).finally(release)
        const result = await Promise.race([started, aborted])
        signal.removeEventListener('abort', onAbort)
        cache.set(key, { ms: at, ttl: result.ok ? 60000 : 15000, result })
        while (cache.size > 200) cache.delete(cache.keys().next().value)
        return result
      } catch {
        if (!started) release()
        return { ok: false, reason: 'SOURCE_FAILED' }
      }
    })()
    flights.set(key, promise)
    try { return structuredClone(await promise) } finally { flights.delete(key) }
  }
  async function load({ principal, company, state = {}, taskId = null, evidenceVersion = null, range } = {}) {
    if (principal !== 'local_full') return empty('NO_AUTHORIZED_LIVE_SCOPE')
    const ms = clock()
    if (ms === null || typeof get !== 'function' || !id(company?.id) || !sameCompany(state, company.id)) return empty('SOURCE_FAILED')
    company = { id: company.id, name: hidden(company.name) }
    const captured = structuredClone(state)
    const to = range?.to ?? (isIso(captured.at) ? captured.at : new Date(ms).toISOString())
    const from = range?.from ?? new Date(Date.parse(to) - days * DAY).toISOString()
    if (!isIso(to) || !isIso(from) || Date.parse(to) > ms || Date.parse(from) > Date.parse(to) || Date.parse(to) - Date.parse(from) > 14 * DAY) return empty('SOURCE_FAILED')
    const context = { companyId: company.id, requests: 0 }
    const base = JSON.stringify([company.id, principal, projectName, from, to])
    const projectRows = rowsOf(captured.projects, 'projects')
    const projects = projectRows ? { ok: true, value: projectRows } : await request(
      `/api/companies/${encodeURIComponent(company.id)}/projects?limit=200`, `${base}:projects`,
      (body) => {
        const rows = rowsOf(body, 'projects')
        if (!rows) throw new Error('invalid source')
        return rows.slice(0, 200).map((row) => ({ id: id(row.id), name: row.name, companyId: row.companyId }))
      }, context)
    if (!projects.ok) return empty(projects.reason)
    const matches = projects.value.filter((row) => row.name === projectName && id(row.id))
    if (matches.length !== 1) return empty('SOURCE_FAILED')
    const projectId = matches[0].id
    const scopeKey = JSON.stringify([base, projectId])
    const within = (row) => row.projectId === projectId
    const recent = (row) => {
      const at = row.completedAt || row.updatedAt || row.at
      return isIso(at) && Date.parse(at) >= Date.parse(from) && Date.parse(at) <= Date.parse(to)
    }
    const completed = await request(
      `/api/companies/${encodeURIComponent(company.id)}/issues?${new URLSearchParams({ projectId, status: 'done', updatedAfter: from, limit: '200' })}`,
      `${scopeKey}:completed`, (body) => {
        const rows = rowsOf(body, 'issues')
        if (!rows || rows.some((row) => !within(row) || row.status !== 'done')) throw new Error('invalid scope')
        return snap(rows.slice(0, 200).filter(recent).map((row) => task(row, company.id, handlers)), null, !partial(body, rows))
      }, context)
    const assigned = rowsOf(captured.assigned, 'issues') || []
    const assignedSource = snap(assigned.filter(within).map((row) => task(row, company.id, handlers)),
      captured.assigned?.at || captured.at, captured.assigned?.complete === true)
    const all = new Map(assignedSource.items.map((row) => [row.id, row]))
    if (completed.ok) for (const row of completed.value.items) all.set(row.id, row)
    if (all.has(null)) return empty('SOURCE_FAILED')
    for (const waitingTask of rowsOf(captured.waiting, 'items') || []) {
      if (waitingTask.kind === 'question' && all.has(waitingTask.issueId)) all.get(waitingTask.issueId).awaitingBoard = true
    }
    let detail = null, runs = null, activity = null
    if (taskId !== null) {
      if (!id(taskId) || !all.has(taskId)) return empty('NO_AUTHORIZED_LIVE_SCOPE')
      const key = JSON.stringify([scopeKey, taskId, evidenceVersion])
      const query = new URLSearchParams({ issueId: taskId, limit: '200' })
      const results = await Promise.all([
        request(`/api/issues/${encodeURIComponent(taskId)}`, `${key}:detail`, (body) => {
          if (!isObject(body) || body.id !== taskId || !within(body)) throw new Error('invalid scope')
          return task(body, company.id, handlers)
        }, context),
        request(`/api/companies/${encodeURIComponent(company.id)}/heartbeat-runs?${query}`, `${key}:runs`, (body) => {
          const rows = rowsOf(body, 'runs')
          if (!rows) throw new Error('invalid source')
          // The company endpoint ignores issueId and returns only its recent page.
          return snap(rows.slice(0, 200).map((row) => run(row, company.id)).filter((row) => row.taskId === taskId), null)
        }, context),
        request(`/api/issues/${encodeURIComponent(taskId)}/activity?limit=200`, `${key}:activity`, (body) => {
          const rows = rowsOf(body, 'activity')
          if (!rows || rows.some((row) => row.entityType !== 'issue' || row.entityId !== taskId)) throw new Error('invalid task')
          return snap(rows.slice(0, 200).map((row) => ({
            id: id(row.id), taskId, companyId: company.id, runId: id(row.runId),
            action: row.action, actorType: row.actorType, createdAt: row.createdAt,
          })), null, !partial(body, rows))
        }, context),
      ])
      detail = results[0]
      runs = results[1]
      activity = results[2]
      if (detail.ok) all.set(taskId, detail.value)
      else all.set(taskId, { ...all.get(taskId), dependencyKnown: false, blockedBy: [] })
      if ((rowsOf(captured.waiting, 'items') || []).some((row) => row.issueId === taskId && row.kind === 'question')) all.get(taskId).awaitingBoard = true
    }
    const source = (result, fallback) => result?.ok ? { ...result.value, at: result.at }
      : snap([], null, false, result?.reason || fallback)
    const rawRuns = rowsOf(captured.runs, 'runs') || []
    const mappedRuns = rawRuns.map((row) => run(row, company.id))
      .filter((row) => all.has(row.taskId) && (taskId === null || row.taskId === taskId))
    const runMap = new Map(mappedRuns.map((row) => [row.id, row]))
    if (runs?.ok) for (const row of runs.value.items) runMap.set(row.id, row)
    const tasks = [...all.values()]
    const complete = assignedSource.complete && completed.ok && completed.value.complete && tasks.length <= 200
    const sourceTimes = [assignedSource.at, completed.at, detail?.at].filter(isIso)
    const queueAt = assignedSource.at && sourceTimes.length ? sourceTimes.sort()[0] : null
    const runTimes = [captured.runs?.at, runs?.at].filter(isIso).sort()
    const agentRows = rowsOf(captured.agents, 'agents') || []
    const agents = agentRows.slice(0, 200).map((row) => ({
      id: id(row.id), companyId: company.id, model: typeof row.model === 'string' ? hidden(row.model) : null,
      budgetRemaining: isNumber(row.budgetRemaining) ? row.budgetRemaining : null,
    }))
    const sources = {
      tasks: snap(tasks.slice(0, 200), queueAt, complete, completed.ok ? 'PARTIAL_PAGE' : completed.reason),
      agents: snap(agents, captured.agents?.at || captured.at, captured.agents?.complete === true),
      runs: snap([...runMap.values()].slice(0, 200), runTimes[0] || captured.at, false, runs && !runs.ok ? runs.reason : 'PARTIAL_PAGE'),
      state: { at: isIso(captured.at) ? captured.at : null },
      evidence: null, generatedAt: captured.at && isIso(captured.at) ? captured.at : new Date(ms).toISOString(),
    }
    // 未加载的活动不参与列表年龄；投影器仍保留默认 NOT_LOADED 缺口。
    if (taskId !== null) sources.activity = source(activity, 'NOT_LOADED')
    if (captured.contractView) sources.contractView = snap((rowsOf(captured.contractView, 'items') || []).filter((row) => all.has(row.taskId)).map((row) => ({
      taskId: row.taskId, state: row.state,
    })), captured.contractView.at, captured.contractView.complete === true)
    if (captured.scheduler) sources.scheduler = {
      ...snap([], captured.scheduler.at, captured.scheduler.complete === true),
      skipped: (captured.scheduler.skipped || []).filter((row) => all.has(row.taskId)).slice(0, 200).map((row) => ({
        taskId: row.taskId, reasonCodes: (row.reasonCodes || []).filter((code) => ['AWAITING_BOARD', 'MONEY_CLASS_NEEDS_BOARD', 'BUDGET_EXHAUSTED', 'DEP_UNKNOWN', 'DEP_PENDING', 'DEP_CANCELLED'].includes(code)),
      })),
    }
    if (captured.health) sources.health = {
      ...snap([], captured.health.at, captured.health.complete === true),
      incidents: (captured.health.incidents || []).slice(0, 200).map((row) => ({ agentIds: (row.agentIds || []).filter((agentId) => agents.some((agent) => agent.id === agentId)) })),
    }
    const output = projectCommandView({ now: new Date(ms).toISOString(), mode: 'live', company, scope: { project: projectId, range: { from, to } }, sources })
    if (output.ok === false) return empty('SOURCE_FAILED')
    for (const row of output.queue) {
      row.stage = 'pending_verification'
      row.stageReason = ['done', 'in_review'].includes(row.rawStatus) ? 'NO_ACCEPTANCE_EVIDENCE' : 'EVIDENCE_NOT_CONNECTED'
      row.evidence = { value: null, reason: 'EVIDENCE_NOT_CONNECTED' }
    }
    output.summary.accepted = { value: null, reason: 'EVIDENCE_NOT_CONNECTED' }
    if (detail && !detail.ok) {
      output.quality.sources.push({ source: 'detail', ageMs: { value: null, reason: 'UNKNOWN_TIME' }, complete: false, reason: detail.reason })
      output.quality.gaps.push(detail.reason)
      output.dataAgeMs = { value: null, reason: 'UNKNOWN_TIME' }
      output.quality.freshness = { stale: true, reason: 'UNKNOWN_TIME', maxAgeMs: 120000, animationAllowed: false }
    }
    output.quality.gaps = [...new Set([...output.quality.gaps, ...output.queue.map((row) => row.stageReason)])].sort()
    return validateCommandView(output).ok ? output : empty('SOURCE_FAILED')
  }
  return Object.freeze({ load: async (input) => {
    try { return await load(input) } catch { return empty('SOURCE_FAILED') }
  } })
}
