import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  IllegalTransitionError,
  InvariantViolationError,
  REQUIREMENT_STATES,
  applyRequirementEvent,
  requirementMachine,
  transitionRequirement,
} from '../dist/index.js'
import type { RequirementAnalysis, RequirementEvent, RequirementState } from '../dist/index.js'
import { NOW, approval, requirement } from './fixtures.js'

const analysis: RequirementAnalysis = {
  goal: '用户能登录',
  scenarios: ['手机号登录'],
  scope: ['登录页', '登录接口'],
  nonScope: ['注册'],
  businessRules: ['密码错误 5 次锁定'],
  risks: ['短信服务未定'],
  openQuestions: ['是否需要记住我？'],
  acceptanceCriteria: ['正确密码可登录'],
}
const subject = { kind: 'requirement' as const, id: 'r1' }
const approve = { type: 'APPROVE', approval: approval({ gate: 'requirement', subject }) } as const
const reject = { type: 'REJECT', approval: approval({ gate: 'requirement', subject, decision: 'rejected' }) } as const
const deliver = { type: 'DELIVER', openTaskCount: 0, approval: approval({ gate: 'delivery', subject }) } as const

// One representative event per type, used for the exhaustive table check.
const SAMPLES: Record<RequirementEvent['type'], RequirementEvent> = {
  START_ANALYSIS: { type: 'START_ANALYSIS' },
  ANALYSIS_COMPLETED: { type: 'ANALYSIS_COMPLETED', analysis },
  ANALYSIS_FAILED: { type: 'ANALYSIS_FAILED', reason: 'timeout' },
  APPROVE: approve,
  REJECT: reject,
  PLAN: { type: 'PLAN', taskCount: 3 },
  DELIVER: deliver,
}

// The documented table (docs/architecture/state-machines.md). Anything not listed is illegal.
const EXPECTED: Record<RequirementState, Partial<Record<RequirementEvent['type'], RequirementState>>> = {
  DRAFT: { START_ANALYSIS: 'ANALYZING' },
  ANALYZING: { ANALYSIS_COMPLETED: 'WAITING_APPROVAL', ANALYSIS_FAILED: 'DRAFT' },
  WAITING_APPROVAL: { APPROVE: 'APPROVED', REJECT: 'DRAFT' },
  APPROVED: { PLAN: 'PLANNED' },
  PLANNED: { DELIVER: 'DELIVERED' },
  DELIVERED: {},
}

test('requirement: every state x event matches the documented table', () => {
  for (const from of REQUIREMENT_STATES) {
    for (const [type, event] of Object.entries(SAMPLES) as Array<[RequirementEvent['type'], RequirementEvent]>) {
      const expected = EXPECTED[from][type]
      if (expected) assert.equal(transitionRequirement(from, event), expected, `${from} --${type}-->`)
      else assert.throws(() => transitionRequirement(from, event), IllegalTransitionError, `${from} --${type}--> must be illegal`)
    }
  }
  assert.ok(requirementMachine.isTerminal('DELIVERED'))
})

test('requirement: full valid lifecycle through Gate 1 and Gate 2', () => {
  let r = requirement()
  r = applyRequirementEvent(r, { type: 'START_ANALYSIS' }, NOW)
  r = applyRequirementEvent(r, { type: 'ANALYSIS_COMPLETED', analysis }, NOW)
  assert.equal(r.status, 'WAITING_APPROVAL')
  assert.deepEqual(r.analysis, analysis)
  assert.equal(r.rawText, '做一个登录页', 'analysis never overwrites what the human wrote')
  r = applyRequirementEvent(r, approve, NOW)
  r = applyRequirementEvent(r, { type: 'PLAN', taskCount: 2 }, NOW)
  r = applyRequirementEvent(r, deliver, NOW)
  assert.equal(r.status, 'DELIVERED')
})

test('requirement: rejection and failed analysis go back to DRAFT', () => {
  assert.equal(transitionRequirement('WAITING_APPROVAL', reject), 'DRAFT')
  assert.equal(transitionRequirement('ANALYZING', { type: 'ANALYSIS_FAILED', reason: 'executor crashed' }), 'DRAFT')
})

test('requirement: illegal transitions fail explicitly', () => {
  assert.throws(() => transitionRequirement('DRAFT', approve), IllegalTransitionError, 'cannot approve before analysis')
  assert.throws(() => transitionRequirement('ANALYZING', { type: 'PLAN', taskCount: 1 }), IllegalTransitionError)
  assert.throws(() => transitionRequirement('APPROVED', deliver), IllegalTransitionError, 'cannot deliver before planning')
  const err = (() => {
    try {
      transitionRequirement('DRAFT', approve)
    } catch (e) {
      return e
    }
    return null
  })()
  assert.ok(err instanceof IllegalTransitionError)
  assert.equal(err.from, 'DRAFT')
  assert.equal(err.event, 'APPROVE')
})

test('requirement: only a human can pass Gate 1 and Gate 2', () => {
  const byAgent = { type: 'APPROVE', approval: approval({ gate: 'requirement', subject, by: 'agent' }) } as const
  assert.throws(() => transitionRequirement('WAITING_APPROVAL', byAgent), InvariantViolationError)
  const undecided = { type: 'APPROVE', approval: approval({ gate: 'requirement', subject, decision: 'pending', by: null }) } as const
  assert.throws(() => transitionRequirement('WAITING_APPROVAL', undecided), InvariantViolationError)
  const wrongGate = { type: 'APPROVE', approval: approval({ gate: 'delivery', subject }) } as const
  assert.throws(() => transitionRequirement('WAITING_APPROVAL', wrongGate), InvariantViolationError)
  const agentDelivery = { type: 'DELIVER', openTaskCount: 0, approval: approval({ gate: 'delivery', subject, by: 'agent' }) } as const
  assert.throws(() => transitionRequirement('PLANNED', agentDelivery), InvariantViolationError)
})

test('requirement: plan needs tasks, delivery needs every task done, approvals must match the requirement', () => {
  assert.throws(() => transitionRequirement('APPROVED', { type: 'PLAN', taskCount: 0 }), InvariantViolationError)
  assert.throws(() => transitionRequirement('PLANNED', { ...deliver, openTaskCount: 2 }), InvariantViolationError)
  const other = { type: 'APPROVE', approval: approval({ gate: 'requirement', subject: { kind: 'requirement', id: 'r2' } }) } as const
  assert.throws(() => applyRequirementEvent(requirement('WAITING_APPROVAL'), other, NOW), InvariantViolationError)
})
