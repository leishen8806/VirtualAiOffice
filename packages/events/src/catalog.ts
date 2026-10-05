import type { EventType } from './envelope.js'

/**
 * Representative event types for the first vertical slice. The convention, not this list, is the
 * contract: new types follow `<namespace>.<past_tense_snake_case>` and are added when a service
 * actually emits them. Keep the list short.
 */
export const EVENT_TYPES = {
  requirementCreated: 'requirement.created',
  requirementAnalysisCompleted: 'requirement.analysis_completed',
  requirementApprovalRequested: 'requirement.approval_requested',
  requirementApproved: 'requirement.approved',
  taskCreated: 'task.created',
  taskReady: 'task.ready',
  taskStarted: 'task.started',
  taskVerifying: 'task.verifying',
  taskCompleted: 'task.completed',
  taskFailed: 'task.failed',
  /** Every Task status change also emits this, with `{ from, to, event }` in the payload. */
  taskTransitioned: 'task.transitioned',
  executionStarted: 'execution.started',
  executionActivity: 'execution.activity',
  executionFinished: 'execution.finished',
  evidenceRecorded: 'evidence.recorded',
  approvalRequested: 'approval.requested',
  approvalDecided: 'approval.decided',
} as const satisfies Record<string, EventType>

export type KnownEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/** Payload of `<entity>.transitioned` events, written in the same transaction as the state change. */
export interface TransitionPayload<S extends string = string> {
  readonly from: S
  readonly to: S
  readonly event: string
}
