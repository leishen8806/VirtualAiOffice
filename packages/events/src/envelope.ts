// Versioned domain event envelope (docs/architecture/event-contract.md).
// Pure TypeScript: no Node APIs, no database, no transport.

/** Current envelope version. Bump only for breaking envelope changes; payload changes use the type. */
export const EVENT_ENVELOPE_VERSION = 1

export const EVENT_NAMESPACES = [
  'workspace',
  'project',
  'requirement',
  'task',
  'execution',
  'evidence',
  'approval',
  'meeting',
  'member',
  'artifact',
] as const
export type EventNamespace = (typeof EVENT_NAMESPACES)[number]

/** Namespaces whose events always belong to one project and must carry `projectId`. */
export const PROJECT_SCOPED_NAMESPACES: readonly EventNamespace[] = [
  'project',
  'requirement',
  'task',
  'execution',
  'evidence',
  'approval',
  'meeting',
  'artifact',
]

/** `<namespace>.<snake_case_action>`, e.g. `task.started`, `requirement.analysis_completed`. */
export type EventType = `${EventNamespace}.${string}`

export interface EventSubject {
  /** Entity kind the event is about, e.g. `task`. Usually the namespace. */
  readonly kind: string
  readonly id: string
}

export interface EventActor {
  /** Human or agent member who caused the event; absent for system events. */
  readonly memberId?: string
}

export interface DomainEvent<TPayload = unknown> {
  /** Globally unique id (e.g. a UUID), assigned by the producer. */
  readonly id: string
  /**
   * Position in the workspace event log, assigned by the event store on append. Strictly
   * increasing; absent until the event has been persisted. SSE uses it as `id:` for resuming.
   */
  readonly seq?: number
  /** ISO-8601 time the event happened. */
  readonly ts: string
  readonly workspaceId: string
  readonly projectId?: string
  readonly type: EventType
  readonly subject: EventSubject
  readonly actor?: EventActor
  readonly payload: TPayload
  /** Envelope version. */
  readonly v: number
}

/** An event read back from the store: always has a sequence number. */
export type StoredEvent<TPayload = unknown> = DomainEvent<TPayload> & { readonly seq: number }

export class EventContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventContractError'
  }
}

const TYPE_PATTERN = new RegExp(`^(${EVENT_NAMESPACES.join('|')})\\.[a-z][a-z0-9_]*$`)

export function isEventType(value: string): value is EventType {
  return TYPE_PATTERN.test(value)
}

export function namespaceOf(type: EventType): EventNamespace {
  return type.slice(0, type.indexOf('.')) as EventNamespace
}

export interface NewEvent<TPayload> {
  readonly type: EventType
  readonly workspaceId: string
  readonly projectId?: string
  readonly subject: EventSubject
  readonly actor?: EventActor
  readonly payload: TPayload
}

/** Ids and clocks are injected so the contract stays pure and deterministic in tests. */
export interface EventFactoryDeps {
  readonly newId: () => string
  readonly now: () => Date
}

/** Build a validated, unsequenced event. The store assigns `seq` on append. */
export function createEvent<TPayload>(input: NewEvent<TPayload>, deps: EventFactoryDeps): DomainEvent<TPayload> {
  const event: DomainEvent<TPayload> = {
    id: deps.newId(),
    ts: deps.now().toISOString(),
    workspaceId: input.workspaceId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    type: input.type,
    subject: input.subject,
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    payload: input.payload,
    v: EVENT_ENVELOPE_VERSION,
  }
  validateEvent(event)
  return event
}

/** Throws EventContractError when the envelope breaks the contract. */
export function validateEvent(event: DomainEvent): void {
  const fail = (msg: string): never => {
    throw new EventContractError(`event ${event?.id ?? '?'}: ${msg}`)
  }
  if (!event || typeof event !== 'object') fail('not an object')
  if (typeof event.id !== 'string' || !event.id) fail('missing id')
  if (typeof event.v !== 'number') fail('missing version v')
  if (event.v > EVENT_ENVELOPE_VERSION || event.v < 1) fail(`unsupported envelope version ${event.v}`)
  if (typeof event.ts !== 'string' || Number.isNaN(Date.parse(event.ts))) fail('ts must be an ISO-8601 timestamp')
  if (typeof event.workspaceId !== 'string' || !event.workspaceId) fail('missing workspaceId')
  if (typeof event.type !== 'string' || !isEventType(event.type)) fail(`type "${String(event.type)}" does not follow <namespace>.<action>`)
  if (!event.subject || typeof event.subject.kind !== 'string' || !event.subject.kind || typeof event.subject.id !== 'string' || !event.subject.id) {
    fail('subject needs kind and id')
  }
  if (PROJECT_SCOPED_NAMESPACES.includes(namespaceOf(event.type)) && !event.projectId) fail(`${event.type} is project-scoped and needs projectId`)
  if (event.seq !== undefined && (!Number.isSafeInteger(event.seq) || event.seq < 1)) fail('seq must be a positive integer')
  if (!('payload' in event)) fail('missing payload')
}

/**
 * Wire and storage format: one JSON object per event, keys in a fixed order. The same string is
 * an NDJSON line in exports and the `data:` field of an SSE message.
 */
export function serializeEvent(event: DomainEvent): string {
  validateEvent(event)
  const ordered = {
    v: event.v,
    id: event.id,
    ...(event.seq !== undefined ? { seq: event.seq } : {}),
    ts: event.ts,
    workspaceId: event.workspaceId,
    ...(event.projectId !== undefined ? { projectId: event.projectId } : {}),
    type: event.type,
    subject: { kind: event.subject.kind, id: event.subject.id },
    ...(event.actor !== undefined ? { actor: event.actor } : {}),
    payload: event.payload,
  }
  return JSON.stringify(ordered)
}

export function deserializeEvent(text: string): DomainEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new EventContractError('event is not valid JSON')
  }
  validateEvent(parsed as DomainEvent)
  return parsed as DomainEvent
}
