import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { projectCommandView, isCommandMoneyTask } from '../command-view-data.mjs'
import { validateCommandView } from '../command-view-validate.mjs'

const NOW = '2026-10-21T05:00:00.000Z'
const AT = '2026-10-21T04:59:00.000Z'
const VERSION = 'git:resource@abcdef1'
const OTHER_VERSION = 'git:resource@fffffff'
const snap = (items = [], more = {}) => ({ items, complete: true, at: AT, ...more })
function fixture() {
  return {
    now: NOW, mode: 'live', company: { id: 'company-a', name: 'Approved company' },
    scope: { project: 'project-a', range: { from: '2026-10-21T04:00:00.000Z', to: NOW } },
    sources: {
      tasks: snap([{ id: 'task-a', companyId: 'company-a', projectId: 'project-a', title: '整理文档', status: 'todo', assigneeAgentId: 'agent-a', blockedBy: [], dependencyKnown: true, createdAt: '2026-10-21T04:00:00.000Z', subjectVersion: VERSION }]),
      agents: snap([{ id: 'agent-a', companyId: 'company-a', model: 'gpt-5.6-terra' }]),
      runs: snap(), activity: snap(),
    },
  }
}
function evidence() {
  return {
    taskId: 'task-a', subjectVersion: VERSION, enforcedSince: '2026-10-20T00:00:00.000Z',
    protectedTestsHash: 'protected-tests-v1', executorActor: 'agent-a', boardActors: ['board-a'],
    records: ['execution', 'test', 'review', 'acceptance'].map((kind) => ({
      kind, ok: true, actor: kind === 'acceptance' ? 'board-a' : kind === 'review' ? 'reviewer-a' : 'agent-a',
      ref: `evidence-${kind}`, subjectVersion: VERSION, protectedTestsHash: 'protected-tests-v1',
    })),
  }
}
function projected(input) {
  const result = projectCommandView(input)
  assert.notEqual(result.ok, false, JSON.stringify(result))
  assert.deepEqual(validateCommandView(result), { ok: true, errors: [] })
  return result
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) freeze(child)
  return value
}
const addRun = (input, more = {}) => input.sources.runs.items.push({
  id: 'run-a', companyId: 'company-a', taskId: 'task-a', agentId: 'agent-a',
  status: 'succeeded', startedAt: '2026-10-21T04:20:00.000Z', ...more,
})

test('minimal incomplete sources produce explicit unknowns, not zero', () => {
  const input = fixture()
  input.sources = {}
  const out = projected(input)
  assert.deepEqual(out.summary.tasks, { value: null, reason: 'NOT_LOADED' })
  assert.equal(out.summary.cost.observedRuns.value, null)
  assert.equal(out.summary.cost.confirmedAmount.value, null)
  assert.equal(out.summary.accepted.value, null)
  assert.equal(out.dataAgeMs.value, null)
  assert.equal(out.quality.freshness.reason, 'UNKNOWN_TIME')
  assert.equal(out.quality.freshness.animationAllowed, false)
})
test('deterministic with deeply frozen snapshots; no input mutation or long output', () => {
  const input = fixture()
  input.sources.tasks.items[0].title = 'x\u0000 Bearer synthetic-private http://internal.test/ ' + '界'.repeat(100)
  input.sources.tasks.items[0].description = '禁止读取密钥，禁止提现；客户正文不输出'
  addRun(input, { stdout: 'private-output', processPid: 5 })
  const before = structuredClone(input)
  freeze(input)
  const out = projected(input)
  assert.deepEqual(out, projected(input))
  assert.deepEqual(input, before)
  assert.equal([...out.queue[0].title].length, 80)
  assert.doesNotMatch(JSON.stringify(out), /Bearer|internal\.test|description|private-output|processPid/)
})
test('done, succeeded, vote PASS or stage boolean is never evidence', () => {
  for (const status of ['done', 'in_review', 'todo']) {
    const input = fixture()
    Object.assign(input.sources.tasks.items[0], { status, accepted: true, vote: 'PASS', stage: 'accepted' })
    addRun(input)
    const out = projected(input)
    assert.equal(out.queue[0].stage, 'pending_verification')
    assert.equal(out.queue[0].rawStatus, status)
    assert.equal(out.summary.accepted.value, null)
  }
})
test('explicit same-version evidence reaches strongest level and accepted coverage', () => {
  for (const [count, expected] of [[2, 'verifying'], [3, 'awaiting_acceptance'], [4, 'accepted']]) {
    const input = fixture()
    const e = evidence()
    e.records = e.records.slice(0, count)
    input.sources.evidence = snap([e])
    const out = projected(input)
    assert.equal(out.queue[0].stage, expected)
    assert.equal(out.summary.accepted.value, count === 4 ? 1 : 0)
    assert.equal(out.queue[0].evidence.value.subjectVersion, VERSION)
  }
})
test('legacy, missing boundary/review, version/hash mutation, failure and unauthorized actor never accepted', () => {
  const changes = [
    (e) => { delete e.enforcedSince },
    (e) => { e.enforcedSince = '2026-10-22T00:00:00.000Z' },
    (e) => { e.records = e.records.filter((row) => row.kind !== 'review') },
    (e) => { e.records[2].actor = 'agent-a' },
    (e) => { e.records[1].protectedTestsHash = 'changed' },
    (e) => { e.records[3].subjectVersion = OTHER_VERSION },
    (e) => { e.subjectVersion = OTHER_VERSION },
    (e) => { e.records[3].actor = 'unapproved-a' },
    (e) => { e.records[1].ok = false },
  ]
  for (const change of changes) {
    const input = fixture()
    const e = evidence()
    change(e)
    input.sources.evidence = snap([e])
    const stage = projected(input).queue[0].stage
    assert.notEqual(stage, 'accepted')
    if (!e.records.some((row) => row.kind === 'review')) assert.equal(stage, 'verifying')
    else assert.equal(stage, 'pending_verification')
  }
})
test('money/server tasks require approved board acceptance, normal cannot self-review', () => {
  for (const riskClass of ['money', 'server']) {
    const input = fixture()
    input.sources.tasks.items[0].riskClass = riskClass
    const e = evidence()
    e.boardActors = []
    input.sources.evidence = snap([e])
    assert.notEqual(projected(input).queue[0].stage, 'accepted')
  }
})
test('execution mapping, explicit checkout and contract authorization preserve provenance', () => {
  const input = fixture()
  addRun(input, { status: 'running', model: 'claude-opus', usage: 8 })
  let out = projected(input)
  assert.equal(out.queue[0].stage, 'executing')
  assert.equal(out.execution.items[0].modelSource, 'run')
  assert.equal(out.execution.items[0].family, 'claude')
  assert.equal(out.execution.items[0].taskId, out.queue[0].taskId)
  input.sources.runs.items[0].agentId = 'other-agent'
  assert.notEqual(projected(input).queue[0].stage, 'executing')
  input.sources.runs.items = []
  input.sources.tasks.items[0].checkout = { taskId: 'task-a', agentId: 'agent-a', runId: 'run-a' }
  assert.equal(projected(input).queue[0].stage, 'claimed')
  delete input.sources.tasks.items[0].checkout
  input.sources.tasks.items[0].authorization = { approved: true, taskId: 'task-a' }
  input.sources.contractView = snap([{ taskId: 'task-a', state: 'complete' }])
  assert.equal(projected(input).queue[0].stage, 'requirement_confirmed')
})
test('cost unknown, zero requires pricing record, currency and partial counts do not fake totals', () => {
  const input = fixture()
  addRun(input, { spentMonthlyCents: 0, cost: 0 })
  let cost = projected(input).summary.cost
  assert.equal(cost.totalAmount.value, null)
  assert.equal(cost.confirmedAmount.value, null)
  assert.equal(cost.unknownCostRuns.value, 1)
  assert.equal(cost.missingUsageRuns.value, 1)
  input.sources.runs.items[0].cost = { amount: 0, currency: 'USD', confirmed: true }
  cost = projected(input).summary.cost
  assert.equal(cost.totalAmount.value, 0)
  assert.equal(cost.confirmedAmount.value, 0)
  addRun(input, { id: 'run-b', usage: { totalTokens: 1 } })
  cost = projected(input).summary.cost
  assert.equal(cost.totalAmount.value, null)
  assert.equal(cost.confirmedAmount.value, 0)
  input.sources.runs.items[1].cost = { amount: 5, currency: 'KHR', confirmed: true }
  cost = projected(input).summary.cost
  assert.equal(cost.totalAmount.reason, 'MIXED_CURRENCY')
  assert.equal(cost.confirmedAmount.reason, 'MIXED_CURRENCY')
  input.sources.runs.complete = false
  input.sources.runs.reason = 'PARTIAL_PAGE'
  cost = projected(input).summary.cost
  for (const key of ['observedRuns', 'unknownCostRuns', 'confirmedRuns', 'missingUsageRuns', 'totalAmount']) assert.equal(cost[key].value, null)
})
test('freshness considers oldest samples, cache generation time, disconnect and missing sample', () => {
  const input = fixture()
  input.sources.generatedAt = '2026-10-21T04:55:00.000Z'
  input.sources.tasks.at = '2026-10-21T04:57:00.000Z'
  let out = projected(input)
  assert.equal(out.generatedAt, input.sources.generatedAt)
  assert.equal(out.dataAgeMs.value, 300000)
  assert.equal(out.quality.freshness.stale, true)
  input.sources.tasks.at = AT
  input.sources.disconnected = true
  assert.equal(projected(input).quality.freshness.reason, 'DISCONNECTED')
  delete input.sources.disconnected
  delete input.sources.runs.at
  assert.equal(projected(input).quality.freshness.reason, 'UNKNOWN_TIME')
})
test('all nested cross-company objects reject before filtering or projection', () => {
  for (const put of [
    (input) => { input.sources.tasks.items[0].companyId = 'company-b' },
    (input) => { input.sources.runs.items.push({ companyId: 'company-b', taskId: 'other' }) },
    (input) => { input.sources.evidence = snap([{ taskId: 'task-a', records: [{ companyId: 'company-b' }] }]) },
    (input) => { input.sources.ignored = { company: { id: 'company-b' } } },
  ]) {
    const input = fixture()
    put(input)
    assert.deepEqual(projectCommandView(input), { ok: false, code: 'COMPANY_MISMATCH' })
  }
})
test('demo IDs never accept real UUID, issue identifier, SHA or identity masquerade', () => {
  const input = fixture()
  input.mode = 'demo'
  input.company.id = 'demo-company'
  input.scope.project = 'demo-project'
  input.sources.tasks = snap([{ id: 'demo-task', projectId: 'demo-project', title: '合成任务', status: 'todo' }])
  input.sources.agents = snap()
  projected(input)
  for (const value of ['CMP-1', 'a'.repeat(64), '6e91a701-11ee-4111-a111-001122334455']) {
    const copy = structuredClone(input)
    copy.sources.tasks.items[0].title = value
    assert.equal(projectCommandView(copy).code, 'DEMO_IDENTIFIER_REQUIRED')
  }
  input.sources.tasks.items[0].id = 'real-task'
  assert.equal(projectCommandView(input).code, 'DEMO_IDENTIFIER_REQUIRED')
})
test('NO_STATUS_TRANSITION does not invent duration, percent, rework or approval', () => {
  const input = fixture()
  input.sources.tasks.items[0].updatedAt = AT
  input.sources.activity = snap([{ id: 'event-a', taskId: 'task-a', action: 'issue.updated', actorType: 'agent', createdAt: AT, body: '返工已验收' }])
  const out = projected(input)
  assert.equal(out.queue[0].waitingMs.value, null)
  assert.equal(out.queue[0].progress.passed.value, null)
  assert.equal(out.timeline.items[0].stageReason, 'NO_STATUS_TRANSITION')
  assert.equal(out.timeline.items[0].type, 'issue.updated')
  assert.doesNotMatch(JSON.stringify(out), /reworkCount|percent|body|已验收/)
})
test('money signals in prohibition-only text do not influence class or focus', () => {
  const input = fixture()
  input.sources.tasks.items[0].description = '禁止读取密钥，严禁提现或资金入账'
  input.sources.tasks.items[0].contract = { '项目': '文档项目', '目标': '整理文档', '允许修改': ['docs/spec.md'], '禁止': ['读取密钥', '提现', '鉴权迁移'], '交付物': ['docs/spec.md'] }
  assert.equal(isCommandMoneyTask(input.sources.tasks.items[0]), false)
  assert.equal(projected(input).queue[0].blocker, 'none')
  input.sources.tasks.items[0].contract['目标'] = '实现资金入账'
  assert.equal(isCommandMoneyTask(input.sources.tasks.items[0]), true)
  assert.equal(projected(input).queue[0].blocker, 'budget')
})
test('multiple blockers coexist, priority and confirmed waits precede unknown and ID tie-break', () => {
  const input = fixture()
  const base = input.sources.tasks.items[0]
  input.sources.tasks.items = [
    { ...base, id: 'task-z', awaitingBoard: true, blockedBy: [{ id: 'dep-a', status: 'cancelled' }], boardActorId: 'board-a', projectOwnerId: 'owner-a' },
    { ...base, id: 'task-b', statusTransition: { to: 'todo', at: '2026-10-21T04:30:00.000Z' } },
    { ...base, id: 'task-a' },
  ]
  const out = projected(input)
  assert.deepEqual(out.queue.map((row) => row.taskId), ['task-z', 'task-b', 'task-a'])
  assert.deepEqual(out.queue[0].blockers.map((row) => row.blocker), ['authorization', 'dependency'])
  assert.equal(out.queue[0].entry, 'governance')
  assert.equal(out.queue[1].waitingMs.value, 1800000)
})
test('H1 capacity classification and incident focus use snapshots, never raw errors', () => {
  const input = fixture()
  addRun(input, { status: 'failed', errorCode: 'provider_quota', message: 'Selected model is at capacity. Please try a different model.' })
  input.sources.health = { incidents: [{ category: 'login', agentIds: ['agent-a'] }] }
  input.sources.tasks.items[0].maintenanceActorId = 'maintainer-a'
  const out = projected(input)
  assert.equal(out.execution.items[0].healthCategory, 'upstream')
  assert.equal(out.queue[0].blocker, 'executor')
  assert.equal(out.queue[0].nextHandler.value, 'maintainer-a')
  assert.doesNotMatch(JSON.stringify(out), /at capacity|errorCode|message/)
})
test('relations require actual edges and source, missing sets remain incomplete', () => {
  const input = fixture()
  input.sources.relations = { dependencies: snap([{ from: 'task-a', to: 'missing-task', source: 'tasks', type: 'blocks', confidence: 'observed' }]) }
  const out = projected(input)
  assert.equal(out.relations.calls.complete, false)
  assert.equal(out.relations.calls.reason, 'NO_CALL_EVIDENCE')
  assert.equal(out.relations.dependencies.complete, false)
  assert.deepEqual(out.relations.dependencies.items, [])
})
test('200 queue cap marks partial and does not count array length as total', () => {
  const input = fixture()
  input.sources.tasks.items = Array.from({ length: 201 }, (_, index) => ({ ...input.sources.tasks.items[0], id: `task-${index}` }))
  const out = projected(input)
  assert.equal(out.queue.length, 200)
  assert.deepEqual(out.summary.tasks, { value: null, reason: 'PARTIAL_PAGE' })
  assert.equal(out.quality.sources.find((row) => row.source === 'queue').complete, false)
})
test('ten thousand tasks project under 500 ms with bounded output', () => {
  const input = fixture()
  const base = input.sources.tasks.items[0]
  input.sources.tasks.items = Array.from({ length: 10000 }, (_, index) => ({ ...base, id: `task-${String(index).padStart(5, '0')}` }))
  const start = performance.now()
  const out = projected(input)
  const elapsed = performance.now() - start
  assert.ok(elapsed < 500, `10000 tasks: ${elapsed.toFixed(2)} ms`)
  assert.equal(out.queue.length, 200)
  console.log(`C2_BENCHMARK_10000_MS=${elapsed.toFixed(2)}`)
})
test('new modules are pure and do not reference runtime owner or prohibited APIs', () => {
  for (const file of ['command-view-data.mjs', 'command-view-validate.mjs']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bfetch\b|node:fs|Date\.now|Math\.random|child_process|\beval\s*\(|innerHTML|server\.mjs|setInterval|setTimeout/)
  }
})

test('evidence for another task or missing creation time cannot establish acceptance', () => {
  const input = fixture()
  const e = evidence()
  e.records[0].taskId = 'other-task'
  input.sources.evidence = snap([e])
  assert.notEqual(projected(input).queue[0].stage, 'accepted')
  delete e.records[0].taskId
  delete input.sources.tasks.items[0].createdAt
  assert.equal(projected(input).queue[0].stageReason, 'LEGACY_BASELINE')
})
test('only same-version valid n/m evidence produces progress', () => {
  const input = fixture()
  const e = evidence()
  e.progress = { subjectVersion: VERSION, passed: 12, total: 12 }
  input.sources.evidence = snap([e])
  assert.equal(projected(input).queue[0].progress.passed.value, 12)
  e.progress.subjectVersion = OTHER_VERSION
  assert.equal(projected(input).queue[0].progress.passed.value, null)
})
test('malformed omitted task rows stay partial, raw status is preserved', () => {
  const input = fixture()
  input.sources.tasks.items[0].status = 'paused'
  input.sources.tasks.items.push(null)
  const out = projected(input)
  assert.equal(out.summary.tasks.value, null)
  assert.equal(out.queue[0].rawStatus, 'paused')
})
test('configured model is not falsely identified as run model', () => {
  const input = fixture()
  addRun(input)
  const out = projected(input)
  assert.equal(out.execution.items[0].modelSource, 'agent_config')
  assert.equal(out.execution.items[0].model.value, 'gpt-5.6-terra')
})
test('explicit parent call edges are separate from organization and activity noise', () => {
  const input = fixture()
  addRun(input)
  addRun(input, { id: 'run-b' })
  input.sources.relations = {
    calls: snap([
      { from: 'run-a', to: 'run-b', source: 'agents', type: 'calls', confidence: 'observed' },
      { from: 'run-a', to: 'run-b', source: 'runs', type: 'calls', confidence: 'observed' },
    ]),
  }
  const out = projected(input)
  assert.equal(out.relations.calls.items.length, 1)
  assert.equal(out.relations.calls.items[0].source, 'runs')
  assert.equal(out.relations.organization.complete, false)
})

test('missing dependencies and malformed run records never become known empty data', () => {
  const input = fixture()
  delete input.sources.tasks.items[0].blockedBy
  input.sources.runs.items.push(null)
  const out = projected(input)
  assert.equal(out.queue[0].blocker, 'dependency')
  assert.equal(out.queue[0].blockers[0].reason, 'DEP_UNKNOWN')
  assert.equal(out.summary.running.value, null)
  assert.equal(out.summary.cost.observedRuns.value, null)
})

test('cached version mismatch cannot be rewritten by sanitizing the evidence', () => {
  const input = fixture()
  const e = evidence()
  input.sources.tasks.items[0].subjectVersion = OTHER_VERSION
  input.sources.evidence = snap([e])
  const out = projected(input)
  assert.equal(out.queue[0].stageReason, 'VERSION_MISMATCH')
  assert.equal(out.queue[0].evidence.value.subjectVersion, VERSION)
})

test('duplicate task evidence and future snapshot clocks reject rather than guessing', () => {
  const input = fixture()
  input.sources.evidence = snap([evidence(), evidence()])
  assert.equal(projectCommandView(input).code, 'AMBIGUOUS_EVIDENCE')
  delete input.sources.evidence
  input.sources.generatedAt = '2026-10-22T00:00:00.000Z'
  assert.equal(projectCommandView(input).code, 'INVALID_INPUT')
})

test('existing scheduler and contract summaries join identifier without changing task identity', () => {
  const input = fixture()
  input.sources.tasks.items[0].identifier = 'CMP-101'
  input.sources.scheduler = { at: AT, skipped: [{ identifier: 'CMP-101', reasonCodes: ['AWAITING_BOARD'] }] }
  const out = projected(input)
  assert.equal(out.queue[0].taskId, 'task-a')
  assert.equal(out.queue[0].blocker, 'authorization')
  input.sources.scheduler.skipped = []
  input.sources.tasks.items[0].authorization = { taskId: 'task-a', approved: true }
  input.sources.contractView = snap([{ identifier: 'CMP-101', state: 'complete' }])
  assert.equal(projected(input).queue[0].stage, 'requirement_confirmed')
})
