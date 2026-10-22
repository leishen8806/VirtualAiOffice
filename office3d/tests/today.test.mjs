import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeToday } from '../today.mjs'

const base = { projects: [], assigned: [], waiting: [], runsToday: {}, duty: { on: true } }

test('zero total never produces NaN', () => {
  const out = computeToday({ ...base, now: '2026-10-17T01:00:00Z' })
  assert.equal(out.total, 0)
  assert.equal(out.percent, 0)
  assert.equal(out.backlog, 0)
})

test('completed work counts without open work', () => {
  const out = computeToday({ ...base, now: '2026-10-17T10:00:00+07:00', doneLedger: [{ id: 'a', at: '2026-10-17T09:00:00+07:00' }] })
  assert.equal(out.done, 1)
  assert.equal(out.total, 1)
  assert.equal(out.percent, 1)
})

test('金边午夜 decides which day owns a completion', () => {
  const ledger = [{ at: '2026-10-16T23:59:00+07:00' }, { at: '2026-10-17T00:01:00+07:00' }]
  assert.equal(computeToday({ ...base, now: '2026-10-16T23:59:30+07:00', doneLedger: ledger }).done, 1)
  assert.equal(computeToday({ ...base, now: '2026-10-17T00:01:30+07:00', doneLedger: ledger }).done, 1)
})

test('dayOff follows the configured work days (Sunday off only when not in days)', () => {
  const off = computeToday({ ...base, now: '2026-10-18T12:00:00+07:00', duty: { on: false, days: [1, 2, 3, 4, 5, 6] } })
  assert.equal(off.weekday, '周日')
  assert.equal(off.dayOff, true)
  assert.equal(off.onDuty, false)
  const work = computeToday({ ...base, now: '2026-10-18T12:00:00+07:00', duty: { on: true, days: [0, 1, 2, 3, 4, 5, 6] } })
  assert.equal(work.dayOff, false)
  assert.equal(work.onDuty, true)
  assert.equal(computeToday({ ...base, now: '2026-10-18T12:00:00+07:00', duty: { on: false } }).dayOff, true) // 没有配置：沿用周日休息
})

test('old ledger rows without projectId are kept as unclassified', () => {
  const out = computeToday({ ...base, now: '2026-10-17T10:00:00+07:00', doneLedger: [{ at: '2026-10-17T09:00:00+07:00' }], assigned: [{ status: 'todo', projectId: 'p1' }], projects: [{ id: 'p1', name: '项目一' }] })
  assert.deepEqual(out.byProject, [{ projectId: null, name: '未归类', done: 1, total: 1 }, { projectId: 'p1', name: '项目一', done: 0, total: 1 }])
})

test('backlog is separate and excluded from total; projects are not truncated in data', () => {
  const assigned = Array.from({ length: 8 }, (_, i) => ({ status: i < 7 ? 'todo' : 'backlog', projectId: `p${i}` }))
  const out = computeToday({ ...base, now: '2026-10-17T10:00:00+07:00', assigned, projects: assigned.map((x, i) => ({ id: x.projectId, name: `项目${i}` })) })
  assert.equal(out.backlog, 1)
  assert.equal(out.total, 7)
  assert.equal(out.open.total, 7)
  assert.equal(out.byProject.length, 7)
})

test('status breakdown and daily counters are numeric', () => {
  const out = computeToday({ ...base, assigned: [{ status: 'in_progress' }, { status: 'in_review' }, { status: 'blocked' }, { status: 'todo' }], runsToday: { runs: { total: 4, succeeded: 3, failed: 1 }, comments: 2, decisions: { approved: 1, rejected: 1 } } })
  assert.deepEqual(out.open, { inProgress: 1, inReview: 1, blocked: 1, todo: 1, total: 4 })
  assert.deepEqual(out.runs, { total: 4, succeeded: 3, failed: 1 })
  assert.deepEqual(out.decisions, { approved: 1, rejected: 1 })
})
