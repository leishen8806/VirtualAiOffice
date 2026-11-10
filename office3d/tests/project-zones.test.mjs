import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTEFIT_ZONE, routefitSeatAssignments } from '../project-zones.js'

test('RouteFit wing config keeps the approved roster and groups', () => {
  assert.equal(ROUTEFIT_ZONE.routefit.length, 18)
  assert.equal(ROUTEFIT_ZONE.platform.length, 8)
  assert.equal(ROUTEFIT_ZONE.paused.length, 4)
  assert.equal(Object.values(ROUTEFIT_ZONE.groups).flat().length, 18)
  assert.equal(ROUTEFIT_ZONE.wing.x1 - ROUTEFIT_ZONE.wing.x0, 18)
})

test('RouteFit assignments preserve old seats and only add missing names', () => {
  const old = { PM: ['old', 1, 2, 0, { x: 1, z: 2, yaw: 0 }] }
  const result = routefitSeatAssignments(['PM', 'Lead2'], old)
  assert.deepEqual(result.PM, old.PM)
  assert.equal(result.Lead2[0], 'routefit')
})

