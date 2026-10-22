import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { buildDemoCommandView, defaultCommandView, describeScenario, listDemoScenarios } from '../command-view-demo.mjs'
import { projectCommandView } from '../command-view-data.mjs'
import { evaluateCommandEvidence, realIdentifier, sensitiveValue, validateCommandView } from '../command-view-validate.mjs'

const identityKeys = new Set(['id', 'taskId', 'projectId', 'runId', 'agentId', 'ownerId', 'nextHandler', 'project', 'actor', 'executorActor', 'boardActors', 'subjectVersion', 'protectedTestsHash'])
function checkStrings(value, parent = '') {
  if (Array.isArray(value)) value.forEach((item) => checkStrings(item, parent))
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) checkStrings(child, key === 'value' ? parent : key)
  } else if (typeof value === 'string') {
    assert.equal(realIdentifier.test(value), false, value)
    assert.equal(sensitiveValue.test(value), false, value)
    if (identityKeys.has(parent)) assert.match(value, /^demo-[a-z0-9-]+$/)
  }
}

for (const scenario of listDemoScenarios()) {
  for (let timeSlice = 0; timeSlice < scenario.timeSlices; timeSlice++) {
    test(`${scenario.id} slice ${timeSlice}: valid, deterministic, exclusively synthetic`, () => {
      const input = Object.freeze({ scenario: scenario.id, timeSlice })
      const data = buildDemoCommandView(input)
      assert.deepEqual(validateCommandView(data), { ok: true, errors: [] })
      assert.deepEqual(buildDemoCommandView(input), data)
      assert.equal(data.mode, 'demo')
      assert.equal(data.quality.synthetic, true)
      assert.equal(data.quality.writesAllowed, false)
      assert.ok(data.quality.gaps.includes('SYNTHETIC_DEMO'))
      checkStrings(data)
      for (const row of data.queue) {
        assert.equal(row.evidence.synthetic, true)
        if (row.evidence.value) {
          assert.equal(row.evidence.value.synthetic, true)
          assert.ok(row.evidence.value.records.every((record) => record.synthetic === true))
          assert.equal(evaluateCommandEvidence(row.evidence.value).valid, false)
        }
        assert.notEqual(row.stage, 'accepted')
      }
      assert.equal(data.summary.accepted.value, null)
    })
  }
}

test('journey retains ordered creation, claim, execution, verification, one rework and simulated acceptance', () => {
  const expectedStages = ['pending_verification', 'claimed', 'executing', 'pending_verification', 'pending_verification', 'pending_verification']
  const expectedTypes = ['issue.created', 'task.started', 'execution.activity', 'evidence.test_simulated', 'task.rework_simulated', 'evidence.acceptance_simulated']
  for (let timeSlice = 0; timeSlice < expectedStages.length; timeSlice++) {
    const data = buildDemoCommandView({ scenario: 'demo-journey', timeSlice })
    assert.equal(data.queue[0].stage, expectedStages[timeSlice])
    assert.deepEqual(data.timeline.items.map((event) => event.type), expectedTypes.slice(0, timeSlice + 1))
    assert.deepEqual(data.timeline.items.map((event) => event.stage), expectedStages.slice(0, timeSlice + 1))
    assert.ok(data.timeline.items.every((event) => event.synthetic && event.source === 'synthetic'))
    assert.equal(data.timeline.items.filter((event) => event.type === 'task.rework_simulated').length, timeSlice >= 4 ? 1 : 0)
    if (timeSlice >= 3) assert.equal(data.queue[0].stageReason, 'LEGACY_BASELINE')
    if (timeSlice === 4) assert.equal(data.queue[0].blocker, 'verification_failed')
    if (timeSlice === 5) {
      assert.equal(data.queue[0].rawStatus, 'done')
      assert.equal(data.queue[0].blocker, 'delivered_unaccepted')
      assert.ok(data.queue[0].evidence.value.records.some((record) => record.kind === 'acceptance' && record.synthetic))
    }
  }
})

test('unproved synthetic acceptance cannot be promoted, or re-labelled live', () => {
  const data = buildDemoCommandView({ timeSlice: 5 })
  const promoted = structuredClone(data)
  promoted.queue[0].stage = 'accepted'
  assert.equal(validateCommandView(promoted).ok, false)
  const live = structuredClone(data)
  live.mode = 'live'
  assert.ok(validateCommandView(live).errors.some((error) => error.code === 'SYNTHETIC_MODE_MISMATCH'))
  const evidence = data.queue[0].evidence.value
  const projected = projectCommandView({
    now: data.generatedAt, mode: 'live', company: data.company, scope: data.scope,
    sources: {
      tasks: { items: [{ id: 'demo-task', projectId: 'demo-project', status: 'done', createdAt: data.scope.range.from, subjectVersion: 'demo-version', blockedBy: [] }], at: data.generatedAt, complete: true },
      evidence: { items: [{ ...evidence, taskId: 'demo-task' }], at: data.generatedAt, complete: false, reason: 'SYNTHETIC_DEMO' },
    },
  })
  assert.equal(projected.queue[0].stage, 'pending_verification')
  assert.equal(projected.summary.accepted.value, null)
})

test('focus has each of five distinct blockers and explicit handlers', () => {
  const data = buildDemoCommandView({ scenario: 'demo-focus' })
  const expected = {
    'demo-task-approval': ['authorization', 'governance', 'demo-board'],
    'demo-task-dependency': ['dependency', 'issue', 'demo-owner'],
    'demo-task-budget': ['budget', 'governance', 'demo-board'],
    'demo-task-executor': ['executor', 'health', 'demo-maintainer'],
    'demo-task-delivered': ['delivered_unaccepted', 'acceptance', 'demo-reviewer'],
  }
  assert.equal(data.queue.length, 5)
  for (const row of data.queue) assert.deepEqual([row.blocker, row.entry, row.nextHandler.value], expected[row.taskId])
})

test('quality demonstrates missing usage, unknown cost, interrupted update and partial unknown counts', () => {
  const current = buildDemoCommandView({ scenario: 'demo-quality', timeSlice: 0 })
  assert.equal(current.summary.cost.totalAmount.value, null)
  assert.equal(current.summary.cost.confirmedAmount.value, null)
  assert.equal(current.summary.cost.missingUsageRuns.value, 1)
  assert.equal(current.summary.cost.unknownCostRuns.value, 1)
  assert.equal(current.execution.items[0].usage.reason, 'USAGE_NOT_RETURNED')
  const stale = buildDemoCommandView({ scenario: 'demo-quality', timeSlice: 1 })
  assert.equal(stale.dataAgeMs.value, 300000)
  assert.equal(stale.quality.freshness.reason, 'STALE_DATA')
  assert.equal(stale.quality.freshness.animationAllowed, false)
  assert.equal(stale.generatedAt, '2026-10-21T04:00:00.000Z')
  const partial = buildDemoCommandView({ scenario: 'demo-quality', timeSlice: 2 })
  assert.deepEqual(partial.summary.tasks, { value: null, reason: 'PARTIAL_PAGE' })
  assert.equal(partial.summary.cost.observedRuns.value, null)
  assert.equal(partial.execution.complete, false)
  assert.equal(partial.execution.reason, 'PARTIAL_PAGE')
  assert.equal(partial.timeline.complete, false)
  assert.equal(partial.timeline.reason, 'PARTIAL_PAGE')
})

test('scenario APIs give independent pure metadata and invalid inputs do not silently fallback', () => {
  const scenarios = listDemoScenarios()
  assert.equal(scenarios.length, 3)
  scenarios[0].name = 'modified'
  assert.notEqual(listDemoScenarios()[0].name, 'modified')
  const detail = describeScenario('demo-journey')
  detail.steps[0].name = 'modified'
  assert.notEqual(describeScenario('demo-journey').steps[0].name, 'modified')
  assert.equal(describeScenario('unknown'), null)
  assert.throws(() => buildDemoCommandView({ scenario: 'unknown' }), RangeError)
  for (const timeSlice of [-1, 6, 0.5, '1', NaN, Infinity]) assert.throws(() => buildDemoCommandView({ timeSlice }), RangeError)
})

test('returned demo mutations cannot alter later scenes', () => {
  const data = buildDemoCommandView({ timeSlice: 5 })
  data.queue[0].title = 'modified'
  data.queue[0].evidence.value.records.length = 0
  const next = buildDemoCommandView({ timeSlice: 5 })
  assert.notEqual(next.queue[0].title, 'modified')
  assert.equal(next.queue[0].evidence.value.records.length, 4)
})

test('no authorized live scope defaults to an empty envelope, never a fabricated company or demo', () => {
  const empty = { kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' }
  assert.deepEqual(defaultCommandView(), empty)
  assert.deepEqual(defaultCommandView({ mode: 'live', scenario: 'demo-journey' }), empty)
  assert.deepEqual(defaultCommandView({ mode: 'replay' }), empty)
  assert.deepEqual(defaultCommandView({ authorized: true }), empty)
  assert.deepEqual(defaultCommandView(null), empty)
  const explicit = defaultCommandView({ mode: 'demo', scenario: 'demo-quality', timeSlice: 1 })
  assert.deepEqual(validateCommandView(explicit), { ok: true, errors: [] })
  assert.equal(explicit.mode, 'demo')
})

test('loader is pure, no forbidden APIs, version hashes, external imports or existing-file mutations', () => {
  const source = fs.readFileSync(new URL('../command-view-demo.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\b|node:fs|Date\.now|Math\.random|child_process|\beval\s*\(|innerHTML|server\.mjs|setTimeout|setInterval/)
  assert.doesNotMatch(source, /git:|sha256:|https?:\/\/|[0-9a-f]{32,}/i)
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]), ['./command-view-data.mjs', './command-view-validate.mjs'])
})
