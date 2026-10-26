import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createLiveSource } from '../command-view-live.mjs'
import { realIdentifier, sensitiveValue, validateCommandView } from '../command-view-validate.mjs'
import { duration, measurement, playbackAllowed, responseKind } from '../command-view-render.js'

const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/command-view-live/shapes.json', import.meta.url), 'utf8'))
const copy = (value) => structuredClone(value)
function setup(more = {}) {
  const f = fixture(), calls = []
  let time = Date.parse(f.state.at)
  const get = async (path, options) => {
    calls.push({ path, options })
    if (more.get) return more.get(path, options, f)
    if (path.includes('/projects?')) return copy(f.state.projects)
    if (path.includes('/issues?')) return copy(f.completed)
    if (path.includes('/activity?')) return copy(f.activity)
    if (path.includes('/heartbeat-runs?')) return copy(f.runs)
    return copy(f.detail)
  }
  const source = createLiveSource({ get, now: () => time, ...more.options })
  const input = { principal: 'local_full', company: f.company, state: f.state }
  return { f, calls, source, input, advance: (ms) => { time += ms } }
}
async function valid(source, input) {
  const result = await source.load(input)
  assert.notEqual(result.kind, 'empty', JSON.stringify(result))
  assert.deepEqual(validateCommandView(result), { ok: true, errors: [] })
  return result
}
test('local-full only, no get for denied or unspecified principal', async () => {
  const { source, input, calls } = setup()
  for (const principal of ['lan', 'wall', undefined, 'local']) {
    assert.deepEqual(await source.load({ ...input, principal }), { kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' })
  }
  assert.equal(calls.length, 0)
})
test('project resolves from snapshot or injected list; missing and ambiguous never fall back to company', async () => {
  const { source, input, calls } = setup()
  await valid(source, input)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].path.includes('projectId=demo-project'))
  const fresh = setup()
  fresh.input.state = copy(fresh.input.state)
  delete fresh.input.state.projects
  await valid(fresh.source, fresh.input)
  assert.equal(fresh.calls.filter((row) => row.path.includes('/projects?')).length, 1)
  for (const projects of [[], [{ id: 'demo-other', name: 'Other' }], [...fixture().state.projects, ...fixture().state.projects]]) {
    const s = setup()
    s.input.state.projects = projects
    assert.equal((await s.source.load(s.input)).reason, 'SOURCE_FAILED')
    assert.equal(s.calls.length, 0)
  }
})
test('range is capped at 14 days and invalid future or excessive range is rejected', async () => {
  const s = setup({ options: { rangeDays: 90 } })
  const output = await valid(s.source, s.input)
  assert.equal(Date.parse(output.scope.range.to) - Date.parse(output.scope.range.from), 14 * 86400000)
  assert.match(s.calls[0].path, /limit=200/)
  for (const range of [
    { from: '2026-10-01T05:00:00.000Z', to: s.f.state.at },
    { from: s.f.state.at, to: '2026-10-22T05:00:00.000Z' },
    { from: 'invalid', to: s.f.state.at },
  ]) assert.equal((await s.source.load({ ...s.input, range })).reason, 'SOURCE_FAILED')
})
test('list layer does not query details; selected detail uses only bounded GET endpoints', async () => {
  const s = setup()
  await valid(s.source, s.input)
  assert.equal(s.calls.length, 1)
  await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.equal(s.calls.length, 4)
  for (const call of s.calls) {
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.timeoutMs, 5000)
    assert.ok(call.options.signal instanceof AbortSignal)
    assert.doesNotMatch(call.path, /comments|\/state(?:\?|$)|\/act(?:\?|$)/)
  }
  assert.ok(s.calls.length <= 20)
  assert.equal((await s.source.load({ ...s.input, taskId: '../../private' })).reason, 'NO_AUTHORIZED_LIVE_SCOPE')
  assert.equal((await s.source.load({ ...s.input, taskId: 'demo-foreign' })).reason, 'NO_AUTHORIZED_LIVE_SCOPE')
})
test('done, review and running tasks all remain pending without evidence; owners are display names', async () => {
  const s = setup()
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  for (const row of output.queue) {
    assert.equal(row.stage, 'pending_verification')
    assert.equal(row.evidence.value, null)
  }
  const done = output.queue.find((row) => row.taskId === 'demo-done')
  assert.equal(done.rawStatus, 'done')
  assert.equal(done.stageReason, 'NO_ACCEPTANCE_EVIDENCE')
  assert.equal(done.blockers.find((row) => row.blocker === 'delivered_unaccepted').nextHandler.value, '董事会')
  const blocked = output.queue.find((row) => row.taskId === 'demo-blocked')
  assert.equal(blocked.blocker, 'authorization')
  assert.equal(blocked.nextHandler.value, '董事会')
  assert.equal(output.summary.accepted.value, null)
  assert.equal(output.timeline.items[0].stage, 'pending_verification')
})
test('actual completed timestamp is used; older done tasks excluded, incomplete source never counted as zero', async () => {
  const s = setup({ get: (path, options, f) => path.includes('/issues?')
    ? [...f.completed, { ...f.completed[0], id: 'demo-old', completedAt: '2026-09-01T00:00:00.000Z' }]
    : copy(f.detail) })
  const output = await valid(s.source, s.input)
  assert.equal(output.queue.some((row) => row.taskId === 'demo-old'), false)
  s.input.state.assigned = s.f.state.assigned.items
  const partial = await valid(s.source, s.input)
  assert.equal(partial.summary.tasks.value, null)
})
test('200 item boundary, pagination markers and oversized lists remain partial', async () => {
  for (const count of [200, 201, 240]) {
    const s = setup({ get: (path, options, f) => Array.from({ length: count }, (_, index) => ({ ...f.completed[0], id: `demo-done-${index}` })) })
    const output = await valid(s.source, s.input)
    assert.equal(output.queue.length, 200)
    assert.equal(output.summary.tasks.value, null)
    assert.ok(output.quality.gaps.includes('PARTIAL_PAGE'))
  }
})
test('missing blockedBy never means no dependencies', async () => {
  const s = setup()
  delete s.f.detail.blockedBy
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  const row = output.queue.find((row) => row.taskId === 'demo-blocked')
  assert.ok(row.blockers.some((item) => item.reason === 'DEP_UNKNOWN'))
})
test('known costs stay confirmed, missing usage and missing costs remain honest null', async () => {
  const s = setup()
  s.input.state.assigned.items = [s.input.state.assigned.items[0]]
  s.f.completed = []
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.equal(output.summary.cost.totalAmount.value, null)
  assert.deepEqual(output.summary.cost.unknownCostRuns, { value: null, reason: 'PARTIAL_PAGE' })
  assert.deepEqual(output.summary.cost.missingUsageRuns, { value: null, reason: 'PARTIAL_PAGE' })
  s.f.runs[0].usageJson = { inputTokens: 5, outputTokens: 7 }
  const next = setup()
  next.input.state.runs = { items: s.f.runs, complete: true, at: s.f.state.at }
  const known = await valid(next.source, next.input)
  assert.equal(known.execution.items[0].usage.value, 12)
})
test('titles hide server IPv4, IPv6 and URLs; untrusted bodies and comments never escape', async () => {
  for (const address of ['192.0.2.10:3200', '[2001:db8::1]:3200', '2001:db8::2', 'http://example.internal/path']) {
    const s = setup()
    s.f.detail.title = `demo-server ${address}`
    s.f.detail.description = 'private-text'
    s.f.detail.comments = ['private-text']
    s.f.runs[0].stdout = 'private-text'
    s.f.activity[0].body = 'private-text'
    const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
    assert.match(output.queue.find((row) => row.taskId === 'demo-blocked').title, /\[已隐藏\]/)
    assert.doesNotMatch(JSON.stringify(output), /private-text|192\.0\.2|2001:db8|example\.internal|description|comments|stdout/)
  }
})
test('no input mutation, deterministic projection and cached responses are independent copies', async () => {
  const s = setup()
  const input = { ...s.input, taskId: 'demo-blocked' }
  const before = copy(input)
  const first = await valid(s.source, input)
  const second = await valid(s.source, input)
  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
  first.queue[0].title = 'changed'
  assert.notEqual((await valid(s.source, input)).queue[0].title, 'changed')
})
test('60s cache and single flight dedupe; evidence-version and company scopes are distinct', async () => {
  const s = setup()
  const input = { ...s.input, taskId: 'demo-blocked', evidenceVersion: 'demo-v1' }
  await Promise.all(Array.from({ length: 8 }, () => valid(s.source, input)))
  assert.equal(s.calls.length, 4)
  s.advance(59000)
  const cached = await valid(s.source, input)
  assert.equal(s.calls.length, 4)
  assert.equal(cached.dataAgeMs.value, 59000)
  s.advance(1000)
  await valid(s.source, input)
  assert.equal(s.calls.length, 8)
  await valid(s.source, { ...input, evidenceVersion: 'demo-v2' })
  assert.equal(s.calls.length, 11)
})
test('404 and 403 failures cache for at most 15s and preserve missing-dependency safety', async () => {
  for (const status of [404, 403]) {
    const s = setup({ get: (path, options, f) => path.includes('/issues?') ? copy(f.completed)
      : path.endsWith('/demo-blocked') ? { status, body: null }
        : path.includes('/activity?') ? copy(f.activity) : copy(f.runs) })
    const input = { ...s.input, taskId: 'demo-blocked' }
    const output = await valid(s.source, input)
    assert.ok(output.quality.gaps.includes(status === 404 ? 'SOURCE_DISABLED' : 'SOURCE_FAILED'))
    assert.ok(output.queue.find((row) => row.taskId === 'demo-blocked').blockers.some((row) => row.reason === 'DEP_UNKNOWN'))
    s.advance(14000)
    await valid(s.source, input)
    assert.equal(s.calls.length, 4)
    s.advance(1000)
    await valid(s.source, input)
    assert.equal(s.calls.length, 5)
  }
})
test('shared concurrency never exceeds four across concurrent task selections', async () => {
  let active = 0, max = 0
  const s = setup({ get: async (path, options, f) => {
    active++; max = Math.max(max, active)
    await new Promise((resolve) => setImmediate(resolve))
    active--
    if (path.includes('/issues?')) return copy(f.completed)
    if (path.includes('/activity?') || path.includes('/heartbeat-runs?')) return []
    const taskId = path.split('/').at(-1)
    return { ...f.detail, id: taskId }
  } })
  s.input.state.assigned.items = Array.from({ length: 12 }, (_, index) => ({
    ...s.f.state.assigned.items[0], issueId: `demo-task-${index}`,
  }))
  await Promise.all(s.input.state.assigned.items.map((row) => valid(s.source, { ...s.input, taskId: row.issueId })))
  assert.equal(max, 4)
  assert.ok(s.calls.length <= 1 + 12 * 3)
})
test('company mismatch and task/project scope mismatch fail closed', async () => {
  const denied = setup()
  denied.input.state.agents.items[0].companyId = 'demo-other'
  assert.equal((await denied.source.load(denied.input)).reason, 'SOURCE_FAILED')
  assert.equal(denied.calls.length, 0)
  for (const change of [{ companyId: 'demo-other' }, { projectId: 'demo-other' }, { id: 'demo-other' }]) {
    const s = setup()
    Object.assign(s.f.detail, change)
    const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
    assert.ok(output.quality.gaps.includes('SOURCE_FAILED'))
    assert.ok(!output.queue.some((row) => row.taskId === 'demo-other'))
  }
})
test('contract, scheduler, health snapshots are mapped without evidence or identity authority', async () => {
  const s = setup({ options: { owners: { acceptor: 'fake-person', budgetAuthorizer: 'fake-person', sampleReviewer: 'fake-person' } } })
  s.input.state.scheduler = { at: s.f.state.at, complete: true, skipped: [{ taskId: 'demo-blocked', reasonCodes: ['MONEY_CLASS_NEEDS_BOARD'] }] }
  s.input.state.contractView = { at: s.f.state.at, complete: true, items: [{ taskId: 'demo-blocked', state: 'complete' }] }
  s.input.state.health = { at: s.f.state.at, complete: true, incidents: [{ agentIds: ['demo-agent'] }] }
  const output = await valid(s.source, s.input)
  const row = output.queue.find((row) => row.taskId === 'demo-blocked')
  assert.equal(row.blockers.find((item) => item.blocker === 'budget').nextHandler.value, '董事会')
  assert.equal(row.stage, 'pending_verification')
})
test('5s timeout is contained, rejects stale detail and does not exceed concurrency slots', async () => {
  const s = setup({ get: (path, options, f) => {
    if (path.includes('/issues?')) return copy(f.completed)
    // 挂起直到调用方 abort；用 ref'd setTimeout 兜底保持事件循环存活（Node 22 上 AbortSignal.timeout 的计时器是 unref 的，否则测试被取消）
    return new Promise((resolve) => {
      const hung = setTimeout(() => resolve({ status: 503, body: null }), 10000)
      options.signal.addEventListener('abort', () => { clearTimeout(hung); resolve({ status: 503, body: null }) }, { once: true })
    })
  } })
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.ok(output.quality.gaps.includes('SOURCE_FAILED'))
  assert.equal(s.calls.length, 4)
})
test('fixture contains only redacted shape fields and pure source contains no transport or file APIs', () => {
  const raw = fs.readFileSync(new URL('./fixtures/command-view-live/shapes.json', import.meta.url), 'utf8')
  assert.equal(realIdentifier.test(raw), false)
  assert.equal(sensitiveValue.test(raw), false)
  assert.doesNotMatch(raw, /description|comment|stdout|payload|body|processPid/)
  const source = fs.readFileSync(new URL('../command-view-live.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\b|\bfs\b|node:|Date\.now|Math\.random|child_process|\beval\s*\(|innerHTML/)
})
test('company isolation has separate caches even with equal project and task IDs', async () => {
  const s = setup({ get: (path, options, f) => {
    const companyId = path.includes('demo-second') ? 'demo-second' : 'demo-company'
    return f.completed.map((row) => ({ ...row, companyId }))
  } })
  await valid(s.source, s.input)
  const second = copy(s.input)
  second.company.id = 'demo-second'
  const rewrite = (value) => {
    if (!value || typeof value !== 'object') return
    if (value.companyId) value.companyId = 'demo-second'
    for (const child of Object.values(value)) rewrite(child)
  }
  rewrite(second.state)
  const output = await valid(s.source, second)
  assert.equal(output.company.id, 'demo-second')
  assert.equal(s.calls.length, 2)
})
test('completed list failures cannot leak foreign-company/project tasks or fake completeness', async () => {
  for (const change of [{ companyId: 'demo-other' }, { projectId: 'demo-other' }]) {
    const s = setup({ get: (path, options, f) => f.completed.map((row) => ({ ...row, ...change })) })
    const output = await valid(s.source, s.input)
    assert.equal(output.summary.tasks.value, null)
    assert.ok(output.quality.gaps.includes('SOURCE_FAILED'))
    assert.equal(output.queue.some((row) => row.taskId === 'demo-done'), false)
  }
})
test('malformed input and throwing clock fail without exposing errors', async () => {
  const source = createLiveSource({ now: () => { throw new Error('private') } })
  assert.deepEqual(await source.load({ principal: 'local_full' }), { kind: 'empty', data: null, reason: 'SOURCE_FAILED' })
  const s = setup()
  assert.equal((await s.source.load(null)).reason, 'SOURCE_FAILED')
  s.input.state.scheduler = { skipped: 'invalid' }
  assert.equal((await s.source.load(s.input)).reason, 'SOURCE_FAILED')
})
test('partial selected runs cannot promote snapshot costs or running counts to complete', async () => {
  const s = setup({ get: (path, options, f) => path.includes('/issues?') ? copy(f.completed)
    : path.includes('/heartbeat-runs?') ? { runs: copy(f.runs), hasMore: true }
      : path.includes('/activity?') ? copy(f.activity) : copy(f.detail) })
  s.input.state.runs = { items: [], complete: true, at: s.f.state.at }
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.equal(output.execution.complete, false)
  assert.equal(output.summary.running.value, null)
  assert.equal(output.summary.cost.observedRuns.value, null)
  assert.equal(output.summary.cost.totalAmount.value, null)
})

test('company recent run page filters three tasks and unmapped rows without rejecting the batch', async () => {
  const s = setup()
  s.input.state.runs = { items: copy(s.f.runs), at: s.f.state.at, complete: true }
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.deepEqual(output.execution.items.map(row => row.runId), ['demo-run'])
  assert.ok(output.execution.items.every(row => row.taskId === 'demo-blocked'))
  assert.doesNotMatch(JSON.stringify(output.execution), /demo-run-review|demo-run-foreign|demo-run-unmapped/)
  assert.equal(output.quality.gaps.includes('SOURCE_FAILED'), false)
  assert.equal(output.execution.complete, false)
  assert.equal(output.execution.reason, 'PARTIAL_PAGE')
  const source = output.quality.sources.find(row => row.source === 'execution')
  assert.equal(source.complete, false)
  assert.equal(source.reason, 'PARTIAL_PAGE')
  assert.deepEqual(output.summary.running, { value: null, reason: 'PARTIAL_PAGE' })
  for (const key of ['confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns']) {
    assert.deepEqual(output.summary.cost[key], { value: null, reason: 'PARTIAL_PAGE' })
  }
})
test('captured runs map nested task identities but list only includes queue tasks', async () => {
  const s = setup()
  s.input.state.runs = { items: copy(s.f.runs), at: s.f.state.at, complete: true }
  const output = await valid(s.source, s.input)
  assert.deepEqual(output.execution.items.map(row => row.runId).sort(), ['demo-run', 'demo-run-review'])
  assert.ok(output.execution.items.every(row => output.queue.some(task => task.taskId === row.taskId)))
  assert.equal(output.execution.complete, false)
  assert.equal(output.execution.reason, 'PARTIAL_PAGE')
  assert.equal(s.calls.length, 1)
})
test('full 200-row company page stays partial after client task filtering', async () => {
  const s = setup()
  s.f.runs = Array.from({ length: 200 }, (_, index) => ({
    ...s.f.runs[0], id: `demo-run-${index}`,
    contextSnapshot: { issueId: index % 3 === 0 ? 'demo-blocked' : index % 3 === 1 ? 'demo-review' : 'demo-foreign' },
  }))
  const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
  assert.equal(output.execution.items.length, 67)
  assert.ok(output.execution.items.every(row => row.taskId === 'demo-blocked'))
  assert.equal(output.execution.complete, false)
  assert.equal(output.execution.reason, 'PARTIAL_PAGE')
  assert.deepEqual(output.summary.cost.observedRuns, { value: null, reason: 'PARTIAL_PAGE' })
})
test('usageJson accepts object and string and task identity keeps declared fallback precedence', async () => {
  for (const usageJson of [{ inputTokens: 5, outputTokens: 7 }, '{"inputTokens":5,"outputTokens":7}']) {
    const s = setup()
    s.f.runs = [
      { ...s.f.runs[0], id: 'demo-run-top-task', taskId: 'demo-blocked', issueId: 'demo-review', contextSnapshot: { issueId: 'demo-foreign' }, usageJson },
      { ...s.f.runs[0], id: 'demo-run-top-issue', issueId: 'demo-blocked', contextSnapshot: { issueId: 'demo-foreign' }, usageJson },
      { ...s.f.runs[0], id: 'demo-run-context-issue', contextSnapshot: { issueId: 'demo-blocked', taskId: 'demo-review' }, usageJson },
      { ...s.f.runs[0], id: 'demo-run-context-task', contextSnapshot: { taskId: 'demo-blocked' }, usageJson },
      { ...s.f.runs[0], id: 'demo-run-no-context', contextSnapshot: undefined, usageJson },
    ]
    const output = await valid(s.source, { ...s.input, taskId: 'demo-blocked' })
    assert.equal(output.execution.items.length, 4)
    assert.ok(output.execution.items.every(row => row.taskId === 'demo-blocked'))
    assert.ok(output.execution.items.every(row => row.usage.value === 12 && row.usage.reason === null))
    assert.equal(output.execution.complete, false)
  }
})

test('list freshness uses loaded sources at 19 seconds while page keeps honest gaps and unknown totals', async () => {
  const s = setup()
  s.input.state.assigned.complete = false
  s.input.state.agents.complete = false
  s.input.state.runs = { items: copy(s.f.runs), at: s.f.state.at, complete: false }
  s.advance(19000)
  const output = await valid(s.source, s.input)
  assert.deepEqual(output.dataAgeMs, { value: 19000, reason: null })
  assert.deepEqual(output.quality.freshness, { stale: false, reason: null, maxAgeMs: 120000, animationAllowed: true })
  assert.equal(output.quality.sources.some(row => row.source === 'activity'), false)
  const timeline = output.quality.sources.find(row => row.source === 'timeline')
  assert.deepEqual(timeline.ageMs, { value: null, reason: 'UNKNOWN_TIME' })
  assert.equal(timeline.reason, 'NOT_LOADED')
  assert.equal(output.timeline.complete, false)
  assert.equal(output.timeline.reason, 'NOT_LOADED')
  for (const reason of ['NOT_LOADED', 'EVIDENCE_NOT_CONNECTED', 'PARTIAL_PAGE', 'NO_ACCEPTANCE_EVIDENCE']) {
    assert.ok(output.quality.gaps.includes(reason), reason)
  }
  for (const key of ['tasks', 'running']) assert.deepEqual(output.summary[key], { value: null, reason: 'PARTIAL_PAGE' })
  assert.deepEqual(output.summary.accepted, { value: null, reason: 'EVIDENCE_NOT_CONNECTED' })
  for (const key of ['totalAmount', 'observedRuns', 'confirmedRuns', 'unknownCostRuns', 'missingUsageRuns']) {
    assert.deepEqual(output.summary.cost[key], { value: null, reason: 'PARTIAL_PAGE' })
  }
  assert.equal(s.calls.length, 1)
  assert.ok(s.calls[0].path.includes('/issues?'))
  // 使用真实形态夹具和注入 get，走页面实际的纯渲染/播放边界。
  assert.equal(responseKind(output, 'live'), 'data')
  assert.equal(duration(output.dataAgeMs), '19 秒')
  assert.match(measurement(output.summary.tasks), /^未知/)
  assert.equal(playbackAllowed({
    mode: 'live', hidden: false, reduced: false, stale: false,
    animationAllowed: output.quality.freshness.animationAllowed, busy: false, slice: 0, slices: 10,
  }), false)
})

test('list freshness includes state time and the oldest loaded source with inclusive 120 second threshold', async () => {
  for (const age of [120000, 130000]) {
    const s = setup()
    s.advance(age)
    const output = await valid(s.source, s.input)
    assert.deepEqual(output.dataAgeMs, { value: age, reason: null })
    assert.equal(output.quality.freshness.stale, age > 120000)
    assert.equal(output.quality.freshness.reason, age > 120000 ? 'STALE_DATA' : null)
    assert.equal(output.quality.freshness.animationAllowed, age <= 120000)
  }
  for (const field of ['assigned', 'agents', 'runs']) {
    const s = setup()
    if (field === 'runs') s.input.state.runs = { items: [], complete: false }
    s.input.state[field].at = new Date(Date.parse(s.f.state.at) - 11000).toISOString()
    s.advance(19000)
    assert.deepEqual((await valid(s.source, s.input)).dataAgeMs, { value: 30000, reason: null })
  }
  const s = setup()
  s.input.state.assigned.at = s.input.state.agents.at = new Date(Date.parse(s.f.state.at) + 10000).toISOString()
  s.input.state.runs = { items: [], at: s.input.state.agents.at, complete: false }
  s.advance(19000)
  assert.deepEqual((await valid(s.source, s.input)).dataAgeMs, { value: 19000, reason: null })
})

test('missing or invalid state time remains UNKNOWN_TIME even with known loaded-source times', async () => {
  for (const at of [undefined, null, 'invalid', '2026-10-21']) {
    const s = setup()
    s.input.state.runs = { items: [], at: s.f.state.at, complete: false }
    s.input.state.at = at
    s.advance(19000)
    const output = await valid(s.source, s.input)
    assert.deepEqual(output.dataAgeMs, { value: null, reason: 'UNKNOWN_TIME' })
    assert.deepEqual(output.quality.freshness, { stale: true, reason: 'UNKNOWN_TIME', maxAgeMs: 120000, animationAllowed: false })
    assert.ok(output.quality.gaps.includes('NOT_LOADED'))
    assert.equal(s.calls.length, 1)
  }
})

test('detail failure keeps UNKNOWN_TIME and successful loaded activity keeps known age', async () => {
  const failed = setup({ get: (path, options, f) => path.endsWith('/demo-blocked')
    ? { status: 503, body: null }
    : path.includes('/issues?') ? copy(f.completed)
      : path.includes('/activity?') ? copy(f.activity) : copy(f.runs) })
  failed.advance(19000)
  const output = await valid(failed.source, { ...failed.input, taskId: 'demo-blocked' })
  assert.deepEqual(output.dataAgeMs, { value: null, reason: 'UNKNOWN_TIME' })
  assert.deepEqual(output.quality.freshness, { stale: true, reason: 'UNKNOWN_TIME', maxAgeMs: 120000, animationAllowed: false })
  assert.ok(output.quality.gaps.includes('SOURCE_FAILED'))
  assert.deepEqual(output.quality.sources.find(row => row.source === 'detail').ageMs, { value: null, reason: 'UNKNOWN_TIME' })
  assert.equal(failed.calls.length, 4)
  const succeeded = setup()
  succeeded.advance(19000)
  const detail = await valid(succeeded.source, { ...succeeded.input, taskId: 'demo-blocked' })
  assert.deepEqual(detail.dataAgeMs, { value: 19000, reason: null })
  assert.equal(detail.quality.freshness.stale, false)
  for (const name of ['timeline', 'activity']) {
    assert.deepEqual(detail.quality.sources.find(row => row.source === name).ageMs, { value: 0, reason: null })
  }
  assert.equal(succeeded.calls.length, 4)
})

test('advancing clock is sampled again after detail sources load so their ages stay known', async () => {
  const f = fixture(), calls = []
  let time = Date.parse(f.state.at) + 19000
  const ticks = []
  const now = () => {
    const value = time
    ticks.push(value)
    time += 50
    return value
  }
  const get = async (path, options) => {
    calls.push({ path, options })
    if (path.includes('/issues?')) return copy(f.completed)
    if (path.includes('/activity?')) return copy(f.activity)
    if (path.includes('/heartbeat-runs?')) return copy(f.runs)
    return copy(f.detail)
  }
  const source = createLiveSource({ get, now })
  const output = await valid(source, {
    principal: 'local_full', company: f.company, state: f.state, taskId: 'demo-blocked',
  })
  assert.equal(calls.length, 4)
  assert.ok(ticks.length >= 6)
  assert.equal(Date.parse(output.scope.range.to), Date.parse(f.state.at))
  assert.ok(Date.parse(output.scope.range.to) <= ticks.at(-1))
  for (const name of ['execution', 'timeline', 'activity']) {
    const age = output.quality.sources.find(row => row.source === name)?.ageMs
    assert.equal(typeof age?.value, 'number', `${name}: ${JSON.stringify(age)}`)
    assert.equal(age.reason, null)
    assert.ok(age.value >= 0)
  }
  assert.equal(typeof output.dataAgeMs.value, 'number')
  assert.equal(output.dataAgeMs.reason, null)
  assert.equal(output.quality.freshness.stale, false)
  assert.equal(output.quality.freshness.reason, null)
  assert.equal(output.quality.freshness.animationAllowed, true)
})

test('fixed clock keeps detail projection deterministic and source failures explicitly unknown', async () => {
  const fixed = setup()
  fixed.advance(19000)
  const input = { ...fixed.input, taskId: 'demo-blocked' }
  const first = await valid(fixed.source, input)
  const second = await valid(fixed.source, input)
  assert.deepEqual(second, first)
  assert.equal(first.dataAgeMs.value, 19000)
  assert.equal(first.quality.freshness.stale, false)
  for (const name of ['execution', 'timeline', 'activity']) {
    assert.deepEqual(first.quality.sources.find(row => row.source === name).ageMs, { value: 0, reason: null })
  }
  const failed = setup({ get: (path, options, f) => path.endsWith('/demo-blocked')
    ? { status: 503, body: null }
    : path.includes('/issues?') ? copy(f.completed)
      : path.includes('/activity?') ? copy(f.activity) : copy(f.runs) })
  failed.advance(19000)
  const failure = await valid(failed.source, { ...failed.input, taskId: 'demo-blocked' })
  assert.deepEqual(failure.dataAgeMs, { value: null, reason: 'UNKNOWN_TIME' })
  assert.deepEqual(failure.quality.freshness, {
    stale: true, reason: 'UNKNOWN_TIME', maxAgeMs: 120000, animationAllowed: false,
  })
})
