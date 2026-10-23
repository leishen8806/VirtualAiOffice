import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, createOfficeNavigation, roomSegments, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { createDirector } from '../director.js'

const furniture = officeFurnitureV2Spec(LAYOUT_V3)
const box = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })
const finiteRoute = route => route.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))
const segmentHits = (a, b, area) => {
  const dx = b.x - a.x, dz = b.z - a.z
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .025))
  for (let index = 1; index < steps; index++) {
    const t = index / steps, x = a.x + dx * t, z = a.z + dz * t
    if (x > area.x0 + 1e-6 && x < area.x1 - 1e-6 && z > area.z0 + 1e-6 && z < area.z1 - 1e-6) return true
  }
  return false
}
const wallSegments = LAYOUT_V3.regions.flatMap(room => roomSegments(room).map(segment => {
  if (segment.side === 'north') return { x0: segment.lo, x1: segment.hi, z0: room.z0, z1: room.z0 }
  if (segment.side === 'south') return { x0: segment.lo, x1: segment.hi, z0: room.z1, z1: room.z1 }
  if (segment.side === 'west') return { x0: room.x0, x1: room.x0, z0: segment.lo, z1: segment.hi }
  return { x0: room.x1, x1: room.x1, z0: segment.lo, z1: segment.hi }
}))
const crossesWall = (a, b, wall) => {
  if (wall.x0 === wall.x1) {
    if ((a.x - wall.x0) * (b.x - wall.x0) >= 0 || a.x === b.x) return false
    const t = (wall.x0 - a.x) / (b.x - a.x), z = a.z + (b.z - a.z) * t
    return t > 1e-6 && t < 1 - 1e-6 && z > wall.z0 + 1e-6 && z < wall.z1 - 1e-6
  }
  if ((a.z - wall.z0) * (b.z - wall.z0) >= 0 || a.z === b.z) return false
  const t = (wall.z0 - a.z) / (b.z - a.z), x = a.x + (b.x - a.x) * t
  return t > 1e-6 && t < 1 - 1e-6 && x > wall.x0 + 1e-6 && x < wall.x1 - 1e-6
}

test('J-01 routes all 14 V3 meeting seats through their actual doors without legacy west-wing coordinates', () => {
  const nav = createOfficeNavigation(LAYOUT_V3), homes = Object.values(LAYOUT_V3.seats).map(workHome)
  const seats = furniture.meetings.flatMap(room => room.seats)
  assert.equal(seats.length, 14)
  for (const [index, seat] of seats.entries()) {
    const room = LAYOUT_V3.regions.find(region => region.id === (seat.room === 'A' ? 'review' : 'plan'))
    const route = nav.meetingTrip(homes[index % homes.length], seat)
    const door = room.doors[0], exterior = { x: -17.25, z: door.at }
    const interior = door.side === 'east' ? { x: room.x1 - .6, z: door.at } : { x: room.x0 + .6, z: door.at }
    assert.ok(finiteRoute(route), `${seat.room}/${index} has finite coordinates`)
    assert.deepEqual(route.at(-1), { x: seat.x, z: seat.z }, `${seat.room}/${index} terminates at the assigned seat`)
    assert.ok(route.some(point => point.x === exterior.x && point.z === exterior.z), `${seat.room}/${index} enters shared doorway exterior`)
    assert.ok(route.some(point => point.x === interior.x && point.z === interior.z), `${seat.room}/${index} enters intended room door`)
    assert.ok(route.every(point => point.x >= LAYOUT_V3.envelope.x0), `${seat.room}/${index} never enters obsolete west wing`)
    for (let step = 1; step < route.length; step++) for (const wall of wallSegments) assert.equal(crossesWall(route[step - 1], route[step], wall), false, `${seat.room}/${index} crosses a solid wall`)

    const meetingBlocks = furniture.meetings.flatMap(candidate => [
      box(candidate.x, candidate.z, candidate.w, candidate.d),
      ...candidate.seats.map(chair => box(chair.x, chair.z, .62, .62)),
    ])
    for (let step = 1; step < route.length - 1; step++) {
      for (const obstacle of meetingBlocks) assert.equal(segmentHits(route[step - 1], route[step], obstacle), false, `${seat.room}/${index} intersects meeting furniture before its destination`)
    }
  }
})

test('J-01 regression: V1 legacy routing reproduces the undefined viaZ defect while V3 rejects it', () => {
  const seat = furniture.meetings[0].seats[0], home = workHome(Object.values(LAYOUT_V3.seats)[0])
  const legacy = createOfficeNavigation(LAYOUT_V1).meetingTrip(home, seat)
  assert.equal(finiteRoute(legacy), false, 'legacy route exposes the historical undefined viaZ waypoint')
  assert.equal(finiteRoute(createOfficeNavigation(LAYOUT_V3).meetingTrip(home, seat)), true)
})

test('J-01 preserves V2 meeting navigation output', () => {
  const nav = createOfficeNavigation(LAYOUT_V2), seat = officeFurnitureV2Spec(LAYOUT_V2).meetings[0].seats[0]
  const route = nav.meetingTrip(workHome(Object.values(LAYOUT_V2.seats)[0]), seat)
  assert.ok(finiteRoute(route))
  assert.ok(route.some(point => point.z === -16.3), 'V2 keeps its approved north-side table aisle')
})

test('J-01 director travel fails closed for malformed waypoints without changing actor state', () => {
  const group = new THREE.Group()
  const actor = { id: 'route-check', name: 'route-check', home: { x: 1, z: 1, yaw: 0 }, char: { group, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } }, act: null }
  group.position.set(1, 0, 1)
  const director = createDirector({ layout: LAYOUT_V3, views: new Map([[actor.id, actor]]), board: {}, layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} } })
  const warn = console.warn
  console.warn = () => {}
  try {
    for (const route of [[{ x: 1, z: undefined }], [{ x: NaN, z: 1 }], [{ x: Infinity, z: 1 }], [{}], null]) {
      assert.equal(director.travel(actor, route, actor.home, false), false)
      assert.equal(actor.act, null)
      assert.deepEqual({ x: group.position.x, z: group.position.z }, { x: 1, z: 1 })
    }
  } finally {
    console.warn = warn
  }
})
