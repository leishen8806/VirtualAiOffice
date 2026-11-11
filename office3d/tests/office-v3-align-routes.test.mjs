import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { LAYOUT_V3, LAYOUT_V3_ALIGN, createOfficeNavigation, roomSegments, workHome } from '../office-layout.js'
import { barColliders, barLounges, barSeats } from '../office-bar-geometry.js'
import { alignZoneObstaclePlan } from '../office-vis2/align-zones.js'
import { buildOfficeAlignedZones } from '../office-vis2/zone-finish.js'
import * as THREE from '../vendor/three/three.module.js'
import { displayRoute, displayRoster } from '../display-staff-logic.js'

const finite = route => Array.isArray(route) && route.length > 0 && route.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const routeLength = route => route.slice(1).reduce((sum, point, index) => sum + distance(point, route[index]), 0)
const blocks = layout => [
  ...barColliders(layout),
  ...alignZoneObstaclePlan(layout).flatMap(({ plan }) => plan.placements.map(item => item.bounds)),
  ...Object.values(layout.seats).map(([, x, z]) => ({ x0: x - .8, x1: x + .8, z0: z - .8, z1: z + .8 })),
]
const pointInside = (point, box) => point.x > box.x0 && point.x < box.x1 && point.z > box.z0 && point.z < box.z1
const clearMiddle = (route, blockers, label) => {
  for (const point of route.slice(2, -2)) assert.equal(blockers.some(box => pointInside(point, box)), false, `${label} waypoint blocked`)
}
const stableMatrix = layout => {
  const nav = createOfficeNavigation(layout), homes = Object.values(layout.seats).map(workHome)
  return JSON.stringify(homes.flatMap(home => [
    nav.officeExit(home), nav.boardTrip(home, layout.boss.stand),
    ...homes.map(target => nav.officeTrip(home, target, target)),
    ...barLounges(layout).map(seat => nav.loungeTrip(home, seat)),
  ]))
}

test('ALIGN route matrix reaches work, meetings, board, lounge and public destinations without blocked waypoints', () => {
  const layout = LAYOUT_V3_ALIGN, nav = createOfficeNavigation(layout), homes = Object.entries(layout.seats).map(([id, seat]) => [id, workHome(seat)])
  const meetings = Object.values(layout.meetingSeatPoints).flat(), lounges = barLounges(layout), stools = barSeats(layout)
  const blockers = blocks(layout)
  let count = 0
  for (const [id, home] of homes) {
    const routes = [
      nav.officeExit(home),
      nav.boardTrip(home, layout.boss.stand),
      nav.corridorPath(home, nav.ENTRANCE.inner),
      ...homes.map(([, target]) => nav.officeTrip(home, target, target)),
      ...meetings.map(seat => nav.meetingTrip(home, seat)),
      ...lounges.map(seat => nav.loungeTrip(home, seat)),
      ...stools.map(seat => nav.corridorPath(home, { x: seat.x, z: seat.z })),
      ...Object.keys(nav.consumerQueues).map(target => nav.consumerTrip(home, target, nav.consumerQueues[target][0])),
    ]
    for (const route of routes) {
      assert.ok(finite(route), `${id} finite route`)
      clearMiddle(route, blockers, id)
      count++
    }
  }
  assert.equal(count, 25 * (3 + 25 + 14 + 6 + 10 + Object.keys(nav.consumerQueues).length))
})

test('ALIGN open desks use direct public egress and stable V3 matrix hash remains unchanged', () => {
  const nav = createOfficeNavigation(LAYOUT_V3_ALIGN)
  for (const [name, seat] of Object.entries(LAYOUT_V3_ALIGN.seats).filter(([, seat]) => ['west-open', 'kb', 'product', 'eng', 'drlife'].includes(seat[0]))) {
    const home = workHome(seat), route = nav.officeExit(home)
    assert.ok(finite(route), name)
    assert.ok(routeLength(route) <= 1.5, `${name} open egress remains direct`)
  }
  const actual = createHash('sha256').update(stableMatrix(LAYOUT_V3)).digest('hex')
  assert.equal(actual, 'e9fe5c4f07f63bb1945b453c75a0ffbd18e57e9590c5646f429dbb674f9bcce2')
})

test('ALIGN display routes stay in their room then reach only the 1.5m door apron', () => {
  const layout = { ...LAYOUT_V3_ALIGN, version: 2, displayAdapter: 'v3' }
  for (const person of displayRoster(layout)) {
    const room = layout.regions.find(region => region.id === person.department), route = displayRoute(layout, person)
    assert.ok(finite(route.go), person.id)
    for (const point of route.go.slice(0, -1)) assert.ok(point.x >= room.x0 - 1e-6 && point.x <= room.x1 + 1e-6 && point.z >= room.z0 - 1e-6 && point.z <= room.z1 + 1e-6, `${person.id} stays in room`)
    assert.ok(distance(route.go.at(-2), route.go.at(-1)) <= 1.500001, `${person.id} apron is bounded`)
  }
})

test('ALIGN walls remain data-owned while public routes keep their endpoints finite', () => {
  const walls = LAYOUT_V3_ALIGN.regions.filter(room => room.walled).flatMap(roomSegments)
  const nav = createOfficeNavigation(LAYOUT_V3_ALIGN)
  for (const home of Object.values(LAYOUT_V3_ALIGN.seats).map(workHome)) {
    const route = nav.corridorPath(home, nav.ENTRANCE.inner)
    assert.ok(finite(route))
    for (const wall of walls) assert.ok(Number.isFinite(wall.lo) && Number.isFinite(wall.hi))
  }
})

test('ALIGN pure furnishing plan conservatively covers every zone registry obstacle', () => {
  const root = new THREE.Group(), zones = buildOfficeAlignedZones({ THREE, root, layout: LAYOUT_V3_ALIGN })
  try {
    const planned = alignZoneObstaclePlan(LAYOUT_V3_ALIGN).flatMap(({ id, plan }) =>
      plan.placements.map(item => ({ id: `${id}-${item.id}`, ...item.bounds })))
    const actual = new Map(zones.obstacles().map(item => [item.id, item]))
    assert.equal(planned.length, actual.size)
    for (const item of planned) {
      const rendered = actual.get(item.id)
      assert.ok(rendered, item.id)
      // Registry bounds come from Float32 geometry; preserve the plan's
      // conservative coverage while tolerating conversion-level drift.
      const epsilon = 1e-5
      assert.ok(
        item.x0 <= rendered.x0 + epsilon &&
        item.x1 >= rendered.x1 - epsilon &&
        item.z0 <= rendered.z0 + epsilon &&
        item.z1 >= rendered.z1 - epsilon,
        item.id,
      )
    }
  } finally {
    zones.dispose()
  }
})
