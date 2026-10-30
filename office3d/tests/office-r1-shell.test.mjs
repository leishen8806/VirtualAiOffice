import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B, SEATS as LEGACY_SEATS, createOfficeNavigation, resolveOfficeLayout, workHome } from '../office-layout.js'
import { officeSeats } from '../office-v2-modules.js'
import { officeV3Modules, officeV3ModulesFor } from '../office-v3-modules.js'
import { buildR1Shell, r1CornerSpec, r1FrontHeight, r1WallPlan } from '../office-vis2/r1-shell.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { createDirector } from '../director.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const R1_SEARCH = '?place=drlife-office&layout=3&align=1&officeSample=1&r1=1'
const r1 = () => resolveOfficeLayout(R1_SEARCH)

test('I2 resolves only the strict sample r1 switch and preserves every other sample entry', () => {
  assert.equal(r1().r1Phase, 'R1')
  assert.equal(Object.keys(r1().seats).length, r1().r1.workstations.length)
  for (const search of ['?layout=3&align=1&officeSample=1', '?layout=3&align=1&officeSample=1&r1=0', '?layout=3&align=1&officeSample=1&r1=1&r1=1']) {
    assert.equal(resolveOfficeLayout(search), LAYOUT_V3_ALIGN_L2B, search)
  }
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=0&r1=1'), LAYOUT_V3_ALIGN)
})

test('I2 excludes the old north garden only for the same strict R1 query', () => {
  const env = readFileSync(new URL('../env.js', import.meta.url), 'utf8')
  assert.match(env, /export const r1EnvironmentRequested = \(search = ''\) => \{[\s\S]*params\.getAll\('layout'\)\.length === 1[\s\S]*params\.getAll\('r1'\)\.length === 1 && params\.get\('r1'\) === '1'[\s\S]*\}/)
  assert.match(env, /if \(!r1Mode\) \{[\s\S]*north-garden-\$\{String\(i \+ 1\)\.padStart\(2,'0'\)\}/)
})

test('I3 retains the old V3 module order and isolates R1 to its shell and furniture slots', () => {
  assert.deepEqual(officeV3Modules.map(([name]) => name), ['shell3', 'furniture3', 'island', 'zones', 'plaza', 'displayDepartments', 'displayStaff'])
  assert.deepEqual(officeV3ModulesFor(LAYOUT_V3_ALIGN_L2B).map(([name]) => name), officeV3Modules.map(([name]) => name))
  // r1Books（OFFICE-R1-FOOD 补充 R2 的书架书籍）插在 r1Decor 与 r1Plaza 之间，非 R1 入口照旧取不到。
  assert.deepEqual(officeV3ModulesFor(r1()).map(([name]) => name), ['shell3', 'furniture3', 'r1Island', 'r1Plants', 'r1Doors', 'r1Lounge', 'r1Decor', 'r1Books', 'r1Plaza', 'r1Lights', 'r1Brand'])
})

test('MOVE preserves registered seats and old navigation while exposing R1 destinations', () => {
  const layout = r1(), nav = createOfficeNavigation(layout), home = { x: 1, z: 2 }
  assert.equal(Object.keys(officeSeats(layout)).length, layout.r1.workstations.length)
  assert.deepEqual(officeSeats(layout), layout.seats)
  assert.equal(nav.ready(), false); assert.equal(nav.prepared(), false)
  assert.throws(() => nav.plan(home, { x: 4, z: 5 }), /not attached/)
  assert.equal(nav.LOUNGE_SEATS.filter(s => s.meeting).length, 14)
  assert.equal(nav.LOUNGE_SEATS.some(s => ['08-CH-011', '08-CH-012', '08-CH-013'].includes(s.id)), false)
  assert.deepEqual(nav.standAt(home), home); assert.deepEqual(nav.consumerQueues, { waiting: [] })
  const frozen = createOfficeNavigation(LAYOUT_V3_ALIGN_L2B), legacyHome = workHome(LAYOUT_V3_ALIGN_L2B.seats.OpsLead)
  const snapshot = { seats: LAYOUT_V3_ALIGN_L2B.seats, entrance: frozen.ENTRANCE, lounge: frozen.LOUNGE_SEATS, queues: frozen.consumerQueues, exit: frozen.officeExit(legacyHome), corridor: frozen.corridorPath(legacyHome, frozen.ENTRANCE.inner), stand: frozen.standAt(legacyHome) }
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), '20225f85b3da10410659dbba819f3465b9db5aa2909b158f70b2725f14a5ba54')
  assert.deepEqual(officeSeats(LAYOUT_V3_ALIGN_L2B), Object.fromEntries(Object.keys(LEGACY_SEATS).map(name => [name, LAYOUT_V3_ALIGN_L2B.seats[name]])))
})

test('I3 registers all workstation seats with the candidate C-01 coordinates and runtime-facing yaw', () => {
  const candidate = createOfficeR1Layout(), base = createOfficeR1Layout({ candidateC01: false })
  assert.equal(Object.keys(candidate.seats).length, candidate.r1.workstations.length)
  assert.deepEqual(Object.values(candidate.seats).map(seat => seat[0]).reduce((counts, group) => ({ ...counts, [group]: (counts[group] || 0) + 1 }), {}), { product: 12, drlife: 10, ops: 8 })
  for (const station of candidate.r1.workstations) {
    const seat = candidate.seats[station.business_id], home = seat[4]
    assert.ok(seat, station.business_id)
    assert.ok(Math.abs(seat[1] - (station.xM - 26)) < 1e-9); assert.ok(Math.abs(seat[2] - (18 - station.yM)) < 1e-9)
    assert.ok(Math.abs(home.x - (station.chairXM - 26)) < 1e-9); assert.ok(Math.abs(home.z - (18 - station.chairYM)) < 1e-9)
    const facing = { x: -Math.sin(home.yaw), z: -Math.cos(home.yaw) }
    assert.ok(facing.x * (seat[1] - home.x) + facing.z * (seat[2] - home.z) > 0, station.business_id)
  }
  assert.notDeepEqual(candidate.seats.Architect, base.seats.Architect)
})

const r1Assets = THREE => ({ furn: Object.fromEntries(['desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded', 'computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1'].map(name => {
  const group = new THREE.Group()
  for (const [name, color] of [['wood', 0xcdbb9c], ['metal', 0xc7cbcf]]) group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ name, color })))
  return [name, group]
})) })
const r1PlaceFurniture = THREE => (_A, name, x, z, { y = 0, rotY = 0 } = {}) => {
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  mesh.position.y = .5; group.add(mesh); group.position.set(x, y, z); group.rotation.y = rotY
  return { group, size: new THREE.Vector3(1, 1, 1), name }
}

test('I3 furniture bakes mapped assets into a few meshes, exposes desks and registers real-geometry collision', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const deskGroups = [], originalAdd = collision.add
  collision.add = (group, category) => { if (category === '办公桌') deskGroups.push(group); return originalAdd(group, category) }
  const calls = [], placeFurniture = (_A, ...args) => { calls.push({ name: args[0], x: args[1], z: args[2], options: args[3] }); return r1PlaceFurniture(THREE)(_A, ...args) }
  const furniture = buildR1Furniture({ THREE, root, layout, collision, A: r1Assets(THREE), placeFurniture, makeScreenTexture: () => ({ ctx: {}, tex: { dispose() {} } }) })
  root.updateMatrixWorld(true)
  assert.ok(Object.keys(furniture.instanceIds).length >= 10)
  // I6 起区 14 的室外长椅由 r1-plaza.js 重建，I3 不再画它的素色方块。
  assert.equal(Object.values(furniture.instanceIds).flat().length, layout.r1.elements.filter(item => ['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '书架', '共享显示站', '协作桌', '咖啡台', '弧形接待台', '弧形座段', '弧形沙发段', '室外长椅', '吧凳'].includes(item.category) && !(item.regionId === '07' && ['吧凳', '弧形座段'].includes(item.category)) && item.id !== '11-CT-001' && !(item.regionId === '12' && item.category === '弧形沙发段') && !(item.regionId === '14' && item.category === '室外长椅')).length)
  for (const asset of ['chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded', 'computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1']) assert.ok(calls.some(call => call.name === asset), asset)
  // R5 replaces only the office desk geometry; keep every other mapped asset and collision assertion.
  assert.equal(calls.filter(call => call.name === 'desk').length, 0)
  assert.equal(deskGroups.length, 78)
  for (const group of deskGroups) {
    const item = layout.r1.elements.find(item => item.id === group.userData.r1Id), box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), yaw = -item.yawDeg * Math.PI / 180
    assert.equal(group.children.length, 4, item.id)
    assert.deepEqual(group.children.map(mesh => { const p = mesh.geometry.parameters; return [p.width, p.height, p.depth] }), [[1.4, .03, .7], [.025, .72, .7], [.025, .72, .7], [1.35, .4, .018]])
    assert.ok(Math.abs(center.x - (item.xM - 26)) < 1e-6); assert.ok(Math.abs(center.z - (18 - item.yM)) < 1e-6)
    assert.ok(Math.abs(size.x - (Math.abs(Math.cos(yaw)) * item.lengthM + Math.abs(Math.sin(yaw)) * item.widthM)) < 1e-6)
    assert.ok(Math.abs(size.z - (Math.abs(Math.sin(yaw)) * item.lengthM + Math.abs(Math.cos(yaw)) * item.widthM)) < 1e-6)
    assert.ok(Math.abs(box.min.y) < 1e-6); assert.ok(Math.abs(box.max.y - item.heightM) < 1e-6)
    assert.ok(collision.hit(center.x, center.z), item.id)
  }
  assert.ok(root.getObjectByName('r1-furniture-wood')); assert.ok(root.getObjectByName('r1-furniture-fabric')); assert.ok(root.getObjectByName('r1-furniture-screen'))
  for (const seat of Object.values(layout.seats)) assert.ok(furniture.deskAt(seat[1], seat[2]))
  for (const station of layout.r1.workstations) {
    const chair = r1ToWorld(station.chairXM, station.chairYM)
    assert.ok(furniture.chairAt(chair.x, chair.z)?.children.some(child => child.isMesh), station.business_id)
    assert.ok(furniture.itemBounds.get(station.chair_id)?.isBox3, station.chair_id)
  }
  const solid = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '吧凳'])
  const solidItems = layout.r1.elements.filter(item => solid.has(item.category) && !(item.category === '吧凳' && item.regionId === '07'))
  for (const item of solidItems) assert.ok(collision.hit(item.xM - 26, 18 - item.yM), item.id)
  assert.equal(collision.stats().bodies, solidItems.length)
  for (const station of layout.r1.workstations) {
    const chair = r1ToWorld(station.chairXM, station.chairYM), home = layout.seats[station.business_id][4]
    const call = calls.find(value => value.name === 'chairDesk' && value.x === chair.x && value.z === chair.z)
    assert.ok(call, station.business_id); assert.ok(Math.abs(call.options.rotY - (home.yaw + Math.PI)) < 1e-9, station.business_id)
  }
  furniture.dispose()
})

test('MOVE refuses to create an R1 director without the real collision and furniture wiring', () => {
  assert.throws(() => createDirector({ views: new Map(), board: {}, layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} }, layout: r1() }), /requires real collision, furniture and doors/)
})

test('I2 R3 selects R1 miniBounds without altering the non-R1 minimap expression', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(app, /const MINI = DR_MODE \? PLACE_MODE\.miniBounds : OFFICE_LAYOUT\.r1Phase === 'R1' \? OFFICE_LAYOUT\.miniBounds : MINI_BOUNDS/)
  assert.deepEqual(r1().miniBounds, { x0: -38, x1: 42, z0: -31, z1: 44 })
})

test('I2 carries all registered wall and face identities through the R1 shell plan', () => {
  const plan = r1WallPlan(r1()), ids = new Set([...plan.straight.map(wall => wall.id), ...plan.front.map(wall => wall.id)])
  assert.equal(ids.size, 44); assert.equal(r1().r1.data.wallFaces.length, 88)
  assert.ok(plan.straight.every(wall => wall.faceIds.length === 2))
  assert.deepEqual(r1CornerSpec.southeast, { center: [24.3, 32.5], radius: 1.5, from: [24.3, 31], to: [25.8, 32.5] })
  assert.deepEqual(r1CornerSpec.southwest, { center: [31.7, 32.5], radius: 1.5, from: [30.2, 32.5], to: [31.7, 31] })
  const door = r1().r1.data.doors.find(value => value.id === '03-D-001')
  assert.ok(Math.abs((door.yM - door.lengthM / 2) - r1CornerSpec.southeast.to[1] - .1) < 1e-9)
})

test('I2 front profile is symmetric, continuous and bounded by the approved heights', () => {
  const walls = r1().r1.data.walls
  for (const x of [0, 3, 6, 12, 18, 21, 24.5, 28, 31.5, 35, 38, 44, 50, 53, 56]) {
    assert.ok(Math.abs(r1FrontHeight(x, walls) - r1FrontHeight(56 - x, walls)) < 1e-9, x)
    assert.ok(r1FrontHeight(x, walls) >= 1.2 && r1FrontHeight(x, walls) <= 4.5, x)
  }
  assert.equal(r1FrontHeight(0, walls), 4.5); assert.equal(r1FrontHeight(56, walls), 4.5)
  assert.equal(r1FrontHeight(21, walls), 1.2); assert.equal(r1FrontHeight(35, walls), 1.2)
})

const withCanvas = callback => {
  const oldDocument = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillText() {}, set fillStyle(_) {}, set font(_) {}, set textAlign(_) {} }) }) }
  try { return callback() } finally { globalThis.document = oldDocument }
}

const closedMesh = mesh => {
  const counts = new Map(), index = mesh.geometry.index.array
  for (let at = 0; at < index.length; at += 3) {
    for (const [a, b] of [[index[at], index[at + 1]], [index[at + 1], index[at + 2]], [index[at + 2], index[at]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  assert.ok([...counts.values()].every(count => count === 2))
}

test('I2 R4 makes the real collision engine block every registered wall sample but leave door centres clear', () => withCanvas(() => {
  const root = new THREE.Group(), collision = createFurnitureCollision(), layout = r1()
  const shell = buildR1Shell({ THREE, root, layout, collision }); root.updateMatrixWorld(true)
  let samples = 0
  for (const wall of layout.r1.data.walls) {
    for (let index = 1; index < wall.geometry.points.length; index++) {
      const [a, b] = [wall.geometry.points[index - 1], wall.geometry.points[index]]
      for (const fraction of [.25, .5, .75]) {
        samples++
        assert.ok(collision.hit(a[0] + (b[0] - a[0]) * fraction - 26, 18 - a[1] - (b[1] - a[1]) * fraction), `${wall.id}@${fraction}`)
      }
    }
  }
  assert.equal(samples, 624)
  for (const door of layout.r1.data.doors) assert.equal(collision.hit(door.xM - 26, 18 - door.yM), null, door.id)
  assert.equal(collision.hit(2, 18 - 31.5), null, '00-D-001 centre')
  assert.equal(collision.stats().contacts, samples)
  shell.dispose()
}))

test('I2 R4 keeps the identity ledger addressable and batches its zones and closed wall solids', () => withCanvas(() => {
  const root = new THREE.Group(), collision = createFurnitureCollision()
  const shell = buildR1Shell({ THREE, root, layout: r1(), collision }); root.updateMatrixWorld(true)
  assert.equal(root.children[0].name, 'r1-shell-root')
  assert.equal(root.children[0].userData.dynamic, true)
  assert.equal(shell.wallLedger.wallIds.length, 44); assert.equal(shell.wallLedger.faceIds.length, 88)
  const front = root.getObjectByName('r1-collision-front'), corners = root.getObjectByName('r1-corner-walls')
  assert.equal(front.material.side, THREE.FrontSide); closedMesh(front); closedMesh(corners)
  const normal = front.geometry.attributes.normal, position = front.geometry.attributes.position
  for (let index = 0; index < position.count; index += 4) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index), b = new THREE.Vector3().fromBufferAttribute(position, index + 1), c = new THREE.Vector3().subVectors(a, b)
    const face = new THREE.Vector3().subVectors(new THREE.Vector3().fromBufferAttribute(position, index + 2), b).cross(c).normalize()
    for (let vertex = 0; vertex < 4; vertex++) assert.ok(Math.abs(face.dot(new THREE.Vector3().fromBufferAttribute(normal, index + vertex))) > Math.cos(Math.PI / 36))
    assert.ok(Math.abs(position.getY(index + 2) - r1FrontHeight(position.getX(index + 2) + 26, r1().r1.data.walls)) <= .001)
  }
  const zones = root.getObjectByName('r1-zones')
  assert.equal(zones.children.length, 2); assert.equal(root.getObjectByName('r1-zones-ground').userData.zoneIds['14'].count, 4); assert.equal(root.getObjectByName('r1-zone-labels').userData.zoneIds.length, 13)
  shell.dispose()
}))
