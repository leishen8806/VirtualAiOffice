import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCanBind, canBind, completionPolicyFrom, evaluateCompletion, InvariantViolationError } from '../dist/index.js'
import type { CompletionPolicy, Member, Role } from '../dist/index.js'
import { evidence } from './fixtures.js'

const target = { taskId: 't1', commitSha: 'abc123' }
const testsAndReview: CompletionPolicy = { requiredChecks: ['build', 'unit_test'], requireAiReview: true, requireHumanApproval: false }

test('completion: all required evidence on the same commit passes and cites it', () => {
  const ev = [
    evidence({ kind: 'build', source: 'machine', status: 'pass' }),
    evidence({ kind: 'unit_test', source: 'machine', status: 'pass' }),
    evidence({ kind: 'review', source: 'ai', status: 'pass' }),
  ]
  const d = evaluateCompletion(testsAndReview, ev, target)
  assert.equal(d.outcome, 'passed')
  assert.deepEqual([...d.evidenceIds].sort(), ev.map((e) => e.id).sort())
})

test('completion: a failing check or a rejecting review is repairable', () => {
  const failingTest = evaluateCompletion(testsAndReview, [
    evidence({ kind: 'build', source: 'machine', status: 'pass' }),
    evidence({ kind: 'unit_test', source: 'machine', status: 'fail', summary: '3 failed' }),
    evidence({ kind: 'review', source: 'ai', status: 'pass' }),
  ], target)
  assert.equal(failingTest.outcome, 'failed')
  assert.match(failingTest.reasons.join(), /unit_test: 3 failed/)
  assert.deepEqual(failingTest.evidenceIds, [], 'only a pass cites supporting evidence')
  const rejected = evaluateCompletion({ requiredChecks: [], requireAiReview: true, requireHumanApproval: false }, [evidence({ kind: 'review', source: 'ai', status: 'fail' })], target)
  assert.equal(rejected.outcome, 'failed')
})

test('completion: fails closed on missing, errored, skipped, stale or self-reported evidence', () => {
  const cases = {
    missing: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })],
    errored: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'unit_test', source: 'machine', status: 'error' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })],
    skipped: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'unit_test', source: 'machine', status: 'skipped' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })],
    stale: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'unit_test', source: 'machine', status: 'pass', commitSha: 'old999' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })],
    selfReported: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'unit_test', source: 'ai', status: 'pass', summary: 'agent says tests pass' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })],
    reviewUnknown: [evidence({ kind: 'build', source: 'machine', status: 'pass' }), evidence({ kind: 'unit_test', source: 'machine', status: 'pass' }), evidence({ kind: 'review', source: 'ai', status: 'error', summary: 'unparseable reviewer output' })],
  }
  for (const [name, ev] of Object.entries(cases)) {
    const d = evaluateCompletion(testsAndReview, ev, target)
    assert.equal(d.outcome, 'needs_human', name)
    assert.deepEqual(d.evidenceIds, [], name)
  }
})

test('completion: nothing configured, or no commit, means unverified', () => {
  const none = evaluateCompletion({ requiredChecks: [], requireAiReview: false, requireHumanApproval: false }, [], target)
  assert.equal(none.outcome, 'needs_human')
  const noCommit = evaluateCompletion(testsAndReview, [evidence({ kind: 'build', source: 'machine', status: 'pass' })], { taskId: 't1', commitSha: null })
  assert.equal(noCommit.outcome, 'needs_human')
})

test('completion: the newest evidence of a kind wins; other tasks are ignored', () => {
  const ev = [
    evidence({ kind: 'review', source: 'ai', status: 'fail' }),
    evidence({ kind: 'review', source: 'ai', status: 'pass' }),
    evidence({ kind: 'review', source: 'ai', status: 'pass', taskId: 'other' }),
  ]
  assert.equal(evaluateCompletion({ requiredChecks: [], requireAiReview: true, requireHumanApproval: false }, ev, target).outcome, 'passed')
  const human = { requiredChecks: [], requireAiReview: false, requireHumanApproval: true } satisfies CompletionPolicy
  assert.equal(evaluateCompletion(human, [evidence({ kind: 'approval', source: 'ai', status: 'pass' })], target).outcome, 'needs_human', 'an agent cannot supply human approval')
  assert.equal(evaluateCompletion(human, [evidence({ kind: 'approval', source: 'human', status: 'pass' })], target).outcome, 'passed')
})

test('completion: policy derives required checks from the project quality profile', () => {
  const p = completionPolicyFrom({ checks: [{ kind: 'unit_test', command: 'npm test' }, { kind: 'lint', command: 'npm run lint' }, { kind: 'unit_test', command: 'npm run test:e2e' }] }, { requireAiReview: true, requireHumanApproval: false })
  assert.deepEqual(p.requiredChecks, ['unit_test', 'lint'])
})

test('role binding: agents cannot hold a role that approves', () => {
  const owner: Role = { id: 'owner', workspaceId: 'w1', name: 'Human Owner', description: '', permissions: ['approve', 'administer'], instructions: '' }
  const engineer: Role = { id: 'eng', workspaceId: 'w1', name: 'Primary Engineer', description: '', permissions: ['execute'], instructions: '' }
  const agent: Member = { id: 'a1', workspaceId: 'w1', kind: 'agent', displayName: '主力工程师' }
  const human: Member = { id: 'h1', workspaceId: 'w1', kind: 'human', displayName: 'Lei' }
  assert.equal(canBind(agent, engineer), true)
  assert.equal(canBind(human, owner), true)
  assert.equal(canBind(agent, owner), false)
  assert.throws(() => assertCanBind(agent, owner), InvariantViolationError)
  assert.throws(() => assertCanBind({ ...human, workspaceId: 'w2' }, owner), InvariantViolationError)
})
