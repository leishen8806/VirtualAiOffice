import assert from 'node:assert/strict'
import test from 'node:test'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import {
  CAMPUS_PAVING, CENTRAL_CIRCLE, CORRIDOR_X, ENTRANCE, FOYER_ITEMS, FOYER_QUEUES, FOYER_RECEPTION, FOYER_TARGETS, FOYER_ZONES,
  MAIN_AISLE, MINI_BOUNDS, OFFICE_ROOMS, PLAZA, RECEPTION, REGION_FOCUS, SEATS, WAITING_CAPACITY, WAITING_SEATS, consumerQueue, corridorPath,
  foyerReturnTrip, foyerTrip, loungeTrip, officeExit, plazaTrip, roomAt, roomSegments,
} from '../office-layout.js'

const TARGET_IDS = ['A1', 'A2', 'desk', 'B0', 'B1', 'B2', 'B3']
const EXISTING_FOCUS = ['product', 'eng', 'quality', 'drlife', 'board', 'kb', 'ops', 'review', 'plan', 'meet', 'plaza', 'lounge']
const halfGrid = n => Number.isInteger(n * 2)
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const inCircle = p => Math.hypot(p.x - CENTRAL_CIRCLE.cx, p.z - CENTRAL_CIRCLE.cz) < CENTRAL_CIRCLE.r - 1e-6
const rectHitsCircle = r => Math.hypot(Math.max(r.x0, Math.min(CENTRAL_CIRCLE.cx, r.x1)) - CENTRAL_CIRCLE.cx, Math.max(r.z0, Math.min(CENTRAL_CIRCLE.cz, r.z1)) - CENTRAL_CIRCLE.cz) < CENTRAL_CIRCLE.r
const inItem = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1
const receptionRect = { x0: RECEPTION.x - RECEPTION.width / 2, x1: RECEPTION.x + RECEPTION.width / 2, z0: RECEPTION.z0, z1: RECEPTION.z1 }
const inMainAisle = p => p.x > MAIN_AISLE.x0 && p.x < MAIN_AISLE.x1 && p.z >= 8 && p.z <= PLAZA.z1
const samples = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 10) + 1; return Array.from({ length: n }, (_, i) => ({ x: a.x + (b.x - a.x) * i / (n - 1 || 1), z: a.z + (b.z - a.z) * i / (n - 1 || 1) })) }

function assertNoWallCrossing(path) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    for (const room of OFFICE_ROOMS) for (const wall of roomSegments(room)) {
      const vertical = wall.side === 'west' || wall.side === 'east'
      const fixed = vertical ? (wall.side === 'west' ? room.x0 : room.x1) : (wall.side === 'north' ? room.z0 : room.z1)
      const av = vertical ? a.x : a.z, bv = vertical ? b.x : b.z
      if ((av - fixed) * (bv - fixed) > 0 || av === bv) continue
      const t = (fixed - av) / (bv - av), cross = vertical ? a.z + (b.z - a.z) * t : a.x + (b.x - a.x) * t
      assert.ok(cross <= wall.lo + 1e-6 || cross >= wall.hi - 1e-6, `${room.id}/${wall.side} crossed at ${cross}`)
    }
  }
}

function assertStaticSafe(path) {
  for (let i = 1; i < path.length; i++) for (const p of samples(path[i - 1], path[i])) {
    assert.ok(!FOYER_ITEMS.filter(x => x.blocksFloor).some(r => inItem(p, r)), `item collision at ${p.x},${p.z}`)
    assert.ok(!inItem(p, receptionRect), `central reception collision at ${p.x},${p.z}`)
    assert.ok(!inCircle(p), `central circle entered at ${p.x},${p.z}`)
    if (p.z > 13 && p.z < 16) assert.ok(p.x >= MAIN_AISLE.x0 && p.x <= MAIN_AISLE.x1, `door bridge left at ${p.x},${p.z}`)
  }
}

test('foyer constants are complete, derived and on the half-metre grid', () => {
  assert.equal(FOYER_ZONES.length, 12)
  assert.equal(FOYER_ITEMS.length, 27)
  assert.equal(Object.keys(FOYER_TARGETS).length, 27)
  assert.deepEqual(Object.keys(FOYER_QUEUES), TARGET_IDS)
  for (const r of [...FOYER_ZONES, ...FOYER_ITEMS]) {
    for (const n of [r.x0, r.x1, r.z0, r.z1, r.center.x, r.center.z]) assert.ok(halfGrid(n), `${r.id} ${n}`)
    if (!['plaza_service', 'B0'].includes(r.id)) assert.deepEqual(r.center, { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })
    if (r.size) assert.deepEqual(r.size, { x: r.x1 - r.x0, z: r.z1 - r.z0 })
  }
  for (const p of [...Object.values(FOYER_TARGETS), ...Object.values(FOYER_QUEUES).flat()]) assert.ok(halfGrid(p.x) && halfGrid(p.z))
  assert.deepEqual(FOYER_RECEPTION, { x0: 8.5, x1: 14.5, z0: 8.5, z1: 9.5 })
})

test('items, aisle, entrance, circle and named targets stay geometrically valid', () => {
  for (let i = 0; i < FOYER_ITEMS.length; i++) for (let j = i + 1; j < FOYER_ITEMS.length; j++) assert.ok(!overlaps(FOYER_ITEMS[i], FOYER_ITEMS[j]), `${FOYER_ITEMS[i].id}/${FOYER_ITEMS[j].id}`)
  assert.deepEqual(Object.keys(FOYER_TARGETS).sort(), FOYER_ITEMS.map(x => x.id).sort())
  for (const item of FOYER_ITEMS.filter(x => x.blocksFloor)) {
    assert.ok(!overlaps(item, { ...MAIN_AISLE, z0: 8, z1: PLAZA.z1 }), `${item.id} blocks aisle`)
    assert.ok(!rectHitsCircle(item), `${item.id} enters circle`)
  }
  for (const [id, p] of Object.entries(FOYER_TARGETS)) {
    assert.equal(roomAt(p), undefined, `${id} is in a room`)
    assert.ok(!FOYER_ITEMS.filter(x => x.blocksFloor).some(r => inItem(p, r)), `${id} is blocked`)
    assert.ok((p.z >= 8 && p.z <= 13) || (p.x >= PLAZA.x0 && p.x <= PLAZA.x1 && p.z >= PLAZA.z0 && p.z <= PLAZA.z1), `${id} is outside walk area`)
  }
  assert.equal(ENTRANCE.gate.every(p => p.x === CORRIDOR_X && p.x >= MAIN_AISLE.x0 && p.x <= MAIN_AISLE.x1), true)
})

test('central reception is separate from the foyer plan, aisle, targets and queues', () => {
  assert.ok(FOYER_ITEMS.every(item => !overlaps(receptionRect, item)), 'central reception overlaps a planned item')
  assert.ok(!overlaps(receptionRect, { ...MAIN_AISLE, z0: 8, z1: PLAZA.z1 }), 'central reception overlaps the foyer/plaza aisle')
  for (const [id, p] of [...Object.entries(FOYER_TARGETS), ...Object.values(FOYER_QUEUES).flat().map((p, i) => [`queue-${i}`, p])]) {
    assert.ok(!inItem(p, receptionRect), `${id} is inside the central reception`)
  }
})

test('all seven queues have six ordered, spaced, walkable points', () => {
  for (const [id, queue] of Object.entries(FOYER_QUEUES)) {
    assert.equal(queue.length, 6, id)
    for (let i = 1; i < queue.length; i++) assert.ok(Math.hypot(queue[i].x - queue[i - 1].x, queue[i].z - queue[i - 1].z) >= 1 && 1 > PERSON_GAP, `${id}/${i}`)
    for (const p of queue) {
      assert.ok(!inMainAisle(p), `${id} occupies aisle`)
      assert.ok(!inCircle(p), `${id} occupies circle`)
      assert.ok(!(p.z >= 13 && p.z <= 16 && p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1), `${id} occupies entrance`)
    }
  }
})

test('four waiting seats stay fixed, spaced and clear of every planned obstruction', () => {
  assert.equal(WAITING_CAPACITY, 4)
  assert.equal(WAITING_CAPACITY, WAITING_SEATS.length)
  for (let i = 0; i < WAITING_SEATS.length; i++) {
    const p = WAITING_SEATS[i]
    assert.ok(halfGrid(p.x) && halfGrid(p.z), `waiting/${i} off half-grid`)
    assert.equal(p.yaw, 0)
    assert.ok(!inMainAisle(p), `waiting/${i} occupies aisle`)
    assert.ok(!inCircle(p), `waiting/${i} occupies circle`)
    assert.ok(!(p.z >= 13 && p.z <= 16 && p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1), `waiting/${i} occupies entrance`)
    assert.ok(!FOYER_ITEMS.filter(x => x.blocksFloor).some(item => inItem(p, item)), `waiting/${i} hits item`)
    for (const queue of Object.values(FOYER_QUEUES)) for (const q of queue) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 1, `waiting/${i} hits queue`)
    if (i) assert.ok(Math.hypot(p.x - WAITING_SEATS[i - 1].x, p.z - WAITING_SEATS[i - 1].z) >= 1)
  }
})

test('consumerQueue selects only the first fixed free slot', () => {
  const first = FOYER_QUEUES.A1[0], second = FOYER_QUEUES.A1[1]
  assert.deepEqual(consumerQueue('A1'), first)
  assert.deepEqual(consumerQueue('A1', [first]), second)
  assert.deepEqual(consumerQueue('A1', [{ x: 999, z: 999 }]), first)
  assert.equal(consumerQueue('A1', FOYER_QUEUES.A1), null)
})

test('all 25 homes have safe foyer/plaza outward and reverse routes', () => {
  assert.equal(Object.keys(SEATS).length, 25)
  for (const [, x, z] of Object.values(SEATS)) for (const targetId of TARGET_IDS) {
    const home = { x, z }, go = targetId.startsWith('B') ? plazaTrip(home, targetId) : foyerTrip(home, targetId)
    const back = foyerReturnTrip(home, targetId), endpoint = FOYER_QUEUES[targetId][0]
    assert.deepEqual(go.at(-1), endpoint)
    assert.deepEqual(back, go.toReversed())
    assert.deepEqual(back.at(-1), officeExit(home)[0])
    assertNoWallCrossing(go); assertStaticSafe(go)
    assertNoWallCrossing(back); assertStaticSafe(back)
  }
  assert.deepEqual(foyerTrip({ x: -25.5, z: -9 }, 'a1_counter').at(-1), FOYER_TARGETS.a1_counter)
  assert.deepEqual(plazaTrip({ x: -25.5, z: -9 }, 'b0_table_1').at(-1), FOYER_TARGETS.b0_table_1)
})

test('public keys remain additive while the central reception keeps its detour', () => {
  assert.deepEqual(RECEPTION, { x: CORRIDOR_X, z: 5.5, width: 5.5, z0: 3.8, z1: 6.5, bypassX: -2 })
  assert.ok(corridorPath({ x: CORRIDOR_X, z: 2 }, { x: CORRIDOR_X, z: 8 }).some(p => p.x === RECEPTION.bypassX))
  assert.ok(loungeTrip({ x: -25.5, z: -9 }, { x: -11.5, z: 10, appX: -10.5 }).length > 1)
  assert.ok(EXISTING_FOCUS.every(k => k in REGION_FOCUS))
  assert.deepEqual(['foyer_A1', 'foyer_A2', 'foyer_desk'].filter(k => k in REGION_FOCUS), ['foyer_A1', 'foyer_A2', 'foyer_desk'])
  assert.equal(REGION_FOCUS.foyer_desk.label, '前厅服务台（接待与等候）')
  assert.equal(MINI_BOUNDS.z1, CAMPUS_PAVING.z1 + 2)
})
