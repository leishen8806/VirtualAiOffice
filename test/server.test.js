import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/server.js'

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

function fakeCoord() {
  const c = new EventEmitter()
  c.posted = []
  c.snapshot = () => ({ mode: 'live', agents: {}, tasks: [], messages: [] })
  c.post = (t) => c.posted.push(t)
  c.stop = () => {}
  return c
}

async function start(t, opts) {
  const coord = fakeCoord()
  const server = createServer(coord, { publicDir, ...opts })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => {
    server.close()
    server.closeAllConnections()
  })
  const port = server.address().port
  const req = (p, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve({ status: res.statusCode, body: data, type: res.headers['content-type'], headers: res.headers }))
      })
      r.on('error', reject)
      r.end(body)
    })
  return { coord, server, port, req }
}

test('serves the page with a document shell and blocks path traversal', async (t) => {
  const { server, req } = await start(t, { host: '127.0.0.1' })
  const page = await req('/')
  assert.equal(page.status, 200)
  assert.match(page.body, /^<!doctype html>/)
  assert.match(page.body, /智序工场/)
  assert.match(page.body, /Virtual AI Office/)
  assert.match(page.body, /Helix/)
  assert.equal((await req('/app.js')).status, 200)
  assert.notEqual((await req('/../package.json')).status, 200)
  assert.notEqual((await req('/%2e%2e/package.json')).status, 200)
})

test('loopback mode rejects foreign Host headers and cross-site posts', async (t) => {
  const { coord, server, port, req } = await start(t, { host: '127.0.0.1' })
  assert.equal((await req('/api/state', { headers: { Host: 'evil.example:80' } })).status, 403)
  const json = { 'Content-Type': 'application/json' }
  const body = JSON.stringify({ text: '你好' })
  assert.equal((await req('/api/message', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })).status, 403)
  assert.equal((await req('/api/message', { method: 'POST', headers: { ...json, Origin: 'https://evil.example' }, body })).status, 403)
  const ok = await req('/api/message', { method: 'POST', headers: { ...json, Origin: `http://localhost:${port}` }, body })
  assert.equal(ok.status, 200)
  assert.deepEqual(coord.posted, ['你好'])
})

test('LAN mode requires the token', async (t) => {
  const { server, req } = await start(t, { host: '0.0.0.0', token: 'secret' })
  assert.equal((await req('/api/state')).status, 401)
  assert.equal((await req('/api/state?token=secret')).status, 401)
  assert.equal((await req('/api/state', { headers: { 'X-Niuma-Token': 'secret' } })).status, 200)
  assert.equal((await req('/')).status, 200)
})

function streamReq(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      let data = ''
      const done = () => {
        res.destroy()
        resolve({ status: res.statusCode, headers: res.headers, body: data })
      }
      res.on('data', (c) => {
        data += c
        if (data.includes('data: ')) done()
      })
      res.on('end', done)
    })
    r.on('error', reject)
    r.end()
  })
}

test('malformed request paths return an error without killing loopback or LAN servers', async (t) => {
  for (const host of ['127.0.0.1', '0.0.0.0']) {
    const { req } = await start(t, { host, ...(host === '0.0.0.0' ? { token: 'secret' } : {}) })
    for (const p of ['//', '//?x=1', '///a', '/%']) {
      assert.ok([400, 404].includes((await req(p)).status), `${host} ${p}`)
    }
    assert.equal((await req('/')).status, 200)
  }
})

test('unexpected handler errors become 500 responses and the server stays alive', async (t) => {
  const coord = fakeCoord()
  coord.snapshot = () => { throw new Error('SECRET STACK SHOULD NOT LEAK') }
  const server = createServer(coord, { publicDir, host: '127.0.0.1' })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => { server.close(); server.closeAllConnections() })
  const port = server.address().port
  const req = (p) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, headers: { Host: `localhost:${port}` } }, (res) => {
      let body = ''; res.on('data', (c) => { body += c }); res.on('end', () => resolve({ status: res.statusCode, body }))
    }); r.on('error', reject); r.end()
  })
  const failed = await req('/api/state')
  assert.equal(failed.status, 500)
  assert.doesNotMatch(failed.body, /SECRET STACK|Error:|at /)
  assert.equal((await req('/')).status, 200)
})

test('LAN mode without a non-empty token fails closed at construction', () => {
  const coord = fakeCoord()
  assert.throws(() => createServer(coord, { publicDir, host: '0.0.0.0' }), /token/i)
  assert.throws(() => createServer(coord, { publicDir, host: '0.0.0.0', token: '' }), /token/i)
  assert.doesNotThrow(() => createServer(coord, { publicDir, host: '127.0.0.1' }))
})

test('LAN authentication accepts header or session cookie, never query tokens', async (t) => {
  const { port, req } = await start(t, { host: '0.0.0.0', token: 'secret' })
  for (const p of ['/api/state', '/events']) assert.equal((await req(p)).status, 401)
  for (const p of ['/api/state?token=secret', '/events?token=secret']) assert.equal((await req(p)).status, 401)
  assert.equal((await req('/api/state', { headers: { 'X-Niuma-Token': 'secret' } })).status, 200)
  assert.equal((await req('/api/state', { headers: { 'X-Niuma-Token': 'wrong' } })).status, 401)
  assert.equal((await req('/api/state', { headers: { 'X-Niuma-Token': 'a' } })).status, 401)
  assert.equal((await req('/api/state', { headers: { 'X-Niuma-Token': 'x'.repeat(1000) } })).status, 401)
  const guide = await req('/?token=secret')
  assert.equal(guide.status, 302)
  assert.equal(guide.headers?.location, '/')
  const cookie = guide.headers?.['set-cookie']?.[0] || ''
  assert.match(cookie, /vao_sid=/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.doesNotMatch(guide.body, /secret/)
  assert.equal((await req('/api/state', { headers: { Cookie: cookie.split(';')[0] } })).status, 200)
  assert.equal((await streamReq(port, '/events', { Cookie: cookie.split(';')[0] })).status, 200)
  assert.equal((await req('/api/state', { headers: { Cookie: 'vao_sid=fake' } })).status, 401)
  const wrong = await req('/?token=wrong')
  assert.equal(wrong.status, 200)
  assert.equal(wrong.headers?.['set-cookie'], undefined)
})

test('sessions expire by idle and absolute age while successful use refreshes idle age', async (t) => {
  let now = 0
  const { req } = await start(t, { host: '0.0.0.0', token: 'secret', now: () => now, sessionIdleMs: 100, sessionMaxAgeMs: 500 })
  const cookie = (await req('/?token=secret')).headers['set-cookie'][0].split(';')[0]
  now = 99
  assert.equal((await req('/api/state', { headers: { Cookie: cookie } })).status, 200)
  now = 198
  assert.equal((await req('/api/state', { headers: { Cookie: cookie } })).status, 200)
  now = 297
  assert.equal((await req('/api/state', { headers: { Cookie: cookie } })).status, 200)
  now = 501
  assert.equal((await req('/api/state', { headers: { Cookie: cookie } })).status, 401)
})

test('session limits evict the least recently seen session and clean expired entries', async (t) => {
  let now = 0
  const { req } = await start(t, { host: '0.0.0.0', token: 'secret', now: () => now, maxSessions: 3, sessionIdleMs: 100, sessionMaxAgeMs: 1000 })
  const getCookie = async () => (await req('/?token=secret')).headers['set-cookie'][0].split(';')[0]
  const first = await getCookie(); now += 1
  const second = await getCookie(); now += 1
  const third = await getCookie(); now += 1
  assert.equal((await req('/api/state', { headers: { Cookie: first } })).status, 200)
  now += 1
  assert.equal((await req('/api/state', { headers: { Cookie: second } })).status, 200)
  now += 1
  const fourth = await getCookie()
  assert.equal((await req('/api/state', { headers: { Cookie: third } })).status, 401)
  assert.equal((await req('/api/state', { headers: { Cookie: second } })).status, 200)
  assert.equal((await req('/api/state', { headers: { Cookie: fourth } })).status, 200)
  now += 101
  const fifth = await getCookie()
  assert.equal((await req('/api/state', { headers: { Cookie: fifth } })).status, 200)
})

test('session cookies declare the absolute lifetime', async (t) => {
  const { req } = await start(t, { host: '0.0.0.0', token: 'secret', sessionMaxAgeMs: 7_200_000 })
  const cookie = (await req('/?token=secret')).headers['set-cookie'][0]
  assert.match(cookie, /Max-Age=7200/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Path=\//)
})

test('loopback explicit tokens are enforced, while tokenless loopback remains open', async (t) => {
  const open = await start(t, { host: '127.0.0.1' })
  assert.equal((await open.req('/api/state')).status, 200)
  const secured = await start(t, { host: '127.0.0.1', token: 'secret' })
  assert.equal((await secured.req('/api/state')).status, 401)
  assert.equal((await secured.req('/api/state', { headers: { 'X-Niuma-Token': 'secret' } })).status, 200)
  const guide = await secured.req('/?token=secret')
  assert.equal(guide.status, 302)
  assert.match(guide.headers['set-cookie'][0], /Max-Age=/)
})

test('cookie-authenticated POST keeps the existing CSRF checks', async (t) => {
  const { port, req } = await start(t, { host: '0.0.0.0', token: 'secret' })
  const guide = await req('/?token=secret')
  const cookie = guide.headers['set-cookie'][0].split(';')[0]
  const body = JSON.stringify({ text: 'hello' })
  const post = (headers) => req('/api/message', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body })
  assert.equal((await post({})).status, 200)
  assert.equal((await post({ Origin: 'https://evil.example' })).status, 403)
  assert.equal((await req('/api/message', { method: 'POST', headers: { Cookie: cookie, Origin: `http://localhost:${port}`, 'Content-Type': 'text/plain' }, body })).status, 403)
  assert.equal((await post({ Origin: `http://localhost:${port}` })).status, 200)
})

test('all responses carry the baseline security headers', async (t) => {
  const { req } = await start(t, { host: '127.0.0.1' })
  for (const result of [await req('/'), await req('/api/state'), await req('/missing')]) {
    assert.equal(result.headers['x-content-type-options'], 'nosniff')
    assert.equal(result.headers['referrer-policy'], 'no-referrer')
    assert.equal(result.headers['x-frame-options'], 'DENY')
  }
})

test('the 接入员工 routes call the setup actions and report failures as ok:false', async (t) => {
  const calls = []
  const setup = {
    status: async () => ({ groups: [], presets: [] }),
    saveApi: async (b) => (calls.push(['api', b.preset]), { ok: true, id: b.preset }),
    install: async (tool) => {
      throw new Error(`装不了 ${tool}`)
    },
    testApi: async (a) => (calls.push(['test', a.baseUrl]), { ok: true }),
    testCli: async (tool) => (calls.push(['cli', tool]), { ok: true }),
  }
  const { port, req } = await start(t, { host: '127.0.0.1', setup })
  const post = (p, body, headers = {}) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}`, ...headers }, body: JSON.stringify(body) })
  assert.deepEqual(JSON.parse((await req('/api/setup')).body), { groups: [], presets: [] })
  assert.deepEqual(JSON.parse((await post('/api/setup/api', { preset: 'deepseek' })).body), { ok: true, id: 'deepseek' })
  assert.deepEqual(JSON.parse((await post('/api/setup/install', { tool: 'codex' })).body), { ok: false, error: '装不了 codex' })
  await post('/api/setup/test', { api: { baseUrl: 'http://x/v1' } })
  await post('/api/setup/test', { tool: 'claude' })
  assert.deepEqual(calls, [['api', 'deepseek'], ['test', 'http://x/v1'], ['cli', 'claude']])
  assert.equal((await post('/api/setup/nope', {})).status, 404)
  assert.equal((await post('/api/setup/api', { preset: 'x' }, { Origin: 'https://evil.example' })).status, 403)
})

test('skin routes: anyone with the page can list, saving goes through the skin store', async (t) => {
  const calls = []
  const skins = {
    listSkins: () => ({ dir: '/x', skins: [{ id: 'a', name: 'A' }], errors: [] }),
    saveSkin: (skin, o) => (calls.push(['save', skin.name, o.replace]), { id: 'a', name: skin.name }),
    deleteSkin: (id) => {
      throw new Error(`找不到 ${id}`)
    },
    openSkinsFolder: () => (calls.push(['open']), { ok: true }),
  }
  const { port, req } = await start(t, { host: '127.0.0.1', skins })
  const post = (p, body) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}` }, body: JSON.stringify(body) })
  assert.deepEqual(JSON.parse((await req('/api/skins')).body).skins, [{ id: 'a', name: 'A' }])
  assert.deepEqual(JSON.parse((await post('/api/skins/save', { skin: { name: '海边' }, replace: true })).body), { ok: true, skin: { id: 'a', name: '海边' } })
  assert.deepEqual(JSON.parse((await post('/api/skins/delete', { id: 'b' })).body), { ok: false, error: '找不到 b' })
  await post('/api/skins/open-folder', {})
  assert.deepEqual(calls, [['save', '海边', true], ['open']])
  // 带图片的皮肤比普通请求大
  const big = await post('/api/skins/save', { skin: { name: 'x'.repeat(10), pad: 'a'.repeat(1_000_000) } })
  assert.equal(JSON.parse(big.body).ok, true)
})
