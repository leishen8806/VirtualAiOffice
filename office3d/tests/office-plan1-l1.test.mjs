import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, resolveOfficeLayout, workHome } from '../office-layout.js'
import { OFFICE_PLAN1_REGIONS, OFFICE_PLAN1_SEATS } from '../office-plan1-layout.js'
import { buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const pointInPolygon = (point, polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
const lineCrosses = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return abC * abD < -1e-8 && cdA * cdB < -1e-8
}
const segmentHitsBox = (a, b, box) => {
  let lo = 0, hi = 1
  for (const axis of ['x', 'z']) {
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-10) { if (a[axis] <= box[axis + '0'] || a[axis] >= box[axis + '1']) return false; continue }
    const p = (box[axis + '0'] - a[axis]) / delta, q = (box[axis + '1'] - a[axis]) / delta
    lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q))
    if (lo >= hi) return false
  }
  return hi > 0 && lo < 1
}
const workstationBox = station => {
  const halfX = Math.abs(Math.cos(station.yaw)) * .7 + Math.abs(Math.sin(station.yaw)) * .35
  const halfZ = Math.abs(Math.sin(station.yaw)) * .7 + Math.abs(Math.cos(station.yaw)) * .35
  return { x0: station.x - halfX, x1: station.x + halfX, z0: station.z - halfZ, z1: station.z + halfZ }
}

test('L1 is selected only by the exact ALIGN sample query and preserves every frozen fallback', () => {
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1'), LAYOUT_V3_ALIGN_SAMPLE)
  for (const search of ['', '?layout=2', '?layout=3', '?layout=3&align=1', '?layout=3&align=1&officeSample=0', '?layout=3&officeSample=1']) {
    assert.notEqual(resolveOfficeLayout(search), LAYOUT_V3_ALIGN_SAMPLE, search)
  }
  assert.equal(LAYOUT_V1, resolveOfficeLayout(''))
  assert.equal(LAYOUT_V2, resolveOfficeLayout('?layout=2'))
  assert.equal(LAYOUT_V3, resolveOfficeLayout('?layout=3'))
  assert.equal(LAYOUT_V3_ALIGN, resolveOfficeLayout('?layout=3&align=1'))
  assert.equal(LAYOUT_V3_ALIGN_SAMPLE.plan1Phase, 'L1')
})

test('L1 carries the approved 48x36 shell, 13 regions, curved product footprint and six-metre gate', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE
  assert.deepEqual(layout.envelope, { x0: -22, x1: 26, z0: -18, z1: 18 })
  assert.equal(layout.regions.length, 13)
  assert.deepEqual(layout.doors.south, { x0: -1, x1: 5, z: 18, width: 6, height: 3.5 })
  const product = layout.regions.find(region => region.id === 'product-eng-knowledge')
  assert.equal('rect' in product, false)
  assert.equal(product.footprint.length, 28)
  assert.deepEqual(layout.regions, OFFICE_PLAN1_REGIONS)
  const shell = buildOfficeShellV3Spec(layout)
  assert.equal(shell.outer.length, 29)
  assert.ok(shell.outer.some(wall => wall.a && wall.a.x !== wall.b.x && wall.a.z !== wall.b.z), 'entrance uses chorded arcs')
})

test('all 25 approved identities, desks and chair homes occur once and remain in their assigned regions', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, ids = Object.keys(layout.seats)
  assert.equal(ids.length, 25)
  assert.equal(new Set(ids).size, 25)
  assert.equal(hash(layout.seats), 'ace9a3ceb9b0969c244823f0c66dbf0aedd049966fed28741c0b0001a85b7bbb')
  assert.deepEqual(layout.seats, OFFICE_PLAN1_SEATS)
  for (const [id, seat] of Object.entries(layout.seats)) {
    const region = layout.regions.find(item => item.id === seat[0]), home = workHome(seat)
    assert.ok(region, `${id} region`)
    const contains = point => region.footprint ? pointInPolygon(point, region.footprint) : point.x > region.x0 && point.x < region.x1 && point.z > region.z0 && point.z < region.z1
    assert.ok(contains({ x: seat[1], z: seat[2] }), `${id} desk`)
    assert.ok(contains(home), `${id} home`)
  }
})

test('L1 route matrix is finite and no segment cuts a wall, another workstation or the solid tea-bar core', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, nav = createOfficeNavigation(layout), homes = Object.entries(layout.seats).map(([id, seat]) => [id, workHome(seat)])
  const furniture = officeFurnitureV2Spec(layout), meetings = furniture.meetings.flatMap(room => room.seats)
  const walls = buildOfficeShellV3Spec(layout).inner.filter(wall => wall.a)
  const desks = new Map(furniture.workstations.map(station => [station.name, workstationBox(station)]))
  const routes = []
  for (const [id, home] of homes) {
    routes.push([id, null, 'exit', nav.officeExit(home)], [id, null, 'board', nav.boardTrip(home, layout.boss.stand)])
    for (const [target, targetHome] of homes) routes.push([id, target, 'office', nav.officeTrip(home, targetHome, targetHome)])
    for (const seat of nav.LOUNGE_SEATS) routes.push([id, null, 'lounge', nav.loungeTrip(home, seat)])
    for (const seat of meetings) routes.push([id, null, 'meeting', nav.meetingTrip(home, seat)])
    for (const key of Object.keys(nav.consumerQueues)) routes.push([id, null, 'consumer', nav.consumerTrip(home, key, nav.consumerQueues[key][0])])
  }
  assert.equal(routes.length, 1225)
  for (const [id, target, kind, route] of routes) {
    assert.ok(route.length >= 1 && route.every(point => Number.isFinite(point.x) && Number.isFinite(point.z)), `${id}/${kind} finite`)
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i]
      for (const wall of walls) assert.equal(lineCrosses(a, b, wall.a, wall.b), false, `${id}->${target || kind}/${kind}/${i} wall ${wall.room?.id || wall.side}`)
      for (const [other, box] of desks) if (other !== id && other !== target) assert.equal(segmentHitsBox(a, b, box), false, `${id}/${kind}/${i} desk ${other}`)
      if (kind !== 'lounge') {
        const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
        const t = length2 ? Math.max(0, Math.min(1, ((layout.bar.center.x - a.x) * dx + (layout.bar.center.z - a.z) * dz) / length2)) : 0
        assert.ok(Math.hypot(a.x + t * dx - layout.bar.center.x, a.z + t * dz - layout.bar.center.z) >= layout.bar.radius - 1e-6, `${id}/${kind}/${i} bar core`)
      }
    }
  }
})

test('four display rooms and their twelve simulated identities move with the approved regions', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, expected = { market: [-18.6, -14.1], service: [22.85, -14.1], aftersales: [-18.6, 12], marketing: [22.6, 12] }
  assert.equal(layout.displaySeats.length, 12)
  for (const [region, [x, z]] of Object.entries(expected)) {
    const seats = layout.displaySeats.filter(seat => seat.region === region)
    assert.equal(seats.length, 3)
    assert.deepEqual(seats.map(seat => seat.x), [x - .4, x - .4, x + .4])
    assert.deepEqual(seats.map(seat => seat.z), [z - .8, z + .8, z - .8])
    assert.deepEqual(seats.map(seat => seat.yaw), [-Math.PI/2, -Math.PI/2, Math.PI/2])
  }
})
