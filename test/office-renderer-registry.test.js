import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const modulePath = path.join(ROOT, 'public/core/office-renderer-registry.js')
delete globalThis.VAOOfficeRendererRegistry
delete require.cache[modulePath]
require(modulePath)
const R = globalThis.VAOOfficeRendererRegistry

const methods = () => ({
  update() {}, setRoleState() {}, activateHumanArea() {}, pulseHelixTo() {}, destroy() {},
})
const handle = (overrides = {}) => ({ mode: null, mount: null, ...methods(), ...overrides })
const impl = (makeHandle = handle) => ({ attach(mount, opts) { return makeHandle({ mount, mode: opts.mode }) } })
let trackedAttaches = 0
let trackedDestroys = 0
const trackedImpl = () => ({ attach(mount, opts) {
  trackedAttaches++
  return handle({ mount, mode: opts.mode, destroy() { trackedDestroys++ } })
} })

test('1. constants and exported registry are frozen', () => {
  assert.ok(Object.isFrozen(R))
  assert.deepEqual(R.RENDERER_IDS, ['2d', '3d'])
  assert.equal(R.DEFAULT_RENDERER, '2d')
  assert.deepEqual(R.HANDLE_MEMBERS, ['mode', 'mount', 'update', 'setRoleState', 'activateHumanArea', 'pulseHelixTo', 'destroy'])
  assert.deepEqual(R.RESOLVE_REASONS, ['MOBILE_NO_3D', 'DEFAULT', 'REQUESTED', 'NO_WEBGL2', 'LOW_TIER', 'RENDERER_UNAVAILABLE'])
  for (const value of [R.RENDERER_IDS, R.HANDLE_MEMBERS, R.RESOLVE_REASONS]) assert.ok(Object.isFrozen(value))
})

test('2. register validates IDs and implementations', () => {
  const twoD = trackedImpl()
  R.register('2d', twoD)
  assert.equal(R.has('2d'), true)
  assert.equal(R.get('2d'), twoD)
  assert.throws(() => R.register('webgl', twoD), /webgl/)
  assert.throws(() => R.register('3d', {}), /3d.*attach/i)
  assert.throws(() => R.register('2d', twoD), /2d/)
})

test('3. resolve follows strict fallback order before 3d registration', () => {
  const cases = [
    [{ requested: '3d', responsiveMode: 'MOBILE', capabilities: { webgl2: true, tier: 'high' } }, { id: '2d', reason: 'MOBILE_NO_3D' }],
    [{ requested: null }, { id: '2d', reason: 'DEFAULT' }],
    [{ requested: 'bogus' }, { id: '2d', reason: 'DEFAULT' }],
    [{ requested: '2d', capabilities: { webgl2: false } }, { id: '2d', reason: 'REQUESTED' }],
    [{ requested: '3d' }, { id: '2d', reason: 'NO_WEBGL2' }],
    [{ requested: '3d', capabilities: { webgl2: false } }, { id: '2d', reason: 'NO_WEBGL2' }],
    [{ requested: '3d', capabilities: { webgl2: true, tier: 'low' } }, { id: '2d', reason: 'LOW_TIER' }],
    [{ requested: '3d', capabilities: { webgl2: true, tier: 'mid' } }, { id: '2d', reason: 'RENDERER_UNAVAILABLE' }],
  ]
  for (const [input, expected] of cases) assert.deepEqual(R.resolve(input), expected)
})

test('4. late registration resolves pending and immediate promises', async () => {
  const pending = R.whenRegistered('3d')
  const threeD = trackedImpl()
  R.register('3d', threeD)
  assert.equal(await pending, threeD)
  assert.equal(await R.whenRegistered('3d'), threeD)
  assert.deepEqual(R.resolve({ requested: '3d', capabilities: { webgl2: true, tier: 'high' } }), { id: '3d', reason: 'REQUESTED' })
})

test('5. handle contract reports every missing function and preserves valid handles', () => {
  const valid = handle()
  assert.equal(R.assertHandleContract(valid), valid)
  assert.throws(() => R.assertHandleContract(handle({ destroy: undefined, pulseHelixTo: undefined })), /destroy.*pulseHelixTo|pulseHelixTo.*destroy/)
  assert.throws(() => R.assertHandleContract(handle({ setRoleState: 'nope' })), /setRoleState/)
})

test('6. readPreference accepts query strings and URLSearchParams with safe fallback', () => {
  const storage = (value) => ({ getItem() { return value } })
  const cases = [
    [{ search: '?renderer=3d', storage: storage('2d') }, '3d'],
    [{ search: '?renderer=bogus', storage: storage('3d') }, '3d'],
    [{ search: '?renderer=3D', storage: storage('2d') }, '2d'],
    [{ search: null, storage: null }, null],
    [{ search: '?renderer=', storage: storage('2d') }, '2d'],
    [{ search: '?x=1', storage: storage('webgl') }, null],
    [{ search: new URLSearchParams('renderer=3d'), storage: storage('2d') }, '3d'],
    [{ search: null, storage: { getItem() { throw new Error('no storage') } } }, null],
  ]
  for (const [input, expected] of cases) assert.equal(R.readPreference(input), expected)
})

test('7. round-trip swap retains renderer-agnostic state without shared nested references', () => {
  trackedAttaches = 0
  trackedDestroys = 0
  const old = R.get('3d').attach({}, { mode: 'live' })
  const original = { selectedRoleId: 'reviewer', selectedTaskId: 'T-42', drawer: { kind: 'role', id: 'reviewer' }, viewpoint: 'HELIX', camera: { azimuth: 62, polar: 47, zoom: 1.3, targetX: -4, targetZ: 2 }, filters: { status: ['BLOCKED', 'DONE'], onlyMine: true } }
  const originalCopy = structuredClone(original)
  const state = R.createViewState(original)
  const first = R.swap({ mount: {}, fromHandle: old, toId: '2d', snapshot: {}, mode: 'live', viewState: state })
  const second = R.swap({ mount: {}, fromHandle: first.handle, toId: '3d', snapshot: {}, mode: 'live', viewState: first.viewState })
  assert.deepEqual(second.viewState, original)
  assert.notEqual(second.viewState.filters, original.filters)
  assert.notEqual(second.viewState.camera, original.camera)
  assert.deepEqual(original, originalCopy)
  assert.equal(trackedAttaches, 3)
  assert.equal(trackedDestroys, 2)
})

test('8. lifecycle stays at one live handle and registry never installs listeners', () => {
  trackedAttaches = 0
  trackedDestroys = 0
  const source = fs.readFileSync(modulePath, 'utf8')
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener() { throw new Error('listener installed') } }
  let current = R.get('2d').attach({}, {})
  for (let i = 0; i < 5; i++) {
    const result = R.swap({ mount: {}, fromHandle: current, toId: i % 2 ? '3d' : '2d', snapshot: null, mode: null, viewState: {} })
    current = result.handle
  }
  globalThis.window = previousWindow
  assert.equal(trackedAttaches - trackedDestroys, 1)
  for (const forbidden of ['EventSource', 'new WebSocket', '/events', 'addEventListener', 'deriveCoreRuntimeFromState', 'ZONE_POSITIONS', 'localStorage', 'document']) assert.ok(!source.includes(forbidden), forbidden)
})

test('9. swap failures keep the old renderer or return a destroy warning', () => {
  let destroyed = 0
  assert.throws(() => R.swap({ mount: {}, fromHandle: handle({ destroy() { destroyed++ } }), toId: 'missing', viewState: {} }), /missing/)
  assert.equal(destroyed, 0)
  const result = R.swap({ mount: {}, fromHandle: handle({ destroy() { throw new Error('cleanup') } }), toId: '2d', viewState: {} })
  assert.equal(result.warnings.length, 1)
  assert.throws(() => R.assertHandleContract({ mode: null, mount: null }), /update.*destroy|destroy.*update/)
})

test('10. mergeViewState freezes an independent copy and rejects private keys', () => {
  const previous = R.createViewState({ camera: { zoom: 2 }, filters: { tag: ['x'] } })
  const merged = R.mergeViewState(previous, {})
  assert.deepEqual(merged, previous)
  assert.notEqual(merged, previous)
  assert.notEqual(merged.camera, previous.camera)
  assert.notEqual(merged.filters, previous.filters)
  assert.ok(Object.isFrozen(merged))
  assert.throws(() => R.mergeViewState(previous, { cameraZ: 1 }), /cameraZ/)
})
