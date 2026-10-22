import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { commandLiveConfig, commandStateSnapshot, createCommandLiveWiring } from '../command-view-wiring.mjs'
import { createCommandViewRoutes } from '../command-view-routes.mjs'
import { responseKind } from '../command-view-render.js'
const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/command-view-live/shapes.json', import.meta.url), 'utf8'))
function setup(extra = {}) {
  const f = fixture()
  let ms = Date.parse(f.state.at), reads = 0
  const calls = []
  const config = extra.config || { enabled: true, live: { enabled: true } }
  const routes = createCommandViewRoutes({ enabled: config.enabled === true })
  const readState = async () => { reads++; return f.state }
  const get = async (path, options) => {
    calls.push({ path, method: options.method })
    if (path.includes('/issues?')) return f.completed
    if (path.includes('/activity?')) return f.activity
    if (path.includes('/heartbeat-runs?')) return f.runs
    return f.detail
  }
  const wire = createCommandLiveWiring({ config, routes, company: f.company, get, readState,
    now: () => ms, ...extra })
  const request = (query = 'mode=live', more = {}) => wire.handle({
    method: 'GET', path: '/command-view', query, principal: 'local_full', now: ms, ...more,
  })
  return { wire, request, f, calls, reads: () => reads, advance: n => { ms += n } }
}
test('two literal switches only; defaults and owners match board decision', () => {
  for (const enabled of [false, true, 'true', 1, undefined]) for (const live of [false, true, 'true', 1, undefined]) {
    assert.equal(commandLiveConfig({ enabled, live: { enabled: live } }).enabled, enabled === true && live === true)
  }
  assert.equal(commandLiveConfig(null).enabled, false)
  assert.equal(commandLiveConfig({ enabled: true, live: { enabled: true, rangeDays: 90 } }).rangeDays, 14)
  assert.deepEqual(commandLiveConfig({}).owners, { acceptor: '董事会', budgetAuthorizer: '董事会', sampleReviewer: '董事会' })
})
test('either switch disabled returns reasoned live empty with no I/O', async () => {
  for (const enabled of [false, true]) {
    const s = setup({ config: { enabled, live: { enabled: false } } })
    const result = await s.request()
    assert.equal(result.status, 200)
    assert.equal(result.body.reason, 'SOURCE_DISABLED')
    assert.equal(s.reads(), 0)
    assert.equal(s.calls.length, 0)
  }
})
test('restricted principal and wall scope never fetch state or live data', async () => {
  const s = setup()
  for (const principal of [undefined, 'restricted', 'lan', 'wall']) {
    const result = await s.request('mode=live', { principal })
    assert.equal(result.body.reason, 'NO_AUTHORIZED_LIVE_SCOPE')
  }
  assert.equal((await s.request('mode=live', { wallScope: true })).status, 403)
  assert.equal(s.reads(), 0)
  assert.equal(s.calls.length, 0)
})
test('taskId strict syntax and membership; no input echo or detail requests for invalid task', async () => {
  const s = setup()
  for (const value of ['', '../private', 'a/b', 'a '.repeat(90), 'demo-x&taskId=demo-y']) {
    const result = await s.request('mode=live&taskId=' + encodeURIComponent(value))
    assert.equal(result.status, 400)
    assert.deepEqual(result.body, { error: 'INVALID_PARAMETERS' })
  }
  assert.equal(s.reads(), 0)
  const denied = await s.request('mode=live&taskId=demo-other')
  assert.equal(denied.status, 400)
  assert.equal(s.calls.length, 1)
  assert.equal((await s.request('mode=live&taskId=demo-blocked&taskId=demo-blocked')).status, 400)
})
test('state traffic reused; no state read on warm capture; cold read single flight and 60s cache', async () => {
  const warm = setup()
  warm.wire.capture(warm.f.state)
  await warm.request()
  assert.equal(warm.reads(), 0)
  const s = setup()
  await Promise.all(Array.from({ length: 6 }, () => s.request()))
  assert.equal(s.reads(), 1)
  assert.equal(s.calls.length, 1)
  s.advance(59000)
  await s.request()
  assert.equal(s.reads(), 1)
  s.advance(1000)
  await s.request()
  assert.equal(s.reads(), 2)
})
test('details lazy, 60s cached; real adapter enforces pending evidence and preserves unknown costs', async () => {
  const s = setup()
  const list = await s.request()
  assert.equal(list.status, 200)
  assert.equal(s.calls.length, 1)
  assert.equal(responseKind(list.body, 'live'), 'data')
  assert.equal(responseKind(list.body, 'demo'), 'invalid')
  const detail = await s.request('mode=live&taskId=demo-blocked')
  assert.equal(detail.status, 200)
  assert.ok(detail.body.queue.every(row => row.stage === 'pending_verification' && row.evidence.value === null))
  assert.equal(detail.body.summary.cost.totalAmount.value, null)
  assert.equal(s.calls.length, 4)
  await s.request('mode=live&taskId=demo-blocked')
  assert.equal(s.calls.length, 4)
  assert.ok(s.wire.metrics().maxConcurrent <= 4)
  assert.deepEqual(s.wire.metrics(), { count: 4, concurrent: 0, maxConcurrent: 3 })
  assert.ok(s.calls.length <= 20)
})
test('snapshot strips operation credentials, body, comments and nested config before any clone', () => {
  const f = fixture()
  const state = { ...f.state, actToken: 'private', approvals: [{ summary: 'private' }],
    _schedulerSource: { schedulerTasks: [{ id: 'demo-task', description: 'private', projectId: 'demo-project', title: 'demo-title' }] } }
  const out = commandStateSnapshot(state)
  assert.doesNotMatch(JSON.stringify(out), /private|actToken|description|approvals/)
  assert.equal(out.assigned.items[0].issueId, 'demo-task')
  Object.defineProperty(state, 'actToken', { get() { assert.fail('operation token accessed') } })
  assert.deepEqual(commandStateSnapshot(state), out)
})
test('response validation failure returns generic 500 and never raw data', async () => {
  const s = setup({ makeSource: () => ({ load: async () => ({ mode: 'live', private: 'hidden' }) }) })
  const result = await s.request()
  assert.equal(result.status, 500)
  assert.deepEqual(result.body, { error: 'COMMAND_VIEW_UNAVAILABLE' })
})
test('demo and unrelated paths bypass live wiring, method and shared rate guard preserved', async () => {
  const s = setup()
  assert.equal(await s.request('mode=demo'), null)
  assert.equal(await s.request('mode=live', { path: '/state' }), null)
  assert.equal((await s.request('mode=live', { method: 'POST' })).status, 405)
  assert.equal(s.reads(), 0)
})
test('empty reasons remain empty, malformed mode data cannot become demo fallback', () => {
  for (const reason of ['SOURCE_DISABLED', 'SOURCE_FAILED', 'NO_AUTHORIZED_LIVE_SCOPE']) {
    assert.equal(responseKind({ kind: 'empty', data: null, reason }, 'live'), 'empty')
  }
  assert.equal(responseKind({ kind: 'empty', data: null, reason: 'private' }, 'live'), 'invalid')
})
test('server reads config once, captures only after projection, no new enrichment in state', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/readFileSync\(path\.join\(HERE, 'command-view\.json'\)/g) || []).length, 1)
  const state = source.slice(source.indexOf('async function state()'), source.indexOf('http\r\n  .createServer') > 0 ? source.indexOf('http\r\n  .createServer') : source.indexOf('http\n  .createServer'))
  assert.match(state, /commandLive\.capture\(out\)/)
  assert.doesNotMatch(state, /commandLive\.handle|source\.load|command-view-live/)
  assert.match(source, /principal: !lanUser && !wallAuthed\(req\)/)
  const page = fs.readFileSync(new URL('../command-view.js', import.meta.url), 'utf8')
  assert.match(page, /if \(mode === 'live' && taskId\) query\.set\('taskId', taskId\)/)
  assert.match(page, /正在读取详情/)
  assert.match(page, /真实数据 · 本机授权/)
})
