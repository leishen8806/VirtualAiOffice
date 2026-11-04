import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import { createLastGoodState, stripStateCredentials, loadStateComponents, createBackgroundHealth, createSnapshotGet } from '../state-last-good.mjs'
import { buildHealth } from '../health.mjs'
import { redactState } from '../wall.mjs'
import { coarsenGeo } from '../office-geo.mjs'

const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const backup = fs.readFileSync(new URL('./fixtures/historical/office3d-backup-h2/server.mjs', import.meta.url), 'utf8')
const start = Date.parse('2026-10-22T02:00:00Z')
const extract = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)))
const fixedDate = class extends Date { constructor(value = start) { super(value) } static now() { return start } }
const fixture = () => ({ at: new Date(start).toISOString(), agents: [{ id: 'demo-agent' }], tasks: { todo: 2 },
  costs: { total: 7 }, actToken: 'fixture-only', memory: { text: 'http://example.test 10.0.0.1' },
  world: { weather: { location: { lat: 11.55555, lon: 104.92222, address: 'fixture address' } } },
})
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h2-state-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'state-last-good.json')
}
function context(extra = {}) {
  const empty = () => ({}), view = { view: empty, summary: empty }
  const value = { Date: fixedDate, COMPANY: 'demo-company', ACT_TOKEN: 'fixture-only',
    get: async p => p.endsWith('/dashboard') ? { tasks: { todo: 1 }, costs: { total: 2 }, pendingApprovals: 0 }
      : p.endsWith('/agents') ? [{ id: 'demo-agent', name: 'demo-name', status: 'idle' }] : [],
    backlogRows: async () => [], world: () => ({ duty: { on: false, days: [1] } }),
    readNames: empty, pidAlive: () => null, readProcessTable: async () => null,
    readProcessTables: async () => ({ previous: null, current: null }), runBusy: () => ({ busy: false, busyName: null }),
    runAlive: run => ({ alive: null, via: null, descendants: [] }), gossip: { maybeGenerate() {}, recent: () => [] },
    stats: { ingest() {}, daily: () => ({ done: [] }), awards: () => [] },
    telegram: { view: empty, onState: async () => {} }, committee: view, standup: view, acceptance: { ...view, onState() {} },
    patrol: view, rework: view, handoff: view, mem: view, chat: view, workload: view,
    voteSessions: () => [], scheduleCache: {}, projectsCache: [],
    buildMeetings: async () => [], buildWaiting: async () => [], buildEvents: async () => [],
    CONTRACT_VIEW_ENABLED: false, ledger: { ingest() {}, view: empty },
    healthReport: async () => ({ level: 'ok', text: '运行健康' }),
    computeToday: () => ({ runs: { total: 0 }, backlog: 0, done: 0, total: 1, percent: 0, comments: 0, waiting: 0, decisions: {}, byProject: [] }),
    commandLive: { capture() {} }, console: { log() {} }, loadStateComponents, ...extra,
  }
  value.moduleGet ||= () => value.get
  return value
}
function stateFunction(text, ctx) {
  // 服务器入口后来改成 `const server = http`（优雅退出要用到句柄），老版本仍是裸 `http`。
  const end = text.includes('\nconst server = http') ? '\nconst server = http' : '\nhttp'
  return vm.runInNewContext(extract(text, 'async function state()', end) + '\nstate', ctx)
}
function stateRoute(state, lanUser = false, wallScope = false, cache = new Map(), now = Date.now, routeSource = source) {
  const code = extract(routeSource, "      if (url.pathname === '/state')", "      if (url.pathname === '/replay')")
  let response
  const res = { writeHead(status) { response = { status }; return this }, end(body) { response.body = JSON.parse(body); return this } }
  const run = vm.runInNewContext(`(async () => { ${code} })`, {
    url: { pathname: '/state' }, state, lanUser, wallScope, stateResponseCache: cache, Date: { now }, LAN: { write: false }, foyer: { summary: () => ({}) },
    redactState, restrictedWorld: value => ({ ...value, weather: { ...value.weather,
      location: coarsenGeo(value.weather.location.lat, value.weather.location.lon) } }),
    TYPES: { '.json': 'application/json' }, res, json: (status, body) => { response = { status, body } },
  })
  return run().then(() => JSON.parse(JSON.stringify(response)))
}

test('credentials are stripped recursively without accessing credential getters', () => {
  const value = { at: fixture().at, nested: [{ access_code: 'fixture', apiKey: 'fixture', safe: 4 }], count: 3 }
  Object.defineProperty(value, 'actToken', { enumerable: true, get() { assert.fail('credential getter accessed') } })
  assert.deepEqual(stripStateCredentials(value), { at: value.at, nested: [{ safe: 4 }], count: 3 })
  for (const key of ['token', 'refreshToken', 'password', 'authorization', 'cookie', 'secret', '令牌', '访问码']) {
    assert.deepEqual(stripStateCredentials({ [key]: 'fixture', safe: true }), { safe: true })
  }
})

test('successful state stays identical to old aggregation field by field after health cache warmup', async t => {
  const manager = createLastGoodState({ file: temp(t), now: () => start, log() {} })
  const old = await stateFunction(backup, context())()
  const current = await stateFunction(source, context({ lastGoodState: manager }))()
  assert.deepEqual(JSON.parse(JSON.stringify(current)), JSON.parse(JSON.stringify(old)))
  assert.deepEqual(JSON.parse(JSON.stringify(current._schedulerSource)), JSON.parse(JSON.stringify(old._schedulerSource)))
  assert.equal(current.stale, undefined)
})

test('required failure returns last good 200, grows age, recovers and logs once per transition', async t => {
  let ms = start
  const logs = [], file = temp(t)
  const manager = createLastGoodState({ file, now: () => ms, log: message => logs.push(message) })
  await manager.run(async () => fixture())
  const fail = () => manager.run(async () => { throw new Error('fixture upstream') })
  ms += 60000
  const reply = await stateRoute(fail)
  assert.equal(reply.status, 200)
  assert.deepEqual(reply.body.stale, { active: true, since: fixture().at, ageMs: 60000, reason: 'UPSTREAM_UNAVAILABLE' })
  assert.equal(reply.body.actToken, '')
  reply.body.agents.length = 0
  assert.equal((await fail()).agents.length, 1)
  assert.equal(logs.length, 1)
  ms += 30 * 60000
  assert.equal((await fail()).stale.reason, 'STALE_DATA')
  await manager.run(async () => ({ ...fixture(), at: new Date(ms).toISOString() }))
  assert.equal(logs.at(-1), '[state] 恢复')
  assert.equal(logs.length, 2)
})

test('missing corrupt invalid files yield 503, persisted credentials are removed on startup', async t => {
  const file = temp(t)
  for (const content of [null, '{broken', 'null', '{}', JSON.stringify({ ...fixture(), stale: { active: true } })]) {
    if (content !== null) fs.writeFileSync(file, content)
    const manager = createLastGoodState({ file, log() {} })
    const reply = await stateRoute(() => manager.run(async () => { throw new Error('fixture failure') }))
    assert.deepEqual(reply, { status: 503, body: { error: 'STATE_UNAVAILABLE_NO_SNAPSHOT', reason: 'UPSTREAM_UNAVAILABLE' } })
  }
  fs.writeFileSync(file, JSON.stringify({ ...fixture(), child: { accessToken: 'fixture-only', safe: 3 } }))
  const manager = createLastGoodState({ file, now: () => start, log() {} })
  const out = await manager.run(async () => { throw new Error('fixture') })
  assert.deepEqual(out.child, { safe: 3 })
  assert.equal(out.actToken, '')
})

test('atomic writes exclude credentials, final snapshot survives restart and failed write keeps memory', async t => {
  const file = temp(t)
  const manager = createLastGoodState({ file, now: () => start, log() {} })
  await manager.run(async () => ({ ...fixture(), nested: { token: 'fixture', safe: 2 } }))
  const written = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(written.actToken, undefined); assert.deepEqual(written.nested, { safe: 2 })
  assert.equal(fs.existsSync(file + '.tmp'), false)
  const restarted = createLastGoodState({ file, now: () => start, log() {} })
  assert.equal((await restarted.run(async () => { throw new Error() })).stale.ageMs, 0)
  const broken = createLastGoodState({ file: path.join(path.dirname(file), 'missing', 'state.json'), now: () => start, log() {} })
  await broken.run(async () => fixture())
  assert.equal((await broken.run(async () => { throw new Error() })).stale.active, true)
})

test('each optional source failure stays 200 with ordered gaps and unknown dependent numbers', async t => {
  for (const name of ['runs', 'approvals', 'activity', 'approvalsAll', 'backlog']) {
    const manager = createLastGoodState({ file: temp(t), now: () => start, log() {} })
    const ctx = context({ lastGoodState: manager })
    const get = ctx.get
    ctx.get = async p => {
      if ((name === 'runs' && p.includes('heartbeat-runs')) || (name === 'approvals' && p.includes('status=pending')) ||
          (name === 'activity' && p.includes('/activity')) || (name === 'approvalsAll' && p.endsWith('/approvals'))) throw new Error('fixture')
      return get(p)
    }
    if (name === 'backlog') ctx.backlogRows = async strict => { assert.equal(strict, true); throw new Error('fixture') }
    const reply = await stateRoute(stateFunction(source, ctx))
    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body.gaps, [{ source: name, reason: 'UPSTREAM_UNAVAILABLE' }])
    assert.equal(reply.body.stale, undefined)
    if (name === 'runs') assert.deepEqual(reply.body.today.runs.total, { value: null, reason: 'UPSTREAM_UNAVAILABLE' })
    if (name === 'activity') assert.deepEqual(reply.body.today.done, { value: null, reason: 'UPSTREAM_UNAVAILABLE' })
    if (name === 'backlog') assert.deepEqual(reply.body.today.backlog, { value: null, reason: 'UPSTREAM_UNAVAILABLE' })
  }
  for (const required of ['agents', 'dashboard', 'issues']) {
    await assert.rejects(loadStateComponents({ company: 'demo', backlog: async () => [], get: async p => {
      if (p.includes(`/${required}`)) throw new Error('fixture required')
      return required === 'dashboard' || !p.endsWith('/dashboard') ? [] : { tasks: {} }
    } }))
  }
})

test('LAN and wall use identical redaction on normal and fallback snapshots without mutating stored data', async t => {
  const manager = createLastGoodState({ file: temp(t), now: () => start, log() {} })
  await manager.run(async () => fixture())
  const fallback = () => manager.run(async () => { throw new Error('fixture') })
  for (const [lan, wall] of [[true, false], [false, true]]) {
    const normal = await stateRoute(async () => fixture(), lan, wall)
    const stale = await stateRoute(fallback, lan, wall)
    delete stale.body.stale
    assert.deepEqual(stale, normal)
    assert.equal(stale.body.world.weather.location.address, undefined)
    assert.notEqual(stale.body.world.weather.location.lat, fixture().world.weather.location.lat)
  }
})

test('health refresh timeout never blocks state, preserves report and H1 classifier results', async t => {
  let ms = start, fail = false
  const agents = [{ id: 'OpsLead', model: 'gpt-5.6-terra', status: 'running' }]
  const runs = [{ agentId: 'OpsLead', status: 'failed', errorCode: 'provider_quota',
    error: 'Selected model is at capacity. Please try a different model.', finishedAt: '2026-10-22T01:00:00Z' }]
  const calls = []
  let healthSettled = false
  const cache = createBackgroundHealth({ now: () => ms, timeoutMs: 500, company: 'demo', buildHealth, schedule: () => ({ days: [1] }),
    get: async p => { calls.push(p); if (fail) return new Promise(() => {}); return p.includes('heartbeat') ? runs.map(run => ({ ...run, resultJson: null })) : agents } })
  assert.equal(cache.read().stale.reason, 'NOT_LOADED')
  await cache.refresh()
  assert.deepEqual(calls.sort(), [
    '/api/companies/demo/agents',
    '/api/companies/demo/heartbeat-runs?limit=1000&summary=true',
  ].sort())
  const good = cache.read()
  assert.deepEqual(good, buildHealth({ now: new Date(ms), agents, runs, schedule: { days: [1] } }))
  assert.equal(good.agents[0].lastFailure.category, 'upstream')
  assert.equal(good.incidents.length, 0)
  fail = true; ms += 30000
  const manager = createLastGoodState({ file: temp(t), now: () => ms, log() {} })
  const state = stateFunction(source, context({ lastGoodState: manager, healthReport: async () => cache.read() }))
  const refresh = cache.refresh().then(() => { healthSettled = true })
  const out = await state()
  assert.equal(healthSettled, false, 'state awaited health timeout')
  assert.equal(out.healthLevel.stale.active, true)
  await refresh
  const expired = cache.read(), { stale, ...retained } = expired
  assert.equal(stale.reason, 'UPSTREAM_UNAVAILABLE')
  assert.deepEqual(retained, good)
  assert.equal(calls.filter(p => p.includes('heartbeat-runs')).length, 2)
  fail = false; ms += 30000
  await cache.refresh()
  assert.equal(cache.read().stale, undefined)
  assert.deepEqual(cache.read(), buildHealth({ now: new Date(ms), agents, runs, schedule: { days: [1] } }))
})

test('health summary retains the 24h window when another agent has over 40 newer runs', async () => {
  const ms = Date.parse('2026-11-03T04:00:00Z')
  const agents = [{ id: 'quiet-agent', name: 'quiet-agent', model: 'claude' }, { id: 'busy-agent', name: 'busy-agent', model: 'gpt' }]
  const runs = []
  for (let i = 0; i < 40; i++) runs.push({ agentId: 'busy-agent', status: 'succeeded', finishedAt: new Date(ms - i * 60000).toISOString() })
  runs.push({ agentId: 'quiet-agent', status: 'failed', errorCode: 'claude_auth_required', error: 'login required', finishedAt: new Date(ms - 30 * 60000).toISOString() })
  const calls = []
  const cache = createBackgroundHealth({ now: () => ms, company: 'demo', buildHealth, schedule: () => ({ days: [1] }),
    get: async p => {
      calls.push(p)
      if (!p.includes('heartbeat-runs')) return agents
      const limit = Number(new URL(`http://local${p}`).searchParams.get('limit'))
      return runs.slice(0, limit).map(run => ({ ...run, resultJson: null }))
    } })
  await cache.refresh()
  assert.deepEqual(calls, [
    '/api/companies/demo/agents',
    '/api/companies/demo/heartbeat-runs?limit=1000&summary=true',
  ])
  const report = cache.read()
  assert.equal(report.agents.find(a => a.agentId === 'quiet-agent').lastFailure.category, 'login')
  assert.equal(report.incidents.some(i => i.category === 'login' && i.agentIds.includes('quiet-agent')), true)
  assert.equal(report.agents.find(a => a.agentId === 'busy-agent').runs24h, 40)
  let later = ms + 30000
  // A retained snapshot proves a 40-row follow-up cannot erase a quiet agent's 24h failure.
  const file = path.join(os.tmpdir(), `health-runs-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify({ runs }))
  const retained = createBackgroundHealth({ now: () => later, file, company: 'demo', buildHealth, schedule: () => ({ days: [1] }),
    get: async p => p.includes('heartbeat-runs') ? runs.slice(0, 40) : agents })
  await retained.refresh()
  assert.equal(retained.read().agents.find(a => a.agentId === 'quiet-agent').lastFailure.category, 'login')
  fs.unlinkSync(file)
})

test('shared collection snapshot coalesces modules and preserves caller isolation', async () => {
  let ms = start, upstream = 0
  const snapshots = createSnapshotGet({ now: () => ms, get: async () => { upstream++; return [{ id: upstream }] } })
  const modules = ['state', 'workload', 'blocked', 'stats', 'health'].map(name => snapshots.forModule(name))
  const rows = await Promise.all(modules.map(get => get('/api/companies/demo/agents')))
  assert.equal(upstream, 1)
  rows[0][0].id = 'changed'
  assert.equal((await modules[0]('/api/companies/demo/agents'))[0].id, 1)
  assert.deepEqual(snapshots.counts().state, { requests: 2, hits: 1, upstream: 1 })
  ms += 45000
  await modules[0]('/api/companies/demo/agents')
  assert.equal(upstream, 2)
})

test('/state shares one response for five seconds and refreshes after expiry', async () => {
  let ms = start, builds = 0
  const cache = new Map(), read = async () => { builds++; return fixture() }
  await stateRoute(read, false, false, cache, () => ms)
  ms += 4999
  await stateRoute(read, false, false, cache, () => ms)
  assert.equal(builds, 1)
  ms += 1
  await stateRoute(read, false, false, cache, () => ms)
  assert.equal(builds, 2)
})

test('/state keeps one upstream build for one, three, and five concurrent pages', async t => {
  for (const pages of [1, 3, 5]) {
    let builds = 0
    const manager = createLastGoodState({ file: temp(t), now: () => start, log() {} })
    const read = () => manager.run(async () => { builds++; await Promise.resolve(); return fixture() })
    await Promise.all(Array.from({ length: pages }, () => stateRoute(read, false, false, new Map(), () => start)))
    assert.equal(builds, 1)
  }
})

test('/state five-second response cache halves work at a three-second poll cadence', async () => {
  const poll = async (routeSource) => {
    let ms = start, builds = 0
    const cache = new Map()
    const read = async () => { builds++; return fixture() }
    for (let i = 0; i < 20; i++) {
      await stateRoute(read, false, false, cache, () => ms, routeSource)
      ms += 3000
    }
    return builds
  }
  const oneSecondBaseline = source.replace(/cached\.at < 5000/, 'cached.at < 1000')
  assert.notEqual(oneSecondBaseline, source, 'baseline fixture must contain the former one-second TTL')
  const baselineBuilds = await poll(oneSecondBaseline)
  const cachedBuilds = await poll(source)
  assert.equal(baselineBuilds, 20)
  assert.equal(cachedBuilds, 10)
  assert.equal((baselineBuilds - cachedBuilds) / baselineBuilds, 0.5)
})

test('/state response cache does not cross local, LAN, and wall scopes', async () => {
  let builds = 0
  const cache = new Map(), read = async () => { builds++; return fixture() }
  await stateRoute(read, false, false, cache, () => start)
  await stateRoute(read, true, false, cache, () => start + 10)
  await stateRoute(read, false, true, cache, () => start + 20)
  assert.equal(builds, 3)
})

test('health readers share concurrent work and refresh no faster than once per 30 seconds', async () => {
  let ms = start
  const calls = []
  const agents = [{ id: 'demo-agent', name: 'Demo', status: 'idle', model: 'gpt-5.6' }]
  const runs = [{ id: 'r1', agentId: 'demo-agent', status: 'succeeded', finishedAt: new Date(ms).toISOString() }]
  const health = createBackgroundHealth({
    now: () => ms, company: 'demo', buildHealth, schedule: () => ({ days: [1] }),
    get: async (route) => { calls.push(route); return route.includes('heartbeat-runs') ? runs : agents },
  })
  await Promise.all(Array.from({ length: 12 }, () => health.refresh()))
  assert.equal(calls.filter((route) => route.includes('heartbeat-runs')).length, 1)
  for (let i = 0; i < 100; i++) health.read()
  await health.refresh()
  assert.equal(calls.filter((route) => route.includes('heartbeat-runs')).length, 1)
  ms += 30000
  await health.refresh()
  assert.equal(calls.filter((route) => route.includes('heartbeat-runs')).length, 2)
})

test('concurrent state reads share build and return isolated copies, gaps deterministic on all optional failures', async t => {
  const manager = createLastGoodState({ file: temp(t), now: () => start, log() {} })
  let calls = 0
  const build = async () => { calls++; return fixture() }
  const results = await Promise.all([manager.run(build), manager.run(build)])
  assert.equal(calls, 1)
  results[0].agents.length = 0
  assert.equal(results[1].agents.length, 1)
  const loaded = await loadStateComponents({ company: 'demo', backlog: async () => { throw new Error() },
    get: async p => {
      if (p.endsWith('/agents')) return []
      if (p.endsWith('/dashboard')) return { tasks: {} }
      if (p.includes('/issues?status=todo')) return []
      throw new Error()
    } })
  assert.deepEqual(loaded.gaps.map(row => row.source), ['runs', 'approvals', 'activity', 'approvalsAll', 'backlog'])
})

test('act auth and body are unchanged; fake unavailable upstream never returns successful write', async () => {
  // DS-7 / R1（2026-10-23，规划者批准）：完成策略只改 act 的签名与 review 分支；其余部分（含鉴权与其它所有分支）仍须与 H2 备份逐字一致。
  const sigRe = /async function act\(a(?:, options = \{\})?\)/
  const reviewRe = /  if \(a\.type === 'review'\) \{[\s\S]*?\n  \}\n/
  const cancelRunRe = /  if \(a\.type === 'cancel_run'\) \{[\s\S]*?\n  \}\n(?=  if \(a\.type === 'review'\))/
  // OFFICE-R1-MOVEFIX J（CMP-835，董事会 2026-10-30「名牌重名」）：rename 分支只新增一行显示名查重；
  // 鉴权与其它所有分支仍须与 H2 备份逐字一致，所以这里只豁免这一行，并在下面正面断言它存在。
  const renameGuardRe = / {4}need\(!nameConflict\(names, key, name\), '[^']*'\)\n/
  const actBody = (text) => text.replace(sigRe, 'async function act(a)').replace(/\r\n/g, '\n').replace(cancelRunRe, '  /* cancel_run */\n').replace(reviewRe, '  /* review */\n').replace(renameGuardRe, '')
  const actNow = extract(source, 'async function act(a', '// 任务详情（只读）')
  assert.match(actNow, /^async function act\(a, options = \{\}\)/)
  assert.match(actNow, /need\(!nameConflict\(names, key, name\), '[^']*'\)/, 'rename 分支必须保留显示名查重')
  assert.match(actNow, /const liveness = run && runAlive\(run, await readProcessTable\(\)\)/)
  assert.match(actNow, /if \(shouldBlockCancel\(liveness\)\)/)
  assert.equal(actBody(actNow), actBody(extract(backup, 'async function act(a)', '// 任务详情（只读）')))
  const normalizeActCall = (text) => text.replace(/\r\n/g, '\n').replace(/await act\(body, \{ localFullAccess: !lanUser && !wallScope \}\)/, 'await act(body)') // DS-7：仅此一处调用点改动
  const route = normalizeActCall(extract(source, "      if (req.method === 'POST' && url.pathname === '/act')", "      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/town/map')"))
  assert.equal(route, normalizeActCall(extract(backup, "      if (req.method === 'POST' && url.pathname === '/act')", "      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/town/map')")))
  const act = actNow
  let calls = 0
  const run = vm.runInNewContext(act + '\nact', { need: (ok, message) => { if (!ok) throw new Error(message) },
    UUID: /^[a-z0-9-]+$/, str: s => String(s || ''), send: async () => { calls++; throw new Error('fixture upstream unavailable') } })
  await assert.rejects(run({ type: 'comment', issueId: 'demo-task', body: 'fixture' }), /unavailable/)
  assert.equal(calls, 1)
  let response
  const req = { method: 'POST', headers: { host: 'fixture', 'x-office-token': 'fixture-only', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield JSON.stringify({ type: 'comment', issueId: 'demo-task', body: 'fixture' }) } }
  await vm.runInNewContext(`(async () => { ${route} })`, {
    req, url: { pathname: '/act' }, lanUser: false, LAN: { write: false }, ACT_TOKEN: 'fixture-only',
    hostOk: () => true, originOk: () => true, act: run, CONTRACT_VIEW_ENABLED: false, console: { log() {} },
    json: (status, body) => { response = { status, body } },
  })()
  assert.equal(response.status, 502)
  assert.equal(response.body.ok, undefined)
  assert.match(response.body.error, /unavailable/)
})

test('strict state backlog reports a failed older cache rather than calling it fresh success', async () => {
  const code = extract(source, 'async function backlogRows(', 'async function schedulerEnrichRows')
  const strictRead = vm.runInNewContext(code + '\nbacklogRows', {
    Date: fixedDate, backlogCache: { at: start, rows: [{ id: 'old' }], failed: true },
  })
  await assert.rejects(strictRead(true), /BACKLOG_UNAVAILABLE/)
  assert.deepEqual(JSON.parse(JSON.stringify(await strictRead())), [{ id: 'old' }])
})

test('snapshot static paths denied and new helper has no Paperclip write or random/eval paths', () => {
  const declarations = extract(source, 'const STATIC_EXT', 'let wallCache')
  const staticOk = vm.runInNewContext(declarations + '\nstaticOk', { path })
  for (const route of ['/state-last-good.json', '/state-last-good.json.tmp']) assert.equal(staticOk(route), false)
  const helper = fs.readFileSync(new URL('../state-last-good.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(helper, /Math\.random|\beval\s*\(|\bfetch\s*\(|\bsend\s*\(/)
  assert.equal(extract(source, 'const API_PATHS', 'let wallCache').includes("'/state-last-good"), false)
})
