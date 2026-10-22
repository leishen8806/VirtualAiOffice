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
  fitView,
  khanNameMeta,
  landmarkNameMeta,
  loadMapWithFallback,
  mapBounds,
  resolveLabelPlacement,
  typeText,
  worldToScreen,
} from '../town-map-core.js'

const root = path.resolve(import.meta.dirname, '..')
const OFFICE = { id: 'office-fictional', label: '智序工场', point: [2614, -1468] }

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

test('landmark type translations cover every type present in the data', () => {
  const types = [...new Set(mapData.layers.landmarks.map((item) => item.type))].sort()
  assert.deepEqual(types, Object.keys(LANDMARK_TYPE_TEXT).sort())
  for (const type of types) assert.notEqual(typeText(type), '地标')
})

test('static checks keep the map page offline, safe and within size budget', () => {
  const html = fs.readFileSync(path.join(root, 'town.html'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'town.css'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'town.js'), 'utf8')
  const core = fs.readFileSync(path.join(root, 'town-map-core.js'), 'utf8')
  const names = fs.readFileSync(path.join(root, 'town-names.js'), 'utf8')
  const fetchMatches = js.match(/\bfetch\s*\(/g) || []

  for (const [name, text] of [['town.js', js], ['town-map-core.js', core], ['town-names.js', names]]) {
    for (const bad of [/innerHTML/, /\beval\s*\(/, /new Function/, /document\.write/, /XMLHttpRequest/, /WebSocket/]) assert.doesNotMatch(text, bad, `${name} ${bad}`)
  }
  assert.equal(fetchMatches.length, 1)
  assert.match(js, /fetchImpl:\s*\(url\)\s*=>\s*fetch\(url\)/)
  assert.doesNotMatch(js, /fetch\((?!url)/)
  assert.match(html, /© OpenStreetMap contributors/)
  assert.match(html, /https:\/\/www\.openstreetmap\.org\/copyright/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/i)
  const total = ['town.html', 'town.css', 'town.js', 'town-map-core.js', 'town-map-data.js', 'town-names.js'].reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0)
  assert.ok(total <= 2 * 1024 * 1024, total)
})
