// Persistence contracts. Domain and orchestration code depend on these interfaces, never on SQL,
// so the SQLite implementation (Stage 2) can be replaced without touching business logic.

import type {
  Approval,
  Evidence,
  Execution,
  ExecutionState,
  Id,
  Requirement,
  RequirementState,
  Task,
  TaskState,
  Timestamp,
} from '@vao/domain'
import type { DomainEvent, StoredEvent } from '@vao/events'

/**
 * Status writes are compare-and-set: they succeed only if the stored status still equals `from`.
 * A `false` return means someone else moved the entity first; the caller reloads and decides again.
 */
export interface StatusWrite<S extends string> {
  readonly id: Id
  readonly from: S
  readonly to: S
  readonly at: Timestamp
}

export interface RequirementRepository {
  get(id: Id): Requirement | undefined
  insert(requirement: Requirement): void
  /** Persists `analysis` together with the status change when present. */
  writeStatus(write: StatusWrite<RequirementState>, analysis?: Requirement['analysis']): boolean
}

export interface TaskRepository {
  get(id: Id): Task | undefined
  listByRequirement(requirementId: Id): readonly Task[]
  /** Inserts the task and its `dependsOn` rows (task_deps). */
  insert(task: Task): void
  writeStatus(write: StatusWrite<TaskState>): boolean
}

export interface ExecutionRepository {
  get(id: Id): Execution | undefined
  listByTask(taskId: Id): readonly Execution[]
  /** Executions left RUNNING by a crash; restart recovery marks them interrupted. */
  listRunning(): readonly Execution[]
  insert(execution: Execution): void
  finish(write: StatusWrite<ExecutionState>, result: Pick<Execution, 'actualModel' | 'costUsd' | 'tokensIn' | 'tokensOut' | 'error'>): boolean
}

export interface EvidenceRepository {
  /** Evidence is immutable: append only. */
  insert(evidence: Evidence): void
  listByTask(taskId: Id): readonly Evidence[]
}

export interface ApprovalRepository {
  get(id: Id): Approval | undefined
  insert(approval: Approval): void
  /** Records a human decision on a pending approval (the schema rejects non-human deciders). */
  decide(approval: Approval): boolean
}

/** Appends inside the current transaction and returns the events with their sequence numbers. */
export interface TransactionalEventAppender {
  append(events: readonly DomainEvent[]): readonly StoredEvent[]
}

export interface StoreTransaction {
  readonly requirements: RequirementRepository
  readonly tasks: TaskRepository
  readonly executions: ExecutionRepository
  readonly evidence: EvidenceRepository
  readonly approvals: ApprovalRepository
  readonly events: TransactionalEventAppender
}

/**
 * The persistence rule (ADR-001): every state change and its event are written in one transaction.
 *
 *   store.transaction((tx) => {
 *     const task = tx.tasks.get(id)                      // read
 *     const next = applyTaskEvent(task, event, now)      // the only place a status is computed
 *     if (!tx.tasks.writeStatus({ id, from: task.status, to: next.status, at: now })) throw new Conflict()
 *     tx.events.append([createEvent({ type: 'task.transitioned', ... })])
 *   })                                                    // COMMIT, or ROLLBACK on any throw
 *
 * The callback is synchronous on purpose: SQLite transactions must not span `await` (an executor
 * call, a network request). Do the slow work first, then open a short transaction to record it.
 */
export interface Store {
  transaction<T>(work: (tx: StoreTransaction) => T): T
  close(): void
}
