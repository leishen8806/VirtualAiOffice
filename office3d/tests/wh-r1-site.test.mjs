import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { buildWhR1Site } from '../dr-wh-r1-site.js'
import { WH_R1_BUILDING, WH_R1_CAMERA_VIEWS, WH_R1_SITE, WH_R1_ZONES } from '../dr-wh-r1-zones.js'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_WORLD_OFFSET, whToWorld, whZoneToWorld } from '../wh-r1-layout.js'
import { WH_R1_ANNEX, WH_R1_DEVIATIONS, WH_R1_I7_ROWS, WH_R1_PARKING_BAYS, WH_R1_RESERVED_YARDS } from '../wh-r1-site-plan.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { normalizeCameraState, resolvePlaceMode } from '../place-mode.js'

const near = (actual, expected, message, tolerance = .005) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} !== ${expected}`)
const bounds = row => {
  const p = whToWorld(row.xM, row.yM), turn = Math.abs(row.yawDeg % 180) === 90, width = turn ? row.widthM : row.lengthM, depth = turn ? row.lengthM : row.widthM
  return { x0: p.x - width / 2, x1: p.x + width / 2, z0: p.z - depth / 2, z1: p.z + depth / 2 }
}
const gap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.z0 - a.z1, a.z0 - b.z1))

test('SITE uses one conversion offset and leaves the WH-R1 root at the origin', () => {
  assert.deepEqual(WH_R1_WORLD_OFFSET, { x: -64, z: 0 })
  assert.deepEqual(WH_R1_SITE, { x0: -238, x1: -72, z0: -74, z1: 42, width: 166, depth: 116 })
  assert.deepEqual(WH_R1_BUILDING, { x0: -232, x1: -144, z0: -18, z1: 30, width: 88, depth: 48 })
  for (const zone of WH_R1_DATA.zones.filter(row => row.id !== '14')) {
    const expected = zone.worldBboxXZ.map((value, index) => value + (index < 2 ? WH_R1_WORLD_OFFSET.x : WH_R1_WORLD_OFFSET.z))
    assert.deepEqual(whZoneToWorld(zone.sourceBboxM), expected, zone.id)
  }
  const prior = globalThis.location
  try {
    globalThis.location = { search: '?place=drlife-warehouse&whr1=1' }
    const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'low' }, layout: {} })
    registry.buildAll()
    assert.deepEqual(registry.root.position.toArray(), [0, 0, 0])
    assert.deepEqual(registry.summary().modules, ['wh-r1-shell', 'wh-r1-zones', 'wh-r1-site', 'wh-r1-racks', 'wh-r1-workflow', 'wh-r1-vehicles'])
    assert.deepEqual(registry.summary().skipped, [])
    registry.dispose()
  } finally { globalThis.location = prior }
})

test('SITE keeps source data immutable and records every approved deviation', () => {
  const source = readFileSync(new URL('../wh-r1/data.js', import.meta.url))
  assert.equal(createHash('sha256').update(source).digest('hex'), '946b7519a00d762a709b93442188a1cd83423aae37bb9404713583ee01d0fff0')
  assert.deepEqual(WH_R1_DEVIATIONS.map(row => row.id), ['WH-R1-WORLD-ORIGIN', 'WH-14-D-001', 'WH-R1-PARKING-BAYS', 'WH-14-LOGISTICS-GATE'])
  assert.ok(WH_R1_DEVIATIONS.every(row => row.date === '2026-10-31' && row.reason))
  assert.equal(WH_R1_DATA.elements.find(row => row.id === 'WH-01-VH-001').lengthM, 8)
})

test('SITE freezes nine 16.5 m bays with the approved clearances and no static intersection', () => {
  assert.equal(WH_R1_PARKING_BAYS.length, 9)
  assert.deepEqual(WH_R1_PARKING_BAYS.map(row => row.id), ['WH-01-VH-001', 'WH-01-VH-002', 'WH-01-VH-003', 'WH-01-VH-004', 'WH-01-VH-005', 'WH-06-VH-001', 'WH-06-VH-002', 'WH-06-VH-003', 'WH-06-VH-004'])
  const annexObstacles = [...WH_R1_ANNEX.walls.map(row => ({ ...row, category: '方案新增外墙' })), ...WH_R1_ANNEX.doors.map(row => ({ ...row, category: '方案新门静态占位' }))]
  const sourceObstacles = WH_R1_DATA.elements.filter(row => row.category !== '厢式货车' && row.collisionRole !== 'assembly_reference_only' && row.collisionRole !== 'nonphysical_control')
  const obstacles = [...sourceObstacles, ...annexObstacles]
  for (const bay of WH_R1_PARKING_BAYS) {
    assert.deepEqual([bay.lengthM, bay.widthM, bay.heightM], [16.5, 2.55, 4], bay.id)
    const box = bounds(bay), intersections = obstacles.filter(row => { const other = bounds(row); return Math.min(box.x1, other.x1) - Math.max(box.x0, other.x0) > .001 && Math.min(box.z1, other.z1) - Math.max(box.z0, other.z0) > .001 })
    assert.deepEqual(intersections, [], bay.id)
    const door = [...WH_R1_DATA.doors, ...WH_R1_ANNEX.doors].find(row => row.id === bay.doorId)
    near(gap(box, bounds(door)), .6, `${bay.id} door clearance`)
  }
  const north = WH_R1_PARKING_BAYS.slice(0, 5).sort((a, b) => a.xM - b.xM), east = WH_R1_PARKING_BAYS.slice(5).sort((a, b) => a.yM - b.yM)
  for (let index = 1; index < north.length; index++) near(gap(bounds(north[index - 1]), bounds(north[index])), 2.95, 'north neighbour')
  for (let index = 1; index < east.length; index++) near(gap(bounds(east[index - 1]), bounds(east[index])), 4.45, 'east neighbour')
})

test('SITE annex, I7 objects and planning yards are complete and collidable', () => {
  assert.deepEqual(WH_R1_ANNEX.bboxSource, [88, 12, 112, 42])
  assert.equal(WH_R1_ANNEX.walls.length, 7); assert.equal(WH_R1_ANNEX.doors.length, 4)
  assert.deepEqual(WH_R1_ANNEX.doors.map(row => row.id), ['R5-SHIP-D-1', 'R5-SHIP-D-2', 'R5-SHIP-D-3', 'R5-SHIP-D-4'])
  assert.ok(WH_R1_ANNEX.doors.every(row => row.sweep === 'UNKNOWN'))
  assert.equal(WH_R1_I7_ROWS.length, 69); assert.equal(WH_R1_RESERVED_YARDS.length, 2)
  assert.deepEqual(WH_R1_RESERVED_YARDS.map(row => row.bboxSource), [[-6, 74, 34, 104], [130, 12, 160, 42]])
  const root = new THREE.Group(), collision = createFurnitureCollision(), value = buildWhR1Site({ THREE, root, collision, quality: { tier: 'high' } })
  assert.deepEqual(value.root.getObjectByName('wh-r1-site-boxes').userData.groups, { fixtures: 32, annexWalls: 7, annexDoors: 4, bayEdges: 36 })
  assert.equal(value.root.children.filter(row => row.visible && !row.userData.collisionProxy && (row.isMesh || row.isInstancedMesh)).length, 5, 'labels are the optional sixth SITE draw call')
  assert.ok(collision.stats().bodies >= 60)
  for (const row of [...WH_R1_ANNEX.walls, ...WH_R1_ANNEX.doors]) { const p = whToWorld(row.xM, row.yM); assert.equal(collision.hit(p.x, p.z)?.group.userData.whR1Id, row.id, row.id) }
  value.dispose(); assert.equal(collision.stats().bodies, 0); assert.equal(root.children.length, 0)
})

test('SITE instance colors are readable by every material and match the registered design colors', () => {
  const expected = [
    ['wh-r1-site-boxes', WH_R1_I7_ROWS.find(row => row.category === '长椅').id, 0x725740],
    ['wh-r1-site-boxes', WH_R1_ANNEX.walls[0].id, 0x64767d],
    ['wh-r1-site-planes', WH_R1_RESERVED_YARDS[0].id, 0xe1bd61],
  ]
  for (const tier of ['high', 'low']) {
    const root = new THREE.Group(), value = buildWhR1Site({ THREE, root, quality: { tier } })
    for (const name of ['wh-r1-site-boxes', 'wh-r1-site-planes']) {
      const mesh = value.root.getObjectByName(name)
      if (mesh.material.vertexColors) assert.ok(mesh.geometry.getAttribute('color'), `${tier} ${name} 开启 vertexColors 时必须有顶点 color`)
    }
    for (const [name, id, hex] of expected) {
      const mesh = value.root.getObjectByName(name), index = mesh.userData.instanceToRegisterId.indexOf(id), actual = new THREE.Color()
      assert.ok(index >= 0, id); mesh.getColorAt(index, actual)
      const registered = new THREE.Color(hex)
      assert.ok(Math.max(Math.abs(actual.r - registered.r), Math.abs(actual.g - registered.g), Math.abs(actual.b - registered.b)) < 1e-6, `${tier} ${id} 实例色必须等于 #${hex.toString(16).padStart(6, '0')}`)
    }
    value.dispose()
  }
})

test('SITE changes only the explicit WH-R1 place metadata and clamps saved cameras to the new site', () => {
  const mode = resolvePlaceMode('?place=drlife-warehouse&whr1=1')
  assert.deepEqual(mode.miniBounds, WH_R1_SITE); assert.deepEqual(mode.zones, WH_R1_ZONES)
  assert.equal(mode.homeCamera.r, 132)
  assert.deepEqual(mode.cameraViews, WH_R1_CAMERA_VIEWS); assert.equal(WH_R1_CAMERA_VIEWS.length, 4)
  const inside = { az: 10, el: 40, r: 80, t: [-230, 0, -60] }
  assert.deepEqual(normalizeCameraState(inside, mode.homeCamera, mode.miniBounds), inside)
  assert.equal(normalizeCameraState({ ...inside, t: [-250, 0, -60] }, mode.homeCamera, mode.miniBounds), mode.homeCamera)
  assert.equal(resolvePlaceMode('?place=drlife-office').whr1, undefined)
  assert.equal(resolvePlaceMode('?place=drlife-warehouse').whr1, undefined)
  assert.equal(WH_R1_SITE.x1 - -40, -32)
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(app, /CAMPUS_MODE \? PLACE_MODE\.miniBounds : ENVELOPE/)
  assert.match(app, /for \(const zone of PLACE_MODE\.zones\)/)
  assert.match(app, /zones: PLACE_MODE\.zones/)
})
