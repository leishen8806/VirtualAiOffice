import { parseContract, validateContract } from './task-contract.mjs'
import { RULE_VERSION, pickNext } from './scheduler-core.mjs'

const MAX_TEXT = 200

function text(value, max = MAX_TEXT) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function time(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function sourceTasks(state) {
  if (Array.isArray(state?.schedulerTasks)) return state.schedulerTasks
  if (Array.isArray(state?.tasks)) return state.tasks
  return [...(Array.isArray(state?.assigned) ? state.assigned : []), ...(Array.isArray(state?.backlog) ? state.backlog : [])]
}

function sourceAgents(state) {
  return Array.isArray(state?.schedulerAgents) ? state.schedulerAgents : (Array.isArray(state?.agents) ? state.agents : [])
}

function normalizeTask(raw) {
  const task = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const description = String(task.description ?? '').replace(/[\u0000-\u001f\u007f]/g, (value) => value === '\n' || value === '\r' ? value : ' ').trim().slice(0, 2000)
  const parsed = parseContract(description)
  const contract = parsed.found ? parsed.contract : null
  const validation = contract ? validateContract(contract, { assignee: task.assignee || task.assigneeAgentId }) : null
  return {
    id: text(task.id || task.issueId || task.identifier),
    identifier: text(task.identifier || task.id || task.issueId),
    title: text(task.title),
    description,
    status: text(task.status),
    priority: text(task.priority || 'medium'),
    assigneeAgentId: text(task.assigneeAgentId || task.agentId || task.assigneeId),
    blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy : [],
    dependencyKnown: task.dependencyKnown !== false,
    awaitingBoard: task.awaitingBoard === true,
    leasedByRunId: text(task.leasedByRunId),
    createdAt: task.createdAt || task.at || null,
    parentId: text(task.parentId),
    parentStatus: text(task.parentStatus),
    ...(contract ? { contract } : {}),
    hasContract: Boolean(parsed.found && validation?.ok === true),
  }
}

function normalizeAgent(raw, tasks) {
  const agent = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const id = text(agent.id)
  const openCount = Number.isInteger(agent.openCount)
    ? agent.openCount
    : tasks.filter((task) => task.assigneeAgentId === id && ['todo', 'in_progress', 'in_review', 'blocked'].includes(String(task.status).toLowerCase())).length
  return {
    id,
    status: text(agent.status),
    openCount,
    budgetRemaining: typeof agent.budgetRemaining === 'number' && Number.isFinite(agent.budgetRemaining) ? agent.budgetRemaining : null,
  }
}

export function buildSchedulerInput(state, { now, dataAt } = {}) {
  const tasks = sourceTasks(state).map(normalizeTask).filter((task) => task.id)
  const agents = sourceAgents(state).map((agent) => normalizeAgent(agent, tasks)).filter((agent) => agent.id)
  const resolvedNow = time(now ?? state?.at)
  const resolvedDataAt = time(dataAt ?? state?.schedulerDataAt ?? state?.at)
  return {
    tasks,
    agents,
    ctx: {
      now: resolvedNow,
      dataAt: resolvedDataAt,
      agents,
      policy: { moneyNeedsBoard: true, cancelledDependencySatisfies: false, requireContract: false },
      maxDataAgeMs: 120000,
      dispatchedToday: Number.isInteger(state?.dispatchedToday) ? state.dispatchedToday : 0,
    },
  }
}

function reasonCodes(reasons) {
  return [...new Set((Array.isArray(reasons) ? reasons : []).map((item) => text(item?.code, 60)).filter(Boolean))].sort()
}

function assignmentCandidates(task, state) {
  const agents = sourceAgents(state)
    .map((agent) => normalizeAgent(agent, sourceTasks(state)))
    .filter((agent) => agent.id && !['paused', 'error', 'terminated'].includes(agent.status.toLowerCase()) && agent.budgetRemaining !== 0)
  const completed = Array.isArray(state?.schedulerCompletedTasks) ? state.schedulerCompletedTasks : []
  const scored = agents.map((agent) => {
    const history = completed
      .filter((item) => String(item.projectId || '') === String(task.projectId || '') && String(item.assigneeAgentId || '') === agent.id)
      .sort((a, b) => (time(b.completedAt) || 0) - (time(a.completedAt) || 0))
    return {
      agent,
      historyCount: history.length,
      latest: time(history[0]?.completedAt) || 0,
    }
  })
  scored.sort((a, b) => b.historyCount - a.historyCount || b.latest - a.latest || a.agent.openCount - b.agent.openCount || a.agent.id.localeCompare(b.agent.id))
  return scored.slice(0, 3).map(({ agent }) => agent.id)
}

export function suggest(state, opts = {}) {
  const input = buildSchedulerInput(state, opts)
  const selected = pickNext(input.tasks, input.ctx, { limit: Number.isInteger(opts.limit) ? opts.limit : 3 })
  const now = time(opts.now ?? state?.at)
  const dataAt = time(opts.dataAt ?? state?.schedulerDataAt ?? state?.at)
  const dataAgeMs = now !== null && dataAt !== null ? Math.max(0, now - dataAt) : null
  const picks = (selected.picks || []).map((item) => ({
    identifier: text(item.taskId),
    rank: item.rank,
    reasonsForPick: reasonCodes(item.reasonsForPick),
  }))
  const skipped = (selected.skipped || []).map((item) => ({
    identifier: text(item.taskId),
    reasonCodes: reasonCodes(item.reasons),
  }))
  const pendingAssignments = input.tasks
    .filter((task) => !task.assigneeAgentId && ['todo', 'backlog'].includes(String(task.status).toLowerCase()))
    .map((task) => {
      const evaluation = selected.skipped.find((item) => item.taskId === text(task.identifier || task.id))
      const codes = reasonCodes(evaluation?.reasons)
      const money = codes.includes('MONEY_CLASS_NEEDS_BOARD')
      return {
        identifier: text(task.identifier || task.id),
        suggestedAgentIds: money || codes.some((code) => ['DEP_UNKNOWN', 'DEP_PENDING', 'DEP_CANCELLED', 'AWAITING_BOARD'].includes(code))
          ? []
          : assignmentCandidates(task, state),
        reasonCodes: codes,
      }
    })
  const stale = dataAgeMs !== null && dataAgeMs > input.ctx.maxDataAgeMs
  return {
    ruleVersion: RULE_VERSION,
    picks: stale ? [] : picks,
    skipped,
    pendingAssignments: stale ? [] : pendingAssignments,
    ...(stale ? { idleReason: 'STALE_DATA' } : selected.idleReason ? { idleReason: selected.idleReason } : {}),
    dataAgeMs,
  }
}

export function decisionRecords(result, at) {
  const rows = [
    ...(result?.picks || []).map((item) => ({ identifier: item.identifier, rank: item.rank, reasonCodes: item.reasonsForPick || [], picked: true })),
    ...(result?.skipped || []).map((item) => ({ identifier: item.identifier, rank: null, reasonCodes: item.reasonCodes || [], picked: false })),
  ]
  return rows.map((row) => ({ at: at ?? null, ...row, ruleVersion: RULE_VERSION }))
}
