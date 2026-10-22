import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  RULE_VERSION,
  PRIORITY_ORDER,
  REASON_CODES,
  evaluateTask,
  pickNext,
  revalidate,
  decisionRecord,
} from '../scheduler-core.mjs'

const baseCtx = (overrides = {}) => ({
  now: 1000,
  dataAt: 1000,
  agents: [{ id: 'a1', status: 'idle', openCount: 0, budgetRemaining: 10, permissions: [] }],
  policy: { requireContract: false, moneyNeedsBoard: true },
  ...overrides,
})
const task = (overrides = {}) => ({
  id: 't1',
  identifier: 'CMP-1',
  title: '普通任务',
  description: '实现面板',
  status: 'todo',
  priority: 'medium',
  assigneeAgentId: 'a1',
  projectId: 'p1',
  createdAt: 100,
  updatedAt: 900,
  blockedBy: [],
  hasContract: true,
  riskClass: '低',
  awaitingBoard: false,
  leasedByRunId: null,
  ...overrides,
})

function codes(result) {
  return result.reasons.map((entry) => entry.code)
}

test('exports frozen rule tables and evaluates a clean task', () => {
  assert.equal(evaluateTask(task(), baseCtx()).eligible, true)
  assert.ok(Object.isFrozen(PRIORITY_ORDER))
  assert.ok(Object.isFrozen(REASON_CODES))
  assert.equal(RULE_VERSION, 'L3a-3')
  assert.ok(REASON_CODES.includes('DEP_CANCELLED'))
  assert.ok(REASON_CODES.includes('DEP_UNKNOWN'))
})

test('dependency pending blocks, cancelled dependencies block by default, and done dependencies pass', () => {
  assert.ok(codes(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'todo' }] }), baseCtx())).includes('DEP_PENDING'))
  assert.ok(!codes(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'done' }] }), baseCtx())).includes('DEP_PENDING'))
  assert.ok(codes(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'cancelled' }] }), baseCtx())).includes('DEP_CANCELLED'))
  assert.equal(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'cancelled' }] }), baseCtx()).eligible, false)
  assert.equal(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'cancelled' }] }), baseCtx({ policy: { cancelledDependencySatisfies: true } })).eligible, true)
  assert.equal(evaluateTask(task({ blockedBy: [{ id: 'd', status: 'done' }, { id: 'c', status: 'cancelled' }] }), baseCtx()).eligible, false)
})

test('unknown dependency shape blocks conservatively while reliable completed dependencies pass', () => {
  assert.ok(codes(evaluateTask(task({ dependencyKnown: false }), baseCtx())).includes('DEP_UNKNOWN'))
  assert.equal(evaluateTask(task({ dependencyKnown: false }), baseCtx()).eligible, false)
  assert.equal(evaluateTask(task({ dependencyKnown: true, blockedBy: [{ id: 'd', status: 'done' }] }), baseCtx()).eligible, true)
})

test('board and money gates block only when configured', () => {
  assert.ok(codes(evaluateTask(task({ awaitingBoard: true }), baseCtx())).includes('AWAITING_BOARD'))
  assert.equal(evaluateTask(task({ description: '禁止: 读取密钥, 不得提现' }), baseCtx()).eligible, true)
  assert.ok(codes(evaluateTask(task({ title: '提现报表' }), baseCtx())).includes('MONEY_CLASS_NEEDS_BOARD'))
  assert.ok(codes(evaluateTask(task({ contract: { '交付物': '迁移脚本' } }), baseCtx())).includes('MONEY_CLASS_NEEDS_BOARD'))
  assert.equal(evaluateTask(task({ contract: { '禁止': '读取密钥' } }), baseCtx()).eligible, true)
  assert.ok(!codes(evaluateTask(task({ title: '提现报表' }), baseCtx({ policy: { moneyNeedsBoard: false } }))).includes('MONEY_CLASS_NEEDS_BOARD'))
})

test('agent availability and parallel limit have separate boundaries', () => {
  assert.ok(codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'paused', openCount: 0, budgetRemaining: 1 }] }))).includes('AGENT_UNAVAILABLE'))
  assert.ok(codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'error', openCount: 0, budgetRemaining: 1 }] }))).includes('AGENT_UNAVAILABLE'))
  assert.ok(codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 2, budgetRemaining: 1 }] }))).includes('AGENT_AT_LIMIT'))
  assert.ok(!codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 1, budgetRemaining: 1 }] }))).includes('AGENT_AT_LIMIT'))
})

test('daily, lease and budget guards distinguish exact boundaries', () => {
  assert.ok(codes(evaluateTask(task(), baseCtx({ dispatchedToday: 5 }))).includes('DAILY_LIMIT'))
  assert.ok(!codes(evaluateTask(task(), baseCtx({ dispatchedToday: 4 }))).includes('DAILY_LIMIT'))
  assert.ok(codes(evaluateTask(task({ leasedByRunId: 'run-1' }), baseCtx())).includes('ALREADY_LEASED'))
  assert.ok(codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 0, budgetRemaining: 0 }] }))).includes('BUDGET_EXHAUSTED'))
  assert.ok(codes(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 0, budgetRemaining: null }] }))).includes('BUDGET_UNKNOWN'))
  assert.equal(evaluateTask(task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 0, budgetRemaining: null }] })).eligible, true)
})

test('stale data blocks only after the exact age boundary', () => {
  assert.ok(codes(evaluateTask(task(), baseCtx({ now: 1120, dataAt: 1000 }))).includes('STALE_DATA') === false)
  assert.ok(codes(evaluateTask(task(), baseCtx({ now: 121001, dataAt: 1000 }))).includes('STALE_DATA'))
  assert.ok(codes(evaluateTask(task(), baseCtx({ now: 1120, dataAt: 1000, maxDataAgeMs: 120 }))).includes('STALE_DATA') === false)
})

test('contract, wrong status, parent and assignee rules are explicit', () => {
  assert.ok(codes(evaluateTask(task({ status: 'in_review' }), baseCtx())).includes('WRONG_STATUS'))
  assert.ok(codes(evaluateTask(task({ status: 'done' }), baseCtx())).includes('WRONG_STATUS'))
  assert.ok(codes(evaluateTask(task({ hasContract: false }), baseCtx({ policy: { requireContract: true } }))).includes('NO_CONTRACT'))
  assert.ok(codes(evaluateTask(task({ hasContract: false }), baseCtx())).includes('NO_CONTRACT'))
  assert.equal(evaluateTask(task({ hasContract: false }), baseCtx()).eligible, true)
  assert.ok(codes(evaluateTask(task({ parentId: 'p', parentStatus: 'todo' }), baseCtx())).includes('PARENT_NOT_READY'))
  assert.ok(codes(evaluateTask(task({ assigneeAgentId: null }), baseCtx())).includes('NO_ASSIGNEE'))
})

test('invalid input returns an error instead of throwing', () => {
  assert.equal(evaluateTask(null, baseCtx()).ok, false)
  assert.equal(evaluateTask(task(), { now: 'bad', dataAt: 1, agents: [] }).ok, false)
  assert.equal(evaluateTask(task({ blockedBy: 'bad' }), baseCtx()).ok, false)
})

test('pickNext sorts priority, downstream count, creation time and identifier', () => {
  const agents = [
    { id: 'a1', status: 'idle', openCount: 0, budgetRemaining: 1 },
    { id: 'a2', status: 'idle', openCount: 0, budgetRemaining: 1 },
  ]
  const tasks = [
    task({ id: 'old', identifier: 'CMP-9', priority: 'low', assigneeAgentId: 'a1', createdAt: 10 }),
    task({ id: 'high', identifier: 'CMP-2', priority: 'high', assigneeAgentId: 'a2', createdAt: 30 }),
    task({ id: 'high2', identifier: 'CMP-3', priority: 'high', assigneeAgentId: 'a2', createdAt: 20, blockedBy: [] }),
  ]
  const result = pickNext(tasks, baseCtx({ agents }), { limit: 3 })
  assert.deepEqual(result.picks.map((entry) => entry.taskId), ['CMP-3', 'CMP-2', 'CMP-9'])
  const shuffled = pickNext([...tasks].reverse(), baseCtx({ agents }), { limit: 3 })
  assert.deepEqual(shuffled.picks, result.picks)
})

test('pickNext enforces limit and per-agent quota', () => {
  const tasks = [
    task({ id: '1', identifier: 'CMP-1', assigneeAgentId: 'a1', priority: 'high' }),
    task({ id: '2', identifier: 'CMP-2', assigneeAgentId: 'a1', priority: 'medium' }),
    task({ id: '3', identifier: 'CMP-3', assigneeAgentId: 'a1', priority: 'low' }),
  ]
  const result = pickNext(tasks, baseCtx(), { limit: 3 })
  assert.equal(result.picks.length, 2)
  assert.ok(result.skipped.some((entry) => entry.taskId === 'CMP-3'))
  assert.equal(pickNext(tasks, baseCtx(), { limit: 1 }).picks.length, 1)
})

test('pickNext returns idle reasons and never picks money tasks', () => {
  const blocked = pickNext([task({ blockedBy: [{ id: 'd', status: 'todo' }] })], baseCtx())
  assert.deepEqual(blocked.picks, [])
  assert.equal(blocked.idleReason, 'ALL_BLOCKED_BY_DEPENDENCY')
  const money = pickNext([task({ title: '提现任务' })], baseCtx())
  assert.deepEqual(money.picks, [])
  assert.ok(money.skipped[0].reasons.some((entry) => entry.code === 'MONEY_CLASS_NEEDS_BOARD'))
})

test('revalidate catches dependency, agent, budget and freshness changes', () => {
  const original = evaluateTask(task(), baseCtx())
  assert.equal(revalidate(original, task({ blockedBy: [{ id: 'd', status: 'todo' }] }), baseCtx()).stillEligible, false)
  const cancelled = revalidate(original, task({ blockedBy: [{ id: 'd', status: 'cancelled' }] }), baseCtx())
  assert.equal(cancelled.stillEligible, false)
  assert.ok(cancelled.changed.includes('DEP_CANCELLED'))
  assert.equal(revalidate(original, task(), baseCtx({ agents: [{ id: 'a1', status: 'paused', openCount: 0, budgetRemaining: 1 }] })).stillEligible, false)
  assert.equal(revalidate(original, task(), baseCtx({ agents: [{ id: 'a1', status: 'idle', openCount: 0, budgetRemaining: 0 }] })).stillEligible, false)
  assert.equal(revalidate(original, task(), baseCtx({ now: 1000 + 120001, dataAt: 1000 })).stillEligible, false)
  assert.ok(revalidate(original, task(), baseCtx()).stillEligible)
})

test('decision records contain only audit fields', () => {
  const record = decisionRecord(evaluateTask(task({ title: 'secret title', description: 'body' }), baseCtx()), { at: 1000, picked: true })
  assert.deepEqual(Object.keys(record).sort(), ['at', 'eligible', 'picked', 'reasonCodes', 'ruleVersion', 'taskId'])
  assert.equal(record.ruleVersion, RULE_VERSION)
  assert.equal('title' in record, false)
  assert.equal('description' in record, false)
  assert.equal('body' in record, false)
  assert.equal('comment' in record, false)
})

test('missing fields and 10000 tasks stay safe and fast', () => {
  assert.doesNotThrow(() => pickNext([{}], baseCtx()))
  const tasks = Array.from({ length: 10000 }, (_, index) => task({ id: String(index), identifier: `CMP-${index + 1}`, createdAt: index }))
  const started = process.hrtime.bigint()
  const result = pickNext(tasks, baseCtx(), { limit: 3 })
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.equal(result.picks.length, 2)
  assert.ok(elapsed < 500, `pickNext took ${elapsed}ms`)
})

test('pure module has no runtime side effects or forbidden imports', () => {
  const source = fs.readFileSync(new URL('../scheduler-core.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fetch|Date\.now|Math\.random|child_process|eval|innerHTML)\b/)
  assert.match(source, /from ['"]\.\/standup\.mjs['"]/)
})
