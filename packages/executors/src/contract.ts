import type { ExecutionEvent, RiskLevel } from '@vao/domain'
import type { ExecutorEvent } from './activity.js'

/**
 * Role -> Execution Policy -> Executor Adapter -> Model / CLI / Tool.
 *
 * The orchestration layer picks an ExecutorConfig through the role's ExecutionPolicy and calls the
 * adapter named by that config. Nothing here names a vendor: an adapter for any coding agent,
 * API model, or a human-in-the-loop IDE session implements the same interface.
 */
export interface ExecutorAdapter {
  /** Stable adapter id, matching `ExecutorConfig.adapter`. */
  id(): string
  capabilities(): ExecutorCapabilities
  /** Start one attempt. Resolves once the attempt is running; completion arrives via the handle. */
  start(spec: ExecutionSpec): Promise<ExecutionHandle>
  /** Stop an attempt. Must be idempotent; the handle's result then resolves as `cancelled`. */
  cancel(executionId: string): Promise<void>
}

export interface ExecutorCapabilities {
  /** Needs a person in the loop (e.g. work done in an IDE and handed back). */
  readonly interactive: boolean
  readonly canReadFiles: boolean
  readonly canWriteFiles: boolean
  readonly canRunShell: boolean
  readonly canUseMcp: boolean
  readonly canUseVision: boolean
  readonly billing: 'subscription' | 'usage' | 'unknown'
  readonly maxConcurrency?: number
}

/** A tool the attempt may use, by catalog id (e.g. `browser`). */
export interface ToolGrant {
  readonly id: string
}

export interface ExecutionBudget {
  /** Hard wall-clock limit; the adapter reports `timed_out` when it is reached. */
  readonly maxDurationMs: number
  readonly maxCostUsd?: number
}

/** Everything an adapter needs for one attempt. No adapter may need anything else. */
export interface ExecutionSpec {
  readonly workspaceId: string
  readonly projectId: string
  readonly taskId: string
  readonly executionId: string
  /** Absolute path the attempt works in (a task worktree from Stage 6 on). Passed per attempt. */
  readonly workdir: string
  /** Self-contained instructions; the executor cannot see the conversation. */
  readonly instructions: string
  /** The responsibility being performed. Context for the executor, not a model choice. */
  readonly role: { readonly id: string; readonly name: string; readonly instructions: string }
  readonly risk: RiskLevel
  /** `read_only` for reviews and research: the adapter must refuse writes. */
  readonly access: 'read_only' | 'read_write'
  readonly tools: readonly ToolGrant[]
  readonly budget: ExecutionBudget
  /** Optional model preference from the execution policy; adapters may ignore it. */
  readonly modelHint?: string
  readonly metadata: Readonly<Record<string, string>>
}

export type ExecutionOutcome = 'succeeded' | 'failed' | 'timed_out' | 'cancelled'

export interface ExecutionResult {
  readonly outcome: ExecutionOutcome
  /** The executor's own report. A claim, not evidence: completion is decided by evidence. */
  readonly summary: string
  readonly error?: string
  /** Files the attempt changed, relative to the workdir, when the adapter can tell. */
  readonly changedFiles?: readonly string[]
  /** Model actually used, if the executor reports it. */
  readonly actualModel?: string
  readonly tokensIn?: number
  readonly tokensOut?: number
  readonly costUsd?: number
  /** Opaque reference to resume or inspect the executor's own session. */
  readonly sessionRef?: string
  readonly durationMs: number
}

export interface ExecutionHandle {
  readonly executionId: string
  /** Structured events, ending when the attempt ends. */
  readonly events: AsyncIterable<ExecutorEvent>
  /** Always resolves (never rejects): failures are reported as an outcome. */
  readonly result: Promise<ExecutionResult>
}

/** Map an adapter outcome to the domain Execution state machine event. */
export function toExecutionEvent(result: ExecutionResult): ExecutionEvent {
  switch (result.outcome) {
    case 'succeeded':
      return { type: 'SUCCEED' }
    case 'failed':
      return { type: 'FAIL', error: result.error || result.summary || 'failed' }
    case 'timed_out':
      return { type: 'TIME_OUT' }
    case 'cancelled':
      return { type: 'CANCEL' }
  }
}

const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\)/

/** Returns a list of problems; an empty list means the spec can be started. */
export function validateExecutionSpec(spec: ExecutionSpec, caps?: ExecutorCapabilities): string[] {
  const problems: string[] = []
  for (const key of ['workspaceId', 'projectId', 'taskId', 'executionId'] as const) {
    if (!spec[key]) problems.push(`${key} is required`)
  }
  if (!ABSOLUTE_PATH.test(spec.workdir)) problems.push('workdir must be an absolute path')
  if (!spec.instructions.trim()) problems.push('instructions are empty')
  if (!spec.role.id) problems.push('role.id is required')
  if (!(spec.budget.maxDurationMs > 0)) problems.push('budget.maxDurationMs must be positive')
  if (spec.budget.maxCostUsd !== undefined && !(spec.budget.maxCostUsd >= 0)) problems.push('budget.maxCostUsd must not be negative')
  if (caps) {
    if (spec.access === 'read_write' && !caps.canWriteFiles) problems.push('executor cannot write files but the attempt needs read_write access')
    if (spec.tools.length > 0 && !caps.canUseMcp) problems.push('executor cannot use tools but tools were granted')
  }
  return problems
}
