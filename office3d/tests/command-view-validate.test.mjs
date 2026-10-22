import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { checkCommandView } from '../docs/command-view-checks.mjs'
import { validateCommandView } from '../command-view-validate.mjs'

const sample = JSON.parse(fs.readFileSync(new URL('../docs/command-view-sample.json', import.meta.url), 'utf8'))
const mutate = (name) => {
  const data = structuredClone(sample)
  if (name === 'zerocost') data.summary.cost.totalAmount.value = 0
  if (name === 'fakeaccepted') data.queue[0].stage = 'accepted'
  if (name === 'leak') data.queue[0].apiToken = 'synthetic-forbidden-field'
  if (name === 'stale') { data.quality.freshness.stale = false; data.quality.freshness.animationAllowed = true }
  return data
}
const rejected = (change, code) => {
  const data = structuredClone(sample)
  change(data)
  const result = validateCommandView(data)
  assert.equal(result.ok, false)
  if (code) assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result))
  assert.ok(result.errors.every((error) => typeof error.path === 'string' && typeof error.code === 'string'))
}

test('C1 sample passes without changes', () => {
  assert.deepEqual(validateCommandView(sample), { ok: true, errors: [] })
})
for (const [mutation, code] of [
  ['zerocost', 'UNKNOWN_COST_MUST_BE_NULL'], ['fakeaccepted', 'NO_VALID_VERSIONED_EVIDENCE'],
  ['leak', 'SENSITIVE_KEY'], ['stale', 'STALE_LIVE_ILLUSION'],
]) {
  test(`C1 ${mutation} is rejected by both validators with corresponding code`, () => {
    const data = mutate(mutation)
    const result = validateCommandView(data)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((error) => error.code === code))
    assert.equal(checkCommandView(data).ok, false)
  })
}

test('required structure, version, mode and finite metrics', () => {
  for (const name of Object.keys(sample)) rejected((data) => { delete data[name] })
  rejected((data) => { data.schemaVersion = 2 }, 'UNSUPPORTED_VERSION')
  rejected((data) => { data.mode = 'replay' }, 'MODE_ENUM')
  rejected((data) => { data.summary.tasks.value = NaN })
  rejected((data) => { data.summary.tasks.value = Infinity })
  rejected((data) => { data.summary.tasks.value = 0.5 }, 'INTEGER_COUNT_REQUIRED')
  rejected((data) => { data.generatedAt = '2026-02-31T00:00:00Z' }, 'ISO_REQUIRED')
})
test('unknown values must be null with an allowed nonempty reason', () => {
  rejected((data) => { data.queue[0].waitingMs = { value: 0, reason: 'NO_STATUS_TRANSITION' } }, 'UNKNOWN_MUST_BE_NULL')
  rejected((data) => { data.queue[0].waitingMs.reason = null }, 'UNKNOWN_REASON_REQUIRED')
  rejected((data) => { data.queue[0].waitingMs.reason = 'UNKNOWN_NEW_CODE' }, 'REASON_ENUM')
  rejected((data) => { data.queue[0].waitingMs = null }, 'OBJECT_REQUIRED')
  rejected((data) => { data.queue[0].waitingMs.value = undefined }, 'JSON_VALUE_REQUIRED')
})
test('queue completeness, evidence coverage and duplicate scope', () => {
  rejected((data) => { data.queue.push(structuredClone(data.queue[0])) }, 'DUPLICATE_TASK')
  rejected((data) => { data.queue[0].projectId = 'demo-other' }, 'OUT_OF_SCOPE_PROJECT')
  rejected((data) => { data.execution.items[0].taskId = 'demo-other' }, 'OUT_OF_SCOPE_TASK')
  rejected((data) => { data.quality.sources.push({ source: 'queue', complete: false, reason: 'PARTIAL_PAGE', ageMs: { value: 180000, reason: null } }) }, 'PARTIAL_COUNT_MUST_BE_NULL')
  rejected((data) => { data.summary.accepted = { value: 1, reason: null } }, 'NO_EVIDENCE_COVERAGE')
})
test('all collection completeness and overflow rules', () => {
  for (const name of ['execution', 'timeline']) {
    rejected((data) => { data[name].reason = null }, 'INCOMPLETE_REASON_REQUIRED')
    rejected((data) => { data[name].complete = 'false' }, 'COMPLETENESS_REQUIRED')
    rejected((data) => { data[name].items = {} }, 'ARRAY_REQUIRED')
  }
  rejected((data) => { data.relations.calls.reason = null }, 'INCOMPLETE_REASON_REQUIRED')
  rejected((data) => { data.relations.organization.reason = 'PARTIAL_PAGE' }, 'COMPLETE_REASON_MUST_BE_NULL')
  rejected((data) => { data.execution.items = Array.from({ length: 201 }, () => structuredClone(data.execution.items[0])) }, 'ARRAY_LIMIT')
})
test('cost partitions, no confirmed records, currency and partial total', () => {
  rejected((data) => { data.summary.cost.confirmedAmount = { value: 0, reason: null } }, 'NO_CONFIRMED_COST_MUST_BE_NULL')
  rejected((data) => { data.summary.cost.currency = ['USD', 'KHR'] }, 'CURRENCY_ENUM')
  rejected((data) => { data.summary.cost.missingUsageRuns.value = 4 }, 'COUNT_MISMATCH')
  rejected((data) => { data.summary.cost.confirmedRuns.value = 0.5 }, 'INTEGER_COUNT_REQUIRED')
  rejected((data) => {
    data.summary.cost.totalAmount = { value: 5, reason: null }
    data.summary.cost.observedRuns = { value: null, reason: 'PARTIAL_PAGE' }
  }, 'UNKNOWN_COST_MUST_BE_NULL')
})
test('sensitive keys/values, demo identifiers and length guards', () => {
  for (const key of ['comment', 'description', 'body', 'password', 'stdout', 'processPid']) rejected((data) => { data.queue[0][key] = 'removed' }, 'SENSITIVE_KEY')
  for (const value of ['Bearer synthetic-only', 'http://internal.test/', '10.0.0.1', 'C:\\private\\file', '/home/private/file', 'demo@example.test']) {
    rejected((data) => { data.queue[0].title = value }, 'SENSITIVE_VALUE')
  }
  for (const value of ['CMP-42', '6e91a701-11ee-4111-a111-001122334455', 'a'.repeat(64)]) rejected((data) => { data.queue[0].title = value }, 'REAL_IDENTIFIER_IN_DEMO')
  rejected((data) => { data.queue[0].title = '字'.repeat(81) }, 'TEXT_LIMIT')
  rejected((data) => { data.company.name = 'x'.repeat(161) }, 'TEXT_LIMIT')
  rejected((data) => { data.queue[0].ownerId.value = 'real-agent' }, 'DEMO_IDENTIFIER_REQUIRED')
})
test('stage, execution, time, operator and entry enums', () => {
  rejected((data) => { data.queue[0].stage = 'released' }, 'STAGE_ENUM')
  rejected((data) => { data.queue[0].entry = 'https://external.test' }, 'ENTRY_ENUM')
  rejected((data) => { data.queue[0].blocker = 'freeform' }, 'BLOCKER_ENUM')
  rejected((data) => { data.execution.items[0].status = 'not-a-status' }, 'RUN_STATUS_ENUM')
  rejected((data) => { data.execution.items[0].modelSource = 'guessed' }, 'MODEL_SOURCE_ENUM')
  rejected((data) => { data.timeline.items[0].operator = 'unknown' }, 'OPERATOR_ENUM')
  rejected((data) => { data.timeline.items[0].at = 'unknown' }, 'ISO_REQUIRED')
})
test('stale source ages, disconnected and synthetic live domain', () => {
  rejected((data) => { data.quality.sources[0].ageMs.value = 999999 }, 'SOURCE_AGE_HIDDEN')
  rejected((data) => { data.quality.freshness.maxAgeMs = 999999 }, 'AGE_LIMIT')
  rejected((data) => { data.quality.writesAllowed = true }, 'WRITES_FORBIDDEN')
  rejected((data) => { data.mode = 'live' }, 'SYNTHETIC_MODE_MISMATCH')
  rejected((data) => { data.quality.freshness.reason = null }, 'STALE_LIVE_ILLUSION')
})
test('malformed objects and cycles return errors, not exceptions', () => {
  for (const value of [null, [], true, 1]) assert.equal(validateCommandView(value).ok, false)
  rejected((data) => { data.queue[0].progress = null })
  rejected((data) => { data.execution.items = [null] })
  rejected((data) => { data.timeline.items = [null] })
  rejected((data) => { data.quality.sources = null })
  rejected((data) => { data.quality.freshness = null })
  rejected((data) => { data.queue[0].evidence = { value: data, reason: null } }, 'NON_JSON_GRAPH')
})
