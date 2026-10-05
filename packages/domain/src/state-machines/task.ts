import type { Approval, Id, Task, TaskState, Timestamp } from '../entities.js'
import { TASK_STATES } from '../entities.js'
import { InvariantViolationError } from '../errors.js'
import { assertHumanApproval } from '../invariants.js'
import type { CompletionDecision } from '../policies/completion.js'
import { createMachine } from './machine.js'

export type TaskEvent =
  | { readonly type: 'DEPENDENCIES_MET' }
  | { readonly type: 'DEPENDENCY_FAILED'; readonly dependencyId: Id }
  | { readonly type: 'UNBLOCKED' }
  /** The scheduler created an Execution for this task. */
  | { readonly type: 'START'; readonly executionId: Id }
  | { readonly type: 'EXECUTION_SUCCEEDED'; readonly executionId: Id }
  /** The attempt failed; the repair policy decides whether to retry (START again) or GIVE_UP. */
  | { readonly type: 'EXECUTION_FAILED'; readonly executionId: Id; readonly reason: string }
  /** Evidence was evaluated. Only `evaluateCompletion()` can produce the decision. */
  | { readonly type: 'COMPLETION_DECIDED'; readonly decision: CompletionDecision }
  /** A gate, an ambiguity, or an agent asking for help: wait for a person. */
  | { readonly type: 'REQUIRE_HUMAN'; readonly reason: string }
  | { readonly type: 'HUMAN_RESUMED'; readonly approval: Approval }
  /** A human accepted the work: records the decision and re-enters VERIFYING. It never yields DONE itself. */
  | { readonly type: 'HUMAN_ACCEPTED'; readonly approval: Approval }
  /** Attempts exhausted under the execution policy. */
  | { readonly type: 'GIVE_UP'; readonly reason: string }
  | { readonly type: 'CANCEL'; readonly reason: string }

export const taskMachine = createMachine<TaskState, TaskEvent>('Task', TASK_STATES, {
  PENDING: {
    DEPENDENCIES_MET: 'READY',
    DEPENDENCY_FAILED: 'BLOCKED',
    CANCEL: 'CANCELLED',
  },
  READY: {
    START: 'RUNNING',
    REQUIRE_HUMAN: 'WAITING_HUMAN',
    GIVE_UP: 'FAILED',
    CANCEL: 'CANCELLED',
  },
  RUNNING: {
    EXECUTION_SUCCEEDED: 'VERIFYING',
    EXECUTION_FAILED: 'READY',
    REQUIRE_HUMAN: 'WAITING_HUMAN',
    CANCEL: 'CANCELLED',
  },
  VERIFYING: {
    COMPLETION_DECIDED: (e) => {
      const d = e.decision
      if (d.outcome === 'passed') {
        if (d.evidenceIds.length === 0) {
          throw new InvariantViolationError('task.done_needs_evidence', 'a passed completion decision must cite evidence')
        }
        return 'DONE'
      }
      return d.outcome === 'failed' ? 'READY' : 'WAITING_HUMAN'
    },
    REQUIRE_HUMAN: 'WAITING_HUMAN',
    CANCEL: 'CANCELLED',
  },
  WAITING_HUMAN: {
    HUMAN_RESUMED: (e) => {
      assertHumanApproval(e.approval, { gate: ['task_resume', 'task_start'] })
      return 'READY'
    },
    // Human authority is preserved, but acceptance is not a completion bypass: it only records the
    // decision and sends the task back through completion evaluation. The orchestration layer records
    // human Evidence (kind 'approval', source 'human', current commit) and `evaluateCompletion()`
    // alone decides DONE via COMPLETION_DECIDED.
    HUMAN_ACCEPTED: (e) => {
      assertHumanApproval(e.approval, { gate: 'task_acceptance' })
      return 'VERIFYING'
    },
    CANCEL: 'CANCELLED',
  },
  BLOCKED: {
    UNBLOCKED: 'READY',
    CANCEL: 'CANCELLED',
  },
  DONE: {},
  FAILED: {},
  CANCELLED: {},
})

/** The state-level transition function. No other code may compute a new Task.status. */
export function transitionTask(current: TaskState, event: TaskEvent): TaskState {
  return taskMachine.transition(current, event)
}

/** Entity-level transition: also checks that approvals refer to this task. Returns a new object. */
export function applyTaskEvent(task: Task, event: TaskEvent, now: Timestamp): Task {
  if (event.type === 'HUMAN_RESUMED' || event.type === 'HUMAN_ACCEPTED') {
    if (event.approval.subject.kind !== 'task' || event.approval.subject.id !== task.id) {
      throw new InvariantViolationError('approval.subject', `approval ${event.approval.id} is not for task ${task.id}`)
    }
  }
  return { ...task, status: transitionTask(task.status, event), updatedAt: now }
}
