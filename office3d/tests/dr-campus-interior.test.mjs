import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  SCREEN_REFRESH_MS,
  campusScreenFrameAt,
  campusScreenSummary,
  createCampusScreenLive,
  DISPATCH_SCREEN_STYLE,
} from '../dr-campus-interior.js'
import {
  controlRoomScreenSummary,
  controlRoomSnapshotAt,
} from '../dr-control-room-screen.js'
import {
  DEMO_BASE_SNAPSHOT,
  sharedDemoSnapshotAt,
} from '../dr-demo-snapshot.js'
import { demoSnapshotAt } from '../dr-console-demo.js'

function contextFixture() {
  const methods = [
    'fillRect', 'strokeRect', 'fillText', 'save', 'restore',
    'translate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'closePath',
    'fill', 'stroke', 'arc', 'strokeText',
  ]
  return Object.fromEntries(methods.map(method => [method, () => {}]))
}

function timerFixture() {
  let time = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => time,
    schedule(callback) { const id = nextId++; timers.set(id, callback); return id },
    unschedule(id) { timers.delete(id) },
    advance(ms) { time += ms; for (const callback of [...timers.values()]) callback() },
    count: () => timers.size,
  }
}

function documentFixture() {
  const listeners = new Map()
  return {
    hidden: false,
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
    dispatch(type) { listeners.get(type)?.() },
    listenerCount: () => listeners.size,
  }
}

test('dispatch screen is deterministic, simulated and rate-bounded', () => {
  assert.deepEqual(campusScreenFrameAt(4000), campusScreenFrameAt(4000))
  assert.notDeepEqual(campusScreenFrameAt(4000), campusScreenFrameAt(5000))
  const frame = campusScreenFrameAt(4000)
  assert.equal(frame.watermark, '模拟数据 · 示意')
  assert.ok(frame.nodes.length >= 7); assert.equal(frame.links.length, frame.nodes.length - 1)
  assert.equal(frame.nodes.find(item => item.id === 'phnom-penh').name, '金边')
  assert.ok(frame.nodes.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && !/^SIM-/.test(item.id)))
  assert.deepEqual(frame.nodes.map(({ id, x, y }) => ({ id, x, y })), campusScreenFrameAt(18000).nodes.map(({ id, x, y }) => ({ id, x, y })))
  assert.equal(SCREEN_REFRESH_MS, 1000)
})

test('console, control room and campus consume identical snapshots at every boundary', () => {
  for (const elapsedMs of [0, -1, 1800, 15000, Number.NaN, 1e12]) {
    const shared = sharedDemoSnapshotAt(elapsedMs)
    const consoleSnapshot = demoSnapshotAt(DEMO_BASE_SNAPSHOT, elapsedMs)
    const control = controlRoomSnapshotAt(elapsedMs)
    const campus = campusScreenFrameAt(elapsedMs)
    assert.deepEqual(consoleSnapshot, shared)
    assert.deepEqual(control, shared)
    assert.deepEqual(campus.snapshot, shared)
    assert.deepEqual(campus.summary, campusScreenSummary(shared))
    const controlSummary = controlRoomScreenSummary(shared)
    assert.deepEqual(campus.summary.kpis, controlSummary.kpis)
    assert.deepEqual(campus.summary.waybills, controlSummary.waybills)
    assert.deepEqual(campus.summary.events, controlSummary.events)
    assert.doesNotMatch(JSON.stringify(campus), /NaN|undefined/)
  }
})

test('campus screen lifecycle defaults closed, pauses and resets safely', () => {
  const originalPath2D = globalThis.Path2D
  globalThis.Path2D = class Path2D {
    constructor(value) {
      this.value = value
    }
  }
  try {
  const timer = timerFixture()
  const documentRef = documentFixture()
  const context = contextFixture()
  let staticDraws = 0
  const texture = { needsUpdate: false }
  const live = createCampusScreenLive({
    context,
    texture,
    drawStatic() { staticDraws += 1 },
    now: timer.now,
    schedule: timer.schedule,
    unschedule: timer.unschedule,
    documentRef,
  })
  assert.equal(live.metrics().desired, false)
  assert.equal(timer.count(), 0)
  live.start()
  assert.equal(timer.count(), 1)
  assert.deepEqual(
    live.metrics().summary,
    campusScreenSummary(sharedDemoSnapshotAt(0)),
  )
  live.seen()
  timer.advance(2000)
  assert.ok(live.metrics().uploads >= 2)
  documentRef.hidden = true
  documentRef.dispatch('visibilitychange')
  assert.equal(timer.count(), 0)
  documentRef.hidden = false
  documentRef.dispatch('visibilitychange')
  assert.equal(timer.count(), 1)
  live.stop()
  assert.equal(timer.count(), 0)
  assert.equal(staticDraws, 1)
  const uploads = live.metrics().uploads
  timer.advance(10000)
  assert.equal(live.metrics().uploads, uploads)
  live.dispose()
  assert.equal(documentRef.listenerCount(), 0)
  } finally {
    globalThis.Path2D = originalPath2D
  }
})

test('S2-11b dispatch screen uses the readable restrained blue and gold palette', () => {
  assert.deepEqual(DISPATCH_SCREEN_STYLE, {
    panel: '#24485c', mapFill: '#183847', outline: '#8fb4c1', outlineWidth: 4,
    route: '#b7d4e0', routeWidth: 3, label: '#f4f1eb', labelSize: 40,
    node: '#b7d4e0', phnomPenh: '#d5af62', phnomPenhRadius: 14, cityRadius: 7,
  })
})

test('dispatch screen has no external data or unsafe runtime inputs', async () => {
  const source = await Promise.all(['../dr-campus-screen.mjs', '../dr-campus-interior.js', '../dr-demo-snapshot.js', '../dr-cambodia-outline.js'].map(file => readFile(new URL(file, import.meta.url), 'utf8')))
  assert.doesNotMatch(source.join('\n'), /fetch\s*\(|Math\.random|Date\.now|innerHTML|\b(?:buy|purchase|price|balance|wallet)\b|\b(?:address|customer|order|inventory)\b/i)
  assert.match(source.join('\n'), /Path2D\(CAMBODIA_OUTLINE_D\)/)
  assert.doesNotMatch(source.join('\n'), /office-/)
})
