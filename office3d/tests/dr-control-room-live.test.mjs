import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import {
  CONTROL_ROOM_BASE_SNAPSHOT,
  CONTROL_ROOM_LIVE_INTERVAL_MS,
  controlRoomLiveEnabled,
  controlRoomScreenSummary,
  controlRoomSnapshotAt,
  createControlRoomLiveScreen,
  drawControlRoomLiveScreen,
} from '../dr-control-room-screen.js'
import { buildDrControlRoom } from '../dr-control-room.js'
import { buildSnapshot } from '../dr-console-data.js'
import { demoSnapshotAt } from '../dr-console-demo.js'

function contextFixture() {
  const operations = []
  const methods = [
    'fillRect',
    'strokeRect',
    'fillText',
    'save',
    'restore',
    'translate',
    'scale',
    'beginPath',
    'moveTo',
    'lineTo',
    'closePath',
    'fill',
    'stroke',
    'arc',
  ]
  const context = {}
  for (const method of methods) {
    context[method] = (...args) => operations.push([method, ...args])
  }
  return { context, operations }
}

function timerFixture() {
  let time = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => time,
    schedule(callback) {
      const id = nextId++
      timers.set(id, callback)
      return id
    },
    unschedule(id) {
      timers.delete(id)
    },
    advance(ms) {
      time += ms
      for (const callback of [...timers.values()]) callback()
    },
    count: () => timers.size,
  }
}

function documentFixture() {
  const listeners = new Map()
  return {
    hidden: false,
    addEventListener(type, callback) {
      listeners.set(type, callback)
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type)
    },
    dispatch(type) {
      listeners.get(type)?.()
    },
    listenerCount: () => listeners.size,
  }
}

test('live switch is strict and defaults closed', () => {
  assert.equal(controlRoomLiveEnabled(''), false)
  assert.equal(controlRoomLiveEnabled('?controlRoomLive=0'), false)
  assert.equal(controlRoomLiveEnabled('?controlRoomLive=true'), false)
  assert.equal(controlRoomLiveEnabled('?controlRoomLive=01'), false)
  assert.equal(
    controlRoomLiveEnabled('?controlRoomLive=1&controlRoomLive=1'),
    false,
  )
  assert.equal(controlRoomLiveEnabled('?controlRoomLive=1'), true)
})

test('3D and console paths produce identical snapshots for the same demo time', () => {
  const base = buildSnapshot({ seed: 2808, timeSlice: 5 })
  assert.deepEqual(CONTROL_ROOM_BASE_SNAPSHOT, base)
  for (const elapsedMs of [0, 1800, 3600, 9000]) {
    assert.deepEqual(
      controlRoomSnapshotAt(elapsedMs),
      demoSnapshotAt(base, elapsedMs),
    )
  }
})

test('pure live renderer draws map, KPIs, waybills, events and watermark', () => {
  const { context, operations } = contextFixture()
  drawControlRoomLiveScreen(
    context,
    controlRoomSnapshotAt(9000),
    1200,
    520,
  )
  const labels = operations
    .filter(([method]) => method === 'fillText')
    .map(([, value]) => String(value))
  for (const expected of [
    '模拟数据 · 示意',
    '金边枢纽',
    '入库',
    '出库',
    '在途',
    '准时率',
    '运单摘要',
    '最近事件',
  ]) {
    assert.ok(labels.some((label) => label.includes(expected)), expected)
  }
  assert.ok(
    operations.filter(([method]) => method === 'lineTo').length >= 60,
    'must draw the accepted Cambodia outline',
  )
})

test('live controller uploads only changed snapshots and stops cleanly', () => {
  const timer = timerFixture()
  const documentRef = documentFixture()
  const { context } = contextFixture()
  let staticDraws = 0
  const texture = { needsUpdate: false }
  const live = createControlRoomLiveScreen({
    context,
    texture,
    drawStatic: () => {
      staticDraws += 1
    },
    now: timer.now,
    schedule: timer.schedule,
    unschedule: timer.unschedule,
    documentRef,
  })

  live.start()
  assert.equal(timer.count(), 1)
  assert.equal(live.metrics().uploads, 1)
  assert.deepEqual(
    live.metrics().summary,
    controlRoomScreenSummary(controlRoomSnapshotAt(0)),
  )
  timer.advance(1000)
  assert.equal(live.metrics().uploads, 1)
  timer.advance(1000)
  assert.equal(live.metrics().uploads, 2)
  assert.ok(live.metrics().uploads / 2 <= 1)

  live.stop()
  const stoppedUploads = live.metrics().uploads
  assert.equal(staticDraws, 1)
  assert.equal(timer.count(), 0)
  timer.advance(10000)
  assert.equal(live.metrics().uploads, stoppedUploads)
  live.dispose()
  assert.equal(documentRef.listenerCount(), 0)
})

test('visibility pauses without backlog and manual stop does not auto-resume', () => {
  const timer = timerFixture()
  const documentRef = documentFixture()
  const { context } = contextFixture()
  const elapsed = []
  const live = createControlRoomLiveScreen({
    context,
    texture: { needsUpdate: false },
    drawStatic() {},
    snapshotProvider(value) {
      elapsed.push(value)
      return controlRoomSnapshotAt(value)
    },
    now: timer.now,
    schedule: timer.schedule,
    unschedule: timer.unschedule,
    documentRef,
  })
  live.start()
  timer.advance(1000)
  documentRef.hidden = true
  documentRef.dispatch('visibilitychange')
  assert.equal(timer.count(), 0)
  timer.advance(120000)
  documentRef.hidden = false
  documentRef.dispatch('visibilitychange')
  assert.equal(timer.count(), 1)
  assert.ok(elapsed.at(-1) <= 1000)

  live.stop()
  documentRef.hidden = true
  documentRef.dispatch('visibilitychange')
  documentRef.hidden = false
  documentRef.dispatch('visibilitychange')
  assert.equal(timer.count(), 0)
  live.dispose()
})

test('provider failures warn once and degrade only the screen', () => {
  const timer = timerFixture()
  const documentRef = documentFixture()
  const { context } = contextFixture()
  let warnings = 0
  let staticDraws = 0
  const live = createControlRoomLiveScreen({
    context,
    texture: { needsUpdate: false },
    drawStatic() {
      staticDraws += 1
    },
    snapshotProvider() {
      throw new Error('expected')
    },
    now: timer.now,
    schedule: timer.schedule,
    unschedule: timer.unschedule,
    documentRef,
    warn() {
      warnings += 1
    },
  })
  live.start()
  live.start()
  assert.equal(warnings, 1)
  assert.equal(staticDraws, 1)
  assert.equal(timer.count(), 0)
  assert.equal(live.metrics().running, false)
  live.dispose()
})

test('build uses one faithful canvas texture in closed and live modes', () => {
  const originalPath2D = globalThis.Path2D
  globalThis.Path2D = class Path2D {
    constructor(value) {
      this.value = value
    }
  }
  try {
    const build = (search) => {
      const timer = timerFixture()
      const documentRef = documentFixture()
      const calls = []
      const scene = new THREE.Scene()
      const canvasTex = (width, height, draw) => {
        const fixture = contextFixture()
        draw(fixture.context, width, height)
        const texture = new THREE.Texture()
        calls.push({ width, height, texture, fixture })
        return texture
      }
      const room = buildDrControlRoom({
        THREE,
        scene,
        canvasTex,
        search,
        liveOptions: {
          now: timer.now,
          schedule: timer.schedule,
          unschedule: timer.unschedule,
          documentRef,
        },
      })
      return { room, calls, timer, scene }
    }

    const closed = build('?controlRoom=1')
    const live = build('?controlRoom=1&controlRoomLive=1')
    assert.equal(closed.calls.length, 1)
    assert.equal(live.calls.length, 1)
    assert.deepEqual(
      live.calls.map(({ width, height }) => [width, height]),
      [[1200, 520]],
    )
    assert.equal(closed.room.liveMetrics().uploads, 0)
    assert.equal(live.room.liveMetrics().uploads, 1)
    assert.equal(
      live.room.root.userData.controlRoomLive.liveMetrics().uploads,
      1,
    )
    assert.ok(
      live.room.root.getObjectByName('dr-control-room-screen'),
      'screen mesh must be inspectable without app wiring',
    )
    assert.equal(live.room.liveMetrics().intervalMs, CONTROL_ROOM_LIVE_INTERVAL_MS)
    assert.equal(live.timer.count(), 1)

    live.room.setDemo((elapsedMs) =>
      controlRoomSnapshotAt(elapsedMs + 3600),
    )
    assert.equal(live.room.liveMetrics().uploads, 2)
    live.room.root.visible = false
    live.timer.advance(1000)
    assert.equal(live.timer.count(), 0)
    const pausedUploads = live.room.liveMetrics().uploads
    live.timer.advance(10000)
    assert.equal(live.room.liveMetrics().uploads, pausedUploads)
    live.room.root.visible = true
    live.room.start()
    assert.equal(live.timer.count(), 1)
    assert.equal(live.room.liveMetrics().uploads, pausedUploads)
    live.timer.advance(1000)
    assert.equal(live.room.liveMetrics().uploads, pausedUploads + 1)

    const uploads = live.room.liveMetrics().uploads
    live.room.stop()
    live.timer.advance(10000)
    assert.equal(live.room.liveMetrics().uploads, uploads + 1)
    assert.equal(live.timer.count(), 0)
    closed.room.dispose()
    live.room.dispose()
    assert.equal(live.room.root.userData.controlRoomLive, undefined)
    assert.equal(closed.scene.children.length, 0)
    assert.equal(live.scene.children.length, 0)
  } finally {
    globalThis.Path2D = originalPath2D
  }
})
