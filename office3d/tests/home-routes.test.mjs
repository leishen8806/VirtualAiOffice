import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createHomeRoutes } from '../town/home-routes.mjs'

const token = 't'.repeat(64)
const base = {
  method: 'GET',
  path: '/town/home/layout',
  remoteAddress: '127.0.0.1',
  host: 'office.localhost:3200',
  origin: 'http://office.localhost:3200',
  isLoopback: (value) => value === '127.0.0.1',
  hostOk: (value) => value === 'office.localhost:3200',
  originOk: (value) => value === 'http://office.localhost:3200',
  now: () => 1000,
}

function fixture(options = {}) {
  const calls = []
  const store = {
    load: () => ({ layout: { revision: 0, placements: [] }, inventory: [], status: 'new' }),
    save: async (_owner, body) => { calls.push(['save', body]); return { ok: true, layout: { revision: 1, placements: body.placements } } },
    reset: async (_owner, body) => { calls.push(['reset', body]); return { ok: true, layout: { revision: 1, placements: [] } } },
  }
  return { routes: createHomeRoutes({ enabled: true, ownerId: 'board', token, store, ...options }), calls }
}

test('missing, corrupt and non-boolean switches stay closed', async () => {
  const store = { load() {}, save() {}, reset() {} }
  assert.throws(() => createHomeRoutes({ enabled: true, ownerId: '../board', token, store }), /invalid_owner_id/)
  for (const enabled of [false, undefined, 1, 'true']) {
    const routes = createHomeRoutes({ enabled, ownerId: 'board', token, store })
    assert.equal((await routes.handle({ ...base, path: '/town/home/session' })).status, 404)
  }
})

test('session and layout are local and same-origin only', async () => {
  const { routes } = fixture()
  const session = await routes.handle({ ...base, path: '/town/home/session' })
  assert.deepEqual(session.body, { token, ownerId: 'board' })
  assert.equal((await routes.handle({ ...base, remoteAddress: '192.168.1.8', path: '/town/home/layout' })).status, 403)
  assert.equal((await routes.handle({ ...base, origin: 'http://evil.test', path: '/town/home/layout' })).status, 403)
  assert.equal((await routes.handle({ ...base, wallScope: true, path: '/town/home/layout' })).status, 403)
})

test('writes enforce token, content type, body size and owner-safe response', async () => {
  const { routes } = fixture()
  const request = { ...base, method: 'POST', path: '/town/home/save', rawBody: JSON.stringify({ placements: [], expectedRevision: 0 }), contentType: 'application/json' }
  assert.equal((await routes.handle(request)).status, 403)
  assert.equal((await routes.handle({ ...request, homeToken: 'wrong' })).status, 403)
  const wrong = await routes.handle({ ...request, homeToken: token, contentType: 'text/plain' })
  assert.equal(wrong.status, 415)
  const large = await routes.handle({ ...request, homeToken: token, bodyTooLarge: true })
  assert.equal(large.status, 413)
  assert.equal(JSON.stringify(large.body).includes(token), false)
})

test('save/reset map store outcomes to stable JSON statuses', async () => {
  const { routes, calls } = fixture()
  const request = { ...base, method: 'POST', path: '/town/home/save', homeToken: token, contentType: 'application/json', rawBody: '{}' }
  const conflict = fixture({ store: { load() {}, save: async () => ({ code: 'revision_conflict', layout: { revision: 2 } }), reset() {} } })
  assert.equal((await conflict.routes.handle(request)).status, 409)
  const invalid = fixture({ store: { load() {}, save: async () => ({ code: 'invalid_layout', violations: [{ rule: 2 }] }), reset() {} } })
  assert.equal((await invalid.routes.handle(request)).status, 422)
  assert.equal((await routes.handle({ ...request, path: '/town/home/reset', rawBody: JSON.stringify({ expectedRevision: 0 }) })).status, 200)
  assert.deepEqual(calls[0], ['reset', { expectedRevision: 0 }])
})

test('write limiter returns 429 after 60 accepted writes', async () => {
  let now = 1000
  const { routes } = fixture()
  const request = { ...base, method: 'POST', path: '/town/home/reset', homeToken: token, contentType: 'application/json', rawBody: '{}' , now: () => now }
  for (let i = 0; i < 60; i++) assert.equal((await routes.handle(request)).status, 200)
  assert.equal((await routes.handle(request)).status, 429)
  now += 60001
  assert.equal((await routes.handle(request)).status, 200)
})

test('route source has no forbidden APIs, commerce words or token persistence', () => {
  const source = fs.readFileSync(new URL('../town/home-routes.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:child_process|eval|innerHTML|fetch|buy|purchase|price|balance|wallet)\b/i)
  assert.doesNotMatch(source, /writeFileSync|appendFileSync|createWriteStream/)
  assert.equal(crypto.createHash('sha256').update(source).digest('hex').length, 64)
})
