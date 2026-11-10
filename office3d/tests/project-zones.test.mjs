import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTEFIT_ZONE, routefitSeatAssignments, routefitWingNavigation } from '../project-zones.js'
import fs from 'node:fs'

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

test('RouteFit read-only summary route is cached and uses the approved project id', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /url\.pathname === '\/zone\/routefit'/)
  assert.match(source, /ROUTEFIT_PROJECT_ID = '520f5417-116e-41fa-a830-ddeac34e5268'/)
  assert.match(source, /setInterval\(\(\) => \{ if \(Date\.now\(\) - routefitCache\.at >= 60000\)/)
  assert.doesNotMatch(source.slice(source.indexOf("url.pathname === '/zone/routefit'"), source.indexOf("url.pathname === '/zone/routefit'") + 500), /method:\s*'POST'|send\(/)
})

test('RouteFit wing navigation crosses the single doorway without a teleport', () => {
  const nav = routefitWingNavigation()
  const path = nav.route({ x: 4, z: -4 }, { x: 33, z: 4 })
  assert.equal(path[1].x, nav.doorway.x)
  assert.equal(path[2].x, ROUTEFIT_ZONE.wing.x0 + 0.8)
  assert.equal(path.at(-1).x, 33)
  assert.ok(path.every((p, i) => !i || Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) > 0), 'path must advance')
})

