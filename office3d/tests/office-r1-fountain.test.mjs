import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Fountain } from '../office-vis2/r1-fountain.js'
import { buildR1Plaza } from '../office-vis2/r1-plaza.js'
import { R1_BACKWALL, R1_BOARD_ROUTE_OVERRIDES, runtimeYawFromFacing } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { LAYOUT_V3_ALIGN_L2B } from '../office-layout.js'

const setup = options => {
  const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  return { root, layout, collision, fountain: buildR1Fountain({ THREE, root, layout, collision, ...options }) }
}
const near = (a, b, e = .00001) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`)
const segmentDistance = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((28 - a[0]) * dx + (-10 - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(28 - a[0] - t * dx, -10 - a[1] - t * dy)
}

test('FT-1 actual geometry has registered centre, coping radius/height, grounded bottom and bounded jets', () => {
  const { fountain: f } = setup()
  assert.deepEqual(f.root.position.toArray(), [2, 0, 28])
  const stone = f.root.getObjectByName('r1-fountain-stone').geometry.attributes.position
  let radius = 0, maxCoping = 0, bottom = Infinity
  for (let i = 0; i < stone.count; i++) {
    const r = Math.hypot(stone.getX(i), stone.getZ(i)); radius = Math.max(radius, r)
    if (r > 3.5) maxCoping = Math.max(maxCoping, stone.getY(i))
    if (r < 3.6 && stone.getY(i) < .01) bottom = Math.min(bottom, stone.getY(i))
  }
  near(radius, 4.15); near(maxCoping, .5); near(bottom, .003)
  for (let t = 0; t < 100; t++) {
    f.onFrame(.1)
    f.root.traverse(mesh => {
      if (!mesh.geometry) return
      const p = mesh.geometry.attributes.position
      for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= 4.2, mesh.name)
    })
  }
  assert.equal(f.particleCount, 2380); assert.ok(f.particleCount <= 3000)
  near(f.water.geometry.attributes.position.getY(0), .34)
  assert.equal(f.water.material.clearcoat, 1)
  assert.ok(f.water.material.normalMap.isDataTexture)
  f.dispose()
})

test('FT-2 only Z14 endpoint is overridden, frozen with provenance; all 17 swept channels clear the pool', () => {
  const { layout, fountain } = setup(), route = layout.r1.routes.find(r => r.id === 'Z14')
  assert.deepEqual(R1_BOARD_ROUTE_OVERRIDES, [{ id: 'Z14', date: '2026-10-29', reason: '董事会 2026-10-29 广场中心建喷泉', from: [28, -10], to: [28, -5] }])
  assert.ok(Object.isFrozen(R1_BOARD_ROUTE_OVERRIDES)); assert.ok(Object.isFrozen(route)); assert.ok(Object.isFrozen(route.points_m)); assert.ok(Object.isFrozen(route.points_m.at(-1)))
  assert.deepEqual(route.points_m, [[28, -1], [28, -4], [28, -5]])
  assert.deepEqual(R1_DATA.routes.find(r => r.id === 'Z14').points_m, [[28, -1], [28, -4], [28, -10]])
  for (const r of layout.r1.routes) {
    // Z09 / Z13 是 OFFICE-R1-BACKWALL 的穿墙改道（冻结在 R1_BACKWALL.routes，由 office-r1-backwall.test.mjs 锁住），不属于喷泉偏离。
    if (r.id !== 'Z14') assert.deepEqual(r.points_m, R1_BACKWALL.routes.get(r.id) ?? R1_DATA.routes.find(x => x.id === r.id).points_m)
    const gap = Math.min(...r.points_m.slice(1).map((b, i) => segmentDistance(r.points_m[i], b))) - 4.15
    assert.ok(gap >= R1_DATA.bodyProfiles[r.body_profile].radius_m, `${r.id}: ${gap}`)
    if (r.id === 'Z14') near(gap, .85)
  }
  fountain.dispose()
})

test('FT-2 all 94 plaza registration footprints, including the I6C overrides, remain outside the pool', () => {
  const { layout, fountain } = setup(), items = layout.r1.elements.filter(r => r.regionId === '14')
  assert.equal(items.length, 94)
  for (const r of items) {
    const yaw = runtimeYawFromFacing(r.facingLocal?.[0] || 0, -(r.facingLocal?.[1] || 0))
    const dx = 28 - r.xM, dz = 10 + r.yM, c = Math.cos(yaw), s = Math.sin(yaw)
    const x = c * dx - s * dz, z = s * dx + c * dz
    const gap = Math.hypot(Math.max(0, Math.abs(x) - r.lengthM / 2), Math.max(0, Math.abs(z) - r.widthM / 2)) - 4.15
    assert.ok(gap > 0, `${r.id}: ${gap}`)
  }
  fountain.dispose()
})

test('FT-3 ordinary cylinder blocks eight inward pushes in the real collision engine and cleans up', () => {
  const { fountain: f, collision, root } = setup()
  assert.ok(f.proxy.isMesh && !f.proxy.isInstancedMesh)
  assert.equal(collision.stats().bodies, 1)
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, p = { x: 2 + 5 * Math.cos(a), z: 28 + 5 * Math.sin(a) }
    collision.move(p, -5 * Math.cos(a), -5 * Math.sin(a))
    assert.ok(Math.hypot(p.x - 2, p.z - 28) >= 4.15, JSON.stringify(p))
  }
  assert.ok(collision.hit(2, 28))
  f.dispose(); f.dispose()
  assert.equal(collision.stats().bodies, 0); assert.equal(root.children.length, 0)
})

test('FT-4/5 high water moves; runtime low stops all animation, hides particles and uses four visible batches', t => {
  let stamp = 1000
  t.mock.method(performance, 'now', () => stamp)
  const quality = { tier: 'high' }, { fountain: f } = setup({ quality })
  const before = f.particles.geometry.attributes.position.array.slice()
  f.onFrame(.1)
  assert.notDeepEqual(f.particles.geometry.attributes.position.array, before)
  assert.ok(f.curtains.material.map.offset.y > 0 && f.water.material.normalMap.offset.x > 0)
  const count = () => f.root.children.filter(n => (n.isMesh || n.isPoints) && n.visible && n.material.visible).length
  assert.equal(count(), 6)
  quality.tier = 'low'; f.onFrame(.1)
  const frozen = f.particles.geometry.attributes.position.array.slice(), offset = f.curtains.material.map.offset.clone()
  for (let i = 0; i < 10; i++) f.onFrame(.1)
  assert.deepEqual(f.particles.geometry.attributes.position.array, frozen)
  assert.deepEqual(f.curtains.material.map.offset, offset)
  assert.equal(f.particles.visible, false); assert.equal(count(), 4)
  quality.tier = 'high'; f.onFrame(.1)
  assert.equal(f.particles.visible, true); assert.notDeepEqual(f.particles.geometry.attributes.position.array, frozen)
  const zeroDt = f.particles.geometry.attributes.position.array.slice()
  stamp += 50; f.onFrame(0)
  assert.notDeepEqual(f.particles.geometry.attributes.position.array, zeroDt)
  f.dispose()
})

test('FT-6 integration forwards animation/disposal and non-R1 creates no fountain, light or collision', () => {
  const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  const plaza = buildR1Plaza({ THREE, root, layout, collision })
  assert.equal(plaza.fountain.root.parent, plaza.root)
  assert.equal(plaza.onFrame, plaza.fountain.onFrame)
  assert.equal(collision.stats().bodies, 31)
  let lights = 0; plaza.root.traverse(n => { if (n.isLight) lights++ }); assert.equal(lights, 0)
  plaza.dispose(); assert.equal(collision.stats().bodies, 0)
  for (const old of [undefined, LAYOUT_V3_ALIGN_L2B]) {
    const f = buildR1Fountain({ THREE, root, layout: old, collision })
    assert.equal(root.children.length, 0); assert.equal(collision.stats().bodies, 0); f.dispose()
  }
})
