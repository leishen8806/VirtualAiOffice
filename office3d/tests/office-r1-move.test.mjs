import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createR1Navigation, R1_RESERVED_SEATS, R1_PUBLIC_TRANSITIONS } from '../office-r1-navigation.js'
import { createR1Director } from '../office-r1-director.js'

const layout = () => ({ site: { x0: -5, x1: 5, z0: -5, z1: 5 }, regions: [], seats: {}, r1: { workstations: [], elements: [] } })
function box(c, id, x, z, width, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth)); mesh.position.set(x, .5, z); mesh.userData.r1Id = id; c.add(mesh, 'test'); return mesh
}
test('R1 uses real triangles at 0.6 m; existing collision default remains 0.22 m', () => {
  const c = createFurnitureCollision(), wall = box(c, 'wall', 0, 0, .2, 4), nav = createR1Navigation(layout()).attach(c)
  assert.equal(c.hit(.5, 0), null); assert.equal(nav.query({ x: .5, z: 0 }).group, wall)
  assert.equal(nav.query({ x: .71, z: 0 }), null)
  assert.throws(() => c.navigationHit(NaN, 0, .6), /Invalid/)
  c.translateNavigationBody(wall, 2, 0)
  assert.equal(c.hit(0, 0), null); assert.equal(c.hit(2, 0).group, wall)
})
test('R1 any-angle routing goes around the real wall and rejects blocked destinations', async () => {
  const c = createFurnitureCollision(); box(c, 'wall', 0, 0, .2, 4)
  const nav = createR1Navigation(layout()).attach(c); await nav.prepare()
  const start = { x: -3, z: 0 }, end = { x: 3, z: 0 }, route = nav.plan(start, end)
  assert.ok(route?.length > 2); assert.deepEqual(route[0], start); assert.deepEqual(route.at(-1), end)
  for (let i = 1; i < route.length; i++) assert.equal(nav.clear(route[i - 1], route[i]), true)
  const smoothed = nav.smoothPath(route)
  assert.deepEqual(smoothed[0], start); assert.deepEqual(smoothed.at(-1), end)
  for (let i = 1; i < smoothed.length; i++) assert.equal(nav.clear(smoothed[i - 1], smoothed[i]), true)
  assert.equal(nav.plan(start, { x: 0, z: 0 }), null)
  assert.deepEqual(R1_RESERVED_SEATS, ['08-CH-011', '08-CH-012', '08-CH-013'])
})
test('the owner exception is only the exact chair; all other chairs and the owner desk remain obstacles', () => {
  const l = layout(); l.seats.A = ['a', 0, -1, 0, { x: 0, z: 0, yaw: 0 }]
  l.r1.workstations = [{ business_id: 'A', desk_id: 'desk', chair_id: 'chair' }]
  const c = createFurnitureCollision(), desk = box(c, 'desk', 0, -.81, 1.4, .7), chair = box(c, 'chair', 0, 0, .62, .6), other = box(c, 'other', 2, 0, .62, .6)
  const nav = createR1Navigation(l).attach(c)
  assert.equal(nav.query({ x: 0, z: .3 }, 'A'), null)
  assert.equal(nav.query({ x: 0, z: .3 }).group, chair)
  assert.equal(nav.query({ x: 0, z: -.5 }, 'A').group, desk)
  assert.equal(nav.query({ x: 2, z: 0 }, 'A').group, other)
  assert.ok(nav.parameters.get('A').exit.distance <= 1.2)
  assert.equal(nav.parameters.get('A').slide, .8)
})

test('replanning avoids people without changing the static walk radius; clear-raster shortcuts remain collision free', async () => {
  const c = createFurnitureCollision(); box(c, 'wall', 0, 1, .2, 3)
  const nav = createR1Navigation(layout()).attach(c); await nav.prepare()
  const person = { x: 0, z: -2 }, route = nav.plan({ x: -3, z: -2 }, { x: 3, z: -2 }, null, [person])
  assert.ok(route?.length > 2)
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((person.x - a.x) * dx + (person.z - a.z) * dz) / (dx * dx + dz * dz)))
    assert.ok(Math.hypot(person.x - a.x - t * dx, person.z - a.z - t * dz) >= .5 - 1e-7)
  }
  let seed = 781
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 300; i++) {
    const a = { x: random() * 8 - 4, z: random() * 8 - 4 }, b = { x: random() * 8 - 4, z: random() * 8 - 4 }
    if (!nav.lineClear(a, b)) continue
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .01)
    for (let j = 0; j <= n; j++) assert.equal(nav.query({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n }), null)
  }
})

test('optimized navigation capsules exactly match the original triangle solver, including slopes and moving poses', () => {
  const c = createFurnitureCollision(), mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 1))
  mesh.position.set(.2, .9, -.3); mesh.rotation.set(.31, .47, -.19); c.add(mesh, 'sloped fixture')
  const wall = box(c, 'thin wall', 1.5, 0, .02, 3)
  let seed = 591
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let phase = 0; phase < 3; phase++) {
    c.poseNavigationBody(mesh, { x: .2, z: -.3 }, phase * .15, 0, phase * .4)
    for (let i = 0; i < 10000; i++) {
      const x = random() * 5 - 2.5, z = random() * 5 - 2.5, radius = [.22, .24, .25, .6][i % 4], ignored = i % 7 ? null : new Set([wall])
      assert.equal(c.navigationHit(x, z, radius, ignored)?.group, c.hit(x, z, ignored, radius)?.group, `${phase}/${i}: ${x},${z},r=${radius}`)
    }
  }
})

test('public seats use a 0.25 m body and exclude only their chair during the last segment and return through the same transition', async () => {
  const l = layout(), home = { x: 0, z: 0, yaw: 0 }; l.seats.A = ['a', 0, -.81, 0, home]
  l.r1.workstations = [{ business_id: 'A', desk_id: 'desk', chair_id: 'chair' }]
  const c = createFurnitureCollision(); box(c, 'desk', 0, -.81, 1.4, .7); const chair = box(c, 'chair', 0, 0, .62, .6)
  box(c, 'public-chair', 2, 2, .62, .6); box(c, 'public-table', 2, 1.19, 1.4, .7)
  let dx = 0, dz = 0, yaw = 0
  const furniture = { chairFacings: new Map([['public-chair', { table: 'public-table', yaw: Math.PI }]]), moveChair(id, x, z, angle) {
    const changed = x !== dx || z !== dz || angle !== yaw; dx = x; dz = z; yaw = angle; c.poseNavigationBody(chair, home, x, z, angle); return changed
  }, chairMotion: () => ({ dx, dz, yaw }) }
  const v = { name: 'nickname', data: { name: 'A' }, home, char: { group: new THREE.Group(), pose: { sit: 1, phase: 0 } } }, views = new Map([['A', v]])
  const director = createR1Director({ views, layout: l, furnitureCollision: c, r1Furniture: furniture, r1Doors: { records: [] } })
  await director.ready
  let arrived = false, returned = false
  assert.equal(director.travel(v, [], { id: 'public-chair', x: 2, z: 2, yaw: 0 }, true, () => { arrived = true }), true)
  for (let i = 0; i < 3000 && !arrived; i++) director.update(1 / 30)
  assert.equal(arrived, true)
  assert.deepEqual(director.publicTransitions.get('public-chair').excluded, ['public-chair'])
  // 0.65 m behind the fully open chair is clear; a 1.04 m centre-radius approximation is not.
  views.set('bystander', { name: 'bystander', home: { x: 0, z: 1.75 }, char: { group: new THREE.Group(), pose: {} } })
  const plan = director.navigation.plan; let returnPlans = 0
  director.navigation.plan = (...args) => { returnPlans++; assert.ok(Math.abs(dz - director.navigation.parameters.get('A').slide) < 1e-9, 'plan after the return chair finishes sliding'); return plan(...args) }
  assert.equal(director.travel(v, [], home, false, () => { returned = true }), true)
  for (let i = 0; i < 3000 && !returned; i++) director.update(1 / 30)
  assert.equal(returned, true); assert.ok(returnPlans > 0); assert.equal(v.char.pose.r1AtDesk, true)
  assert.ok(Math.hypot(dx, dz) < 1e-9); assert.equal(yaw, 0)
  assert.equal(director.travel(v, [], { id: '08-CH-011', x: 1, z: 1 }, true), false)
})

test('R6 freezes all 63 public paths and the four approved sofa point lists and limits', () => {
  assert.equal(Object.keys(R1_PUBLIC_TRANSITIONS).length, 63)
  const sofaPaths = {"12-SF-001": [[14.039365, 12.400265], [14.409738692692903, 12.551338914892755], [15.4, 11.775]], "12-SF-002": [[14.518558, 14.814065], [14.789034554390293, 14.519374597161436], [15.4, 11.775]], "12-SF-003": [[17.025029, 15.08122], [16.833645159613894, 14.729976173521775], [16.6, 11.775]], "12-SF-004": [[17.960623, 12.757641], [17.57043111283354, 12.845676738137861], [16.6, 11.775]]}
  for (const [id, path] of Object.entries(R1_PUBLIC_TRANSITIONS)) {
    assert.ok(Object.isFrozen(path) && path.every(Object.isFrozen))
    const length = path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0)
    assert.ok(length <= 3.5, id)
    if (sofaPaths[id]) {
      assert.deepEqual(path.map(p => [p.x, p.z]), sofaPaths[id])
      assert.ok(length <= [1.66, 3.22, 3.37, 1.85][Number(id.slice(-3)) - 1])
    }
  }
})


test('moving a workstation chair invalidates cached visible edges and preserves exact owner exclusion', async () => {
  const l = layout(), c = createFurnitureCollision()
  for (const [id, x] of [['A', -2], ['B', 2]]) {
    l.seats[id] = ['a', x, -.81, 0, { x, z: 0, yaw: 0 }]
    l.r1.workstations.push({ business_id: id, desk_id: `${id}-desk`, chair_id: `${id}-chair` })
    box(c, `${id}-desk`, x, -.81, 1.4, .7); box(c, `${id}-chair`, x, 0, .62, .6)
  }
  const nav = createR1Navigation(l).attach(c); await nav.prepare()
  const from = { x: -3.5, z: 2 }, to = { x: 3.5, z: 2 }
  assert.equal(nav.plan(from, to, 'A').length, 2)
  c.translateNavigationBody(nav.bodyFor('B-chair').group, 0, 1.6); nav.refreshChairs()
  const moved = nav.plan(from, to, 'A'); assert.ok(moved?.length > 2)
  for (let i = 1; i < moved.length; i++) {
    const a = moved[i - 1], b = moved[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .005)
    for (let j = 0; j <= n; j++) assert.equal(nav.query({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n }, 'A'), null)
  }
  c.translateNavigationBody(nav.bodyFor('B-chair').group, 0, -1.6); nav.refreshChairs()
  assert.equal(nav.plan(from, to, 'A').length, 2)
})


test('a person sealing a destination pocket rejects that trip without rejecting the reopened route', async () => {
  const c = createFurnitureCollision()
  box(c, 'right', 3, 0, .1, 2.4)
  box(c, 'top', 2, -1.2, 2, .1); box(c, 'bottom', 2, 1.2, 2, .1)
  box(c, 'door-left', 1, -.975, .1, .45); box(c, 'door-right', 1, .975, .1, .45)
  const nav = createR1Navigation(layout()).attach(c); await nav.prepare()
  const start = { x: -3, z: 0 }, end = { x: 2, z: 0 }
  for (const [from, to] of [[start, end], [end, start]]) {
    const path = nav.plan(from, to); assert.ok(path)
    assert.deepEqual(path[0], from); assert.deepEqual(path.at(-1), to)
    for (let i = 1; i < path.length; i++) assert.equal(nav.lineClear(path[i-1], path[i]), true)
  }
  assert.equal(nav.plan(start, end, undefined, [{ x: 1, z: 0 }]), null)
  assert.ok(nav.plan(start, end, undefined, [{ x: -2, z: 2 }]))
})
