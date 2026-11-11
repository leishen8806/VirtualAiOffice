import assert from 'node:assert/strict'
import test from 'node:test'
import * as layout from '../office-layout.js'
import { CAT_DESTINATIONS, catRoamPoints, catRoute } from '../cat-play.js'

const {
  CAMPUS_PAVING, DOCK, ENVELOPE, FOYER_ITEMS, FOYER_QUEUES, FOYER_TARGETS, LOGISTICS_GATE_ZONE,
  MINI_BOUNDS, PARKING, PLAZA, SEATS, SERVICE_PASSAGE, WAITING_SEATS, WAREHOUSE, WAREHOUSE_FOCUS,
  WAREHOUSE_ITEMS, WEST_WALK, corridorPath, foyerTrip, plazaTrip, workHome,
} = layout
const IDS = ['w1_rack_a', 'w1_rack_b', 'w1_rack_c', 'w1_rack_d', 'w2_sort', 'w2_review', 'w2_pack', 'w2_aftercare', 'w3_stack_a', 'w3_stack_b', 'w3_forklift_bay', 'dock_buffer_a', 'dock_buffer_b', 'dock_buffer_c', 'truck_bay_1', 'truck_bay_2', 'service_parking', 'logistics_sign', 'west_green', 'logistics_gate', 'warehouse_sign', 'supply_panel']
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1
const pointIn = (p, b, pad = 0) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad
const halfGrid = value => Number.isFinite(value) && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
const segmentHits = (a, b, obstacle, pad = 0.3) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1))
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps })).some(p => pointIn(p, obstacle, pad))
}
const routeHits = (route, obstacle) => route.some((p, i) => i && segmentHits(route[i - 1], p, obstacle))

function validateWarehouse(warehouse, items) {
  assert.ok((warehouse.x1 - warehouse.x0) * (warehouse.z1 - warehouse.z0) >= 336)
  for (const item of items) assert.ok(!overlap(item, PLAZA), `${item.id} overlaps plaza`)
}

test('warehouse constants preserve the complete 336 m² plan on the half-metre grid', () => {
  assert.equal(WAREHOUSE.x1 - WAREHOUSE.x0, 28)
  assert.equal(WAREHOUSE.z1 - WAREHOUSE.z0, 12)
  assert.equal((WAREHOUSE.x1 - WAREHOUSE.x0) * (WAREHOUSE.z1 - WAREHOUSE.z0), 336)
  assert.ok((DOCK.x1 - DOCK.x0) * (DOCK.z1 - DOCK.z0) >= 70)
  assert.ok((PARKING.x1 - PARKING.x0) * (PARKING.z1 - PARKING.z0) >= 112)
  assert.equal(WAREHOUSE_ITEMS.length, 22)
  assert.deepEqual(WAREHOUSE_ITEMS.map(item => item.id), IDS)
  assert.deepEqual(WAREHOUSE_FOCUS, { label: 'DR 仓库', t: [-28, 0, 23], r: 26 })
  assert.deepEqual(LOGISTICS_GATE_ZONE, { x0: -46, x1: -44, z0: 30, z1: 35 })
  const geometry = [WAREHOUSE, DOCK, PARKING, WEST_WALK, SERVICE_PASSAGE, CAMPUS_PAVING, LOGISTICS_GATE_ZONE]
  for (const item of [...geometry, ...WAREHOUSE_ITEMS]) {
    for (const key of ['x0', 'x1', 'z0', 'z1']) assert.ok(halfGrid(item[key]), `${item.id || 'area'}.${key}`)
  }
  for (const item of WAREHOUSE_ITEMS) {
    assert.deepEqual(Object.keys(item).sort(), ['blocksFloor', 'center', 'id', 'name', 'personAccessible', 'size', 'x0', 'x1', 'yaw', 'z0', 'z1'].sort())
    assert.deepEqual(item.center, { x: (item.x0 + item.x1) / 2, z: (item.z0 + item.z1) / 2 })
    assert.deepEqual(item.size, { x: item.x1 - item.x0, z: item.z1 - item.z0 })
    assert.equal(item.personAccessible, false)
    assert.ok(Object.isFrozen(item) && Object.isFrozen(item.center) && Object.isFrozen(item.size))
  }
  assert.ok([WAREHOUSE, DOCK, PARKING, WEST_WALK, SERVICE_PASSAGE, CAMPUS_PAVING, LOGISTICS_GATE_ZONE, WAREHOUSE_FOCUS, WAREHOUSE_ITEMS].every(Object.isFrozen))
})

test('warehouse spacing, items, existing foyer points and minimap margins stay conflict-free', () => {
  assert.equal(PLAZA.x0 - WAREHOUSE.x1, 4)
  assert.equal(WAREHOUSE.z0 - ENVELOPE.z1, 4)
  assert.equal(WEST_WALK.x1 - WEST_WALK.x0, 4)
  assert.equal(SERVICE_PASSAGE.z1 - SERVICE_PASSAGE.z0, 4)
  for (let i = 0; i < WAREHOUSE_ITEMS.length; i++) {
    const item = WAREHOUSE_ITEMS[i]
    assert.ok(inside(item, CAMPUS_PAVING), `${item.id} leaves paving`)
    assert.ok(!overlap(item, PLAZA) && !overlap(item, ENVELOPE), `${item.id} overlaps existing area`)
    assert.ok(!overlap(item, WEST_WALK) && !overlap(item, SERVICE_PASSAGE), `${item.id} blocks a four-metre passage`)
    for (let j = i + 1; j < WAREHOUSE_ITEMS.length; j++) assert.ok(!overlap(item, WAREHOUSE_ITEMS[j]), `${item.id}/${WAREHOUSE_ITEMS[j].id}`)
  }
  for (const item of FOYER_ITEMS) assert.ok(!WAREHOUSE_ITEMS.some(candidate => overlap(item, candidate)), `foyer/${item.id}`)
  for (const point of [...Object.values(FOYER_QUEUES).flat(), ...WAITING_SEATS]) assert.ok(!WAREHOUSE_ITEMS.some(item => pointIn(point, item)))
  assert.equal(MINI_BOUNDS.x0, CAMPUS_PAVING.x0 - 2)
  assert.equal(MINI_BOUNDS.z1, CAMPUS_PAVING.z1 + 2)
  assert.equal(MINI_BOUNDS.x1, 24)
  assert.equal(MINI_BOUNDS.z0, -15)
})

test('all current people and cat public routes avoid warehouse, dock and parking', () => {
  const obstacles = [WAREHOUSE, DOCK, PARKING]
  for (const seat of Object.values(SEATS)) {
    const home = workHome(seat)
    for (const target of Object.keys(FOYER_TARGETS)) for (const route of [foyerTrip(home, target), plazaTrip(home, target)]) {
      for (const obstacle of obstacles) assert.equal(routeHits(route, obstacle), false)
    }
  }
  const catPoints = [...catRoamPoints(), ...Object.values(CAT_DESTINATIONS)]
  for (let i = 0; i < catPoints.length; i++) {
    const route = catRoute(catPoints[i], catPoints[(i + 1) % catPoints.length])
    assert.ok(route)
    for (const obstacle of obstacles) assert.equal(routeHits([catPoints[i], ...route], obstacle), false)
  }
  const corridor = corridorPath({ x: ENVELOPE.x0, z: -2 }, { x: 2, z: 12 })
  assert.equal(routeHits([{ x: ENVELOPE.x0, z: -2 }, ...corridor], WAREHOUSE), false)
})

test('shallow and plaza-overlap mutations fail the same plan validator', () => {
  assert.throws(() => validateWarehouse({ ...WAREHOUSE, z1: 28.5 }, WAREHOUSE_ITEMS))
  assert.throws(() => validateWarehouse(WAREHOUSE, [{ ...WAREHOUSE_ITEMS[0], x0: PLAZA.x0 + 1, x1: PLAZA.x0 + 5 }]))
})

test('all pre-S2-1 data exports except the intentional minimap change are byte-equivalent', async () => {
  const before = await import('./fixtures/historical/office3d-backup-s2-1/office-layout.js')
  const added = new Set(['WAREHOUSE', 'DOCK', 'PARKING', 'WEST_WALK', 'SERVICE_PASSAGE', 'CAMPUS_PAVING', 'LOGISTICS_GATE_ZONE', 'WAREHOUSE_FOCUS', 'WAREHOUSE_ITEMS'])
  for (const [name, value] of Object.entries(before)) {
    if (typeof value === 'function' || name === 'MINI_BOUNDS' || added.has(name)) continue
    assert.deepEqual(layout[name], value, name)
  }
})
