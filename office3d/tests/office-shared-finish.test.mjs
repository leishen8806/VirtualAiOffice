import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V2, workHome, createOfficeNavigation } from '../office-layout.js'
import { officeSeats } from '../office-v2-modules.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { buildOfficePlazaHost } from '../office-vis2/plaza-host.js'
import { createDirector } from '../director.js'

test('shared takeover: V3 preserves all 25 workstation mappings and distinct conversation positions', () => {
  assert.deepEqual(officeSeats(LAYOUT_V3), LAYOUT_V3.seats)
  assert.equal(Object.keys(officeSeats(LAYOUT_V3)).length, 25)
  assert.deepEqual(officeSeats(LAYOUT_V2), LAYOUT_V2.seats)
  const nav = createOfficeNavigation(LAYOUT_V3)
  for (const seat of Object.values(LAYOUT_V3.seats)) {
    const home = workHome(seat), stand = nav.standAt(home)
    assert.ok(Math.hypot(stand.x - home.x, stand.z - home.z) >= .52)
  }
})

test('shared takeover: all 25 exits use finite V3 public paths outside furniture and rooms', () => {
  const n = createOfficeNavigation(LAYOUT_V3), center = LAYOUT_V3.bar.center
  for (const seat of Object.values(LAYOUT_V3.seats)) {
    const exit = n.officeExit(workHome(seat)), path = n.corridorPath(exit.at(-1), n.ENTRANCE.inner)
    assert.deepEqual(path.at(-1), n.ENTRANCE.inner)
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .05)
      for (let k = 0; k <= steps; k++) {
        const t = steps ? k / steps : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
        assert.ok(Number.isFinite(x) && Number.isFinite(z))
        assert.ok(Math.hypot(x - center.x, z - center.z) >= 6.27)
        for (const box of [...LAYOUT_V3.regions, LAYOUT_V3.frontDesk, LAYOUT_V3.waitingArc, LAYOUT_V3.serviceBar]) assert.ok(!(x > box.x0 - .27 && x < box.x1 + .27 && z > box.z0 - .27 && z < box.z1 + .27))
      }
    }
    assert.ok(n.officeTrip(n.ENTRANCE.gate[1], workHome(seat), workHome(seat)).every(p => Number.isFinite(p.x) && Number.isFinite(p.z)))
  }
  assert.throws(() => n.corridorPath({ x: 2, z: -19 }, n.ENTRANCE.inner))
  assert.throws(() => n.corridorPath({ x: 9, z: 14 }, n.ENTRANCE.inner))
})

test('shared takeover: collision add is idempotent and remove clears its geometry only', () => {
  const c = createFurnitureCollision(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  mesh.position.y = .5
  c.add(mesh, 'test'); const first = c.stats()
  c.add(mesh, 'test'); assert.equal(c.stats().bodies, 1); assert.equal(c.stats().triangles, first.triangles)
  assert.ok(c.hit(.5, 0)); assert.equal(c.remove(mesh), true); assert.equal(c.remove(mesh), false)
  assert.equal(c.hit(.5, 0), null); assert.equal(c.stats().triangles, 0)
  mesh.geometry.dispose(); mesh.material.dispose()
})

test('shared takeover: plaza gates, collision ownership, ray hits and repeated teardown', () => {
  for (const search of ['', '?officeSample=0', '?officeSample=1&officeSample=1']) {
    const root = new THREE.Group(), c = createFurnitureCollision()
    buildOfficePlazaHost({ THREE, root, layout: LAYOUT_V3, search, collision: c }).dispose()
    assert.equal(root.children.length, 0); assert.equal(c.stats().bodies, 0)
  }
  const root = new THREE.Group(), c = createFurnitureCollision()
  for (let i = 0; i < 3; i++) {
    const module = buildOfficePlazaHost({ THREE, root, layout: LAYOUT_V3, search: '?officeSample=1', collision: c })
    assert.equal(c.stats().bodies, module.placements.length)
    assert.ok(module.placements.length >= 15)
    const p = module.placements[0], ray = new THREE.Raycaster(new THREE.Vector3(p.x, 10, p.z), new THREE.Vector3(0, -1, 0))
    root.updateMatrixWorld(true)
    assert.equal(module.pick(ray)?.id, p.id)
    assert.ok(c.hit(p.bounds.x0, p.z))
    root.visible = false; assert.equal(module.pick(ray), null); root.visible = true
    module.dispose(); module.dispose()
    assert.equal(c.stats().bodies, 0); assert.equal(c.stats().triangles, 0); assert.equal(root.children.length, 0)
  }
})

test('shared takeover: V3 arrival admission prevents six actors spawning at the same doorway', () => {
  const actors = Object.entries(LAYOUT_V3.seats).filter(([, s]) => s[0] === 'eng').slice(0, 6).map(([id, seat]) => {
    const home = workHome(seat), group = new THREE.Group(); group.position.set(home.x, 0, home.z)
    return { id, name: id, home, char: { group, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } }, act: null }
  })
  assert.equal(actors.length, 6)
  const d = createDirector({ layout: LAYOUT_V3, views: new Map(actors.map(a => [a.id, a])), board: {}, layer: {}, project: {} })
  actors.forEach(a => assert.equal(d.arrive(a), true))
  assert.ok(actors.every(a => a.away && !a.char.group.visible))
  let min = Infinity, frames = 0
  for (; frames < 3600 && actors.some(a => a.act); frames++) {
    d.update(1 / 30)
    const visible = actors.filter(a => !a.away)
    for (let i = 0; i < visible.length; i++) for (const b of visible.slice(i + 1)) min = Math.min(min, visible[i].char.group.position.distanceTo(b.char.group.position))
  }
  assert.ok(min >= .52 - 1e-6)
  assert.equal(d.stats().active, 0); assert.equal(d.stats().abandons, 0); assert.equal(d.stats().timeouts, 0)
  actors.forEach(a => assert.ok(Math.hypot(a.char.group.position.x - a.home.x, a.char.group.position.z - a.home.z) < .01))
})
