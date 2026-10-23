import test from 'node:test'
import assert from 'node:assert/strict'
import * as layout from '../office-layout.js'

const retainedIds = ['market', 'board', 'review', 'plan', 'ops', 'quality', 'aftersales', 'kb', 'service', 'product', 'eng', 'drlife', 'marketing']
const addedIds = ['leisure', 'creative', 'dining']
const overlaps = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.z1, b.z1) > Math.max(a.z0, b.z0)
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9
const clone = (value) => structuredClone(value)

const validate = (v3) => {
  const errors = []
  const structural = [
    ...['x0', 'x1', 'z0', 'z1'].map((key) => v3.envelope[key]),
    ...['x0', 'x1', 'z0', 'z1'].map((key) => v3.site[key]),
    ...v3.regions.flatMap((region) => [region.x0, region.x1, region.z0, region.z1, ...region.doors.flatMap((door) => [door.at, door.width])]),
    ...Object.values(v3.corridors).flatMap((corridor) => 'center' in corridor
      ? [corridor.center.x, corridor.center.z, corridor.r0, corridor.r1, corridor.width]
      : [corridor.x0, corridor.x1, corridor.z0, corridor.z1, corridor.width]),
    ...Object.values(v3.passages).flatMap((passage) => 'center' in passage
      ? [passage.center.x, passage.center.z, passage.r0, passage.r1, passage.width]
      : [passage.x0, passage.x1, passage.z0, passage.z1, passage.width]),
    ...Object.values(v3.doors).flatMap((door) => [door.x0, door.x1, door.z, door.width]),
    v3.ring.center.x, v3.ring.center.z, v3.ring.inner, v3.ring.outer, v3.ring.width,
    v3.island.center.x, v3.island.center.z, v3.island.radius,
    v3.plaza.center.x, v3.plaza.center.z, v3.plaza.radius,
    v3.greenBuffer.width, v3.greenBuffer.x0, v3.greenBuffer.x1, v3.greenBuffer.z0, v3.greenBuffer.z1,
    v3.wallHeight.standard, v3.wallHeight.atrium, v3.wallHeight.windowBandBottom,
  ]
  if (!structural.every((value) => onGrid(value, 0.5))) errors.push('structural-grid')
  for (let i = 0; i < v3.regions.length; i++) {
    if (!v3.regions[i].doors.length || v3.regions[i].doors.some((door) => door.width < 1.5)) errors.push('door')
    for (const other of v3.regions.slice(i + 1)) if (overlaps(v3.regions[i], other)) errors.push('overlap')
  }
  if (v3.ring.outer - v3.ring.inner < 4) errors.push('ring')
  if (v3.plaza.center.z - v3.plaza.radius !== v3.envelope.z1) errors.push('plaza-tangent')
  for (const [name, [regionId, x, z]] of Object.entries(v3.seats)) {
    const region = v3.regions.find((item) => item.id === regionId)
    if (!region || x <= region.x0 || x >= region.x1 || z <= region.z0 || z >= region.z1) errors.push(`seat:${name}`)
  }
  return errors
}

test('layout3 exposes the complete frozen rev3 data contract', () => {
  const v3 = layout.LAYOUT_V3
  assert.equal(v3.version, 3)
  for (const key of ['envelope', 'axis', 'regions', 'rooms', 'seats', 'displaySeats', 'corridors', 'passages', 'bar', 'frontDesk', 'serviceBar', 'waitingArc', 'doors', 'boss', 'boardTable', 'meetingSeats', 'regionFocus', 'miniBounds', 'plaza', 'ring', 'island', 'greenBuffer', 'wallHeight', 'monitorFit', 'cameraDefaults']) assert.ok(key in v3, key)
  assert.deepEqual(v3.envelope, { x0: -28, x1: 32, z0: -18, z1: 12, width: 60, depth: 30, area: 1800 })
  assert.deepEqual(v3.site, { x0: -28, x1: 32, z0: -18, z1: 30, width: 60, depth: 48, area: 2880 })
  assert.equal(Object.isFrozen(v3), true)
  assert.equal(Object.isFrozen(v3.regions[0]), true)
  assert.throws(() => { v3.envelope.x0 = 0 }, TypeError)
})

test('layout3 keeps all retained ids, adds three unique ids and preserves 25 role mappings', () => {
  const v3 = layout.LAYOUT_V3
  const ids = v3.regions.map((region) => region.id)
  assert.deepEqual(ids, [...retainedIds.slice(0, 7), 'leisure', ...retainedIds.slice(7, 9), 'product', 'eng', 'creative', 'dining', 'drlife', 'marketing'])
  assert.equal(new Set(ids).size, 16)
  assert.ok(retainedIds.every((id) => ids.includes(id)))
  assert.ok(addedIds.every((id) => ids.includes(id)))
  assert.equal(Object.keys(v3.seats).length, 25)
  for (const name of Object.keys(layout.SEATS)) assert.equal(v3.seats[name][0], layout.SEATS[name][0], name)
  assert.equal(v3.displaySeats.length, 12)
  assert.ok(v3.displaySeats.every((seat) => seat.display === true))
})

test('layout3 applies separate structural and furniture grids', () => {
  const v3 = layout.LAYOUT_V3
  assert.deepEqual(validate(v3), [])
  assert.equal(v3.regions.find((region) => region.id === 'product').doors[0].at, -7)
  assert.equal(v3.seats.Lead[1], 14.2)
  assert.equal(v3.seats.FrontendSenior[1], 24.2)
  assert.equal(v3.seats.Frontend2[1], 29.8)
  for (const [, x, z] of Object.values(v3.seats)) assert.ok(onGrid(x, 0.1) && onGrid(z, 0.1))
  for (const item of [v3.frontDesk, v3.serviceBar, v3.waitingArc]) {
    for (const value of [item.x0, item.x1, item.z0, item.z1]) assert.ok(onGrid(value, 0.1))
  }
})

test('layout3 geometry and quantities match the rev3 plan', () => {
  const v3 = layout.LAYOUT_V3
  assert.deepEqual(v3.ring, { center: { x: 2, z: -6 }, inner: 6, outer: 10, width: 4 })
  assert.deepEqual(v3.island, { center: { x: 2, z: -6 }, radius: 6, diameter: 12, treeRadius: 1.2, barOuter: 3.5, stoolRadius: 4.2, sofaOuter: 5.8 })
  assert.equal(v3.plaza.radius, 9)
  assert.equal(v3.plaza.diameter, 18)
  assert.equal(v3.plaza.rings, 3)
  assert.equal(v3.plaza.radialSeams, 8)
  assert.equal(v3.plaza.carts.length, 1)
  assert.equal(v3.plaza.kiosks.length, 3)
  assert.equal(v3.plaza.umbrellaTables.length, 4)
  assert.equal(v3.plaza.lamps.length, 8)
  assert.equal(v3.plaza.benches.length, 6)
  assert.equal(v3.plaza.flowerBands.length, 4)
  assert.deepEqual(v3.greenBuffer, { width: 2.5, x0: -30.5, x1: 34.5, z0: -20.5, z1: 32.5 })
  assert.equal(v3.wallHeight.standard, 4.5)
  assert.equal(v3.wallHeight.atrium, 6)
  assert.equal(v3.wallHeight.windowBandBottom, 3.5)
  assert.equal(Object.keys(v3.cameraDefaults).length, 6)
})

test('layout3 checks catch seven independent contract mutations', () => {
  const mutations = [
    ['structural-grid', (value) => { value.regions[0].x0 = -27.8 }],
    ['overlap', (value) => { value.regions.find((region) => region.id === 'service').x0 = 19 }],
    ['ring', (value) => { value.ring.outer = 9.5 }],
    ['door', (value) => { value.regions.find((region) => region.id === 'plan').doors.length = 0 }],
    ['seat:Lead', (value) => { value.seats.Lead[1] = 40 }],
    ['plaza-tangent', (value) => { value.plaza.center.z = 21.5 }],
    ['structural-grid', (value) => { value.regions.find((region) => region.id === 'product').doors[0].at = -6.8 }],
  ]
  for (const [expected, mutate] of mutations) {
    const value = clone(layout.LAYOUT_V3)
    mutate(value)
    assert.ok(validate(value).includes(expected), expected)
  }
})

test('resolver selects exactly one supported layout parameter', () => {
  assert.equal(layout.resolveOfficeLayout('?layout=3'), layout.LAYOUT_V3)
  assert.equal(layout.resolveOfficeLayout('layout=3'), layout.LAYOUT_V3)
  assert.equal(layout.resolveOfficeLayout('?layout=2'), layout.LAYOUT_V2)
  for (const search of ['', '?layout=1', '?layout=4', '?layout=3&layout=3', '?layout=3&layout=2', '?layout=2&layout=3', '?layout=%33x']) assert.equal(layout.resolveOfficeLayout(search), layout.LAYOUT_V1, search)
})
