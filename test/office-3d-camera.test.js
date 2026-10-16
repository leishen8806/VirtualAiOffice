/* M1-2 targeted tests: 3D limited-orbit camera clamp pure module.
 * The orbit range is frozen by the board, so test 1 locks every number in the table:
 * loosening the camera range later must fail loudly here, not silently in the renderer.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const MODULE_REL = 'public/core/office-3d-camera.js'
const MODULE_ABS = path.join(ROOT, MODULE_REL)

delete require.cache[MODULE_ABS]
require(MODULE_ABS)
const M = globalThis.VAOOffice3DCamera

const FIELDS = ['azimuth', 'polar', 'zoom', 'targetX', 'targetZ']
const viewWith = (field, value) => ({ ...M.DEFAULT_VIEW, [field]: value })
const clampField = (field, value) => M.clamp(viewWith(field, value))[field]

test('1. [frozen range] LIMITS / FLOOR / DEFAULT_VIEW numbers match the board freeze', () => {
  assert.deepEqual(M.LIMITS.azimuth, { min: 10, max: 80 })
  assert.deepEqual(M.LIMITS.polar, { min: 40, max: 60 })
  assert.deepEqual(M.LIMITS.zoom, { min: 0.7, max: 1.6 })
  assert.deepEqual(M.LIMITS.targetX, { min: -16, max: 16 })
  assert.deepEqual(M.LIMITS.targetZ, { min: -9, max: 9 })
  assert.deepEqual(M.FLOOR, { width: 32, depth: 18, minX: -16, maxX: 16, minZ: -9, maxZ: 9 })
  assert.deepEqual(M.DEFAULT_VIEW, { azimuth: 45, polar: 50, zoom: 1, targetX: 0, targetZ: 0 })
  for (const fn of ['clamp', 'applyDelta', 'reset', 'isWithinLimits', 'transitionMs']) {
    assert.equal(typeof M[fn], 'function', `${fn} MUST be exported`)
  }
})

test('2. [clamp boundaries] each field is pulled back inside its frozen range', () => {
  assert.equal(clampField('azimuth', 9.9), 10)
  assert.equal(clampField('azimuth', 80.1), 80)
  assert.equal(clampField('azimuth', 45), 45)
  assert.equal(clampField('polar', 39), 40)
  assert.equal(clampField('polar', 61), 60)
  assert.equal(clampField('zoom', 0.69), 0.7)
  assert.equal(clampField('zoom', 1.61), 1.6)
  assert.equal(clampField('targetX', -16.5), -16)
  assert.equal(clampField('targetX', 16.5), 16)
  assert.equal(clampField('targetZ', -9.5), -9)
  assert.equal(clampField('targetZ', 9.5), 9)
})

test('3. [idempotent] clamp(clamp(v)) deep-equals clamp(v) for out-of-range inputs', () => {
  const samples = [
    { azimuth: 200, polar: -30, zoom: 9, targetX: -99, targetZ: 42 },
    { azimuth: 10.00006, polar: 59.99999, zoom: 1.23456, targetX: 15.99999, targetZ: -0.00001 },
    { ...M.DEFAULT_VIEW },
    { azimuth: 10, polar: 60, zoom: 0.7, targetX: 16, targetZ: -9 },
    { azimuth: NaN, polar: 60.5, zoom: 0.5, targetX: 16.00001, targetZ: -9.5 },
  ]
  for (const sample of samples) {
    assert.deepEqual(M.clamp(M.clamp(sample)), M.clamp(sample), JSON.stringify(sample))
  }
})

test('4. [no mutation] clamp returns a new object and leaves the input untouched', () => {
  const input = { azimuth: 70, polar: 41, zoom: 1.5, targetX: 8, targetZ: -3 }
  const snapshot = { ...input }
  const out = M.clamp(input)
  assert.deepEqual(input, snapshot)
  assert.notEqual(out, input)
  assert.deepEqual(out, snapshot)
})

test('5. [dirty input] non-finite / wrong-type values fall back to the default field', () => {
  const dirty = [NaN, Infinity, -Infinity, undefined, null, '45', {}]
  for (const field of FIELDS) {
    for (const value of dirty) {
      const out = clampField(field, value)
      assert.equal(out, M.DEFAULT_VIEW[field], `${field} <= ${String(value)}`)
      assert.ok(Number.isFinite(out), `${field} <= ${String(value)} MUST stay finite`)
      assert.ok(M.isWithinLimits(M.clamp(viewWith(field, value))), `${field} <= ${String(value)} MUST be within limits`)
    }
  }
  assert.deepEqual(M.clamp({}), M.DEFAULT_VIEW, 'missing fields fall back to defaults')
})

test('6. [applyDelta] adds first, then clamps; missing delta fields count as 0', () => {
  const a = M.applyDelta(M.DEFAULT_VIEW, { dAzimuth: 20 })
  assert.equal(a.azimuth, 65)
  const b = M.applyDelta(a, { dAzimuth: 20 })
  assert.equal(b.azimuth, 80)
  const c = M.applyDelta(b, { dAzimuth: 20 })
  assert.equal(c.azimuth, 80, 'third step is clamped, never above 80')
  assert.equal(M.applyDelta(M.DEFAULT_VIEW, { dZoom: -10 }).zoom, 0.7)
  assert.equal(M.applyDelta(M.DEFAULT_VIEW, { dTargetZ: 100 }).targetZ, 9)
  const view = { azimuth: 70, polar: 41, zoom: 1.5, targetX: 8, targetZ: -3 }
  assert.deepEqual(M.applyDelta(view, {}), M.clamp(view))
})

test('7. [reset] returns a fresh default view; DEFAULT_VIEW itself is frozen', () => {
  assert.deepEqual(M.reset(), M.DEFAULT_VIEW)
  assert.notEqual(M.reset(), M.DEFAULT_VIEW, 'reset MUST NOT hand out the shared object')
  const r = M.reset()
  r.azimuth = 999
  assert.equal(M.DEFAULT_VIEW.azimuth, 45, 'mutating the returned view MUST NOT pollute DEFAULT_VIEW')
  assert.equal(M.reset().azimuth, 45)
  assert.ok(Object.isFrozen(M.DEFAULT_VIEW), 'DEFAULT_VIEW MUST be frozen')
  try { M.DEFAULT_VIEW.azimuth = 999 } catch { /* strict mode throws; the value check below is what matters */ }
  assert.equal(M.DEFAULT_VIEW.azimuth, 45)
})

test('8. [isWithinLimits] true for the default view, false for one out-of-range field each', () => {
  assert.equal(M.isWithinLimits(M.DEFAULT_VIEW), true)
  assert.equal(M.isWithinLimits(M.clamp({ azimuth: 1, polar: 1, zoom: 1, targetX: 1, targetZ: 1 })), true)
  const bad = { azimuth: 9.9, polar: 61, zoom: 0.69, targetX: -16.5, targetZ: 9.5 }
  for (const field of FIELDS) {
    assert.equal(M.isWithinLimits(viewWith(field, bad[field])), false, `${field} out of range MUST be false`)
  }
  assert.equal(M.isWithinLimits(viewWith('azimuth', NaN)), false)
})

test('9. [transitionMs] reduced motion collapses the camera transition to 0', () => {
  assert.equal(M.transitionMs(true), 0)
  assert.ok(M.transitionMs(false) > 0)
})

test('10. [purity] source touches no browser global, no network, no events', () => {
  const src = fs.readFileSync(MODULE_ABS, 'utf8')
  for (const token of ['document', 'window', 'addEventListener', 'EventSource', 'fetch(']) {
    assert.equal(src.includes(token), false, `${MODULE_REL} MUST NOT reference ${token}`)
  }
})
