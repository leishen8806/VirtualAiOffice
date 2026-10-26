import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { buildCampusWorkstations, B3_WORKSTATION_PLAN } from '../dr-campus-workstations.js'
import { buildCampusRacks } from '../dr-campus-racks.js'
import { buildCampusMotion } from '../dr-campus-motion.js'
import { createDemoCampusEventSource } from '../dr-campus-motion-logic.js'

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const gap = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.z0 - b.z1, b.z0 - a.z1, 0))
const bounds = item => ({ x0: item.x0, x1: item.x1, z0: item.z0, z1: item.z1 })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= .01, `${actual} ~= ${expected}`)
const canvasTex = (width, height, draw) => {
  draw({ fillRect() {}, strokeRect() {}, fillText() {}, set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set font(value) {}, set textAlign(value) {} }, width, height)
  return new THREE.Texture()
}
const layout = { zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP, campus: { x0: -174, x1: -65, z0: -33, z1: 42 } }
const instanceBox = (root, mesh, index) => {
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(index, matrix)
  mesh.geometry.computeBoundingBox()
  return new THREE.Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld.clone().multiply(matrix))
}
const items = (mesh, root) => Array.from({ length: mesh.count }, (_, index) => instanceBox(root, mesh, index))
const distanceToSegment = (point, from, to) => {
  const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length2))
  return Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t))
}

test('B3 approved workstation plan fixes all approved dimensions and corridors', () => {
  const plan = B3_WORKSTATION_PLAN
  assert.equal(plan.qualityTables.length, 6)
  assert.equal(plan.pickingRacks.length, 8)
  assert.equal(plan.packingBenches.length, 10)
  for (const table of plan.qualityTables) { close(table.x1 - table.x0, 2.4); close(table.z1 - table.z0, 1.2) }
  for (const rack of plan.pickingRacks) { close(rack.x1 - rack.x0, 4); close(rack.z1 - rack.z0, .6) }
  for (const bench of plan.packingBenches) { close(bench.x1 - bench.x0, 2.4); close(bench.z1 - bench.z0, .9) }
  assert.deepEqual(plan.packingBenches.slice(0, 5).map(item => [item.z0, item.z1]), Array.from({ length: 5 }, () => [5, 5.9]))
  assert.deepEqual(plan.packingBenches.slice(5).map(item => [item.z0, item.z1]), Array.from({ length: 5 }, () => [7.4, 8.3]))
  assert.deepEqual(plan.corridors.find(item => item.id === 'PK-OP-01'), { id: 'PK-OP-01', kind: 'packing-operator-aisle', x0: -124.2, x1: -110.2, z0: 5.9, z1: 7.4 })
  assert.deepEqual(plan.corridors.find(item => item.id === 'P-FORK-01'), { id: 'P-FORK-01', kind: 'forklift-cross-aisle', x0: -148.7, x1: -105.3, z0: 11.2, z1: 14.7 })
})

test('B3 facilities have zero overlap and meet approved conveyor, shipping, and boundary clearances', () => {
  const plan = B3_WORKSTATION_PLAN
  const facilities = [...plan.qualityTables, plan.staging, ...plan.pickingRacks, ...plan.packingBenches]
  for (let index = 0; index < facilities.length; index++) for (const other of facilities.slice(index + 1)) assert.equal(overlap(facilities[index], other), false, `${facilities[index].id}/${other.id}`)
  const connectorSafety = { x0: -130.5, x1: -124.5, z0: 2.5, z1: 10.5 }
  for (const bench of plan.packingBenches) assert.equal(overlap(bench, connectorSafety), false, bench.id)
  close(gap(plan.packingBenches[0], connectorSafety), .3)
  const dispatch = plan.corridors.find(item => item.id === 'PK-DISPATCH-01')
  close(gap(plan.packingBenches[4], dispatch), 1.2)
  const f04Safety = { x0: -149.5, x1: -127.5, z0: 7.5, z1: 10.5 }
  close(10.5 - plan.packingBenches[9].z1, 2.2)
  const fork = plan.corridors.find(item => item.id === 'P-FORK-01')
  close(gap(fork, f04Safety), .7)
  close(fork.z0 - plan.packingBenches[9].z1, 2.9)
  for (const item of facilities) {
    const zone = item.id.startsWith('Q') ? { x0: -137, x1: -124, z0: -17, z1: -3 } : item.id.startsWith('P') && !item.id.startsWith('PK') ? { x0: -149, x1: -127, z0: -1, z1: 15 } : { x0: -127, x1: -105, z0: -1, z1: 15 }
    assert.ok(item.x0 - zone.x0 >= .3 - 1e-9 && zone.x1 - item.x1 >= .3 - 1e-9 && item.z0 - zone.z0 >= .3 - 1e-9 && zone.z1 - item.z1 >= .3 - 1e-9, item.id)
  }
})

test('B3 real scene replaces the three old stations and the old conveyor visual', () => {
  const root = new THREE.Group()
  const workstations = buildCampusWorkstations({ THREE, root, quality: { tier: 'high' } })
  const racks = buildCampusRacks({ THREE, root, canvasTex, layout, quality: { tier: 'high' }, replaceRackCell: true, replaceStations: true })
  const motion = buildCampusMotion({ THREE, root, layout, quality: { tier: 'high' }, search: '?campusMotion=0' })
  assert.deepEqual(root.userData.b3Workstations.summary, {
    qualityTables: 6, staging: 1, pickingRacks: 8, packingBenches: 10, conveyorSegments: 4,
    oldStationsDisabled: ['station-inspection', 'station-picking', 'station-packing'],
  })
  assert.deepEqual(root.userData.campusRackSupport.ids, ['receiving-door-D01', 'receiving-door-D02', 'receiving-door-D03', 'receiving-door-D04', 'shipping-door-D05', 'shipping-door-D06', 'shipping-door-D07', 'shipping-door-D08'])
  assert.ok(root.getObjectByName('b3-conveyor-belt'))
  const parts = root.getObjectByName('campus-motion-0').userData.parts
  assert.equal(parts.filter(p => p.kind === 'b3-cargo').length, 4)
  assert.equal(parts.filter(p => p.kind === 'cargo' || p.kind === 'fixed').length, 0)
  motion.dispose()
  racks.dispose()
  workstations.dispose()
})

test('B3 real workstation meshes preserve the approved plan with Box3', () => {
  const root = new THREE.Group()
  const workstations = buildCampusWorkstations({ THREE, root, quality: { tier: 'high' } })
  root.updateMatrixWorld(true)
  const checks = [
    ['b3-table-tops', [...B3_WORKSTATION_PLAN.qualityTables, ...B3_WORKSTATION_PLAN.packingBenches]],
  ]
  for (const [name, items] of checks) {
    const mesh = root.getObjectByName(name)
    assert.equal(mesh.count, items.length, name)
    items.forEach((item, index) => {
      const measured = instanceBox(root, mesh, index)
      close(measured.min.x, item.x0); close(measured.max.x, item.x1)
      close(measured.min.z, item.z0); close(measured.max.z, item.z1)
    })
  }
  const shelves = root.getObjectByName('b3-picking-shelves')
  B3_WORKSTATION_PLAN.pickingRacks.forEach((item, index) => {
    const measured = instanceBox(root, shelves, index * 4)
    close(measured.min.x, item.x0); close(measured.max.x, item.x1)
    close(measured.min.z, item.z0); close(measured.max.z, item.z1)
  })
  workstations.dispose()
})

test('B3 R2 raised conveyor and detailed fixtures meet physical presentation rules', () => {
  const root = new THREE.Group()
  const workstations = buildCampusWorkstations({ THREE, root, quality: { tier: 'high' } })
  root.updateMatrixWorld(true)
  const belt = root.getObjectByName('b3-conveyor-belt')
  const guards = root.getObjectByName('b3-conveyor-guards')
  const legs = root.getObjectByName('b3-conveyor-legs')
  const tops = root.getObjectByName('b3-table-tops')
  const posts = root.getObjectByName('b3-picking-posts')
  const pallets = root.getObjectByName('b3-stage-pallets')
  assert.equal(belt.count, 4)
  assert.equal(guards.count, 8)
  assert.ok(legs.count >= 20)
  assert.equal(pallets.count, 3)
  assert.ok(tops.count === 16 && posts.count === 32)
  for (const measured of items(belt, root)) close(measured.max.y - (-.54), .75)
  const conveyorSegments = B3_WORKSTATION_PLAN.conveyors.flatMap(line => line.points.slice(0, -1).map((from, index) => [from, line.points[index + 1]]))
  assert.equal(legs.count, conveyorSegments.reduce((count, [from, to]) => count + (Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 2) + 1) * 2, 0))
  for (const mesh of [guards, legs, root.getObjectByName('b3-conveyor-rollers')]) for (const measured of items(mesh, root)) {
    const point = measured.getCenter(new THREE.Vector3())
    assert.ok(conveyorSegments.some(([from, to]) => distanceToSegment(point, { x: from[0], z: from[1] }, { x: to[0], z: to[1] }) <= .52), `${mesh.name} stays within belt envelope`)
  }
  workstations.dispose()
})

test('B3 cargo uses the new raised conveyor path without recreating legacy cargo or belts', () => {
  let time = 0
  const root = new THREE.Group()
  const workstations = buildCampusWorkstations({ THREE, root, quality: { tier: 'high' } })
  const motion = buildCampusMotion({
    THREE, root, layout, quality: { tier: 'high' },
    eventSource: createDemoCampusEventSource({ now: () => time }),
  })
  motion.onFrame(0)
  time = 100
  motion.onFrame(.1)
  const cargoMesh = root.getObjectByName('campus-motion-0')
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3()
  const path = root.userData.b3Workstations.conveyorPath
  const lanes = path.slice(0, -1).map((from, index) => [from, path[index + 1]])
  for (let index = cargoMesh.count - 4; index < cargoMesh.count; index++) {
    cargoMesh.getMatrixAt(index, matrix)
    point.setFromMatrixPosition(matrix)
    close(point.y - .24, root.userData.b3Workstations.conveyorSurfaceY)
    assert.ok(lanes.some(([from, to]) => distanceToSegment(point, from, to) <= .01), `cargo ${index} on new belt`)
  }
  assert.equal(root.getObjectByName('campus-b3-conveyors'), undefined)
  assert.equal(root.getObjectByName('campus-motion-2'), undefined)
  motion.dispose()
  workstations.dispose()
})
