import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTEFIT_ZONE, routefitNavigation, routefitSeatAssignments } from '../project-zones.js'
import fs from 'node:fs'

test('RouteFit uses the existing 20-seat four-person desk area', () => {
  const old = Object.fromEntries(ROUTEFIT_ZONE.routefit.map((name, i) => [name, ['old', i, i, 0, { x: i, z: i, yaw: 0 }]]))
  const result = routefitSeatAssignments([], { ...old, Lead: ['product', 1, 1, 0, { x: 1, z: 1, yaw: 0 }], KnowledgeKeeper: ['product', 2, 2, 0, { x: 2, z: 2, yaw: 0 }] })
  const active = ROUTEFIT_ZONE.routefit.filter(name => !ROUTEFIT_ZONE.seatExcluded.includes(name))
  assert.equal(active.length, 20)
  assert.equal(new Set(active.map(name => `${result[name][1]},${result[name][2]}`)).size, 20)
  assert.equal(result.OpsEngineer[0], 'old')
  assert.notDeepEqual(result.Lead, ['product', 1, 1, 0, { x: 1, z: 1, yaw: 0 }])
  assert.notDeepEqual(result.KnowledgeKeeper, ['product', 2, 2, 0, { x: 2, z: 2, yaw: 0 }])
})

test('RouteFit navigation targets the existing workstation area', () => {
  const nav = routefitNavigation()
  assert.ok(Number.isFinite(nav.target.x) && Number.isFinite(nav.target.z))
  assert.deepEqual(nav.route({ x: 0, z: 0 }, nav.target), [{ x: 0, z: 0 }, nav.target])
})

test('RouteFit implementation has no wing geometry or doorway route', () => {
  const source = fs.readFileSync(new URL('../project-zones.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /routefit-wing-zone|buildRoutefitZone|routefitWingNavigation|wing\s*:/)
})

test('RouteFit summary route remains read-only', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /url\.pathname === '\/zone\/routefit'/)
  assert.match(source, /ROUTEFIT_PROJECT_ID = '520f5417-116e-41fa-a830-ddeac34e5268'/)
  const route = source.slice(source.indexOf("url.pathname === '/zone/routefit'"), source.indexOf("url.pathname === '/zone/routefit'") + 500)
  assert.doesNotMatch(route, /method:\s*'POST'|send\(/)
})
