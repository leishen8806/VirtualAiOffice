import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTEFIT_ZONE, routefitSeatAssignments, routefitWingNavigation } from '../project-zones.js'
import fs from 'node:fs'

test('RouteFit wing config keeps the approved roster and groups', () => {
  assert.equal(ROUTEFIT_ZONE.routefit.length, 21)
  assert.equal(ROUTEFIT_ZONE.platform.length, 5)
  assert.equal(ROUTEFIT_ZONE.paused.length, 4)
  assert.equal(Object.values(ROUTEFIT_ZONE.groups).flat().length, 21)
  assert.equal(ROUTEFIT_ZONE.wing.x1 - ROUTEFIT_ZONE.wing.x0, 18)
})

test('RouteFit assignments move the approved roster into the wing and preserve everyone else', () => {
  const old = {
    PM: ['old', 1, 2, 0, { x: 1, z: 2, yaw: 0 }],
    Lead: ['platform', 3, 4, 0, { x: 3, z: 4, yaw: 0 }],
  }
  const result = routefitSeatAssignments(['PM', 'Lead2'], old)
  assert.equal(result.PM[0], 'routefit')
  assert.equal(result.Lead2[0], 'routefit')
  assert.deepEqual(result.Lead, old.Lead)
})

test('all RouteFit seats stay inside the wing with at least 0.8 metres wall clearance', () => {
  const result = routefitSeatAssignments([], {})
  const { x0, x1, z0, z1 } = ROUTEFIT_ZONE.wing
  for (const name of ROUTEFIT_ZONE.routefit) {
    const [, x, z, , stand] = result[name]
    assert.ok(x >= x0 + 0.8 && x <= x1 - 0.8, `${name} seat x=${x}`)
    assert.ok(z >= z0 + 0.8 && z <= z1 - 0.8, `${name} seat z=${z}`)
    assert.ok(stand.x >= x0 + 0.8 && stand.x <= x1 - 0.8, `${name} stand x=${stand.x}`)
    assert.ok(stand.z >= z0 + 0.8 && stand.z <= z1 - 0.8, `${name} stand z=${stand.z}`)
  }
})

test('RouteFit read-only summary route is cached and uses the approved project id', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /url\.pathname === '\/zone\/routefit'/)
  assert.match(source, /ROUTEFIT_PROJECT_ID = '520f5417-116e-41fa-a830-ddeac34e5268'/)
  assert.doesNotMatch(source, /setInterval\([^\n]*refreshRoutefitSummary/)
  const route = source.slice(source.indexOf("url.pathname === '/zone/routefit'"), source.indexOf("url.pathname === '/zone/routefit'") + 500)
  assert.match(route, /await refreshRoutefitSummary\(\)/)
  assert.doesNotMatch(route, /method:\s*'POST'|send\(/)
})

test('RouteFit wing navigation crosses the single doorway without a teleport', () => {
  const nav = routefitWingNavigation()
  const path = nav.route({ x: 4, z: -4 }, { x: 33, z: 4 })
  assert.equal(path[1].x, nav.doorway.x)
  assert.equal(path[2].x, ROUTEFIT_ZONE.wing.x0 + 0.8)
  assert.equal(path.at(-1).x, 33)
  assert.ok(path.every((p, i) => !i || Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) > 0), 'path must advance')
})

