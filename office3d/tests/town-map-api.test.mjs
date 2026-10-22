import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadTownMap } from '../town-map.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const officeJson = path.join(root, 'town-map.json')
const sourceJson = path.resolve(root, '..', 'town-map-data', 'm0', 'derived', 'town-map-v0.json')
const serverPath = path.join(root, 'server.mjs')
const backupServerPath = path.resolve(root, '..', 'office3d-backup-m1b', 'server.mjs')
const townMapPath = path.join(root, 'town-map.mjs')
const FIXED_UNAVAILABLE_BODY = JSON.stringify({ error: '地图数据暂不可用' })
const UNSAFE_ERROR_RE = /(ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|[A-Za-z]:\\|\\\\)/i

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'town-map-api-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

function writeJson(t, data, name = 'town-map.json') {
  const dir = tempDir(t)
  const file = path.join(dir, name)
  fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data))
  return file
}

function sampleData() {
  return {
    attribution: '© OpenStreetMap contributors，ODbL 1.0',
    source: 'snapshot 2026-10-20',
    uiAttributionRequired: true,
    formatVersion: 1,
    coordinateSystem: { projection: 'local equirectangular', origin: { lat: 11.57, lon: 104.905 }, unit: 'meter', canvasUnitMeters: 10 },
    tolerancesMeters: { khans: 18, roads: 25, water: 20 },
    layers: {
      khans: [{ id: 'khan-a', name: 'Alpha', nameKm: 'អាល់ហ្វា', center: [10, 20], rings: [[[0, 0], [20, 0], [20, 20], [0, 0]]] }],
      roads: [{ id: 'road-a', name: 'North Road', line: [[0, 0], [30, 40]] }],
      water: [{ id: 'water-a', label: 'Lake', lines: [[[5, 5], [8, 8]]] }],
      landmarks: [{ id: 'landmark-a', name: 'Tower', label: 'View', point: [12, 18] }],
    },
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function parseSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]\\)`))
  return new Set((match?.[1] || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/^['"]|['"]$/g, '')))
}

function staticRel(pathname) {
  if (pathname === '/') return '/index.html'
  if (pathname === '/wall') return '/wall.html'
  if (pathname === '/town') return '/town.html'
  return pathname
}

function simulateRequest({ lanUser = false, lanAuthed = true, wallAuthed = false, method = 'GET', pathname = '/town/map' } = {}) {
  const server = fs.readFileSync(serverPath, 'utf8')
  const apiPaths = parseSet(server, 'API_PATHS')
  const staticExt = parseSet(server, 'STATIC_EXT')
  let wallScope = false
  if (lanUser && !lanAuthed) {
    if (wallAuthed) wallScope = true
    else return 401
  }
  if (wallScope && (method !== 'GET' || (apiPaths.has(pathname) && !['/state', '/wall/data'].includes(pathname)))) return 403
  if ((method === 'GET' || method === 'HEAD') && pathname === '/town/map') return 200
  if (method !== 'GET') return 405
  const rel = staticRel(pathname)
  return staticExt.has(path.extname(rel).toLowerCase()) ? 200 : 404
}

function loadWithLogs(file) {
  const logs = []
  const loaded = loadTownMap({ file, log: (line) => logs.push(String(line)) })
  return { loaded, logs }
}

test('load and validate town map file without leaking file paths', (t) => {
  const ok = loadTownMap({ file: writeJson(t, sampleData()) })
  assert.equal(ok.ready(), true)
  assert.equal(ok.handle().status, 200)

  const missing = path.join(tempDir(t), 'missing.json')
  const unreadable = tempDir(t)
  const huge = sampleData()
  huge.layers.landmarks[0].label = 'x'.repeat(401 * 1024)
  const cases = [
    { file: missing, reason: '文件不存在' },
    { file: unreadable, reason: '文件不可读' },
    { file: writeJson(t, '{bad'), reason: 'JSON 无效' },
    { file: writeJson(t, { ...sampleData(), layers: { ...sampleData().layers, water: null } }), reason: '校验失败' },
    { file: writeJson(t, huge), reason: '校验失败' },
  ]

  for (const bad of cases) {
    const { loaded, logs } = loadWithLogs(bad.file)
    const res = loaded.handle()
    const head = loaded.handle({ method: 'HEAD' })
    assert.equal(loaded.ready(), false)
    assert.equal(res.status, 503)
    assert.equal(res.body, FIXED_UNAVAILABLE_BODY)
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(head.status, 503)
    assert.equal(head.body, '')
    assert.equal(logs.length, 1)
    assert.match(logs[0], new RegExp(`^\\[town-map\\] 加载失败：${bad.reason}$`))
    assert.doesNotMatch(res.body, UNSAFE_ERROR_RE)
    assert.doesNotMatch(logs[0], UNSAFE_ERROR_RE)
  }
})

test('sanitization trims text fields only and keeps ids, coordinates and array lengths untouched', (t) => {
  const raw = sampleData()
  raw.layers.khans[0].name = `A\u0000lpha${'x'.repeat(200)}`
  raw.layers.roads[0].name = 7
  raw.layers.landmarks[0].label = `\u2028View\u2029${'y'.repeat(200)}`
  const loaded = loadTownMap({ file: writeJson(t, raw) })
  const view = loaded.view()
  assert.equal(view.layers.khans[0].id, raw.layers.khans[0].id)
  assert.deepEqual(view.layers.khans[0].center, raw.layers.khans[0].center)
  assert.equal(view.layers.khans.length, raw.layers.khans.length)
  assert.equal(view.layers.landmarks.length, raw.layers.landmarks.length)
  assert.equal(view.layers.khans[0].name.includes('\u0000'), false)
  assert.equal(Array.from(view.layers.khans[0].name).length, 80)
  assert.equal(view.layers.roads[0].name, '')
  assert.equal(view.layers.landmarks[0].label.includes('\u2028'), false)
  assert.equal(Array.from(view.layers.landmarks[0].label).length, 80)
  assert.equal(loaded.handle().headers.ETag, loadTownMap({ file: writeJson(t, raw) }).handle().headers.ETag)
})

test('etag, cache headers and HEAD behaviour are stable and content-driven', (t) => {
  const base = sampleData()
  const file = writeJson(t, base)
  const a = loadTownMap({ file })
  const get = a.handle({ method: 'GET' })
  const head = a.handle({ method: 'HEAD' })
  const notModified = a.handle({ method: 'GET', ifNoneMatch: get.headers.ETag })
  const changedFile = writeJson(t, { ...base, layers: { ...base.layers, landmarks: [{ ...base.layers.landmarks[0], name: 'Changed' }] } }, 'town-map-2.json')
  const b = loadTownMap({ file: changedFile })

  assert.equal(get.headers['Cache-Control'], 'private, max-age=300')
  assert.equal(get.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(get.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
  assert.equal(Number(head.headers['Content-Length']), Buffer.byteLength(get.body))
  assert.equal(notModified.status, 304)
  assert.equal(notModified.body, '')
  assert.notEqual(get.headers.ETag, b.handle().headers.ETag)
})

test('permission simulation keeps town map read-only and town route aligned with home route', () => {
  assert.equal(simulateRequest({ method: 'GET', pathname: '/town/map' }), 200)
  assert.equal(simulateRequest({ lanUser: true, lanAuthed: true, method: 'GET', pathname: '/town/map' }), 200)
  assert.equal(simulateRequest({ lanUser: true, lanAuthed: false, wallAuthed: true, method: 'GET', pathname: '/town/map' }), 403)
  assert.equal(simulateRequest({ lanUser: true, lanAuthed: false, wallAuthed: false, method: 'GET', pathname: '/town/map' }), 401)
  assert.equal(simulateRequest({ method: 'POST', pathname: '/town/map' }), 405)
  assert.equal(simulateRequest({ method: 'GET', pathname: '/' }), 200)
  assert.equal(simulateRequest({ method: 'GET', pathname: '/town' }), 200)
  assert.equal(simulateRequest({ lanUser: true, lanAuthed: false, wallAuthed: true, method: 'GET', pathname: '/town' }), 200)
})

test('town-map.json stays byte-identical to the reviewed source snapshot when source exists', (t) => {
  if (!fs.existsSync(sourceJson)) return t.skip('source snapshot not present')
  assert.equal(fs.existsSync(officeJson), true)
  assert.equal(sha256(officeJson), sha256(sourceJson))
})

test('server wiring adds town api after access control without changing static whitelist', () => {
  const server = fs.readFileSync(serverPath, 'utf8')
  const backup = fs.readFileSync(backupServerPath, 'utf8')
  const apiPaths = parseSet(server, 'API_PATHS')
  const staticExt = parseSet(server, 'STATIC_EXT')
  const backupStaticExt = parseSet(backup, 'STATIC_EXT')
  const gate = server.indexOf('if (wallScope &&')
  const route = server.indexOf("url.pathname === '/town/map'")
  const fallback = server.indexOf('if (!staticOk')

  assert.match(server, /import \{ loadTownMap \} from '\.\/town-map\.mjs'/)
  assert.match(server, /if \(rel === '\/town'\) rel = '\/town\.html'/)
  assert.ok(apiPaths.has('/town/map'))
  assert.ok(gate < route && route < fallback)
  assert.match(server, /if \(req\.method !== 'GET' && !\(req\.method === 'HEAD' && url\.pathname === '\/town\/map'\)\)/)
  assert.deepEqual([...staticExt], [...backupStaticExt])
  assert.equal(staticExt.has('.json'), false)
  assert.equal(simulateRequest({ method: 'GET', pathname: '/town-map.json' }), 404)
})

test('town-map module stays offline and only reads the local copy', () => {
  const source = fs.readFileSync(townMapPath, 'utf8')
  for (const bad of [/\beval\s*\(/, /new Function/, /child_process/, /\bfetch\s*\(/, /\bhttps?:\/\//, /\bWebSocket\b/, /osm-raw/, /town-map-data/i]) {
    assert.doesNotMatch(source, bad)
  }
  assert.match(source, /town-map\.json/)
})
