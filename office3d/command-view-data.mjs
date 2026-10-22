import { classifyFailure, isFailure } from './health.mjs'
import { evaluateCommandEvidence, isDemoId, isIso, isNumber, isObject, realIdentifier, sensitiveValue, validateCommandView } from './command-view-validate.mjs'

// sources 的列表快照使用 { items, complete, at, reason }；裸列表视作未证明完整。
// evidence.items 绑定 taskId，含 records/subjectVersion/生效边界/测试保护/执行和验收身份。
// cost 只接受运行的 { amount, currency, confirmed:true } 计价记录，不估价。
const MONEY = /资金|账务|入账|提现|鉴权|IAM|迁移|密钥|ledger|withdraw|payout|migration|secret/i
const known = (value) => ({ value, reason: null })
const unknown = (reason) => ({ value: null, reason })
const measured = (value, reason) => value === null || value === undefined || value === '' ? unknown(reason) : known(value)
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const timestamp = (value) => isIso(value) ? Date.parse(value) : null
const safe = (value, limit = 160) => [...String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|-----BEGIN[^-]*-----|https?:\/\/\S+|(?:\d{1,3}\.){3}\d{1,3}|[A-Z]:[\\/]\S*|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\/(?:home|Users|etc|var|tmp|root)\/)\S*/gi, '[redacted]')
  .trim()].slice(0, limit).join('')
const identity = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160 && !sensitiveValue.test(value) ? value : null

export function isCommandMoneyTask(task = {}) {
  const contract = isObject(task.contract) ? task.contract : null
  const positive = [task.title, ...(contract ? ['项目', '目标', '交付物', '允许修改'].map((key) => contract[key]) : [])]
  return positive.flat().some((value) => typeof value === 'string' && MONEY.test(value))
}

function boundary(input, companyId, mode) {
  const stack = [input]
  const seen = new Set()
  const idKeys = new Set(['id', 'identifier', 'taskId', 'agentId', 'projectId', 'companyId', 'assigneeAgentId', 'ownerId', 'runId', 'actor', 'executorActor', 'boardActors', 'reportsTo', 'reviewerId', 'projectOwnerId', 'boardActorId', 'budgetActorId', 'maintenanceActorId'])
  while (stack.length) {
    const value = stack.pop()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    if (Object.hasOwn(value, 'companyId') && value.companyId !== null && value.companyId !== companyId) return 'COMPANY_MISMATCH'
    if (isObject(value.company) && value.company.id !== companyId) return 'COMPANY_MISMATCH'
    for (const [key, child] of Object.entries(value)) {
      if (mode === 'demo') {
        if (typeof child === 'string' && realIdentifier.test(child)) return 'DEMO_IDENTIFIER_REQUIRED'
        if (idKeys.has(key) && child !== null && child !== undefined) {
          const ids = Array.isArray(child) ? child : [child]
          if (ids.some((id) => typeof id === 'string' && !isDemoId(id))) return 'DEMO_IDENTIFIER_REQUIRED'
        }
      }
      if (child && typeof child === 'object') stack.push(child)
    }
  }
  return null
}

function snapshot(value, fallback = 'NOT_LOADED') {
  const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
  const complete = isObject(value) && value.complete === true && Array.isArray(value.items)
  return { items, complete, reason: complete ? null : value?.reason || (value ? 'PARTIAL_PAGE' : fallback), at: isIso(value?.at) ? value.at : null }
}
const collection = (items, source, truncated = false) => ({
  items: items.slice(0, 200), complete: source.complete && !truncated && items.length <= 200,
  reason: truncated || items.length > 200 ? 'PARTIAL_PAGE' : source.complete ? null : source.reason,
})

function costs(runs, source, currency) {
  const confirmed = runs.filter((run) => run.cost?.confirmed === true && isNumber(run.cost.amount) && ['USD', 'KHR'].includes(run.cost.currency))
  const mixed = confirmed.some((run) => run.cost.currency !== currency)
  const missing = runs.filter((run) => !isNumber(run.usage) && !isNumber(run.usage?.totalTokens)).length
  const total = mixed ? null : confirmed.reduce((sum, run) => sum + run.cost.amount, 0)
  const partial = !source.complete
  const count = (value) => partial ? unknown(source.reason) : known(value)
  return {
    currency,
    confirmedAmount: !confirmed.length ? unknown('NO_CONFIRMED_COST') : mixed ? unknown('MIXED_CURRENCY') : isNumber(total) ? known(total) : unknown('COST_NOT_RETURNED'),
    totalAmount: partial ? unknown(source.reason) : mixed ? unknown('MIXED_CURRENCY') : !confirmed.length ? unknown('NO_CONFIRMED_COST')
      : confirmed.length < runs.length || !isNumber(total) ? unknown('COST_NOT_RETURNED') : known(total),
    confirmedRuns: count(confirmed.length), unknownCostRuns: count(runs.length - confirmed.length),
    missingUsageRuns: count(missing), observedRuns: count(runs.length),
    lastUpdatedAt: measured(source.at, 'UNKNOWN_TIME'),
  }
}

function safeEvidence(raw, task, money) {
  if (!raw || raw.taskId !== task.id || !identity(raw.subjectVersion) || sensitiveValue.test(raw.subjectVersion) ||
      !identity(task.subjectVersion)) return null
  if (!Array.isArray(raw.records) || raw.records.length > 200 || raw.records.some((record) => !isObject(record) || (record.taskId && record.taskId !== task.id))) return null
  const value = {
    subjectVersion: raw.subjectVersion, enforcedSince: raw.enforcedSince || null,
    taskCreatedAt: task.createdAt || null, protectedTestsHash: raw.protectedTestsHash || null,
    executorActor: raw.executorActor || null, boardActors: Array.isArray(raw.boardActors) ? raw.boardActors.slice(0, 200) : [],
    riskClass: money ? 'money' : task.riskClass || 'normal',
    records: (Array.isArray(raw.records) ? raw.records : []).slice(0, 200).map((record) => ({
      kind: record.kind, ok: record.ok === true, actor: record.actor || null,
      ref: safe(record.ref), subjectVersion: record.subjectVersion || null,
      protectedTestsHash: record.protectedTestsHash || null,
    })),
  }
  const assessment = evaluateCommandEvidence(value, task)
  return { value, assessment }
}

function phase(task, evidence, runs, contract) {
  const assessment = evidence?.assessment
  if (assessment?.valid) {
    const level = assessment.result?.level
    if (assessment.result?.done) return ['accepted', null]
    if (['reviewed', 'accepted', 'merged', 'released'].includes(level)) return ['awaiting_acceptance', null]
    if (level === 'verified') return ['verifying', null]
  }
  if (evidence && (!assessment.valid || assessment.result?.level === 'none')) return ['pending_verification', assessment.reason]
  if (['done', 'in_review'].includes(task.status)) return ['pending_verification', 'NO_ACCEPTANCE_EVIDENCE']
  const running = runs.find((run) => run.taskId === task.id && run.agentId === task.assigneeAgentId && run.status === 'running' && isIso(run.startedAt))
  if (running) return ['executing', null]
  if (task.checkout?.taskId === task.id && task.checkout.agentId === task.assigneeAgentId && identity(task.checkout.runId)) return ['claimed', null]
  if (contract?.state === 'complete' && task.authorization?.approved === true && task.authorization.taskId === task.id) return ['requirement_confirmed', null]
  return ['pending_verification', !evidence ? 'EVIDENCE_NOT_CONNECTED' : 'NO_TEST_EVIDENCE']
}

function focus(task, stage, schedulerCodes, agent, health, evidence, runs) {
  const codes = new Set(schedulerCodes)
  if (task.awaitingBoard === true) codes.add('AWAITING_BOARD')
  if (task.dependencyKnown === false || !Array.isArray(task.blockedBy)) codes.add('DEP_UNKNOWN')
  for (const dep of Array.isArray(task.blockedBy) ? task.blockedBy : []) {
    if (['cancelled', 'canceled'].includes(dep.status)) codes.add('DEP_CANCELLED')
    else if (!['done', 'completed'].includes(dep.status)) codes.add('DEP_PENDING')
  }
  if (agent?.budgetRemaining === 0) codes.add('BUDGET_EXHAUSTED')
  if (isCommandMoneyTask(task)) codes.add('MONEY_CLASS_NEEDS_BOARD')
  const rows = []
  const add = (blocker, entry, handler, reason = null) => rows.push({ blocker, entry, nextHandler: measured(identity(handler), 'OWNER_UNKNOWN'), reason })
  if (codes.has('AWAITING_BOARD')) add('authorization', 'governance', task.boardActorId)
  if (codes.has('MONEY_CLASS_NEEDS_BOARD') || codes.has('BUDGET_EXHAUSTED')) add('budget', 'governance', task.budgetActorId || task.boardActorId)
  const depCode = ['DEP_CANCELLED', 'DEP_UNKNOWN', 'DEP_PENDING'].find((code) => codes.has(code))
  if (depCode) add('dependency', 'issue', (Array.isArray(task.blockedBy) ? task.blockedBy : []).find((row) => !['done', 'completed'].includes(row.status))?.assigneeAgentId || task.projectOwnerId, depCode === 'DEP_UNKNOWN' ? 'DEP_UNKNOWN' : null)
  if (evidence?.assessment.result?.reasons.includes('EVIDENCE_FAILED') || task.verificationFailed === true) add('verification_failed', 'rework', task.assigneeAgentId)
  const lastRun = runs.filter((run) => run.agentId === task.assigneeAgentId).slice().sort((a, b) =>
    compare(b.finishedAt || b.updatedAt || b.startedAt || '', a.finishedAt || a.updatedAt || a.startedAt || ''))[0]
  if (health?.incidents?.some((row) => row.agentIds?.includes(task.assigneeAgentId)) ||
      (lastRun && isFailure(lastRun) && ['login', 'environment', 'worktree_lock', 'upstream'].includes(classifyFailure(lastRun))) ||
      task.executorBlocked === true) add('executor', 'health', task.maintenanceActorId || task.projectOwnerId)
  if (task.status === 'done' && stage !== 'accepted') add('delivered_unaccepted', 'acceptance', task.reviewerId || task.contract?.['审核责任人'] || task.projectOwnerId)
  if (!rows.length && (task.status === 'blocked' || codes.has('BUDGET_UNKNOWN'))) add('unknown', 'issue', task.projectOwnerId, 'NOT_LOADED')
  if (!rows.length) add('none', 'none', null)
  return { rows, priority: codes.has('AWAITING_BOARD') || codes.has('MONEY_CLASS_NEEDS_BOARD') || codes.has('BUDGET_EXHAUSTED') || codes.has('DEP_CANCELLED') ? 0 : 1 }
}

export function projectCommandView({ now, mode = 'live', company, scope, sources = {} } = {}) {
  if (!isObject(sources) || !isIso(now) || !identity(company?.id) || !isObject(scope) || !isIso(scope.range?.from) || !isIso(scope.range?.to) ||
      Date.parse(scope.range.from) > Date.parse(scope.range.to) || !['live', 'demo'].includes(mode)) return { ok: false, code: 'INVALID_INPUT' }
  const rejected = boundary({ company, scope, sources }, company.id, mode)
  if (rejected) return { ok: false, code: rejected }
  const project = isObject(scope.project) ? scope.project.value : scope.project
  if (project !== null && !identity(project)) return { ok: false, code: 'INVALID_SCOPE' }
  const taskSource = snapshot(sources.tasks ?? sources.state?.tasks ?? sources.state?.assigned)
  const runSource = snapshot(sources.runs)
  const agentSource = snapshot(sources.agents ?? sources.state?.agents)
  const evidenceSource = snapshot(sources.evidence, 'EVIDENCE_NOT_CONNECTED')
  const activitySource = snapshot(sources.activity)
  const contracts = snapshot(sources.contractView)
  const evidenceIds = evidenceSource.items.filter(isObject).map((row) => row.taskId)
  if (new Set(evidenceIds).size !== evidenceIds.length) return { ok: false, code: 'AMBIGUOUS_EVIDENCE' }
  const allTasks = taskSource.items.filter((task) => isObject(task) && identity(task.id) && identity(task.projectId) && (project === null || task.projectId === project))
  if (taskSource.items.some((task) => !isObject(task) || !identity(task.id) || !identity(task.projectId))) {
    taskSource.complete = false
    taskSource.reason = 'PARTIAL_PAGE'
  }
  if (new Set(allTasks.map((task) => task.id)).size !== allTasks.length) return { ok: false, code: 'DUPLICATE_TASK' }
  const allIds = new Set(allTasks.map((task) => task.id))
  const from = Date.parse(scope.range.from)
  const to = Date.parse(scope.range.to)
  const allRuns = runSource.items.filter((run) => isObject(run) && allIds.has(run.taskId) && identity(run.id || run.runId) && identity(run.agentId) &&
    (timestamp(run.startedAt || run.createdAt) === null || (timestamp(run.startedAt || run.createdAt) >= from && timestamp(run.startedAt || run.createdAt) <= to)))
  if (runSource.items.some((run) => !isObject(run) || !identity(run.taskId) || !identity(run.id || run.runId) || !identity(run.agentId))) {
    runSource.complete = false
    runSource.reason = 'PARTIAL_PAGE'
  }
  const agents = new Map(agentSource.items.filter(isObject).map((agent) => [agent.id, agent]))
  const evidenceMap = new Map(evidenceSource.items.filter(isObject).map((row) => [row.taskId, row]))
  const contractMap = new Map(contracts.items.filter(isObject).map((row) => [row.taskId || row.identifier, row]))
  const runMap = new Map()
  for (const run of allRuns) {
    if (!runMap.has(run.taskId)) runMap.set(run.taskId, [])
    runMap.get(run.taskId).push(run)
  }
  const schedulerMap = new Map((sources.scheduler?.skipped || []).map((row) => [row.taskId || row.identifier, row.reasonCodes || []]))
  const rows = allTasks.map((task) => {
    const evidence = safeEvidence(evidenceMap.get(task.id), task, isCommandMoneyTask(task))
    const [stage, stageReason] = phase(task, evidence, runMap.get(task.id) || [], contractMap.get(task.id) || contractMap.get(task.identifier))
    const blocked = focus(task, stage, schedulerMap.get(task.id) || schedulerMap.get(task.identifier) || [], agents.get(task.assigneeAgentId), sources.health, evidence, runMap.get(task.id) || [])
    const progress = evidenceMap.get(task.id)?.progress
    const validProgress = evidence?.assessment.valid && progress?.subjectVersion === task.subjectVersion &&
      Number.isInteger(progress.passed) && Number.isInteger(progress.total) && progress.passed >= 0 && progress.total >= progress.passed
    const waiting = task.statusTransition?.to === task.status && isIso(task.statusTransition.at) && timestamp(task.statusTransition.at) <= Date.parse(now) ? task.statusTransition.at : null
    return {
      priority: blocked.priority,
      row: {
        taskId: task.id, projectId: task.projectId, title: safe(task.title, 80), rawStatus: task.status || 'unknown',
        stage, stageReason, ownerId: measured(identity(task.assigneeAgentId), 'OWNER_UNKNOWN'),
        blocker: blocked.rows[0].blocker, nextHandler: blocked.rows[0].nextHandler, entry: blocked.rows[0].entry,
        blockers: blocked.rows,
        waitingSince: measured(waiting, 'NO_STATUS_TRANSITION'),
        waitingMs: waiting ? known(Date.parse(now) - Date.parse(waiting)) : unknown('NO_STATUS_TRANSITION'),
        progress: validProgress ? { passed: known(progress.passed), total: known(progress.total) }
          : { passed: unknown('NO_TEST_EVIDENCE'), total: unknown('NO_TEST_EVIDENCE') },
        evidence: evidence ? known(evidence.value) : unknown('EVIDENCE_NOT_CONNECTED'),
      },
    }
  })
  rows.sort((a, b) => a.priority - b.priority || compare(a.row.waitingSince.value || '~', b.row.waitingSince.value || '~') || compare(a.row.taskId, b.row.taskId))
  const queue = rows.slice(0, 200).map(({ row }) => row)
  const visible = new Set(queue.map((row) => row.taskId))
  const queueComplete = taskSource.complete && rows.length <= 200
  const queueReason = rows.length > 200 ? 'PARTIAL_PAGE' : taskSource.reason
  const execution = allRuns.filter((run) => visible.has(run.taskId)).map((run) => {
    const agent = agents.get(run.agentId)
    const model = identity(run.model) || identity(agent?.model || agent?.adapterConfig?.model)
    const actualModel = identity(run.model)
    const family = model?.toLowerCase().includes('deepseek') ? 'deepseek' : model?.toLowerCase().includes('claude') ? 'claude' : model ? 'gpt' : 'unknown'
    return {
      runId: run.id || run.runId, taskId: run.taskId, agentId: run.agentId,
      status: ['running', 'queued', 'succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted'].includes(run.status) ? run.status : 'unknown',
      startedAt: measured(isIso(run.startedAt) ? run.startedAt : null, 'UNKNOWN_TIME'),
      finishedAt: measured(isIso(run.finishedAt) ? run.finishedAt : null, 'UNKNOWN_TIME'),
      model: measured(model, 'RUN_MODEL_NOT_RETURNED'), modelSource: actualModel ? 'run' : model ? 'agent_config' : 'unknown',
      usage: isNumber(run.usage) ? known(run.usage) : isNumber(run.usage?.totalTokens) ? known(run.usage.totalTokens) : unknown('USAGE_NOT_RETURNED'),
      cost: run.cost?.confirmed === true && isNumber(run.cost.amount) && run.cost.currency === (sources.currency || 'USD') ? known(run.cost.amount) : unknown('COST_NOT_RETURNED'),
      family, healthCategory: isFailure(run) ? classifyFailure(run) : 'none',
    }
  })
  const timeline = activitySource.items.filter((event) => isObject(event) && visible.has(event.taskId || event.entityId) && isIso(event.at || event.createdAt))
    .filter((event) => timestamp(event.at || event.createdAt) >= from && timestamp(event.at || event.createdAt) <= to)
    .map((event) => ({
      id: identity(event.id), taskId: event.taskId || event.entityId, runId: measured(identity(event.runId), 'NOT_APPLICABLE'),
      at: event.at || event.createdAt, type: safe(event.type || event.action), operator: ['agent', 'board', 'system'].includes(event.operator || event.actorType) ? event.operator || event.actorType : 'system',
      source: 'activity', stage: 'pending_verification', stageReason: 'NO_STATUS_TRANSITION', evidence: unknown('NO_STATUS_TRANSITION'),
    })).sort((a, b) => compare(a.at, b.at) || compare(a.id, b.id))
  const relation = (name, reason) => {
    const source = snapshot(sources.relations?.[name], reason)
    const allowed = name === 'organization' ? new Set(agents.keys()) : name === 'calls' ? new Set(execution.map((run) => run.runId)) : visible
    const origins = name === 'calls' ? ['runs', 'envelope', 'call_event'] : name === 'organization' ? ['agents'] : ['tasks', 'scheduler']
    const edges = source.items.filter((edge) => isObject(edge) && allowed.has(edge.from) && allowed.has(edge.to) && origins.includes(edge.source) && edge.confidence)
      .map((edge) => ({ from: edge.from, to: edge.to, type: safe(edge.type), source: safe(edge.source), confidence: safe(edge.confidence) }))
    return collection(edges, source, edges.length !== source.items.length)
  }
  const at = sources.generatedAt && isIso(sources.generatedAt) ? sources.generatedAt : now
  if (timestamp(at) > timestamp(now)) return { ok: false, code: 'INVALID_INPUT' }
  const sourceRows = [
    ['queue', taskSource, queueComplete, queueReason], ['execution', runSource, runSource.complete, runSource.reason],
    ['evidence', evidenceSource, evidenceSource.complete, evidenceSource.reason], ['timeline', activitySource, activitySource.complete, activitySource.reason],
  ].map(([source, value, complete, reason]) => ({
    source, ageMs: value.at && timestamp(value.at) <= timestamp(now) ? known(timestamp(now) - timestamp(value.at)) : unknown('UNKNOWN_TIME'), complete, reason,
  }))
  const supplied = [['agents', sources.agents, agentSource], ['contractView', sources.contractView, contracts],
    ['evidence', sources.evidence, evidenceSource], ['activity', sources.activity, activitySource],
    ['health', sources.health, snapshot(sources.health)], ['scheduler', sources.scheduler, snapshot(sources.scheduler)]]
  for (const [source, raw, value] of supplied) {
    if (raw && !sourceRows.some((row) => row.source === source)) sourceRows.push({
      source, ageMs: value.at && timestamp(value.at) <= timestamp(now) ? known(timestamp(now) - timestamp(value.at)) : unknown('UNKNOWN_TIME'),
      complete: value.complete, reason: value.reason,
    })
  }
  const critical = [taskSource, runSource, ...supplied.filter(([, raw]) => raw).map(([, , value]) => value),
    ...(sources.state ? [snapshot({ items: [], complete: true, at: sources.state.at })] : [])]
  const hasUnknownAge = critical.some((source) => !source.at || timestamp(source.at) > timestamp(now))
  const knownAges = sourceRows.filter((source) => isNumber(source.ageMs.value)).map((source) => source.ageMs.value)
  if (timestamp(at) <= timestamp(now)) knownAges.push(timestamp(now) - timestamp(at))
  if (sources.state?.at && timestamp(sources.state.at) <= timestamp(now)) knownAges.push(timestamp(now) - timestamp(sources.state.at))
  const age = hasUnknownAge ? unknown('UNKNOWN_TIME') : known(Math.max(...knownAges, 0))
  const disconnected = sources.disconnected === true
  const stale = disconnected || age.value === null || age.value > 120000
  const freshness = { stale, reason: disconnected ? 'DISCONNECTED' : age.value === null ? 'UNKNOWN_TIME' : stale ? 'STALE_DATA' : null, maxAgeMs: 120000, animationAllowed: !stale }
  const coverage = evidenceSource.complete && allTasks.every((task) => {
    const raw = evidenceMap.get(task.id)
    return isIso(raw?.enforcedSince)
  })
  const result = {
    schemaVersion: 1, generatedAt: at, dataAgeMs: age, mode,
    company: { id: company.id, name: safe(company.name) },
    scope: { project: measured(project, 'NOT_APPLICABLE'), range: { from: scope.range.from, to: scope.range.to } },
    summary: {
      tasks: queueComplete ? known(rows.length) : unknown(queueReason),
      running: runSource.complete ? known(allRuns.filter((run) => run.status === 'running').length) : unknown(runSource.reason),
      accepted: coverage && queueComplete ? known(rows.filter(({ row }) => row.stage === 'accepted').length) : unknown('EVIDENCE_NOT_CONNECTED'),
      cost: costs(allRuns, runSource, sources.currency || 'USD'),
    },
    queue,
    relations: { organization: relation('organization', 'NOT_LOADED'), dependencies: relation('dependencies', 'DEP_NOT_LOADED'), calls: relation('calls', 'NO_CALL_EVIDENCE') },
    execution: collection(execution, runSource, allRuns.length !== execution.length),
    timeline: collection(timeline, activitySource),
    quality: { synthetic: mode === 'demo', freshness, sources: sourceRows, gaps: [...new Set([...sourceRows.filter((source) => !source.complete).map((source) => source.reason), ...queue.map((row) => row.stageReason).filter(Boolean)])].sort(), writesAllowed: false },
  }
  const validation = validateCommandView(result)
  return validation.ok ? result : { ok: false, code: 'INVALID_PROJECTION', errors: validation.errors }
}
