import type { DomainEvent, StoredEvent } from './envelope.js'
import { validateEvent } from './envelope.js'

export interface EventFilter {
  readonly projectId?: string
  /** Match by type prefix, e.g. `task.` or `execution.activity`. */
  readonly typePrefix?: string
}

/**
 * The contract every event store implements (SQLite in Stage 2). Append assigns strictly increasing
 * `seq` values within a workspace; replay returns events in `seq` order. In production, append is
 * called inside the same transaction as the state change (docs/architecture/persistence.md).
 */
export interface EventLog {
  append(events: readonly DomainEvent[]): Promise<readonly StoredEvent[]>
  /** Events with `seq > afterSeq`, in order. Used for SSE resume (`Last-Event-ID`) and projections. */
  readSince(afterSeq: number, filter?: EventFilter, limit?: number): Promise<readonly StoredEvent[]>
  lastSeq(): Promise<number>
}

export function matches(event: DomainEvent, filter: EventFilter | undefined): boolean {
  if (!filter) return true
  if (filter.projectId !== undefined && event.projectId !== filter.projectId) return false
  if (filter.typePrefix !== undefined && !event.type.startsWith(filter.typePrefix)) return false
  return true
}

/** Reference implementation for tests and the rehearsal mode. Not durable. */
export class InMemoryEventLog implements EventLog {
  readonly #events: StoredEvent[] = []
  readonly #workspaceId: string

  constructor(workspaceId: string) {
    this.#workspaceId = workspaceId
  }

  async append(events: readonly DomainEvent[]): Promise<readonly StoredEvent[]> {
    // Validate everything first: an append is all-or-nothing.
    for (const e of events) {
      validateEvent(e)
      if (e.workspaceId !== this.#workspaceId) throw new Error(`event ${e.id} belongs to workspace ${e.workspaceId}, not ${this.#workspaceId}`)
      if (e.seq !== undefined) throw new Error(`event ${e.id} already has seq ${e.seq}`)
    }
    let seq = this.#events.length
    const stored = events.map((e) => ({ ...e, seq: ++seq }))
    this.#events.push(...stored)
    return stored
  }

  async readSince(afterSeq: number, filter?: EventFilter, limit = Number.POSITIVE_INFINITY): Promise<readonly StoredEvent[]> {
    const out: StoredEvent[] = []
    for (const e of this.#events) {
      if (out.length >= limit) break
      if (e.seq > afterSeq && matches(e, filter)) out.push(e)
    }
    return out
  }

  async lastSeq(): Promise<number> {
    return this.#events.length
  }
}
