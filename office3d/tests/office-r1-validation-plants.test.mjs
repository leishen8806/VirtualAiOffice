import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_CLUSTER_PLANTS } from '../office-vis2/r1-cluster-plan.js'
import { R1_DECOR } from '../office-vis2/r1-decor.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { recomputeOfficeR1Routes, plantObstaclesFor } from '../office-r1-validation.js'

const base = createOfficeR1Layout()
const routeAtWorld = (id, x, z, body_profile = 'H2') => ({ id, body_profile, points_m: [[x + 26, 18 - z], [x + 26 + .1, 18 - z]] })
const layoutWith = route => ({ ...base, r1: { ...base.r1, routes: [route] } })

test('validator reports three clearance classes and keeps all 17 merged routes clear', () => {
  const rows = recomputeOfficeR1Routes({ layout: base })
  assert.equal(rows.length, 17)
  assert.ok(rows.every(row => Number.isFinite(row.plantClearanceMm) && Number.isFinite(row.decorClearanceMm)))
  assert.ok(rows.every(row => row.status === 'CONDITIONAL_STATIC_CLEAR'))
  assert.ok(rows.every(row => row.segments.every(segment => 'nearestPlantId' in segment && 'nearestDecorId' in segment)))
})

for (const [label, row] of [
  ['registered plant', R1_CLUSTER_PLANTS.find(item => item.id === '07-PL-002')],
  ['DENSE plant', R1_CLUSTER_PLANTS.find(item => item.id === 'DENSE-08-7')],
  ['LOOK plant', R1_CLUSTER_PLANTS.find(item => item.id === 'LOOK-06-1')],
]) {
  test(`validator blocks a ${label} counterexample and reports its id`, () => {
    const result = recomputeOfficeR1Routes({ layout: layoutWith(routeAtWorld('counterexample', row.x, row.z)) })[0]
    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.nearestPlantId, row.id)
    assert.ok(result.plantClearanceMm < 0)
  })
}

test('validator blocks a colliding decor counterexample and reports its id', () => {
  const row = R1_DECOR.find(item => item.id === '11-DC-COAT-001')
  const world = r1ToWorld(row.xM, row.yM)
  const result = recomputeOfficeR1Routes({ layout: layoutWith(routeAtWorld('counterexample', world.x, world.z)) })[0]
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.nearestDecorId, row.id)
  assert.ok(result.decorClearanceMm < 0)
})

for (const [label, row] of [
  ['DENSE edge', R1_CLUSTER_PLANTS.find(item => item.id === 'DENSE-08-7')],
  ['LOOK edge', R1_CLUSTER_PLANTS.find(item => item.id === 'LOOK-06-1')],
  ['registered edge', R1_CLUSTER_PLANTS.find(item => item.id === '07-PL-002')],
]) {
  test(`validator rejects a ${label} scrape at 0.5m`, () => {
    const x = row.x + row.r + .5
    const result = recomputeOfficeR1Routes({ layout: layoutWith(routeAtWorld('scrape', x, row.z)) })[0]
    assert.equal(result.status, 'BLOCKED')
    assert.ok(result.plantClearanceMm < 0)
  })
}

test('validator exposes the same plant source and metric labels used by the tests', () => {
  const obstacles = plantObstaclesFor(base)
  assert.ok(obstacles.some(row => row.id === 'DENSE-08-7' && row.kind === 'foliage'))
  assert.ok(obstacles.some(row => row.id === 'LOOK-06-1' && row.kind === 'foliage'))
  assert.ok(obstacles.some(row => row.id === '07-PL-002' && row.kind === 'registered'))
  const rows = recomputeOfficeR1Routes({ layout: base })
  assert.ok(rows.every(row => row.plantMetric.includes('0.6m')))
})

test('H3 route uses its own body radius for plant clearance', () => {
  const result = recomputeOfficeR1Routes({
    layout: layoutWith({
      id: 'entry_carrying_example',
      body_profile: 'H3',
      points_m: base.r1.routes.find(route => route.id === 'entry_carrying_example').points_m
    })
  })[0]
  assert.equal(result.nearestPlantId, 'DENSE-11-6')
  assert.ok(Math.abs(result.plantClearanceMm - 203) <= 1)
})

test('H3 edge scrape is blocked where H2 would still be clear', () => {
  const row = R1_CLUSTER_PLANTS.find(item => item.id === 'DENSE-11-7')
  const x = row.x + row.r + 1
  const h2 = recomputeOfficeR1Routes({ layout: layoutWith(routeAtWorld('scrape-h2', x, row.z, 'H2')) })[0]
  const h3 = recomputeOfficeR1Routes({ layout: layoutWith(routeAtWorld('scrape-h3', x, row.z, 'H3')) })[0]
  assert.ok(h2.plantClearanceMm > 0)
  assert.equal(h3.status, 'BLOCKED')
  assert.ok(h3.plantClearanceMm < 0)
})
