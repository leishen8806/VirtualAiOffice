import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { conflictStrategy, networkState, ruleMessage, statusState, violationMessages } from '../home-persist-logic.mjs'
import { createHomePersistence } from '../home-persist.js'

test('maps all persistence statuses without exposing server bodies', () => {
  for (const status of [200, 403, 404, 409, 413, 415, 422, 429, 500]) {
    const state = statusState(status)
    assert.ok(state.kind)
    assert.equal(JSON.stringify(state).includes('secret'), false)
  }
  assert.equal(statusState(404).kind, 'offline')
  assert.equal(statusState(403, 'session').message, '仅本机可保存')
  assert.equal(statusState(409).kind, 'conflict')
  assert.equal(statusState(422).kind, 'invalid')
  assert.equal(networkState().retryable, true)
})

test('conflict strategy covers server and overwrite branches', () => {
  assert.deepEqual(conflictStrategy('server'), { action: 'use-server', retry: false })
  assert.deepEqual(conflictStrategy('overwrite'), { action: 'overwrite', retry: true })
  assert.deepEqual(conflictStrategy('cancel'), { action: 'keep-local', retry: false })
})

test('all seven placement rules map to Chinese messages', () => {
  assert.equal(violationMessages([1, 2, 3, 4, 5, 6, 7]).length, 7)
  for (let rule = 1; rule <= 7; rule++) assert.ok(ruleMessage(rule).length > 0)
})

test('adapter uses same-origin requests and keeps token in memory only', async () => {
  const calls = []
  const fakeFetch = async (path, init = {}) => {
    calls.push({ path, init })
    if (path.endsWith('/session')) return new Response(JSON.stringify({ token: 'secret-token', ownerId: 'board' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (path.endsWith('/layout')) return new Response(JSON.stringify({ layout: { revision: 2, placements: [] }, inventory: [], status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ layout: { revision: 3, placements: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const persistence = createHomePersistence({ fetchImpl: fakeFetch })
  const connected = await persistence.connect()
  assert.equal(connected.mode, 'online')
  assert.equal(connected.token, undefined)
  const saved = await persistence.save({ placements: [] })
  assert.equal(saved.ok, true)
  assert.deepEqual(calls.map((call) => call.path), ['/town/home/session', '/town/home/layout', '/town/home/save'])
  assert.equal(calls[2].init.method, 'POST')
  assert.equal(calls[2].init.headers['Content-Type'], 'application/json')
  assert.equal(calls[2].init.headers['X-Home-Token'], 'secret-token')
  assert.equal(Object.getOwnPropertyNames(globalThis).some((key) =>
    /storage|cookie/i.test(key) && typeof globalThis[key] === 'string' && globalThis[key].includes('secret-token')
  ), false)
})

test('404 and 403 session responses degrade to offline mode', async () => {
  for (const status of [404, 403]) {
    const persistence = createHomePersistence({ fetchImpl: async () => new Response('{}', { status }) })
    const result = await persistence.connect()
    assert.equal(result.mode, 'offline')
    assert.equal(result.message.includes('secret'), false)
    const saved = await persistence.save({ placements: [] })
    assert.equal(saved.offline, true)
  }
})

test('422 keeps local layout and returns rule messages', async () => {
  const persistence = createHomePersistence({
    fetchImpl: async (path) => {
      if (path.endsWith('/session')) return new Response(JSON.stringify({ token: 'x', ownerId: 'board' }), { status: 200 })
      if (path.endsWith('/layout')) return new Response(JSON.stringify({ layout: { revision: 1, placements: [] }, inventory: [] }), { status: 200 })
      return new Response(JSON.stringify({ violations: [{ rule: 5 }] }), { status: 422 })
    },
  })
  await persistence.connect()
  const result = await persistence.save({ placements: [{ itemId: 'chair_wood' }] })
  assert.equal(result.ok, false)
  assert.match(result.message, /入口/)
})

test('source stays offline-safe and avoids storage, URL, logging and commerce terms', () => {
  const source = fs.readFileSync(new URL('../home-persist.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|console\.log|location\.search|buy|purchase|price|balance|wallet/i)
  assert.doesNotMatch(source, /innerHTML|eval\s*\(|new Function/i)
  assert.doesNotMatch(source, /https?:\/\//i)
})

function conflictFixture(choice, retryStatus = 200) {
  const local = { revision: 4, placements: [{ itemId: 'chair_wood', cx: 1 }] }
  const server = { revision: 5, placements: [{ itemId: 'plant_pot', cx: 2 }] }
  const writes = []
  const persistence = createHomePersistence({
    onConflict: () => choice,
    fetchImpl: async (path, init = {}) => {
      if (path.endsWith('/session')) return Response.json({ token: 'test-only', ownerId: 'board' })
      if (path.endsWith('/layout')) return Response.json({ layout: local, inventory: [] })
      writes.push(JSON.parse(init.body))
      if (writes.length === 1) return Response.json({ layout: server }, { status: 409 })
      return Response.json({ layout: { ...local, revision: 6 } }, { status: retryStatus })
    },
  })
  return { persistence, local, server, writes }
}

test('409 overwrite saves local placements with latest revision and accurate status', async () => {
  const { persistence, local, writes } = conflictFixture('overwrite')
  await persistence.connect()
  const result = await persistence.save(local)
  assert.equal(result.ok, true)
  assert.equal(result.saved, true)
  assert.equal(result.message, '已覆盖服务器版本并保存')
  assert.deepEqual(result.layout.placements, local.placements)
  assert.equal(result.layout.revision, 6)
  assert.equal(persistence.getRevision(), 6)
  assert.deepEqual(writes.map((body) => body.expectedRevision), [4, 5])
})

test('409 use-server returns server placements without saving local changes', async () => {
  const { persistence, local, server, writes } = conflictFixture('server')
  await persistence.connect()
  const result = await persistence.save(local)
  assert.equal(result.ok, true)
  assert.equal(result.saved, false)
  assert.equal(result.message, '已改用服务器版本（你的修改未保存）')
  assert.deepEqual(result.layout, server)
  assert.equal(persistence.getRevision(), 5)
  assert.equal(writes.length, 1)
  assert.deepEqual(local.placements, [{ itemId: 'chair_wood', cx: 1 }])
})

test('unresolved conflict and failed overwrite never return saved status', async () => {
  for (const [choice, retryStatus] of [['cancel', 200], ['overwrite', 500], ['overwrite', 409]]) {
    const { persistence, local } = conflictFixture(choice, retryStatus)
    await persistence.connect()
    const result = await persistence.save(local)
    assert.equal(result.ok, false)
    assert.notEqual(result.saved, true)
    assert.doesNotMatch(result.message, /已保存|已覆盖/)
    assert.deepEqual(local.placements, [{ itemId: 'chair_wood', cx: 1 }])
  }
})

test('page presents accessible conflict choices and preserves result messages', () => {
  const source = fs.readFileSync(new URL('../home-page.js', import.meta.url), 'utf8')
  assert.match(source, /document\.createElement\('dialog'\)/)
  assert.match(source, /dialog\.showModal\(\)/)
  assert.match(source, /保留我的布置并覆盖/)
  assert.match(source, /改用服务器版本/)
  assert.match(source, /setAttribute\('aria-label', '个人空间版本冲突'\)/)
  assert.match(source, /status\.textContent = result\.message \|\| '已保存到本机'/)
  assert.doesNotMatch(source, /window\.confirm/)
})
