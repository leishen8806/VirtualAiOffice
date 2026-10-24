import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V2 } from '../office-layout.js'
import { buildDisplayDepartments } from '../display-departments.js'
import { displayRoster } from '../display-staff-logic.js'
import { buildOfficeDisplayFinish } from '../office-vis2/display-finish.js'

const layout = { ...LAYOUT_V3_ALIGN, version: 2 }
const context = (low, search = '?officeSample=1', value = layout) => ({ THREE, root: new THREE.Group(), layout: value, low, search })

test('display finish is closed by default and preserves legacy geometry exactly', () => {
  for (const value of [layout, LAYOUT_V2]) for (const search of ['', '?officeSample=0', '?officeSample=bad', '?officeSample=1&officeSample=1']) {
    const old = buildDisplayDepartments(context(false, search, value)), next = buildOfficeDisplayFinish(context(false, search, value))
    try {
      assert.equal(next.finish, undefined)
      for (const key of Object.keys(old.root.children[0].geometry.attributes)) assert.deepEqual(next.root.children[0].geometry.attributes[key].array, old.root.children[0].geometry.attributes[key].array)
    } finally { old.dispose(); next.dispose() }
  }
})

test('four rooms retain labels, twelve identities, exact path bounds and one batch at both qualities', () => {
  const snapshot = JSON.stringify(layout), roster = displayRoster(layout)
  for (const low of [false, true]) {
    const old = buildDisplayDepartments(context(low)), c = context(low), next = buildOfficeDisplayFinish(c)
    try {
      assert.ok(next.finish?.parts, 'recognized original geometry')
      assert.deepEqual(next.bounds, old.bounds); assert.deepEqual(next.regions, old.regions)
      assert.equal(next.summary().calls, 1); assert.equal(next.summary().desks, 12)
      assert.ok(next.summary().triangles < (low ? 7000 : 14000), 'bounded four-room detail')
      const original = old.root.children[0].geometry.attributes, actual = next.root.children[0].geometry.attributes
      // 四块标签为原合批最后的24顶点，移除陈设后逐属性保留。
      for (const key of Object.keys(original)) {
        const size = original[key].itemSize, end = next.finish.retainedVertices * size
        assert.deepEqual(actual[key].array.slice(end - 24 * size, end), original[key].array.slice(-24 * size), 'unchanged label ' + key)
      }
      for (const part of next.finish.parts) {
        const b = new THREE.Box3(), pos = actual.position
        for (let i = part.start; i < part.start + part.count; i++) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i))
        if (part.kind === 'plant') {
          const r = layout.regions.find(r => r.id === part.id), x = r.x1 - .55, z = r.z0 + .65
          assert.ok(b.min.x >= x - .275 - 1e-5 && b.max.x <= x + .275 + 1e-5)
          assert.ok(b.min.z >= z - .25 - 1e-5 && b.max.z <= z + .25 + 1e-5)
          assert.ok(b.min.y >= .025 - 1e-5 && b.max.y <= 1.275 + 1e-5)
          const normal = actual.normal, color = actual.color, soil = new THREE.Color('#534A3C')
          let visibleSoil = 0, coveringCap = 0
          for (let i = part.start; i < part.start + part.count; i++) if (normal.getY(i) > .9 && pos.getY(i) > .66 && pos.getY(i) < .68) {
            if (Math.abs(color.getX(i) - soil.r) < 1e-5) visibleSoil++
            else coveringCap++
          }
          assert.ok(visibleSoil > 0); assert.equal(coveringCap, 0, 'open pot has no solid lid covering the soil')
        } else {
          const p = roster.find(p => p.id === part.id), chair = part.kind === 'chair'
          const x = chair ? p.home.x : p.desk.x, z = chair ? p.home.z : p.desk.z
          assert.ok(b.min.x >= x - (chair ? .23 : .5) - 1e-5 && b.max.x <= x + (chair ? .23 : .5) + 1e-5, part.id + ' width')
          assert.ok(b.min.z >= z - (chair ? .23 : .28) - 1e-5 && b.max.z <= z + (chair ? .26 : .28) + 1e-5, part.id + ' depth')
          if (chair) assert.ok(Math.abs(b.max.y - .98) < 1e-5)
        }
      }
      const disposed = new Set(), mesh = next.root.children[0]
      for (const resource of [mesh.geometry, mesh.material]) resource.addEventListener('dispose', () => disposed.add(resource.uuid))
      next.dispose(); next.dispose(); assert.equal(disposed.size, 2); assert.equal(c.root.children.length, 0)
    } finally { old.dispose(); next.dispose() }
  }
  assert.equal(JSON.stringify(layout), snapshot); assert.equal(Object.keys(layout.seats).length, 25)
})

test('host canvas callback and failed finish keep one owned legacy module with correct cleanup', () => {
  let draws = 0, textureDisposed = 0
  const canvasTex = (w, h, draw) => {
    assert.equal(w, 1024); assert.equal(h, 512)
    draw(new Proxy({}, { get: () => () => {} }), w, h); draws++
    const texture = new THREE.Texture(); texture.addEventListener('dispose', () => textureDisposed++)
    return texture
  }
  let count = 0, geometryDisposed = 0
  const custom = { ...THREE, CylinderGeometry: class extends THREE.CylinderGeometry {
    constructor(...args) {
      if (++count === 3) throw new Error('simulated local geometry failure')
      super(...args); this.addEventListener('dispose', () => geometryDisposed++)
    }
  } }
  const c = { ...context(false), THREE: custom, canvasTex }, value = buildOfficeDisplayFinish(c)
  const old = buildDisplayDepartments(context(false))
  try {
    assert.equal(value.finish.fallback, true); assert.equal(c.root.children.length, 1)
    for (const key of Object.keys(old.root.children[0].geometry.attributes)) assert.deepEqual(value.root.children[0].geometry.attributes[key].array, old.root.children[0].geometry.attributes[key].array)
    assert.equal(draws, 1); assert.equal(geometryDisposed, 2)
    value.dispose(); value.dispose(); assert.equal(textureDisposed, 1); assert.equal(c.root.children.length, 0)
  } finally { value.dispose(); old.dispose() }
})
