import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  DONE_RULE_VERSION,
  LEVELS,
  parseVersion,
  sameVersion,
  completionLevel,
  evaluateDone,
  enforcementBoundary,
} from '../done-rules.mjs'

const current = 'git:E:/repo@abcdef1234567890'
const ev = (kind, overrides = {}) => ({
  kind,
  subjectVersion: current,
  at: '2026-10-21T01:00:00Z',
  ref: `${kind}-ref`,
  ok: true,
  actor: kind === 'execution' ? 'agent-1' : 'reviewer-1',
  ...overrides,
})
const full = () => [
  ev('execution'),
  ev('test', { protectedTestsHash: 'hash-1' }),
  ev('review', { actor: 'reviewer-1' }),
  ev('acceptance', { actor: 'board-1' }),
  ev('merge'),
  ev('release'),
]
const enforced = {
  enforcedSince: '2026-01-01T00:00:00Z',
  executorActor: 'agent-1',
  protectedTestsHash: 'hash-1',
  boardActors: ['board-1'],
}

test('version parsing normalizes git and sha256 without equating invalid values', () => {
  assert.equal(parseVersion(current).kind, 'git')
  assert.equal(sameVersion('git:e:/REPO@ABCDEF1', 'git:E:/repo@abcdef123'), true)
  assert.equal(sameVersion('sha256:E:/A.txt=' + 'A'.repeat(64), 'sha256:e:/a.txt=' + 'a'.repeat(64)), true)
  assert.equal(sameVersion('git:E:/repo@abcdef1', 'git:E:/other@abcdef1'), false)
  assert.equal(sameVersion('git:E:/repo@abcdef1', 'bad-version'), false)
  assert.equal(parseVersion('git:E:/repo@abcdef').kind, 'unparseable')
})

test('levels advance continuously and reject non-independent reviews', () => {
  assert.equal(completionLevel([ev('execution')], current).level, 'executed')
  assert.equal(completionLevel([ev('execution'), ev('test')], current).level, 'verified')
  assert.equal(completionLevel([ev('execution'), ev('test'), ev('review', { actor: 'agent-1' })], current).level, 'verified')
  assert.equal(completionLevel([ev('execution'), ev('test'), ev('review')], current, { executorActor: 'agent-1' }).level, 'reviewed')
  assert.equal(completionLevel([...full().slice(0, 4)], current, { executorActor: 'agent-1' }).level, 'accepted')
  assert.equal(completionLevel(full(), current, { executorActor: 'agent-1' }).level, 'released')
  assert.deepEqual(LEVELS, ['executed', 'verified', 'reviewed', 'accepted', 'merged', 'released'])
})

test('stale, failed and protected test evidence do not count', () => {
  const stale = completionLevel([ev('execution', { subjectVersion: 'git:E:/repo@1111111' })], current)
  assert.equal(stale.level, 'none')
  assert.equal(stale.stale[0].reason, 'VERSION_MISMATCH')
  assert.equal(completionLevel([ev('execution', { ok: false })], current).level, 'none')
  assert.equal(completionLevel([ev('execution'), ev('test', { protectedTestsHash: 'other' })], current, { protectedTestsHash: 'hash-1' }).level, 'executed')
})

test('evaluateDone enforces accepted, merged, board and stale acceptance rules', () => {
  assert.equal(evaluateDone({ createdAt: '2026-10-21T00:00:00Z' }, full(), current, enforced).done, true)
  assert.equal(evaluateDone({ createdAt: '2026-10-21T00:00:00Z' }, full(), current, { ...enforced, requiredLevel: 'merged' }).done, true)
  assert.equal(evaluateDone({ createdAt: '2026-10-21T00:00:00Z', riskClass: 'money' }, full(), current, enforced).done, true)
  const notBoard = evaluateDone({ createdAt: '2026-10-21T00:00:00Z', riskClass: 'money' }, full().map((item) => item.kind === 'acceptance' ? { ...item, actor: 'agent-1' } : item), current, enforced)
  assert.equal(notBoard.done, false)
  assert.ok(notBoard.reasons.includes('BOARD_ACCEPTANCE_REQUIRED'))
  const stale = evaluateDone({ createdAt: '2026-10-21T00:00:00Z' }, full().map((item) => item.kind === 'acceptance' ? { ...item, subjectVersion: 'git:E:/repo@1111111' } : item), current, enforced)
  assert.equal(stale.done, false)
  assert.ok(stale.reasons.includes('ACCEPTANCE_STALE'))
})

test('enforcement has three states and legacy injection', () => {
  const task = { createdAt: '2025-01-01T00:00:00Z' }
  assert.equal(evaluateDone(task, [], current, { ...enforced, legacyDone: () => true }).enforced, false)
  assert.equal(evaluateDone(task, [], current, { ...enforced, legacyDone: () => true }).done, true)
  assert.equal(evaluateDone({ createdAt: '2027-01-01T00:00:00Z' }, [], current, { legacyDone: () => true }).enforced, false)
  assert.equal(evaluateDone({ createdAt: '2027-01-01T00:00:00Z' }, [], current, { ...enforced }).enforced, true)
  assert.ok(evaluateDone({ createdAt: '2027-01-01T00:00:00Z' }, [], current, { ...enforced }).reasons.includes('NO_EXECUTION'))
})

test('unknown inputs, deterministic large input and no retry/rework levels', () => {
  assert.equal(completionLevel(null, current).level, 'none')
  assert.equal(completionLevel([{ kind: 'unknown', ok: true }], current).level, 'none')
  const many = Array.from({ length: 100000 }, (_, index) => ev('test', { ref: `t-${index}` }))
  const started = process.hrtime.bigint()
  const result = completionLevel(many, current)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.equal(result.level, 'none')
  assert.ok(elapsed < 500, `completionLevel took ${elapsed}ms`)
  assert.ok(!['retry', 'rework', 'escalated'].includes(result.level))
})

test('boundary is honest and static module is pure', () => {
  const boundary = enforcementBoundary()
  assert.ok(boundary.uncoveredPaths.length > 0)
  assert.doesNotMatch(boundary.note, /全局已强制/)
  const source = fs.readFileSync(new URL('../done-rules.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fetch|Date\.now|Math\.random|child_process|eval|innerHTML)\b/)
  assert.doesNotMatch(source, /from ['"]\.[^'"]*\.mjs['"]/)
})
