import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import mapData from '../town-map-data.js'
import { DEFAULT_LABEL_MODE, KHAN_NAME_MAP, LANDMARK_NAME_MAP } from '../town-names.js'
import {
  HIDDEN_LANDMARKS,
  LANDMARK_TYPE_TEXT,
  collectLabelCandidates,
  displayNameLines,
  drawPlaceBadge,
  fitView,
  hitTest,
  khanNameMeta,
  landmarkNameMeta,
  loadMapWithFallback,
  mapBounds,
  nextLabelFrame,
  placeMarkerMetrics,
  resolveLabelPlacement,
  schedulePlaceTransitionFallback,
  typeText,
  worldToScreen,
} from '../town-map-core.js'

const root = path.resolve(import.meta.dirname, '..')
const OFFICE = { id: 'office-fictional', label: '智序工场', point: [2614, -1468] }
const PLACES = [
  { id: 'office-zixu-workshop', name: '智序工场·办公室', point: [2923, -1808] },
  { id: 'dr-logistics-campus', name: 'DR 仓配服务中心', point: [7364, -4012] },
]

function overlap(a, b, gap = 4) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

function measureText(text, kind, index) {
  const factor = kind === 'khan' ? (index === 0 ? 7.6 : 6.8) : kind === 'office' ? 7.2 : (index === 0 ? 6.8 : 6.2)
  return Math.max(12, Array.from(text).length * factor)
}

test('name tables cover all 14 khans and keep plain text values', () => {
  const khanNames = mapData.layers.khans.map((item) => item.name)
  assert.equal(new Set(Object.keys(KHAN_NAME_MAP)).size, 14)
  assert.deepEqual([...Object.keys(KHAN_NAME_MAP)].sort(), [...khanNames].sort())
  assert.equal(new Set(Object.keys(LANDMARK_NAME_MAP)).size, Object.keys(LANDMARK_NAME_MAP).length)
  for (const [key, value] of Object.entries(KHAN_NAME_MAP)) {
    assert.equal(khanNames.includes(key), true)
    assert.ok(value.en && !value.en.startsWith('Khan '))
    assert.doesNotMatch(value.zh, /[<>\u0000-\u001f\u007f]/)
    assert.doesNotMatch(value.en, /[<>\u0000-\u001f\u007f]/)
  }
  const landmarkNames = new Set(mapData.layers.landmarks.map((item) => item.name))
  const hits = Object.keys(LANDMARK_NAME_MAP).filter((name) => landmarkNames.has(name))
  assert.equal(hits.length, Object.keys(LANDMARK_NAME_MAP).length)
  for (const value of Object.values(LANDMARK_NAME_MAP)) assert.doesNotMatch(value, /[<>\u0000-\u001f\u007f]/)

  const fallbackLines = displayNameLines(landmarkNameMeta(mapData.layers.landmarks.find((item) => item.name === 'Baby Mckie Shop')), DEFAULT_LABEL_MODE)
  assert.deepEqual(fallbackLines, ['Baby Mckie Shop'])
  const khanLines = displayNameLines(khanNameMeta(mapData.layers.khans.find((item) => item.name === 'Khan Daun Penh')), 'zh')
  assert.deepEqual(khanLines, ['隆边区', '(Daun Penh)'])
})

test('loadMapWithFallback uses api first and falls back to local backup safely', async () => {
  const apiData = structuredClone(mapData)
  let requestPath = ''
  const api = await loadMapWithFallback({
    fetchImpl: async (url) => {
      requestPath = url
      return { status: 200, async json() { return apiData } }
    },
    importImpl: async () => ({ default: null }),
  })
  assert.equal(requestPath, '/town/map')
  assert.equal(api.usedFallback, false)
  assert.equal(api.source, 'api')

  for (const response of [
    { status: 503, async json() { return apiData } },
    { status: 200, async json() { throw new Error('bad json') } },
    { status: 200, async json() { return { attribution: '© OpenStreetMap contributors, ODbL', layers: { khans: [], roads: [], water: [] } } } },
  ]) {
    const fallback = await loadMapWithFallback({
      fetchImpl: async () => response,
      importImpl: async () => ({ default: mapData }),
    })
    assert.equal(fallback.usedFallback, true)
    assert.equal(fallback.source, 'local-backup')
  }

  const networkFallback = await loadMapWithFallback({
    fetchImpl: async () => { throw new Error('network down') },
    importImpl: async () => ({ default: mapData }),
  })
  assert.equal(networkFallback.usedFallback, true)

  await assert.rejects(() => loadMapWithFallback({
    fetchImpl: async () => ({ status: 500, async json() { return null } }),
    importImpl: async () => { throw new Error('missing backup') },
  }), /地图数据未能载入/)
})

test('label tiers, priority and collision handling follow M1-C rules', () => {
  const bounds = mapBounds(mapData.layers.khans)
  const baseView = fitView(bounds, 1280, 900)
  const full = collectLabelCandidates({ data: mapData, view: baseView, width: 1280, height: 900, mode: 'zh', office: OFFICE })
  assert.equal(full.some((item) => item.kind.startsWith('landmark')), false)
  assert.equal(full.filter((item) => item.kind === 'khan').length, 14)
  const withPlaces = collectLabelCandidates({ data: mapData, view: baseView, width: 1280, height: 900, mode: 'zh', places: PLACES })
  assert.deepEqual(withPlaces.filter((item) => item.kind === 'place').map((item) => item.item.id), [
    'office-zixu-workshop',
    'dr-logistics-campus',
  ])

  const majorView = { ...baseView, scale: 1.35 }
  const major = collectLabelCandidates({ data: mapData, view: majorView, width: 1280, height: 900, mode: 'zh', office: OFFICE })
  assert.equal(major.some((item) => item.kind === 'landmark-major'), true)
  assert.equal(major.some((item) => item.kind === 'landmark-minor'), false)

  const zoomedView = { ...baseView, scale: 2.2 }
  const zoomed = collectLabelCandidates({ data: mapData, view: zoomedView, width: 1280, height: 900, mode: 'zh', office: OFFICE })
  assert.equal(zoomed.some((item) => item.kind === 'landmark-minor'), true)
  assert.equal(zoomed.some((item) => HIDDEN_LANDMARKS.includes(item.item?.name)), false)

  const sampleLayout = resolveLabelPlacement([
    { key: 'landmark:x', kind: 'landmark-major', lines: ['A'], anchor: { x: 100, y: 100 }, alpha: 1 },
    { key: 'office:x', kind: 'office', lines: ['B'], anchor: { x: 100, y: 100 }, alpha: 1 },
    { key: 'khan:x', kind: 'khan', lines: ['C'], anchor: { x: 100, y: 100 }, alpha: 1 },
  ], () => 20)
  assert.equal(sampleLayout.visible[0].key, 'khan:x')
  assert.deepEqual(sampleLayout.hidden.map((item) => item.key).sort(), ['landmark:x', 'office:x'])

  const placed = resolveLabelPlacement(zoomed, measureText).visible
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.equal(overlap(placed[i], placed[j]), false)
})

test('place badges scale, fit the full logo and keep a 32px hit radius', () => {
  const small = placeMarkerMetrics(0.35, 979, 544)
  const normal = placeMarkerMetrics(1, 979, 544)
  const large = placeMarkerMetrics(3, 979, 544)
  assert.equal(small.diameter, 28)
  assert.ok(normal.diameter >= 28 && normal.diameter <= 44)
  assert.equal(large.diameter, 44)
  assert.ok([small, normal, large].every((item) => item.hitRadius >= 32))
  assert.ok([small, normal, large].every((item) => item.logoWidth >= 22))
  assert.ok(Math.abs(large.logoWidth / large.logoHeight - 979 / 544) < 1e-9)
  assert.ok(large.logoWidth <= large.diameter * 0.8)
  assert.ok(large.logoHeight <= large.diameter * 0.55)

  const data = structuredClone(mapData)
  data.layers.landmarks.push(...PLACES)
  const view = fitView(mapBounds(data.layers.khans), 1280, 900)
  const center = worldToScreen({ x: PLACES[0].point[0], y: PLACES[0].point[1] }, view, 1280, 900)
  assert.equal(hitTest({ x: center.x + 31, y: center.y }, data, view, 1280, 900)?.item.id, PLACES[0].id)
  assert.notEqual(hitTest({ x: center.x + 33, y: center.y }, data, view, 1280, 900)?.item?.id, PLACES[0].id)
})

test('place transition fallback clears only when pagehide did not occur', () => {
  let callback
  let delay
  let leaving = false
  let clears = 0
  const timer = schedulePlaceTransitionFallback({
    isPageLeaving: () => leaving,
    clear: () => { clears++ },
    schedule: (next, milliseconds) => {
      callback = next
      delay = milliseconds
      return 42
    },
  })
  assert.equal(timer, 42)
  assert.equal(delay, 1500)
  callback()
  assert.equal(clears, 1)
  leaving = true
  callback()
  assert.equal(clears, 1)
})

test('place badge draws the logo once and falls back to the existing ring marker', () => {
  const calls = []
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key]
      target[key] = (...args) => calls.push([key, ...args])
      return target[key]
    },
    set(target, key, value) {
      calls.push([key, value])
      target[key] = value
      return true
    },
  })
  const logo = { naturalWidth: 979, naturalHeight: 544 }
  const rendered = drawPlaceBadge(context, { scale: 3, color: '#e8832a', active: true, logo, logoReady: true })
  assert.equal(rendered.usedLogo, true)
  assert.equal(calls.filter(([name]) => name === 'drawImage').length, 1)
  assert.ok(calls.some(([name, value]) => name === 'lineWidth' && value === 3.5))

  calls.length = 0
  const fallback = drawPlaceBadge(context, { scale: 1, color: '#9a6b24', logo, logoReady: false })
  assert.equal(fallback.usedLogo, false)
  assert.equal(calls.some(([name]) => name === 'drawImage'), false)
  assert.ok(calls.some(([name]) => name === 'moveTo'))
})

test('both place labels survive congestion and stay named in every label mode', () => {
  for (const mode of ['zh', 'en', 'km']) {
    const labels = collectLabelCandidates({
      data: mapData,
      view: fitView(mapBounds(mapData.layers.khans), 1280, 900),
      width: 1280,
      height: 900,
      mode,
      places: PLACES,
    }).filter((item) => item.kind === 'place')
    assert.deepEqual(labels.map((item) => item.lines[0]), ['智序工场·办公室', 'DR 仓配服务中心'])
  }
  const crowded = resolveLabelPlacement([
    { key: 'place:office', kind: 'place', lines: ['智序工场·办公室'], anchor: { x: 100, y: 100 }, markerRadius: 20, alpha: 1 },
    { key: 'place:dr', kind: 'place', lines: ['DR 仓配服务中心'], anchor: { x: 100, y: 100 }, markerRadius: 20, alpha: 1 },
    { key: 'khan:x', kind: 'khan', lines: ['区域'], anchor: { x: 100, y: 100 }, alpha: 1 },
    { key: 'landmark:x', kind: 'landmark-major', lines: ['地标'], anchor: { x: 100, y: 100 }, alpha: 1 },
  ], () => 80)
  assert.deepEqual(crowded.visible.filter((item) => item.kind === 'place').map((item) => item.key), ['place:office', 'place:dr'])
  assert.deepEqual(crowded.hidden.map((item) => item.key).sort(), ['khan:x', 'landmark:x'])
  const firstFrame = nextLabelFrame(crowded)
  assert.ok(firstFrame.draw.filter((item) => item.kind === 'place').every((item) => item.alpha === 1))
})

test('landmark type translations cover every type present in the data', () => {
  const types = [...new Set(mapData.layers.landmarks.map((item) => item.type))].sort()
  assert.ok(types.every((type) => Object.hasOwn(LANDMARK_TYPE_TEXT, type)))
  for (const type of types) assert.notEqual(typeText(type), '地标')
  assert.equal(typeText('office'), '办公地点')
  assert.equal(typeText('logistics-center'), '仓配地点')
})

test('static checks keep the map page offline, safe and within size budget', () => {
  const html = fs.readFileSync(path.join(root, 'town.html'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'town.css'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'town.js'), 'utf8')
  const core = fs.readFileSync(path.join(root, 'town-map-core.js'), 'utf8')
  const names = fs.readFileSync(path.join(root, 'town-names.js'), 'utf8')
  const fetchMatches = js.match(/\bfetch\s*\(/g) || []

  for (const [name, text] of [['town.js', js], ['town-map-core.js', core], ['town-names.js', names]]) {
    for (const bad of [/innerHTML/, /\beval\s*\(/, /new Function/, /document\.write/, /XMLHttpRequest/, /WebSocket/, /Math\.random/, /Date\.now/]) assert.doesNotMatch(text, bad, `${name} ${bad}`)
  }
  assert.equal(fetchMatches.length, 1)
  assert.match(js, /fetchImpl:\s*\(url\)\s*=>\s*fetch\(url\)/)
  assert.doesNotMatch(js, /fetch\((?!url)/)
  assert.match(html, /© OpenStreetMap contributors/)
  assert.match(html, /https:\/\/www\.openstreetmap\.org\/copyright/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/i)
  assert.equal((js.match(/new Image\(\)/g) || []).length, 1)
  assert.equal((js.match(/placeLogo\.src = '\/assets\/logo\.png'/g) || []).length, 1)
  const total = ['town.html', 'town.css', 'town.js', 'town-map-core.js', 'town-map-data.js', 'town-names.js'].reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0)
  assert.ok(total <= 2 * 1024 * 1024, total)
})
