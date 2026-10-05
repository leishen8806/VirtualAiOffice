import type { Execution, ExecutionState, Timestamp } from '../entities.js'
import { EXECUTION_STATES } from '../entities.js'
import { createMachine } from './machine.js'

/** One attempt. Created directly in RUNNING; every other state is terminal. */
export type ExecutionEvent =
  | { readonly type: 'SUCCEED' }
  | { readonly type: 'FAIL'; readonly error: string }
  | { readonly type: 'TIME_OUT' }
  | { readonly type: 'CANCEL' }

export const executionMachine = createMachine<ExecutionState, ExecutionEvent>('Execution', EXECUTION_STATES, {
  RUNNING: {
    SUCCEED: 'SUCCEEDED',
    FAIL: 'FAILED',
    TIME_OUT: 'TIMED_OUT',
    CANCEL: 'CANCELLED',
  },
  SUCCEEDED: {},
  FAILED: {},
  TIMED_OUT: {},
  CANCELLED: {},
})

export function transitionExecution(current: ExecutionState, event: ExecutionEvent): ExecutionState {
  return executionMachine.transition(current, event)
}

export function applyExecutionEvent(execution: Execution, event: ExecutionEvent, now: Timestamp): Execution {
  const status = transitionExecution(execution.status, event)
  const ended: Execution = { ...execution, status, endedAt: now }
  return event.type === 'FAIL' ? { ...ended, error: event.error } : ended
}

export function isExecutionTerminal(state: ExecutionState): boolean {
  return executionMachine.isTerminal(state)
}
