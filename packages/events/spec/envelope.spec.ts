import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EVENT_ENVELOPE_VERSION,
  EVENT_TYPES,
  EventContractError,
  InMemoryEventLog,
  createEvent,
  deserializeEvent,
  isEventType,
  serializeEvent,
  validateEvent,
} from '../dist/index.js'
import type { DomainEvent, EventFactoryDeps, TransitionPayload } from '../dist/index.js'

let counter = 0
const deps: EventFactoryDeps = { newId: () => `evt-${++counter}`, now: () => new Date('2026-10-05T12:00:00.000Z') }

const taskStarted = () =>
  createEvent<TransitionPayload>(
    {
      type: EVENT_TYPES.taskStarted,
      workspaceId: 'w1',
      projectId: 'p1',
      subject: { kind: 'task', id: 't1' },
      actor: { memberId: 'scheduler' },
      payload: { from: 'READY', to: 'RUNNING', event: 'START' },
    },
    deps,
  )

test('envelope: created events carry id, time, version, scope and subject', () => {
  const e = taskStarted()
  assert.equal(e.v, EVENT_ENVELOPE_VERSION)
  assert.equal(e.v, 1)
  assert.match(e.id, /^evt-\d+$/)
  assert.equal(e.ts, '2026-10-05T12:00:00.000Z')
  assert.equal(e.workspaceId, 'w1')
  assert.equal(e.projectId, 'p1')
  assert.deepEqual(e.subject, { kind: 'task', id: 't1' })
  assert.equal(e.seq, undefined, 'seq is assigned by the store, not the producer')
})

test('envelope: serialization round-trips and is stable', () => {
  const e = taskStarted()
  const text = serializeEvent(e)
  assert.ok(!text.includes('\n'), 'one line per event (NDJSON / SSE data field)')
  assert.ok(text.startsWith('{"v":1,"id":'), 'version first, fixed key order')
  assert.deepEqual(deserializeEvent(text), e)
  assert.equal(serializeEvent(deserializeEvent(text)), text)
})

test('envelope: version is checked on read', () => {
  const future = JSON.stringify({ ...taskStarted(), v: 2 })
  assert.throws(() => deserializeEvent(future), EventContractError)
  assert.throws(() => deserializeEvent('{not json'), EventContractError)
  const { v: _v, ...noVersion } = taskStarted()
  assert.throws(() => deserializeEvent(JSON.stringify(noVersion)), EventContractError)
})

test('envelope: type must follow <namespace>.<action>', () => {
  assert.ok(isEventType('requirement.analysis_completed'))
  assert.ok(isEventType('execution.activity'))
  assert.equal(isEventType('agent'), false, 'legacy NiuMa event names are not valid types')
  assert.equal(isEventType('task.Started'), false)
  assert.equal(isEventType('office.walking'), false, 'UI animation states are not domain events')
  for (const t of Object.values(EVENT_TYPES)) assert.ok(isEventType(t), t)
})

test('envelope: subject and workspace/project scope are enforced', () => {
  const base = taskStarted()
  const bad = (over: Record<string, unknown>) => ({ ...base, ...over }) as DomainEvent
  assert.throws(() => validateEvent(bad({ subject: { kind: 'task' } })), EventContractError)
  assert.throws(() => validateEvent(bad({ workspaceId: '' })), EventContractError)
  const { projectId: _p, ...noProject } = base
  assert.throws(() => validateEvent(noProject as DomainEvent), /project-scoped/)
  // Workspace- and member-level events do not need a project.
  const memberEvent = createEvent({ type: 'member.status_changed', workspaceId: 'w1', subject: { kind: 'member', id: 'm1' }, payload: { status: 'idle' } }, deps)
  assert.equal(memberEvent.projectId, undefined)
})

test('event log: append assigns increasing seq and replays in order with filters', async () => {
  const log = new InMemoryEventLog('w1')
  const a = taskStarted()
  const b = createEvent({ type: EVENT_TYPES.executionActivity, workspaceId: 'w1', projectId: 'p2', subject: { kind: 'execution', id: 'x1' }, payload: { type: 'file.write', path: 'src/a.ts' } }, deps)
  const c = createEvent({ type: EVENT_TYPES.taskCompleted, workspaceId: 'w1', projectId: 'p1', subject: { kind: 'task', id: 't1' }, payload: {} }, deps)
  const stored = await log.append([a, b, c])
  assert.deepEqual(stored.map((e) => e.seq), [1, 2, 3])
  assert.equal(await log.lastSeq(), 3)
  assert.deepEqual((await log.readSince(1)).map((e) => e.id), [b.id, c.id], 'resume after seq 1')
  assert.deepEqual((await log.readSince(0, { projectId: 'p1' })).map((e) => e.id), [a.id, c.id])
  assert.deepEqual((await log.readSince(0, { typePrefix: 'task.' })).map((e) => e.seq), [1, 3])
  // Replayed events serialize with their seq.
  assert.match(serializeEvent(stored[2]!), /"seq":3/)
})

test('event log: append is all-or-nothing and rejects foreign or pre-sequenced events', async () => {
  const log = new InMemoryEventLog('w1')
  const ok = taskStarted()
  const foreign = { ...taskStarted(), workspaceId: 'w2' }
  await assert.rejects(log.append([ok, foreign]))
  assert.equal(await log.lastSeq(), 0, 'nothing was written')
  await assert.rejects(log.append([{ ...taskStarted(), seq: 7 }]))
})
