import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { commandViewEnabled, createCommandViewRoutes } from '../command-view-routes.mjs'
import { listDemoScenarios } from '../command-view-demo.mjs'
import { realIdentifier, sensitiveValue, validateCommandView } from '../command-view-validate.mjs'

const request = (routes, query = '', more = {}) => routes.handle({
  method: 'GET', path: '/command-view', query, now: 1000, ...more,
})
const empty = { kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' }

test('only literal boolean true enables config; missing, damaged and other types fail closed', () => {
  for (const config of [undefined, null, {}, [], true, 'damaged', { enabled: false }, { enabled: 'true' }, { enabled: 1 }]) {
    assert.equal(commandViewEnabled(config), false)
  }
  assert.equal(commandViewEnabled({ enabled: true }), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../command-view.json', import.meta.url))), {
    enabled: false, live: { enabled: false, projectName: 'KhmerX', rangeDays: 14,
      owners: { acceptor: '董事会', budgetAuthorizer: '董事会', sampleReviewer: '董事会' } },
  })
})

test('disabled routes do not invoke loaders or require a clock', () => {
  for (const enabled of [undefined, false, 'true', 1]) {
    const fail = () => assert.fail('disabled loader called')
    const routes = createCommandViewRoutes({ enabled, buildDemo: fail, listScenarios: fail, loadDefault: fail })
    for (const path of ['/command-view', '/command-view/scenarios']) {
      assert.equal(request(routes, 'mode=demo', { path, now: undefined }).status, 404)
    }
    assert.equal(request(routes, '', { path: '/state' }), null)
  }
})

test('default and explicit live return only an honest empty state', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  for (const query of ['', 'mode=live']) assert.deepEqual(request(routes, query).body, empty)
  assert.equal(request(routes).status, 200)
})

test('all three real demo builders and all ten slices pass C2 at the route boundary', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  const metadata = request(routes, '', { path: '/command-view/scenarios' })
  assert.equal(metadata.status, 200)
  assert.deepEqual(metadata.body, listDemoScenarios())
  let count = 0
  for (const scenario of metadata.body) {
    for (let timeSlice = 0; timeSlice < scenario.timeSlices; timeSlice++) {
      const response = request(routes, `mode=demo&scenario=${scenario.id}&timeSlice=${timeSlice}`)
      assert.equal(response.status, 200)
      assert.deepEqual(validateCommandView(response.body), { ok: true, errors: [] })
      assert.equal(response.body.mode, 'demo')
      assert.equal(response.body.quality.synthetic, true)
      assert.equal(response.body.queue.some((row) => row.stage === 'accepted'), false)
      count++
    }
  }
  assert.equal(count, 10)
  assert.deepEqual(request(routes, 'mode=demo').body, request(routes, 'mode=demo&scenario=demo-journey&timeSlice=0').body)
})

test('invalid scenarios, modes, slices, duplicate and extra parameters are rejected without echo', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  const invalid = [
    'mode=', 'mode=replay', 'mode=DEMO', 'scenario=demo-journey', 'timeSlice=0',
    'mode=live&scenario=demo-journey', 'mode=live&timeSlice=0',
    'mode=demo&scenario=', 'mode=demo&scenario=../../private', 'mode=demo&scenario=demo-unknown',
    ...['', '-1', '+1', '01', '1.0', '1e0', 'NaN', 'Infinity', '6', '999999999999', ' 1', '1 ']
      .map((slice) => `mode=demo&timeSlice=${encodeURIComponent(slice)}`),
    'mode=demo&scenario=demo-focus&timeSlice=1', 'mode=demo&scenario=demo-quality&timeSlice=3',
    'mode=demo&mode=demo', 'mode=demo&scenario=demo-focus&scenario=demo-focus',
    'mode=demo&timeSlice=0&timeSlice=0', 'mode=demo&extra=private',
  ]
  for (const query of invalid) {
    const response = request(routes, query)
    assert.deepEqual(response.body, { error: 'INVALID_PARAMETERS' }, query)
    assert.equal(response.status, 400, query)
  }
  assert.equal(request(routes, 'mode=demo', { path: '/command-view/scenarios' }).status, 400)
})

test('all non-GET methods reject; wall scope rejects even if disabled; authenticated LAN is readable', () => {
  for (const enabled of [true, false]) {
    const routes = createCommandViewRoutes({ enabled })
    assert.equal(request(routes, '', { wallScope: true }).status, 403)
    assert.equal(request(routes, '', { path: '/command-view/scenarios', wallScope: true }).status, 403)
  }
  const routes = createCommandViewRoutes({ enabled: true })
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.equal(request(routes, '', { method }).status, 405)
  }
  assert.equal(request(routes, 'mode=demo', { lanUser: true }).status, 200)
})

test('120 per minute is shared across endpoints; invalid inputs also consume quota', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  for (let i = 0; i < 120; i++) {
    const response = i % 2 ? request(routes, 'extra=x') : request(routes, '', { path: '/command-view/scenarios' })
    assert.equal(response.status, i % 2 ? 400 : 200)
  }
  assert.equal(request(routes).status, 429)
  assert.equal(request(routes, '', { path: '/command-view/scenarios', now: 60999 }).status, 429)
  assert.equal(request(routes, '', { now: 61000 }).status, 200)
})

test('backward time cannot bypass the quota; unknown time fails closed', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  for (let i = 0; i < 120; i++) assert.equal(request(routes, '', { now: 100000 }).status, 200)
  assert.equal(request(routes, '', { now: 0 }).status, 429)
  for (const now of [undefined, NaN, Infinity, -1]) assert.equal(request(routes, '', { now }).status, 500)
})

test('C2 failures and thrown errors never expose the unvalidated body or exception', () => {
  const cases = [
    { buildDemo: () => ({ private: 'do not expose' }) },
    { validate: () => ({ ok: false, errors: [{ path: 'private', code: 'private' }] }) },
    { buildDemo: () => { throw new Error('private path and stack') } },
    { validate: () => { throw new Error('private path and stack') } },
    { loadDefault: () => ({ ...empty, extra: 'private' }) },
    { loadDefault: () => { throw new Error('private') } },
    { listScenarios: () => [{ id: 'demo-unsafe', name: 'private', timeSlices: 1, synthetic: false }] },
    { listScenarios: () => { throw new Error('private') } },
  ]
  for (const dependencies of cases) {
    const routes = createCommandViewRoutes({ enabled: true, ...dependencies })
    const response = request(routes, dependencies.loadDefault ? '' : 'mode=demo')
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { error: 'COMMAND_VIEW_UNAVAILABLE' })
  }
})

test('all responses use no-store JSON and contain no real identifiers, paths or stack', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  for (const query of ['', 'mode=demo', 'mode=demo&scenario=../../private']) {
    const response = request(routes, query)
    assert.deepEqual(response.headers, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    const walk = (value) => {
      if (typeof value === 'string') {
        assert.equal(realIdentifier.test(value), false)
        assert.equal(sensitiveValue.test(value), false)
        assert.doesNotMatch(value, /private|stack|Error:/)
      } else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(response.body)
  }
})

test('responses are isolated copies and disabled instances have no shared rate state', () => {
  const routes = createCommandViewRoutes({ enabled: true })
  const response = request(routes, '', { path: '/command-view/scenarios' })
  response.body[0].id = 'demo-changed'
  assert.equal(request(routes, '', { path: '/command-view/scenarios' }).body[0].id, 'demo-journey')
  const other = createCommandViewRoutes({ enabled: true })
  for (let i = 0; i < 120; i++) request(routes)
  assert.equal(request(other).status, 200)
})

test('new handler has no I/O, timers or state; server hook is after auth and before write routes', () => {
  const source = fs.readFileSync(new URL('../command-view-routes.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\b|node:|child_process|\beval\s*\(|innerHTML|Date\.now|Math\.random|setTimeout|setInterval|\bstate\s*\(/)
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(server, /API_PATHS\.add\('\/command-view'\)/)
  assert.match(server, /API_PATHS\.add\('\/command-view\/scenarios'\)/)
  assert.equal((server.match(/readFileSync\(path\.join\(HERE, 'command-view\.json'\)/g) || []).length, 1)
  assert.match(server, /const commandViewRoutes = COMMAND_VIEW_ENABLED \? createCommandViewRoutes\(\{ enabled: true \}\) : null/)
  const start = server.indexOf("if (url.pathname === '/command-view' ||")
  const end = server.indexOf("if (url.pathname.startsWith('/town/home/'))", start)
  assert.ok(start > server.indexOf('if (wallScope &&'))
  assert.ok(start > server.indexOf('if (!hostOk(req.headers.host))'))
  assert.ok(end > start)
  assert.doesNotMatch(server.slice(start, end), /\bget\s*\(|\bstate\s*\(|\bfetch\b|readFile|writeFile/)
})
