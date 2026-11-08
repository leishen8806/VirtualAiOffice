import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_CLUSTER_PLANTS } from '../office-vis2/r1-cluster-plan.js'
import { R1_DECOR } from '../office-vis2/r1-decor.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { recomputeOfficeR1Routes } from '../office-r1-validation.js'

const base = createOfficeR1Layout()
const routeAtWorld = (id, x, z) => ({ id, body_profile: 'H2', points_m: [[x + 26, 18 - z], [x + 26 + .1, 18 - z]] })
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
