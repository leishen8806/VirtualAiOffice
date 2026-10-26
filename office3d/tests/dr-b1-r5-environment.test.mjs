import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS_PAVING } from '../office-layout.js'

const loadEnvironmentSpec = async () => {
  const source = await readFile(new URL('../env.js', import.meta.url), 'utf8')
  const executable = source.replace(/^import .+\r?\n/gm, '')
  return import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)
}

const boundsForRoad = ({ width, depth, x, z, rotationZ }) => {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(width, depth))
  road.position.set(x, -0.59, z)
  road.rotation.set(-Math.PI / 2, 0, rotationZ)
  road.updateMatrixWorld()
  return new THREE.Box3().setFromObject(road)
}

const hasPositiveOverlap = (first, second) =>
  Math.min(first.max.x, second.max.x) - Math.max(first.min.x, second.min.x) > 1e-9 &&
  Math.min(first.max.z, second.max.z) - Math.max(first.min.z, second.min.z) > 1e-9

const approximately = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`)

const assertBounds = (bounds, [x0, y0, z0, x1, y1, z1]) => {
  approximately(bounds.min.x, x0, 'min.x')
  approximately(bounds.min.y, y0, 'min.y')
  approximately(bounds.min.z, z0, 'min.z')
  approximately(bounds.max.x, x1, 'max.x')
  approximately(bounds.max.y, y1, 'max.y')
  approximately(bounds.max.z, z1, 'max.z')
}

test('R6 restores the named north-south road geometry without overlapping the six moved buildings', async () => {
  const environment = await loadEnvironmentSpec()
  const { EAST_TOWN_BUILDING_BASE_Z, EAST_TOWN_BUILDING_BOUNDS, EAST_TOWN_BUILDING_X, EAST_TOWN_CURB_LAMP_X, EAST_TOWN_ROAD_BOUNDS, EAST_TOWN_ROAD_SPECS } = environment

  assert.deepEqual(EAST_TOWN_BUILDING_BASE_Z, [-30, -18, -6, 6, 18, 30])
  assert.equal(EAST_TOWN_BUILDING_X, -53)
  assert.equal(EAST_TOWN_BUILDING_BOUNDS.westRoadClearance, 0)
  assert.equal(EAST_TOWN_BUILDING_BOUNDS.pavingClearance, 2)
  assert.deepEqual(EAST_TOWN_ROAD_BOUNDS, { x0: -70, x1: -58, z0: -110, z1: 110 })

  const eastRoad = boundsForRoad(EAST_TOWN_ROAD_SPECS.east)
  const westRoad = boundsForRoad(EAST_TOWN_ROAD_SPECS.west)
  for (const road of [eastRoad, westRoad]) {
    approximately(road.min.y, -0.59, 'road min.y')
    approximately(road.max.y, -0.59, 'road max.y')
    approximately(road.min.z, -110, 'road min.z')
    approximately(road.max.z, 110, 'road max.z')
  }
  assertBounds(eastRoad, [-70, -0.59, -110, -58, -0.59, 110])
  assertBounds(westRoad, [58, -0.59, -110, 70, -0.59, 110])

  const buildingWidth = EAST_TOWN_BUILDING_BOUNDS.x1 - EAST_TOWN_BUILDING_BOUNDS.x0
  for (const z of EAST_TOWN_BUILDING_BASE_Z) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth, 1, 10))
    building.position.set(EAST_TOWN_BUILDING_X, 0, z)
    building.updateMatrixWorld()
    const footprint = new THREE.Box3().setFromObject(building)
    assert.equal(hasPositiveOverlap(footprint, eastRoad), false, `east building at z=${z} overlaps road`)
    assert.equal(hasPositiveOverlap(footprint, westRoad), false, `east building at z=${z} overlaps west road`)
    assert.equal(hasPositiveOverlap(footprint, new THREE.Box3(
      new THREE.Vector3(CAMPUS_PAVING.x0, 0, CAMPUS_PAVING.z0),
      new THREE.Vector3(CAMPUS_PAVING.x1, 1, CAMPUS_PAVING.z1),
    )), false, `east building at z=${z} overlaps paving`)
  }
  assert.ok(EAST_TOWN_CURB_LAMP_X < EAST_TOWN_BUILDING_BOUNDS.x0)
  assert.ok(EAST_TOWN_CURB_LAMP_X > eastRoad.min.x)
  assert.ok(EAST_TOWN_CURB_LAMP_X < eastRoad.max.x)
  assert.ok(eastRoad.max.x - EAST_TOWN_CURB_LAMP_X <= 0.5)
})

test('R6 keeps town navigation independent of the moved east city building row', async () => {
  const source = await readFile(new URL('../town.html', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /EAST_TOWN_BUILDING|town-east-building/)
})
