import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { buildSnapshot } from '../dr-console-data.js'
import { demoSnapshotAt } from '../dr-console-demo.js'
import {
  createDemoDisplay,
  createDemoPageLifecycle,
  flowCanvasDpr,
} from '../dr-console-demo.js'
import { renderKpiCards } from '../dr-console-render.js'

test('dynamic demo snapshot is deterministic and labelled', () => {
  const base = buildSnapshot({ seed: 2808, timeSlice: 5 })
  const a = demoSnapshotAt(base, 3600), b = demoSnapshotAt(base, 3600)
  assert.deepEqual(a, b)
  assert.match(a.generatedAt, /^demo-motion-/)
  assert.ok(a.events.every(event => event.demo === true || event.detail?.includes('模拟')))
  assert.ok(a.waybills.every(item => item.progress >= 0 && item.progress <= 100))
})

test('dynamic demo is derived from the base snapshot without mutating it', () => {
  const base = buildSnapshot({ seed: 1, timeSlice: 0 }), before = JSON.stringify(base)
  const next = demoSnapshotAt(base, 9000)
  assert.equal(JSON.stringify(base), before)
  assert.notEqual(next.generatedAt, base.generatedAt)
})

test('KPI rendering replaces cards on every update', () => {
  const target = {
    children: [],
    replaceChildren(...nodes) { this.children = nodes },
    append(node) { this.children.push(node) },
  }
  const entries = Array.from({ length: 8 }, (_, index) => ['KPI ' + index])
  for (let update = 0; update < 50; update++) {
    renderKpiCards(target, entries, entry => ({ entry }))
    assert.equal(target.children.length, 8)
  }
})

test('flow canvas uses bounded DPR for desktop and large-screen modes', () => {
  assert.equal(
    flowCanvasDpr({ viewportWidth: 1920, devicePixelRatio: 4 }),
    2,
  )
  assert.equal(
    flowCanvasDpr({ viewportWidth: 2560, devicePixelRatio: 4 }),
    3,
  )
  assert.equal(
    flowCanvasDpr({ viewportWidth: 3840, devicePixelRatio: 1 }),
    1,
  )
})

test('all tick-redrawn list regions clear before rebuilding', () => {
  const source = fs.readFileSync(new URL('../dr-console.js', import.meta.url), 'utf8')
  assert.match(source, /for \(const id of \['waybills', 'inventory', 'events', 'devices'\]\) \$\('#' \+ id\)\.replaceChildren\(\)/)
  assert.doesNotMatch(source, /#kpis'\)\.append\(/)
})

function demoHarness() {
  let frame = null, nextFrame = 0, hidden = false
  const listeners = new Map()
  const context = { clearCount: 0, clearRect() { this.clearCount++ }, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} }
  const canvas = { width: 1200, height: 520, getContext: () => context, getBoundingClientRect: () => ({ width: 1200, height: 520 }) }
  const toggle = {
    textContent: '',
    attrs: {},
    click: null,
    addEventListener(type, fn) { if (type === 'click') this.click = fn },
    removeEventListener(type, fn) { if (type === 'click' && this.click === fn) this.click = null },
    setAttribute(name, value) { this.attrs[name] = value },
  }
  const status = { textContent: '' }
  const root = { querySelector(selector) { return selector === '#flowOverlay' ? canvas : selector === '#motionToggle' ? toggle : status }, __drConsoleDemoDisplay: null }
  const documentStub = { get hidden() { return hidden }, addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) } }
  return {
    root, toggle, canvas, context, documentStub,
    requestFrame(fn) { frame = fn; return ++nextFrame },
    cancelFrame() { frame = null },
    tick(stamp) { const fn = frame; frame = null; fn?.(stamp) },
    hide() { hidden = true; listeners.get('visibilitychange')?.() },
    show() { hidden = false; listeners.get('visibilitychange')?.() },
    listenerCount() { return listeners.size },
    pendingFrame: () => frame !== null,
  }
}

test('stop, hide and repeated initialization reset to one static display lifecycle', () => {
  const h = demoHarness()
  const base = buildSnapshot({ seed: 2808, timeSlice: 5 }), snapshots = []
  const options = {
    root: h.root,
    baseSnapshot: base,
    onSnapshot: value => snapshots.push(value),
    now: () => 0,
    documentRef: h.documentStub,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame,
  }
  const display = createDemoDisplay(options)
  assert.deepEqual(snapshots.at(-1), base)
  for (let round = 0; round < 5; round++) {
    display.start(); h.tick(1800); display.stop()
    assert.deepEqual(snapshots.at(-1), base)
    assert.equal(display.isRunning(), false)
    assert.equal(h.listenerCount(), 1)
    assert.equal(h.pendingFrame(), false)
  }
  display.stop()
  assert.deepEqual(snapshots.at(-1), base)
  display.start(); h.tick(1800); h.hide()
  assert.equal(display.isRunning(), false)
  assert.deepEqual(snapshots.at(-1), base)
  h.show()
  assert.equal(display.isRunning(), false)
  display.dispose()
  assert.equal(h.listenerCount(), 0)
  assert.equal(h.toggle.click, null)
  assert.equal(h.context.clearCount >= 8, true)

  const again = createDemoDisplay(options)
  assert.equal(h.listenerCount(), 1)
  assert.equal(again.isRunning(), false)
  again.dispose()
  assert.equal(h.listenerCount(), 0)
})

test('page lifecycle survives five bfcache-style cycles without auto-starting or stacking', () => {
  const h = demoHarness()
  const windowListeners = new Map()
  const windowRef = {
    addEventListener(type, fn) { windowListeners.set(type, fn) },
    removeEventListener(type, fn) { if (windowListeners.get(type) === fn) windowListeners.delete(type) },
    dispatch(type, event = {}) { windowListeners.get(type)?.(event) },
  }
  const base = buildSnapshot({ seed: 2808, timeSlice: 5 })
  const snapshots = []
  const lifecycle = createDemoPageLifecycle({
    root: h.root,
    windowRef,
    baseSnapshot: base,
    onSnapshot: value => snapshots.push(value),
    now: () => 0,
    documentRef: h.documentStub,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame,
  })
  assert.equal(windowListeners.size, 3)
  assert.equal(h.listenerCount(), 1)
  for (let round = 0; round < 5; round++) {
    lifecycle.start()
    h.tick(1800)
    assert.equal(lifecycle.isRunning(), true)
    windowRef.dispatch('pagehide', { persisted: true })
    assert.equal(lifecycle.isRunning(), false)
    assert.equal(h.listenerCount(), 0)
    assert.equal(h.pendingFrame(), false)
    assert.deepEqual(snapshots.at(-1), base)
    windowRef.dispatch('pageshow', { persisted: true })
    assert.equal(lifecycle.isRunning(), false)
    assert.equal(h.listenerCount(), 1)
    assert.equal(windowListeners.size, 3)
  }
  lifecycle.dispose()
  assert.equal(h.listenerCount(), 0)
  assert.equal(windowListeners.size, 0)
  windowRef.dispatch('pageshow', { persisted: true })
  assert.equal(h.listenerCount(), 0)
})
