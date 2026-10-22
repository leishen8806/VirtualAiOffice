import { parseContract, validateContract } from './task-contract.mjs'

export const CONTRACT_VIEW_LIMIT = 500

function text(value, max = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function safeStatus(value) {
  return text(value, 32) || 'unknown'
}

function projectKey(task) {
  return text(task?.projectId || task?.project || '未分组', 80) || '未分组'
}

export function summarizeContracts(tasks, { now } = {}) {
  const source = Array.isArray(tasks) ? tasks : []
  const truncated = source.length > CONTRACT_VIEW_LIMIT
  const items = []
  const byProject = {}
  let withContract = 0
  let complete = 0
  let incomplete = 0
  let none = 0
  for (const task of source.slice(0, CONTRACT_VIEW_LIMIT)) {
    const parsed = parseContract(task?.description)
    const project = projectKey(task)
    const item = {
      identifier: text(task?.identifier || task?.id, 80),
      status: safeStatus(task?.status),
      state: 'none',
      errors: [],
    }
    if (!parsed.found) {
      none++
    } else {
      withContract++
      const result = validateContract(parsed.contract, { now, assignee: task?.assignee })
      item.state = result.ok ? 'complete' : 'incomplete'
      item.errors = result.errors.map((error) => ({ field: text(error.field, 40), code: text(error.code, 60) }))
      if (result.ok) complete++
      else incomplete++
    }
    items.push(item)
    byProject[project] = byProject[project] || { total: 0, complete: 0, incomplete: 0, none: 0 }
    byProject[project].total++
    byProject[project][item.state]++
  }
  return {
    total: source.length,
    withContract,
    complete,
    incomplete,
    none,
    truncated,
    byProject,
    items,
  }
}
