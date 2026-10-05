import type { Approval, ApprovalGate, Id, Member, Role } from './entities.js'
import { InvariantViolationError } from './errors.js'

/**
 * A decided approval may move work forward only if a human member approved it, for the expected
 * gate and subject. Agents may request approvals but never act as the final human approver.
 * Checked at runtime because approvals are read back from storage, where types cannot help.
 */
export function assertHumanApproval(
  approval: Approval,
  expected: { gate: ApprovalGate | readonly ApprovalGate[]; subjectId?: Id },
): void {
  const gates: readonly ApprovalGate[] = typeof expected.gate === 'string' ? [expected.gate] : expected.gate
  if (!gates.includes(approval.gate)) {
    throw new InvariantViolationError('approval.gate', `expected gate ${gates.join(' | ')}, got ${approval.gate}`)
  }
  if (expected.subjectId !== undefined && approval.subject.id !== expected.subjectId) {
    throw new InvariantViolationError('approval.subject', `approval ${approval.id} is for ${approval.subject.id}, not ${expected.subjectId}`)
  }
  if (approval.decision !== 'approved') {
    throw new InvariantViolationError('approval.decision', `approval ${approval.id} is ${approval.decision}, not approved`)
  }
  assertDecidedByHuman(approval)
}

/** A rejection is also a human decision. */
export function assertHumanRejection(approval: Approval, expected: { gate: ApprovalGate; subjectId?: Id }): void {
  if (approval.gate !== expected.gate) {
    throw new InvariantViolationError('approval.gate', `expected gate ${expected.gate}, got ${approval.gate}`)
  }
  if (expected.subjectId !== undefined && approval.subject.id !== expected.subjectId) {
    throw new InvariantViolationError('approval.subject', `approval ${approval.id} is for ${approval.subject.id}, not ${expected.subjectId}`)
  }
  if (approval.decision !== 'rejected') {
    throw new InvariantViolationError('approval.decision', `approval ${approval.id} is ${approval.decision}, not rejected`)
  }
  assertDecidedByHuman(approval)
}

function assertDecidedByHuman(approval: Approval): void {
  if (!approval.decidedBy) {
    throw new InvariantViolationError('approval.decider', `approval ${approval.id} has no decider`)
  }
  if (approval.decidedBy.memberKind !== 'human') {
    throw new InvariantViolationError('approval.human_only', `approval ${approval.id} was decided by a ${approval.decidedBy.memberKind}; only humans decide approvals`)
  }
}

/** Agents cannot hold a role that can approve. */
export function assertCanBind(member: Member, role: Role): void {
  if (member.workspaceId !== role.workspaceId) {
    throw new InvariantViolationError('role_binding.workspace', `member ${member.id} and role ${role.id} belong to different workspaces`)
  }
  if (member.kind === 'agent' && role.permissions.includes('approve')) {
    throw new InvariantViolationError('role_binding.agent_approver', `agent ${member.id} cannot hold role ${role.id} because it grants "approve"`)
  }
}

export function canBind(member: Member, role: Role): boolean {
  try {
    assertCanBind(member, role)
    return true
  } catch {
    return false
  }
}
