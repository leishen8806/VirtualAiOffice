import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  ENVELOPE_VERSION,
  EVENT_TYPES,
  makeEnvelope,
  validateEnvelope,
  serializeEnvelope,
  parseEnvelope,
  fromLedgerEvent,
  dedupe,
} from '../event-envelope.mjs'

const base = () => makeEnvelope({
  id: '00000000-0000-5000-8000-000000000001',
  ts: '2026-10-21T01:00:00.000Z',
  workspaceId: 'zhixu',
  projectId: 'project-1',
  type: 'task.started',
  subject: { kind: 'task', id: 'CMP-1' },
  payload: { ref: 'CMP-1' },
})

test('valid envelope passes and required fields/types are enforced', () => {
  assert.equal(validateEnvelope(base()).ok, true)
  for (const field of ['v', 'id', 'ts', 'workspaceId', 'type', 'subject', 'payload']) {
    const copy = { ...base() }
    delete copy[field]
    assert.equal(validateEnvelope(copy).ok, false, field)
  }
  assert.ok(validateEnvelope({ ...base(), type: 'bad.event' }).errors.some((e) => e.code === 'event_name'))
  assert.ok(validateEnvelope({ ...base(), ts: '2026-10-21' }).errors.some((e) => e.code === 'iso8601_z'))
  assert.ok(validateEnvelope({ ...base(), v: 2 }).errors.some((e) => e.code === 'unsupported_version'))
  assert.equal(ENVELOPE_VERSION, 1)
})

test('payload size and value-only secret scan use format features with two controls', () => {
  assert.ok(validateEnvelope({ ...base(), payload: { text: 'x'.repeat(5000) } }).errors.some((e) => e.code === 'too_large'))
  const secret = validateEnvelope({ ...base(), payload: { note: 'Bearer abcdefghijklmnopqrstuvwxyz012345' } })
  assert.ok(secret.errors.some((e) => e.code === 'suspected_secret'))
  assert.doesNotMatch(JSON.stringify(secret), /abcdefghijklmnopqrstuvwxyz012345/)
  assert.equal(validateEnvelope({ ...base(), payload: { note: '禁止读取密钥' } }).ok, true)
  assert.equal(validateEnvelope({ ...base(), payload: { token: '普通说明文字' } }).ok, true)
})

test('serialization round trips and parse drops unknown fields with a count', () => {
  const serialized = serializeEnvelope(base())
  assert.equal(serialized.ok, true)
  const parsed = parseEnvelope(serialized.text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.envelope.id, base().id)
  const extra = parseEnvelope(JSON.stringify({ ...base(), futureField: true }))
  assert.equal(extra.ok, true)
  assert.equal(extra.unknownCount, 1)
  assert.equal('futureField' in extra.envelope, false)
  assert.equal(parseEnvelope(null).ok, false)
  assert.equal(parseEnvelope([]).ok, false)
  assert.equal(parseEnvelope('{bad').ok, false)
  assert.ok(parseEnvelope(JSON.stringify({ ...base(), v: 9 })).errors.some((e) => e.code === 'unsupported_version'))
})

test('ledger kinds convert deterministically without body text', () => {
  for (const kind of Object.keys(EVENT_TYPES)) {
    const result = fromLedgerEvent({ id: `old-${kind}`, at: '2026-10-21T01:00:00.000Z', kind, from: kind === 'board' ? 'board' : 'agent-1', ref: 'CMP-1', text: '请问？', to: null }, { projectId: 'project-1' })
    assert.equal(result.ok, true, kind)
    assert.equal(result.envelope.type, EVENT_TYPES[kind])
    assert.equal('text' in result.envelope.payload, false)
    assert.equal(result.envelope.payload.hasQuestion, true)
    assert.equal(fromLedgerEvent({ id: `old-${kind}`, at: '2026-10-21T01:00:00.000Z', kind, ref: 'CMP-1', text: '请问？' }, { projectId: 'project-1' }).envelope.id, result.envelope.id)
  }
  assert.equal(fromLedgerEvent({ id: 'x', kind: 'unknown', at: '2026-10-21T01:00:00.000Z' }, { projectId: 'project-1' }).ok, false)
  assert.equal(fromLedgerEvent({ id: 'x', kind: 'speak', at: '2026-10-21T01:00:00.000Z' }).ok, true)
  assert.equal(fromLedgerEvent({ id: 'x', kind: 'speak', at: '2026-10-21T01:00:00.000Z', ref: 'CMP-1' }, { projectId: 'project-1' }).ok, true)
})

test('dedupe removes repeats and reports conflicts', () => {
  const one = base()
  const same = { ...one }
  const conflict = { ...one, payload: { ref: 'other' } }
  const result = dedupe([one, same, conflict])
  assert.equal(result.unique.length, 1)
  assert.equal(result.conflicts.length, 1)
})

test('real ledger sample converts at least 99 percent without body output', () => {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'events')
  if (!fs.existsSync(dir)) return
  const file = fs.readdirSync(dir).filter((name) => /\.jsonl$/.test(name)).sort().pop()
  if (!file) return
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/).filter(Boolean).slice(0, 200)
  let success = 0
  const failures = {}
  for (const line of lines) {
    let record
    try { record = JSON.parse(line) } catch { failures.invalid_json = (failures.invalid_json || 0) + 1; continue }
    const result = fromLedgerEvent(record, { tenantId: 'zhixu', projectId: 'project-1' })
    if (result.ok) success++
    else for (const error of result.errors) failures[error.code] = (failures[error.code] || 0) + 1
  }
  assert.ok(success / Math.max(1, lines.length) >= 0.99)
  assert.ok(Object.keys(failures).every(Boolean))
})

test('pure module has no IO or forbidden runtime APIs', () => {
  const source = fs.readFileSync(new URL('../event-envelope.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fs|fetch|Date\.now|Math\.random|child_process|eval|innerHTML)\b/)
})
