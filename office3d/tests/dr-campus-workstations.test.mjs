import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS_DOCKS, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { buildCampusWorkstations, B3_WORKSTATION_PLAN } from '../dr-campus-workstations.js'
import { buildCampusRacks } from '../dr-campus-racks.js'
import { buildCampusMotion } from '../dr-campus-motion.js'

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
  assert.ok(root.getObjectByName('campus-b3-conveyors'))
  assert.equal(motion.summary().triangles, 112 * 12)
  motion.dispose()
  racks.dispose()
  workstations.dispose()
})

test('B3 real workstation meshes measure to the approved plan with Box3', () => {
  const root = new THREE.Group()
  const workstations = buildCampusWorkstations({ THREE, root, quality: { tier: 'high' } })
  root.updateMatrixWorld(true)
  const checks = [
    ['b3-quality-tables', B3_WORKSTATION_PLAN.qualityTables],
    ['b3-inspection-staging', [B3_WORKSTATION_PLAN.staging]],
    ['b3-picking-racks', B3_WORKSTATION_PLAN.pickingRacks],
    ['b3-packing-benches', B3_WORKSTATION_PLAN.packingBenches],
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
  workstations.dispose()
})
