import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSchedulerInput, decisionRecords, suggest } from '../scheduler-view.mjs'

const contract = (extra = '') => `【任务契约】
项目: Virtual AI Office
目标: 输出可检查的调度建议
允许修改: scheduler-view.mjs
禁止: 读取密钥
依赖: 无
验收标准:
- 返回建议且测试全过
预算上限: 2 次运行
交付物: scheduler-view.mjs
审核责任人: 董事会
风险等级: 低
${extra}`

const base = {
  at: '2026-10-21T12:00:00.000Z',
  schedulerAgents: [{ id: 'a1', status: 'idle', budgetRemaining: 10, openCount: 0 }],
  schedulerTasks: [],
}

test('builds sanitized scheduler input and validates contracts', () => {
  const input = buildSchedulerInput({ ...base, schedulerTasks: [{ id: '1', identifier: 'T-1', description: contract(), status: 'todo', agentId: 'a1' }] })
  assert.equal(input.tasks[0].hasContract, true)
  assert.equal(input.tasks[0].contract['禁止'][0], '读取密钥')
  assert.equal(input.ctx.policy.requireContract, false)
})

test('money tasks are skipped while a forbidden-secret task can be picked', () => {
  const result = suggest({
    ...base,
    schedulerTasks: [
      { id: 'money', identifier: 'M-1', title: '提现报表', description: contract(), status: 'todo', agentId: 'a1' },
      { id: 'safe', identifier: 'T-2', title: '安全检查', description: contract(), status: 'todo', agentId: 'a1' },
    ],
  })
  assert.deepEqual(result.picks.map((item) => item.identifier), ['T-2'])
  assert.ok(result.skipped.find((item) => item.identifier === 'M-1').reasonCodes.includes('MONEY_CLASS_NEEDS_BOARD'))
})

test('cancelled dependencies block and unknown budget is reported', () => {
  const result = suggest({
    ...base,
    schedulerAgents: [{ id: 'a1', status: 'idle', budgetRemaining: null, openCount: 0 }],
    schedulerTasks: [{ id: '1', identifier: 'T-1', description: contract(), status: 'todo', agentId: 'a1', blockedBy: [{ id: 'old', status: 'cancelled' }] }],
  })
  const skipped = result.skipped[0]
  assert.ok(skipped.reasonCodes.includes('DEP_CANCELLED'))
  assert.ok(skipped.reasonCodes.includes('BUDGET_UNKNOWN'))
})

test('stale data returns a reason and no picks', () => {
  const result = suggest({ ...base, schedulerTasks: [{ id: '1', identifier: 'T-1', description: contract(), status: 'todo', agentId: 'a1' }] }, {
    now: '2026-10-21T12:05:00.000Z',
    dataAt: '2026-10-21T12:00:00.000Z',
  })
  assert.equal(result.idleReason, 'STALE_DATA')
  assert.deepEqual(result.picks, [])
})

test('output contains identifiers and reason codes, never title or description', () => {
  const result = suggest({ ...base, schedulerTasks: [{ id: '1', identifier: 'T-1', title: 'visible title', description: contract(), status: 'todo', agentId: 'a1' }] })
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('visible title'), false)
  assert.equal(serialized.includes('【任务契约】'), false)
  assert.deepEqual(Object.keys(result.picks[0]), ['identifier', 'rank', 'reasonsForPick'])
})

test('decision records are bounded to metadata only by the caller', () => {
  const rows = decisionRecords({ picks: [{ identifier: 'T-1', rank: 1, reasonsForPick: [] }], skipped: [] }, '2026-10-21T12:00:00.000Z')
  assert.deepEqual(rows[0], { at: '2026-10-21T12:00:00.000Z', identifier: 'T-1', rank: 1, reasonCodes: [], picked: true, ruleVersion: 'L3a-3' })
  assert.equal('title' in rows[0], false)
})

test('unassigned tasks get deterministic candidates and no money candidates', () => {
  const result = suggest({
    at: '2026-10-21T12:00:00.000Z',
    schedulerAgents: [
      { id: 'a1', status: 'idle', openCount: 2, budgetRemaining: 10 },
      { id: 'a2', status: 'idle', openCount: 0, budgetRemaining: 10 },
      { id: 'a3', status: 'paused', openCount: 0, budgetRemaining: 10 },
      { id: 'a4', status: 'idle', openCount: 0, budgetRemaining: 0 },
    ],
    schedulerTasks: [
      { id: 'u1', identifier: 'T-UNASSIGNED', projectId: 'p1', title: '隐藏标题', description: contract(), status: 'backlog', priority: 'high', dependencyKnown: true, blockedBy: [] },
      { id: 'u2', identifier: 'M-UNASSIGNED', projectId: 'p1', title: '提现', description: contract(), status: 'backlog', dependencyKnown: true, blockedBy: [] },
    ],
    schedulerCompletedTasks: [{ projectId: 'p1', assigneeAgentId: 'a2', completedAt: '2026-10-20T12:00:00Z' }],
  })
  const pending = result.pendingAssignments.find((item) => item.identifier === 'T-UNASSIGNED')
  assert.deepEqual(pending.suggestedAgentIds, ['a2', 'a1'])
  assert.ok(!pending.suggestedAgentIds.includes('a3'))
  assert.ok(!pending.suggestedAgentIds.includes('a4'))
  const money = result.pendingAssignments.find((item) => item.identifier === 'M-UNASSIGNED')
  assert.deepEqual(money.suggestedAgentIds, [])
  assert.ok(money.reasonCodes.includes('MONEY_CLASS_NEEDS_BOARD'))
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('隐藏标题'), false)
  assert.equal(serialized.includes('【任务契约】'), false)
})

test('scheduler output leaves cache metadata to the route and keeps agent ids only', () => {
  const result = suggest({
    ...base,
    schedulerAgents: [{ id: 'agent-1', status: 'idle', budgetRemaining: 10, openCount: 0 }],
    schedulerTasks: [{ id: '1', identifier: 'T-1', description: contract(), status: 'todo', agentId: 'agent-1', dependencyKnown: true, blockedBy: [] }],
  })
  assert.equal('cached' in result, false)
  assert.equal(JSON.stringify(result).includes('agent name'), false)
  assert.ok(result.picks.length >= 1)
})
