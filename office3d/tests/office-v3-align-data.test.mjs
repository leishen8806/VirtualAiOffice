import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, LAYOUT_V3_ALIGN, createOfficeNavigation, regionFocusOf, resolveOfficeLayout, roomSegments, workHome } from '../office-layout.js'

const inside = (point, region) => point.x > region.x0 && point.x < region.x1 && point.z > region.z0 && point.z < region.z1
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0))
const finite = route => Array.isArray(route) && route.length && route.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))
const approvedPlan = JSON.parse(execFileSync('git', ['show', '83ecc1b:office3d/docs/v3-layout-align-plan.json'], { encoding: 'utf8' }))
const rectangleDistance = (point, rect) => Math.hypot(Math.max(rect.x0 - point.x, 0, point.x - rect.x1), Math.max(rect.z0 - point.z, 0, point.z - rect.z1))
const outerClearance = (region, door, regions, seats, envelope) => {
  const point = door.side === 'east' ? { x: region.x1, z: door.at, dx: 1, dz: 0 }
    : door.side === 'west' ? { x: region.x0, z: door.at, dx: -1, dz: 0 }
      : door.side === 'north' ? { x: door.at, z: region.z0, dx: 0, dz: -1 }
        : { x: door.at, z: region.z1, dx: 0, dz: 1 }
  let distance = point.dx ? (point.dx > 0 ? envelope.x1 - point.x : point.x - envelope.x0) : (point.dz > 0 ? envelope.z1 - point.z : point.z - envelope.z0)
  for (const other of regions.filter(item => item !== region && item.walled)) {
    if (point.dx && point.z > other.z0 && point.z < other.z1) {
      const gap = point.dx > 0 ? other.x0 - point.x : point.x - other.x1
      if (gap >= 0) distance = Math.min(distance, gap)
    }
    if (point.dz && point.x > other.x0 && point.x < other.x1) {
      const gap = point.dz > 0 ? other.z0 - point.z : point.z - other.z1
      if (gap >= 0) distance = Math.min(distance, gap)
    }
  }
  for (const [, x, z] of Object.values(seats)) {
    if (point.dx && point.z > z - .8 && point.z < z + .8) {
      const gap = point.dx > 0 ? x - .8 - point.x : point.x - (x + .8)
      if (gap >= 0) distance = Math.min(distance, gap)
    }
    if (point.dz && point.x > x - .8 && point.x < x + .8) {
      const gap = point.dz > 0 ? z - .8 - point.z : point.z - (z + .8)
      if (gap >= 0) distance = Math.min(distance, gap)
    }
  }
  return distance
}

test('align variant is isolated, frozen, and selected only by one layout=3 plus align=1', () => {
  assert.equal(LAYOUT_V3_ALIGN.variant, 'align')
  assert.equal(Object.isFrozen(LAYOUT_V3_ALIGN), true)
  assert.equal(resolveOfficeLayout('?layout=3&align=1'), LAYOUT_V3_ALIGN)
  for (const search of ['?layout=3', '?layout=3&align=0', '?layout=3&align=1&align=1', '?layout=3&layout=3&align=1', '?layout=2&align=1', '']) {
    assert.notEqual(resolveOfficeLayout(search), LAYOUT_V3_ALIGN, search)
  }
  assert.deepEqual(LAYOUT_V3, structuredClone(LAYOUT_V3))
  assert.equal(resolveOfficeLayout('?layout=3'), LAYOUT_V3)
  assert.equal(resolveOfficeLayout('?layout=2'), LAYOUT_V2)
  assert.equal(resolveOfficeLayout(''), LAYOUT_V1)
})

test('align regions, seats, display seats, doors, and meeting seats satisfy the approved data contract', () => {
  const layout = LAYOUT_V3_ALIGN
  for (let i = 0; i < layout.regions.length; i++) for (const other of layout.regions.slice(i + 1)) assert.equal(overlap(layout.regions[i], other), 0, `${layout.regions[i].id}/${other.id}`)
  const west = layout.regions.find(region => region.id === 'west-open')
  assert.equal((west.x1 - west.x0) * (west.z1 - west.z0), 195)
  assert.equal(Math.min(west.x1 - west.x0, west.z1 - west.z0), 10)
  const names = Object.keys(LAYOUT_V3.seats).sort()
  assert.deepEqual(Object.keys(layout.seats).sort(), names)
  for (const [name, seat] of Object.entries(layout.seats)) {
    const hits = layout.regions.filter(region => region.id === seat[0] && inside({ x: seat[1], z: seat[2] }, region))
    assert.equal(hits.length, 1, name)
  }
  assert.equal(layout.displaySeats.length, 12)
  for (const seat of layout.displaySeats) assert.equal(inside(seat, layout.regions.find(region => region.id === seat.region)), true, seat.id)
  assert.equal(Object.values(layout.meetingSeatPoints).flat().length, 14)
  assert.equal(Object.values(layout.meetingSeats).reduce((sum, value) => sum + value, 0), 14)
  const approved = new Map(approvedPlan.regions.map(region => [region.id, region]))
  const northRooms = { board: ['room', -20, -11, -18, -12], review: ['room', -11, -6, -18, -13], plan: ['room', -11, -6, -13, -8] }
  for (const region of layout.regions) {
    const reference = approved.get(region.id)
    assert.deepEqual([region.kind, region.x0, region.x1, region.z0, region.z1], northRooms[region.id] ?? [reference.kind, reference.x0, reference.x1, reference.z0, reference.z1], region.id)
  }
  const walled = layout.regions.filter(region => region.walled)
  assert.deepEqual(walled.map(region => region.id).sort(), ['aftersales', 'board', 'market', 'marketing', 'plan', 'review', 'service'])
  assert.ok(layout.regions.filter(region => !region.walled).every(region => region.doors.length === 0))
  for (const region of walled) for (const door of region.doors) assert.ok(outerClearance(region, door, layout.regions, layout.seats, layout.envelope) >= 1.2, `${region.id}/${door.side}`)
})

test('align collision fields and circulation declarations match the restored open plan', () => {
  const layout = LAYOUT_V3_ALIGN, walled = layout.regions.filter(region => region.walled)
  assert.equal(layout.bar.radius, 6)
  assert.equal(layout.island.barOuter, 3.5)
  assert.equal(layout.island.stoolRadius, 4.2)
  assert.equal(layout.island.sofaOuter, 5.45)
  assert.equal(LAYOUT_V3.island.sofaOuter, 5.8)
  assert.ok(layout.island.sofaOuter + .35 <= layout.bar.radius)
  assert.deepEqual({ inner: layout.ring.inner, outer: layout.ring.outer }, { inner: 6, outer: 10 })
  const declared = [...Object.entries(layout.corridors), ...Object.entries(layout.passages)]
    .filter(([, value]) => Number.isFinite(value.x0) && Number.isFinite(value.x1) && Number.isFinite(value.z0) && Number.isFinite(value.z1))
  for (const [name, rect] of declared) {
    assert.ok(rect.width >= 1.2, `${name} width`)
    for (const room of walled) assert.equal(overlap(rect, room), 0, `${name}/${room.id}`)
    for (const [, x, z] of Object.values(layout.seats)) assert.ok(rectangleDistance({ x, z }, rect) >= .6, `${name} desk clearance`)
  }
  for (const [name, value] of Object.entries(layout.meetingAccess)) {
    assert.ok(Number.isFinite(value), name)
    for (const room of walled) {
      const point = name.endsWith('X') ? { x: value, z: -3.75 } : { x: -7.55, z: value }
      assert.equal(inside(point, room), false, `${name}/${room.id}`)
    }
  }
  const navigation = createOfficeNavigation(layout)
  const westRoute = navigation.corridorPath({ x: -18.25, z: -5 }, { x: -18.25, z: 5 })
  const westLength = westRoute.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - westRoute[index].x, point.z - westRoute[index].z), 0)
  assert.ok(westLength <= 13.3, `west-open length ${westLength}`)
  for (const point of [{ x: -18.25, z: 2 }, ...Object.values(layout.seats).filter(([region]) => region === 'west-open').map(([, x, z]) => ({ x, z: z + 1 }))]) {
    assert.ok(finite(navigation.corridorPath(point, navigation.ENTRANCE.inner)), `west-open endpoint ${point.x}/${point.z}`)
  }
})

test('align public graph connects entrance to every door, workstation, meeting seat, and leisure seat', () => {
  const layout = LAYOUT_V3_ALIGN, navigation = createOfficeNavigation(layout)
  for (const region of layout.regions.filter(region => region.walled)) {
    const door = region.doors[0], exterior = door.side === 'east' ? { x: region.x1 + .75, z: door.at }
      : door.side === 'west' ? { x: region.x0 - .75, z: door.at }
        : door.side === 'north' ? { x: door.at, z: region.z0 - .75 } : { x: door.at, z: region.z1 + .75 }
    const route = navigation.corridorPath(navigation.ENTRANCE.inner, exterior)
    assert.ok(finite(route), `${region.id} door`)
    assert.deepEqual(route.at(-1), exterior, `${region.id} door destination`)
  }
  for (const [name, seat] of Object.entries(layout.seats)) {
    const exit = navigation.officeExit(workHome(seat)), route = navigation.corridorPath(exit.at(-1), navigation.ENTRANCE.inner)
    assert.ok(finite(exit) && finite(route), `workstation ${name}`)
    assert.deepEqual(route.at(-1), navigation.ENTRANCE.inner, `workstation ${name} destination`)
  }
  const home = workHome(layout.seats.Lead)
  for (const seat of Object.values(layout.meetingSeatPoints).flat()) {
    const route = navigation.meetingTrip(home, seat)
    assert.ok(finite(route), `meeting ${seat.room}`)
    assert.deepEqual(route.at(-1), { x: seat.x, z: seat.z }, `meeting ${seat.room} destination`)
  }
  for (const seat of navigation.LOUNGE_SEATS) {
    const route = navigation.loungeTrip(home, seat)
    assert.ok(finite(route), seat.id)
    assert.deepEqual(route.at(-1), { x: seat.x, z: seat.z }, `${seat.id} destination`)
  }
})

test('align focus targets stay in site, and plaza remains inside its circle', () => {
  const layout = LAYOUT_V3_ALIGN
  for (const id of ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'meet', 'board', 'foyer', 'plaza']) {
    const focus = regionFocusOf(layout, id)
    assert.ok(focus.t[0] >= layout.site.x0 && focus.t[0] <= layout.site.x1 && focus.t[2] >= layout.site.z0 && focus.t[2] <= layout.site.z1, id)
  }
  const plaza = regionFocusOf(layout, 'plaza')
  assert.ok(Math.hypot(plaza.t[0] - layout.plaza.center.x, plaza.t[2] - layout.plaza.center.z) <= layout.plaza.radius)
})

test('legacy V3 walls remain unchanged when align data is added', () => {
  const wallCount = LAYOUT_V3.regions.flatMap(roomSegments).length
  assert.equal(wallCount, 80)
  assert.equal(LAYOUT_V3.variant, undefined)
})
