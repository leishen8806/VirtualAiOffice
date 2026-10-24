import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, LAYOUT_V3_ALIGN, createOfficeNavigation, regionFocusOf, resolveOfficeLayout, roomSegments, workHome } from '../office-layout.js'

const inside = (point, region) => point.x > region.x0 && point.x < region.x1 && point.z > region.z0 && point.z < region.z1
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0))
const finite = route => Array.isArray(route) && route.length && route.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))
const outerClearance = (region, door, regions, envelope) => {
  const point = door.side === 'east' ? { x: region.x1, z: door.at, dx: 1, dz: 0 }
    : door.side === 'west' ? { x: region.x0, z: door.at, dx: -1, dz: 0 }
      : door.side === 'north' ? { x: door.at, z: region.z0, dx: 0, dz: -1 }
        : { x: door.at, z: region.z1, dx: 0, dz: 1 }
  let distance = point.dx ? (point.dx > 0 ? envelope.x1 - point.x : point.x - envelope.x0) : (point.dz > 0 ? envelope.z1 - point.z : point.z - envelope.z0)
  for (const other of regions.filter(item => item !== region)) {
    if (point.dx && point.z > other.z0 && point.z < other.z1) {
      const gap = point.dx > 0 ? other.x0 - point.x : point.x - other.x1
      if (gap >= 0) distance = Math.min(distance, gap)
    }
    if (point.dz && point.x > other.x0 && point.x < other.x1) {
      const gap = point.dz > 0 ? other.z0 - point.z : point.z - other.z1
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
  for (const region of layout.regions) for (const door of region.doors) assert.ok(outerClearance(region, door, layout.regions, layout.envelope) >= 1.2, `${region.id}/${door.side}`)
})

test('align public graph connects entrance to every door, workstation, meeting seat, and leisure seat', () => {
  const layout = LAYOUT_V3_ALIGN, navigation = createOfficeNavigation(layout)
  for (const region of layout.regions) {
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
