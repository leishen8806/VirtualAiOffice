import { MONEY_RE } from './standup.mjs'

export const RULE_VERSION = 'L3a-3'
export const DEFAULT_OPEN_LIMIT = 2
export const DEFAULT_DAILY_LIMIT = 5
export const DEFAULT_MAX_DATA_AGE_MS = 120000
export const PRIORITY_ORDER = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 })
export const COMPLETED_STATUSES = Object.freeze(['done', 'completed'])
export const CANCELLED_STATUSES = Object.freeze(['cancelled', 'canceled'])
export const ELIGIBLE_STATUSES = Object.freeze(['todo', 'backlog'])
export const REASON_CODES = Object.freeze([
  'DEP_UNKNOWN',
  'DEP_PENDING',
  'DEP_CANCELLED',
  'AWAITING_BOARD',
  'MONEY_CLASS_NEEDS_BOARD',
  'AGENT_UNAVAILABLE',
  'AGENT_AT_LIMIT',
  'DAILY_LIMIT',
  'ALREADY_LEASED',
  'BUDGET_EXHAUSTED',
  'BUDGET_UNKNOWN',
  'STALE_DATA',
  'NO_CONTRACT',
  'WRONG_STATUS',
  'PARENT_NOT_READY',
  'NO_ASSIGNEE',
  'INVALID_INPUT',
])

const MONEY_POLICY = Object.freeze({ moneyNeedsBoard: true, cancelledDependencySatisfies: false })

function text(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function statusOf(value) {
  return text(value).toLowerCase()
}

function isComplete(value) {
  return COMPLETED_STATUSES.includes(statusOf(value))
}

function isCancelled(value) {
  return CANCELLED_STATUSES.includes(statusOf(value))
}

function parseTime(value) {
  if (finiteNumber(value)) return value
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function taskIdentifier(task) {
  return text(task?.identifier || task?.id) || 'unknown'
}

function reason(code, severity, detail) {
  return { code, severity, detail: text(detail) }
}

function normalizePolicy(policy) {
  return { ...MONEY_POLICY, ...(policy && typeof policy === 'object' ? policy : {}) }
}

function validateContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return 'ctx must be an object'
  if (!finiteNumber(parseTime(ctx.now))) return 'ctx.now must be a finite time'
  if (!finiteNumber(parseTime(ctx.dataAt))) return 'ctx.dataAt must be a finite time'
  if (ctx.agents !== undefined && !Array.isArray(ctx.agents)) return 'ctx.agents must be an array'
  if (ctx.dispatchedToday !== undefined && (!Number.isInteger(ctx.dispatchedToday) || ctx.dispatchedToday < 0)) return 'ctx.dispatchedToday must be a non-negative integer'
  return null
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return 'task must be an object'
  if (!text(task.id)) return 'task.id is required'
  if (task.blockedBy !== undefined && !Array.isArray(task.blockedBy)) return 'task.blockedBy must be an array'
  if (task.contract !== undefined && (!task.contract || typeof task.contract !== 'object' || Array.isArray(task.contract))) {
    return 'task.contract must be an object when provided'
  }
  return null
}

function normalizeAgent(agent) {
  return agent && typeof agent === 'object' && !Array.isArray(agent) ? agent : null
}

function agentFor(task, ctx) {
  const agents = Array.isArray(ctx.agents) ? ctx.agents : []
  return normalizeAgent(agents.find((agent) => String(agent?.id) === String(task?.assigneeAgentId)))
}

function moneyText(task) {
  const values = [task?.title]
  const contract = task?.contract
  if (contract && typeof contract === 'object' && !Array.isArray(contract)) {
    values.push(contract['项目'], contract['目标'], contract['交付物'], contract['允许修改'])
  }
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(text)
    .filter(Boolean)
    .join('\n')
}

function inputError(task, ctx) {
  return validateTask(task) || validateContext(ctx)
}

export function evaluateTask(task, ctx = {}) {
  const invalid = inputError(task, ctx)
  if (invalid) return { ok: false, error: invalid, taskId: taskIdentifier(task), eligible: false, reasons: [reason('INVALID_INPUT', 'block', invalid)] }
  const now = parseTime(ctx.now)
  const dataAt = parseTime(ctx.dataAt)
  const policy = normalizePolicy(ctx.policy)
  const reasons = []
  const status = statusOf(task.status)
  const agent = agentFor(task, ctx)
  const openLimit = Number.isInteger(ctx.openLimitPerAgent) ? ctx.openLimitPerAgent : DEFAULT_OPEN_LIMIT
  const dailyLimit = Number.isInteger(ctx.dailyDispatchLimit) ? ctx.dailyDispatchLimit : DEFAULT_DAILY_LIMIT
  const maxAge = finiteNumber(ctx.maxDataAgeMs) ? ctx.maxDataAgeMs : DEFAULT_MAX_DATA_AGE_MS
  const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy : []

  if (task.dependencyKnown === false) {
    reasons.push(reason('DEP_UNKNOWN', 'block', '阻塞依赖字段不可可靠读取，保守停止建议'))
  }
  if (!policy.cancelledDependencySatisfies && blockedBy.some((entry) => isCancelled(entry?.status))) {
    reasons.push(reason('DEP_CANCELLED', 'block', '存在已取消依赖；取消不等于交付'))
  }
  if (blockedBy.some((entry) => !isComplete(entry?.status) && !isCancelled(entry?.status))) {
    reasons.push(reason('DEP_PENDING', 'block', '存在未完成且未取消的阻塞依赖'))
  }
  if (task.awaitingBoard === true) reasons.push(reason('AWAITING_BOARD', 'block', '任务等待董事会决定'))
  if (policy.moneyNeedsBoard !== false && MONEY_RE.test(moneyText(task))) {
    reasons.push(reason('MONEY_CLASS_NEEDS_BOARD', 'block', '资金类任务需要董事会审批'))
  }
  if (!ELIGIBLE_STATUSES.includes(status) || !task.assigneeAgentId) {
    reasons.push(reason('WRONG_STATUS', 'block', '只有已分配的 todo/backlog 任务可以领取'))
  }
  if (!task.assigneeAgentId) reasons.push(reason('NO_ASSIGNEE', 'block', '任务没有负责人'))
  if (!agent) {
    reasons.push(reason('AGENT_UNAVAILABLE', 'block', '负责人不在当前 agent 快照中'))
  } else {
    const agentStatus = statusOf(agent.status)
    if (agentStatus === 'paused' || agentStatus === 'error') reasons.push(reason('AGENT_UNAVAILABLE', 'block', `负责人状态为 ${agentStatus}`))
    if (Number.isInteger(agent.openCount) && agent.openCount >= openLimit) reasons.push(reason('AGENT_AT_LIMIT', 'block', '负责人已达到并行任务上限'))
  }
  if (Number.isInteger(ctx.dispatchedToday) && ctx.dispatchedToday >= dailyLimit) {
    reasons.push(reason('DAILY_LIMIT', 'block', '已达到今日派发上限'))
  }
  if (task.leasedByRunId) reasons.push(reason('ALREADY_LEASED', 'block', '任务已有原生执行锁标记'))
  if (agent && agent.budgetRemaining === 0) reasons.push(reason('BUDGET_EXHAUSTED', 'block', '负责人预算已耗尽'))
  if (agent && agent.budgetRemaining === null) reasons.push(reason('BUDGET_UNKNOWN', 'warn', '负责人预算未知，不能当作充足'))
  if (now - dataAt > maxAge) reasons.push(reason('STALE_DATA', 'block', '输入快照已超过允许的数据新鲜度'))
  if (policy.requireContract === true && task.hasContract !== true) {
    reasons.push(reason('NO_CONTRACT', 'block', '策略要求任务必须有契约'))
  } else if (policy.requireContract !== true && task.hasContract !== true) {
    reasons.push(reason('NO_CONTRACT', 'warn', '任务没有契约，但当前策略未强制'))
  }
  if (task.parentId && task.parentStatus && statusOf(task.parentStatus) !== 'in_progress') {
    reasons.push(reason('PARENT_NOT_READY', 'warn', '父任务尚未处于进行中状态'))
  }
  const blocking = reasons.some((entry) => entry.severity === 'block')
  return { ok: true, taskId: taskIdentifier(task), eligible: !blocking, reasons }
}

function dependencyCount(task, tasks) {
  const id = String(task.id)
  return tasks.filter((candidate) =>
    Array.isArray(candidate.blockedBy) &&
    candidate.blockedBy.some((entry) => String(entry?.id) === id && !isComplete(entry?.status) && !isCancelled(entry?.status))
  ).length
}

function priorityScore(priority) {
  return PRIORITY_ORDER[statusOf(priority)] || 0
}

function compareTasks(a, b, tasks, downstreamCounts) {
  const priority = priorityScore(b.task.priority) - priorityScore(a.task.priority)
  if (priority) return priority
  const downstream = (downstreamCounts.get(String(b.task.id)) || 0) - (downstreamCounts.get(String(a.task.id)) || 0)
  if (downstream) return downstream
  const created = (parseTime(a.task.createdAt) ?? Number.POSITIVE_INFINITY) - (parseTime(b.task.createdAt) ?? Number.POSITIVE_INFINITY)
  if (created) return created
  return taskIdentifier(a.task).localeCompare(taskIdentifier(b.task))
}

export function pickNext(tasks, ctx = {}, { limit = 3 } = {}) {
  if (!Array.isArray(tasks)) return { picks: [], skipped: [], idleReason: 'NO_TASKS', ok: false, error: 'tasks must be an array' }
  const evaluations = tasks.map((task) => ({ task, evaluation: evaluateTask(task, ctx) }))
  const downstreamCounts = new Map(tasks.map((task) => [String(task?.id), 0]))
  for (const candidate of tasks) {
    if (!Array.isArray(candidate?.blockedBy)) continue
    for (const entry of candidate.blockedBy) {
      if (!isComplete(entry?.status) && !isCancelled(entry?.status)) {
        const id = String(entry?.id)
        downstreamCounts.set(id, (downstreamCounts.get(id) || 0) + 1)
      }
    }
  }
  const skipped = evaluations
    .filter(({ evaluation }) => !evaluation.eligible)
    .map(({ task, evaluation }) => ({ taskId: taskIdentifier(task), reasons: evaluation.reasons }))
  const available = evaluations
    .filter(({ evaluation }) => evaluation.eligible)
    .sort((a, b) => compareTasks(a, b, tasks, downstreamCounts))
  const remaining = new Map()
  for (const task of tasks) {
    const agent = agentFor(task, ctx)
    if (agent) remaining.set(String(agent.id), Math.max(0, (Number.isInteger(agent.openCount) ? (ctx.openLimitPerAgent ?? DEFAULT_OPEN_LIMIT) - agent.openCount : 0)))
  }
  const picks = []
  for (const entry of available) {
    if (picks.length >= Math.max(0, limit)) break
    const agentId = String(entry.task.assigneeAgentId)
    const quota = remaining.get(agentId) ?? 0
    if (quota <= 0) {
      skipped.push({ taskId: taskIdentifier(entry.task), reasons: [reason('AGENT_AT_LIMIT', 'block', '本次推荐已用尽负责人配额')] })
      continue
    }
    remaining.set(agentId, quota - 1)
    picks.push({
      taskId: taskIdentifier(entry.task),
      rank: picks.length + 1,
      score: priorityScore(entry.task.priority) * 1000 + (downstreamCounts.get(String(entry.task.id)) || 0) * 10,
      reasonsForPick: entry.evaluation.reasons.filter((item) => item.severity === 'warn'),
    })
  }
  const idleReason = picks.length || available.length
    ? undefined
    : tasks.length === 0
      ? 'NO_TASKS'
      : skipped.some((entry) => entry.reasons.some((item) => item.code === 'AWAITING_BOARD'))
        ? 'AWAITING_BOARD'
        : skipped.some((entry) => entry.reasons.some((item) => ['DEP_UNKNOWN', 'DEP_PENDING'].includes(item.code)))
          ? 'ALL_BLOCKED_BY_DEPENDENCY'
          : 'ALL_INELIGIBLE'
  return { picks, skipped, ...(idleReason ? { idleReason } : {}) }
}

export function revalidate(decision, freshTask, freshCtx) {
  const fresh = evaluateTask(freshTask, freshCtx)
  const before = new Set((decision?.reasons || []).map((entry) => entry.code))
  const after = new Set((fresh.reasons || []).map((entry) => entry.code))
  const changed = [...new Set([...before, ...after])].filter((code) => before.has(code) !== after.has(code)).sort()
  const stillEligible = fresh.eligible === true && decision?.eligible === true && changed.length === 0
  return { stillEligible, changed, fresh }
}

export function decisionRecord(decision, meta = {}) {
  return {
    at: meta.at ?? null,
    taskId: text(decision?.taskId),
    eligible: decision?.eligible === true,
    reasonCodes: [...new Set((decision?.reasons || []).map((entry) => entry.code))].sort(),
    picked: meta.picked === true,
    ruleVersion: RULE_VERSION,
  }
}
