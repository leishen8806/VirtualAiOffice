import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficePlaza } from '../office-vis2/plaza.js'
import { buildOfficePlazaHost } from '../office-vis2/plaza-host.js'

const overlap = (a, b) => a.x1 > b.x0 + 1e-5 && a.x0 < b.x1 - 1e-5 && a.z1 > b.z0 + 1e-5 && a.z0 < b.z1 - 1e-5
const polygonOverlap = (a, b) => ![a,b].some(poly => poly.some((p,i) => {
  const q = poly[(i+1)%poly.length], nx = q.z-p.z, nz = p.x-q.x
  const pa = a.map(v=>v.x*nx+v.z*nz), pb = b.map(v=>v.x*nx+v.z*nz)
  return Math.max(...pa) <= Math.min(...pb)+1e-5 || Math.max(...pb) <= Math.min(...pa)+1e-5
}))

test('legacy plaza geometry and placement data retain the d3ed647 baseline at both qualities', () => {
  const baseline = ['9870a1c0124741e828c8304affc96ec42b1a5bb41ffd972b0397d646204e0775', '4a7fae55d4e3fc1d04d6ee9753f0825f47626cf79ae52705859c3334f8437c44']
  for (const low of [false, true]) {
    const root = new THREE.Group(), batch = createSampleBatch(THREE), hash = createHash('sha256')
    const placements = appendOfficePlaza({ THREE, batch, layout: LAYOUT_V3, low }), built = batch.build(root, 'legacy-plaza')
    try {
      hash.update(JSON.stringify(placements))
      for (const [key, attr] of Object.entries(built.mesh.geometry.attributes)) { hash.update(key); hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength)) }
      assert.equal(hash.digest('hex'), baseline[Number(low)])
    } finally { built.dispose() }
  }
})

test('ALIGN vendors flare towards the entrance in mirrored directions and all transformed details fit exported footprints', () => {
  const before = JSON.stringify(layout)
  for (const low of [false, true]) {
    const root = new THREE.Group(), batch = createSampleBatch(THREE)
    const placements = appendOfficePlaza({ THREE, batch, layout, low }), built = batch.build(root, 'v-plaza')
    try {
      const vendors = placements.filter(p => p.kind === 'vendors'), original = [...layout.plaza.carts, ...layout.plaza.kiosks]
      assert.deepEqual(vendors.map(v => v.id), original.map(v => v.id)); assert.equal(vendors.length, 4)
      const left = vendors.filter(v => v.x < layout.axis.x), right = vendors.filter(v => v.x > layout.axis.x).sort((a, b) => a.z - b.z)
      assert.ok(left.every(v => v.yaw < Math.PI / 2)); assert.ok(right.every(v => v.yaw > Math.PI / 2))
      assert.ok(Math.abs((left[0].yaw + right[0].yaw) / 2 - Math.PI / 2) < 1e-10)
      const measuredAngle = 40 * Math.PI / 180
      for (const v of vendors) assert.ok(Math.abs(Math.abs(v.yaw - Math.PI / 2) - measuredAngle) < 1e-10, '40 degrees relative to the central axis, not the old 15-degree assumption')
      for (let i = 1; i < right.length; i++) assert.ok(right[i].x > right[i - 1].x && right[i].z > right[i - 1].z, 'southern end opens wider')
      for (let i = 1; i < right.length; i++) {
        const project = v => v.x*Math.sin(measuredAngle)+v.z*Math.cos(measuredAngle)
        assert.ok(Math.min(...right[i].footprint.map(project))-Math.max(...right[i-1].footprint.map(project))>=1.2-1e-5, 'actual rotated kiosk gap remains at least 1.2m')
      }
      for (const side of [-1, 1]) {
        const trees = placements.filter(p => p.kind === 'trees' && Math.sign(p.x - layout.axis.x) === side).sort((a, b) => a.z - b.z)
        const gardens = placements.filter(p => p.kind === 'garden' && Math.sign(p.x - layout.axis.x) === side).sort((a, b) => a.z - b.z)
        assert.equal(trees.length, 4); assert.equal(gardens.length, 2)
        for (const row of [trees, gardens]) {
          const a = row[0], b = row.at(-1)
          assert.ok(Math.abs(Math.atan2(Math.abs(b.x - a.x), b.z - a.z) - measuredAngle) < 1e-10, 'tree and planting rows follow the same measured flare')
        }
        for (const g of gardens) assert.ok(Math.abs(Math.PI / 2 - Math.abs(g.yaw) - measuredAngle) < 1e-10, 'elongated bed axis follows its row')
      }
      for (const [i, p] of placements.entries()) {
        assert.equal(overlap(p.bounds, { x0: 0, x1: 4, z0: 12, z1: 34 }), false)
        for (const other of placements.slice(i + 1)) assert.equal(p.kind==='vendors'&&other.kind==='vendors' ? polygonOverlap(p.footprint,other.footprint) : overlap(p.bounds, other.bounds), false, p.id + '/' + other.id)
      }
      for (const vendor of vendors) assert.ok(Math.hypot(Math.max(vendor.bounds.x0 - 2, 0, 2 - vendor.bounds.x1), Math.max(vendor.bounds.z0 - 21, 0, 21 - vendor.bounds.z1)) >= 9.28, 'clear of 18m plaza with pedestrian margin')
      const pos = built.mesh.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) assert.ok(placements.some(({ bounds: b }) => pos.getX(i) >= b.x0 - 1e-4 && pos.getX(i) <= b.x1 + 1e-4 && pos.getY(i) >= b.y0 - 1e-4 && pos.getY(i) <= b.y1 + 1e-4 && pos.getZ(i) >= b.z0 - 1e-4 && pos.getZ(i) <= b.z1 + 1e-4), 'every roof, cup and equipment vertex follows its bounds')
      const cart = vendors.find(v => v.id === layout.plaza.carts[0].id), angle = cart.yaw - Math.PI / 2, uv = built.mesh.geometry.attributes.sampleUv, surface = built.mesh.geometry.attributes.sampleSurface
      let roof = 0
      for (let i = 0; i < pos.count; i++) if (surface.getZ(i) === 4) {
        const x = pos.getX(i) - cart.x, z = pos.getZ(i) - cart.z
        assert.ok(Math.abs(uv.getX(i) - (Math.cos(angle) * x - Math.sin(angle) * z + cart.source.x) / 1.2) < 1e-5)
        assert.ok(Math.abs(uv.getY(i) - (Math.sin(angle) * x + Math.cos(angle) * z + cart.source.z) / 1.2) < 1e-5)
        roof++
      }
      assert.ok(roof > 0, 'awning stripes retain their original surface coordinates')
      assert.equal(root.children.length, 1)
    } finally { built.dispose() }
    assert.equal(root.children.length, 0)
  }
  assert.equal(JSON.stringify(layout), before); assert.equal(Object.keys(layout.seats).length, 25)
})

test('rotated vendor collision proxies and inspect-only hits use the same measured locations at both qualities', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), live = new Set(), host = buildOfficePlazaHost({ THREE, root, layout, search: '?officeSample=1', low, collision: { add: p => live.add(p), remove: p => live.delete(p) } })
    root.updateMatrixWorld(true)
    for (const v of host.placements.filter(p => p.kind === 'vendors')) {
      const proxy = [...live].find(p => p.name === v.id), measured = new THREE.Box3().setFromObject(proxy)
      assert.ok(Math.abs(measured.min.x - v.bounds.x0) < 1e-5 && Math.abs(measured.max.z - v.bounds.z1) < 1e-5)
      assert.ok(Math.abs(measured.max.x - v.bounds.x1) < 1e-5 && Math.abs(measured.min.z - v.bounds.z0) < 1e-5)
      assert.ok(Math.abs(proxy.rotation.y - (v.yaw-Math.PI/2)) < 1e-10, 'the hit box follows the actual rotated stall')
      assert.ok(Math.abs(measured.max.y - v.bounds.y1) < 1e-5, 'the visible roof must remain clickable')
      const hit = host.pick(new THREE.Raycaster(new THREE.Vector3(v.x, 8, v.z), new THREE.Vector3(0, -1, 0)))
      assert.equal(hit?.id, v.id); assert.equal(hit?.interaction, 'inspect-only')
    }
    host.dispose(); host.dispose(); assert.equal(live.size, 0); assert.equal(root.children.length, 0)
  }
})
