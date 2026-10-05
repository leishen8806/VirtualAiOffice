import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EXECUTION_STATES,
  IllegalTransitionError,
  InvariantViolationError,
  TASK_STATES,
  applyExecutionEvent,
  applyTaskEvent,
  evaluateCompletion,
  executionMachine,
  isExecutionTerminal,
  taskMachine,
  transitionExecution,
  transitionTask,
} from '../dist/index.js'
import type { CompletionPolicy, Execution, ExecutionEvent, TaskEvent, TaskState } from '../dist/index.js'
import { NOW, approval, evidence, task } from './fixtures.js'

const policy: CompletionPolicy = { requiredChecks: ['unit_test'], requireAiReview: true, requireHumanApproval: false }
const target = { taskId: 't1', commitSha: 'abc123' }
const passed = evaluateCompletion(policy, [evidence({ kind: 'unit_test', source: 'machine', status: 'pass' }), evidence({ kind: 'review', source: 'ai', status: 'pass' })], target)
const failed = evaluateCompletion(policy, [evidence({ kind: 'unit_test', source: 'machine', status: 'fail', summary: '2 tests failed' })], target)
const unknown = evaluateCompletion(policy, [], target)
const subject = { kind: 'task' as const, id: 't1' }
const resumed = { type: 'HUMAN_RESUMED', approval: approval({ gate: 'task_resume', subject }) } as const
const accepted = { type: 'HUMAN_ACCEPTED', approval: approval({ gate: 'task_acceptance', subject }) } as const

const SAMPLES: Record<TaskEvent['type'], TaskEvent> = {
  DEPENDENCIES_MET: { type: 'DEPENDENCIES_MET' },
  DEPENDENCY_FAILED: { type: 'DEPENDENCY_FAILED', dependencyId: 't0' },
  UNBLOCKED: { type: 'UNBLOCKED' },
  START: { type: 'START', executionId: 'x1' },
  EXECUTION_SUCCEEDED: { type: 'EXECUTION_SUCCEEDED', executionId: 'x1' },
  EXECUTION_FAILED: { type: 'EXECUTION_FAILED', executionId: 'x1', reason: 'exit 1' },
  COMPLETION_DECIDED: { type: 'COMPLETION_DECIDED', decision: passed },
  REQUIRE_HUMAN: { type: 'REQUIRE_HUMAN', reason: 'ambiguous business rule' },
  HUMAN_RESUMED: resumed,
  HUMAN_ACCEPTED: accepted,
  GIVE_UP: { type: 'GIVE_UP', reason: 'max attempts' },
  CANCEL: { type: 'CANCEL', reason: 'requirement withdrawn' },
}

// docs/architecture/state-machines.md. COMPLETION_DECIDED is sampled with a `passed` decision.
const EXPECTED: Record<TaskState, Partial<Record<TaskEvent['type'], TaskState>>> = {
  PENDING: { DEPENDENCIES_MET: 'READY', DEPENDENCY_FAILED: 'BLOCKED', CANCEL: 'CANCELLED' },
  READY: { START: 'RUNNING', REQUIRE_HUMAN: 'WAITING_HUMAN', GIVE_UP: 'FAILED', CANCEL: 'CANCELLED' },
  RUNNING: { EXECUTION_SUCCEEDED: 'VERIFYING', EXECUTION_FAILED: 'READY', REQUIRE_HUMAN: 'WAITING_HUMAN', CANCEL: 'CANCELLED' },
  VERIFYING: { COMPLETION_DECIDED: 'DONE', REQUIRE_HUMAN: 'WAITING_HUMAN', CANCEL: 'CANCELLED' },
  WAITING_HUMAN: { HUMAN_RESUMED: 'READY', HUMAN_ACCEPTED: 'VERIFYING', CANCEL: 'CANCELLED' },
  BLOCKED: { UNBLOCKED: 'READY', CANCEL: 'CANCELLED' },
  DONE: {},
  FAILED: {},
  CANCELLED: {},
}

test('task: every state x event matches the documented table', () => {
  for (const from of TASK_STATES) {
    for (const [type, event] of Object.entries(SAMPLES) as Array<[TaskEvent['type'], TaskEvent]>) {
      const expected = EXPECTED[from][type]
      if (expected) assert.equal(transitionTask(from, event), expected, `${from} --${type}-->`)
      else assert.throws(() => transitionTask(from, event), IllegalTransitionError, `${from} --${type}--> must be illegal`)
    }
  }
  for (const s of ['DONE', 'FAILED', 'CANCELLED'] as const) assert.ok(taskMachine.isTerminal(s), `${s} is terminal`)
})

test('task: happy path ends in DONE only through an evidence-backed decision', () => {
  let t = task()
  for (const e of [SAMPLES.DEPENDENCIES_MET, SAMPLES.START, SAMPLES.EXECUTION_SUCCEEDED, { type: 'COMPLETION_DECIDED', decision: passed }] as TaskEvent[]) {
    t = applyTaskEvent(t, e, NOW)
  }
  assert.equal(t.status, 'DONE')
  assert.equal(passed.outcome, 'passed')
})

test('task: failed attempts and failed evidence go back to READY for a retry or repair', () => {
  assert.equal(transitionTask('RUNNING', SAMPLES.EXECUTION_FAILED), 'READY')
  assert.equal(transitionTask('READY', SAMPLES.START), 'RUNNING', 'a retry is just another START with a new execution')
  assert.equal(transitionTask('VERIFYING', { type: 'COMPLETION_DECIDED', decision: failed }), 'READY')
  assert.equal(transitionTask('READY', SAMPLES.GIVE_UP), 'FAILED')
})

test('task: unknown completion goes to a human, never to DONE', () => {
  assert.equal(unknown.outcome, 'needs_human')
  assert.equal(transitionTask('VERIFYING', { type: 'COMPLETION_DECIDED', decision: unknown }), 'WAITING_HUMAN')
  assert.equal(transitionTask('WAITING_HUMAN', resumed), 'READY')
  assert.equal(transitionTask('WAITING_HUMAN', accepted), 'VERIFYING', 'human acceptance never yields DONE directly')
})

test('task: human acceptance reaches DONE only through evaluateCompletion', () => {
  const humanPolicy: CompletionPolicy = { requiredChecks: ['unit_test'], requireAiReview: false, requireHumanApproval: true }
  const machine = evidence({ kind: 'unit_test', source: 'machine', status: 'pass' })
  const human = evidence({ kind: 'approval', source: 'human', status: 'pass' })
  let state = transitionTask('WAITING_HUMAN', accepted)
  assert.equal(state, 'VERIFYING')
  // Without the recorded human evidence the decision alone cannot complete the task.
  const without = evaluateCompletion(humanPolicy, [machine], target)
  assert.equal(without.outcome, 'needs_human')
  assert.equal(transitionTask(state, { type: 'COMPLETION_DECIDED', decision: without }), 'WAITING_HUMAN')
  state = transitionTask('WAITING_HUMAN', accepted)
  const withHuman = evaluateCompletion(humanPolicy, [machine, human], target)
  assert.equal(withHuman.outcome, 'passed')
  assert.equal(transitionTask(state, { type: 'COMPLETION_DECIDED', decision: withHuman }), 'DONE')
})

test('task: illegal transitions fail explicitly', () => {
  assert.throws(() => transitionTask('PENDING', SAMPLES.START), IllegalTransitionError, 'cannot start with unmet dependencies')
  assert.throws(() => transitionTask('RUNNING', SAMPLES.COMPLETION_DECIDED), IllegalTransitionError, 'cannot be judged before the attempt ends')
  assert.throws(() => transitionTask('READY', SAMPLES.HUMAN_ACCEPTED), IllegalTransitionError, 'acceptance needs a waiting human')
  assert.throws(() => transitionTask('DONE', SAMPLES.CANCEL), IllegalTransitionError, 'terminal')
})

test('task: agents cannot accept or resume work; approvals must match the task', () => {
  const byAgent = { type: 'HUMAN_ACCEPTED', approval: approval({ gate: 'task_acceptance', subject, by: 'agent' }) } as const
  assert.throws(() => transitionTask('WAITING_HUMAN', byAgent), InvariantViolationError)
  const rejected = { type: 'HUMAN_RESUMED', approval: approval({ gate: 'task_resume', subject, decision: 'rejected' }) } as const
  assert.throws(() => transitionTask('WAITING_HUMAN', rejected), InvariantViolationError)
  const other = { type: 'HUMAN_ACCEPTED', approval: approval({ gate: 'task_acceptance', subject: { kind: 'task', id: 't9' } }) } as const
  assert.throws(() => applyTaskEvent(task('WAITING_HUMAN'), other, NOW), InvariantViolationError)
})

test('task: a forged "passed" decision without evidence is rejected', () => {
  // Forging needs a double cast; the machine still refuses a pass that cites no evidence.
  const forged = { outcome: 'passed', reasons: [], evidenceIds: [], commitSha: 'abc123' } as unknown as typeof passed
  assert.throws(() => transitionTask('VERIFYING', { type: 'COMPLETION_DECIDED', decision: forged }), InvariantViolationError)
})

test('execution: RUNNING ends in exactly one terminal state', () => {
  const events: Record<ExecutionEvent['type'], [ExecutionEvent, string]> = {
    SUCCEED: [{ type: 'SUCCEED' }, 'SUCCEEDED'],
    FAIL: [{ type: 'FAIL', error: 'exit 2' }, 'FAILED'],
    TIME_OUT: [{ type: 'TIME_OUT' }, 'TIMED_OUT'],
    CANCEL: [{ type: 'CANCEL' }, 'CANCELLED'],
  }
  for (const [event, to] of Object.values(events)) assert.equal(transitionExecution('RUNNING', event), to)
  for (const s of EXECUTION_STATES) {
    assert.equal(isExecutionTerminal(s), s !== 'RUNNING')
    if (s === 'RUNNING') continue
    for (const [event] of Object.values(events)) assert.throws(() => transitionExecution(s, event), IllegalTransitionError, `${s} is terminal`)
  }
  assert.deepEqual(executionMachine.allowedEvents('RUNNING').slice().sort(), ['CANCEL', 'FAIL', 'SUCCEED', 'TIME_OUT'])
})

test('execution: applying an event records the end time and the error', () => {
  const x: Execution = { id: 'x1', taskId: 't1', kind: 'initial', attempt: 1, executorId: 'exec-a', memberId: 'agent-1', status: 'RUNNING', workdir: '/tmp/wt', startedAt: NOW }
  const done = applyExecutionEvent(x, { type: 'FAIL', error: 'tests failed' }, '2026-10-05T12:05:00.000Z')
  assert.equal(done.status, 'FAILED')
  assert.equal(done.error, 'tests failed')
  assert.equal(done.endedAt, '2026-10-05T12:05:00.000Z')
  assert.equal(x.status, 'RUNNING', 'entities are not mutated in place')
})
