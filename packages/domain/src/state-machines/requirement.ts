import type { Approval, Requirement, RequirementAnalysis, RequirementState, Timestamp } from '../entities.js'
import { REQUIREMENT_STATES } from '../entities.js'
import { InvariantViolationError } from '../errors.js'
import { assertHumanApproval, assertHumanRejection } from '../invariants.js'
import { createMachine } from './machine.js'

export type RequirementEvent =
  | { readonly type: 'START_ANALYSIS' }
  | { readonly type: 'ANALYSIS_COMPLETED'; readonly analysis: RequirementAnalysis }
  /** Analysis could not finish (executor error, timeout). Back to DRAFT so it can be retried. */
  | { readonly type: 'ANALYSIS_FAILED'; readonly reason: string }
  /** Gate 1: a human approves scope and acceptance criteria. */
  | { readonly type: 'APPROVE'; readonly approval: Approval }
  /** Gate 1: a human sends the requirement back for changes. */
  | { readonly type: 'REJECT'; readonly approval: Approval }
  | { readonly type: 'PLAN'; readonly taskCount: number }
  /** Gate 2: every task is done and a human accepts the delivery. */
  | { readonly type: 'DELIVER'; readonly openTaskCount: number; readonly approval: Approval }

export const requirementMachine = createMachine<RequirementState, RequirementEvent>('Requirement', REQUIREMENT_STATES, {
  DRAFT: {
    START_ANALYSIS: 'ANALYZING',
  },
  ANALYZING: {
    ANALYSIS_COMPLETED: 'WAITING_APPROVAL',
    ANALYSIS_FAILED: 'DRAFT',
  },
  WAITING_APPROVAL: {
    APPROVE: (e) => {
      assertHumanApproval(e.approval, { gate: 'requirement' })
      return 'APPROVED'
    },
    REJECT: (e) => {
      assertHumanRejection(e.approval, { gate: 'requirement' })
      return 'DRAFT'
    },
  },
  APPROVED: {
    PLAN: (e) => {
      if (!Number.isInteger(e.taskCount) || e.taskCount < 1) {
        throw new InvariantViolationError('requirement.plan', 'a plan needs at least one task')
      }
      return 'PLANNED'
    },
  },
  PLANNED: {
    DELIVER: (e) => {
      if (e.openTaskCount !== 0) {
        throw new InvariantViolationError('requirement.deliver', `${e.openTaskCount} task(s) are not done yet`)
      }
      assertHumanApproval(e.approval, { gate: 'delivery' })
      return 'DELIVERED'
    },
  },
  DELIVERED: {},
})

/** The state-level transition function. All requirement status changes go through here. */
export function transitionRequirement(current: RequirementState, event: RequirementEvent): RequirementState {
  return requirementMachine.transition(current, event)
}

/** Entity-level transition: also checks that approvals refer to this requirement. Returns a new object. */
export function applyRequirementEvent(requirement: Requirement, event: RequirementEvent, now: Timestamp): Requirement {
  if (event.type === 'APPROVE' || event.type === 'REJECT' || event.type === 'DELIVER') {
    if (event.approval.subject.kind !== 'requirement' || event.approval.subject.id !== requirement.id) {
      throw new InvariantViolationError('approval.subject', `approval ${event.approval.id} is not for requirement ${requirement.id}`)
    }
  }
  const status = transitionRequirement(requirement.status, event)
  const next: Requirement = { ...requirement, status, updatedAt: now }
  return event.type === 'ANALYSIS_COMPLETED' ? { ...next, analysis: event.analysis } : next
}
