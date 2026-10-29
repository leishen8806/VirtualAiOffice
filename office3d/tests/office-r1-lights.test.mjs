import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { r1LightingPlan, buildR1Lights } from '../office-vis2/r1-lights.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'

const layout = createOfficeR1Layout(), plan = r1LightingPlan(layout)
const bounds = row => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...row.size))
  mesh.position.set(...row.position); mesh.rotation.y = row.yaw
  const box = new THREE.Box3().setFromObject(mesh); mesh.geometry.dispose(); return box
}
const pointSegment = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)
}

test('R1 lighting covers thirteen zones with 17 + 4 unshadowed point lights and three fixture batches without suspended ceiling fixtures', () => {
  const root = new THREE.Group(), calls = [], module = buildR1Lights({ THREE, root, layout, env: { indoorLevel: 1, night: 1 }, collision: { add: (...args) => calls.push(args) } })
  assert.equal(plan.lights.filter(l => l.zone !== '14').length, 17)
  assert.equal(plan.lights.filter(l => l.zone === '14').length, 4)
  for (const zone of layout.regions.filter(z => z.id !== '14')) assert.ok(plan.lights.some(l => l.zone === zone.id), zone.id)
  const objects = []; root.traverse(o => objects.push(o))
  assert.equal(objects.filter(o => o.isPointLight).length, 21)
  assert.ok(objects.filter(o => o.isLight).every(o => !o.castShadow))
  assert.equal(objects.filter(o => o.isMesh).length, 3)
  assert.equal(calls.length, 0)
  assert.ok(plan.fixtures.filter(f => f.zone !== '14').every(f => f.kind === 'glass-strip'), 'no suspended ceiling lamps')
  assert.equal(plan.fixtures.filter(f => f.kind === 'pole').length, 8)
  assert.equal(plan.fixtures.filter(f => f.kind === 'stall').length, 4)
  mergeOfficeStatic(THREE, root)
  assert.equal(module.root.parent, root)
  assert.equal(module.root.children.length, 2)
  module.dispose(); assert.equal(root.children.length, 0)
})

test('R1 fixture batches and point intensities follow independent interior and outdoor curves, invisible on clear day', () => {
  const root = new THREE.Group(), env = { indoorLevel: 0, night: 0 }, module = buildR1Lights({ THREE, root, layout, env })
  assert.ok(module.root.children.every(group => !group.visible))
  for (const level of [.2, .5, 1, 0]) {
    env.indoorLevel = level; env.night = level / 2
    module.root.traverse(o => { if (o.isLight) o.visible = false })
    module.onFrame()
    module.root.traverse(o => { if (o.isLight) { assert.equal(o.visible, true); assert.equal(o.intensity, o.userData.r1Light.intensity * (o.userData.r1Light.zone === '14' ? level / 2 : level)) } })
  }
  assert.ok(module.root.children.every(group => !group.visible))
  module.dispose()
  buildR1Lights({ THREE, root, layout: { r1Phase: 'L2B' } }); assert.equal(root.children.length, 0)
})

test('new fixtures clear registered routes; every source stays two metres from reception screen', () => {
  const screen = new THREE.Box3(new THREE.Vector3(-.5, -100, 8.9), new THREE.Vector3(4.5, 100, 9.1))
  for (const row of plan.fixtures) {
    const box = bounds(row)
    const gapX = Math.max(0, box.min.x - screen.max.x, screen.min.x - box.max.x), gapZ = Math.max(0, box.min.z - screen.max.z, screen.min.z - box.max.z)
    assert.ok(Math.hypot(gapX, gapZ) >= 2, row.id + ' screen')
    if (box.min.y >= 2.1) continue
    for (const route of layout.r1.data.routes) {
      const points = route.points_m.map(p => [p[0] - 26, 18 - p[1]])
      for (let i = 1; i < points.length; i++) {
        const clearance = pointSegment(row.position[0], row.position[2], points[i - 1], points[i]) - Math.hypot(row.size[0], row.size[2]) / 2
        assert.ok(clearance >= (box.max.y <= .3 ? 0 : .6), `${row.id} ${route.id}: ${clearance}`)
      }
    }
  }
  for (const row of plan.lights) assert.ok(screen.distanceToPoint(new THREE.Vector3(...row.position)) >= 2, row.id)
})

test('gate lamps stay outside lettering, opening and door parking zone', () => {
  const opening = new THREE.Box3(new THREE.Vector3(-1.5, 0, 17.8), new THREE.Vector3(5.5, 3.6, 18.4))
  const plates = [-1.75, 5.75].map(x => new THREE.Box3(new THREE.Vector3(x - .19, .9, 18.4), new THREE.Vector3(x + .19, 3.3, 18.5)))
  const gate = plan.fixtures.filter(row => row.kind === 'gate')
  assert.equal(gate.length, 4)
  for (const row of gate) {
    const box = bounds(row)
    assert.ok(box.min.z > 17.9)
    assert.ok(!box.intersectsBox(opening))
    for (const plate of plates) assert.ok(!box.intersectsBox(plate))
    assert.ok(box.max.y < 3.6)
  }
})

test('environment exposes existing curve read-only and guards only the legacy indoor light creation', () => {
  const source = readFileSync(new URL('../env.js', import.meta.url), 'utf8')
  assert.match(source, /get indoorLevel\(\) \{ return indoorLevel \}/)
  assert.doesNotMatch(source, /set indoorLevel/)
  assert.match(source, /if \(!r1Mode\) for \(const \[x, z\] of \[\[-15, -6\]/)
  assert.match(source, /indoorOn = Math.max\(smooth\(0.3, 0.8, night\), overcast \* 0.6\)/)
  assert.match(source, /indoorLevel = indoorOn/)
  assert.match(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), /startOfficeV3\(\{ THREE, scene, env: env3d, quality:/)
})
