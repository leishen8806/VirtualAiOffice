import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { CONSUMER_TARGETS, createQueueBoard, dwellMs, visitPlan } from '../foyer-paths.js'
import { CENTRAL_CIRCLE, FOYER_ITEMS, FOYER_QUEUES, MEETING_SEATS, OFFICE_ROOMS, SEATS, consumerQueue, foyerReturnTrip, foyerTrip, loungeTrip, meetingTrip, officeExit, plazaTrip, roomSegments, workHome } from '../office-layout.js'

const WALLS = OFFICE_ROOMS.flatMap((room) => roomSegments(room).map((wall) => {
  const vertical = wall.side === 'west' || wall.side === 'east'
  return {
    ...wall,
    vertical,
    edge: vertical ? (wall.side === 'west' ? room.x0 : room.x1) : (wall.side === 'north' ? room.z0 : room.z1),
    label: `${room.id}/${wall.side}`,
  }
}))

const BLOCKERS = FOYER_ITEMS.filter((item) => item.blocksFloor)
const HOMES = Object.values(SEATS).map(workHome)
const QUEUE_TARGET_IDS = Object.keys(FOYER_QUEUES)

const SOURCE_URL = new URL('../foyer-paths.js', import.meta.url)
const TEST_URL = new URL('./foyer-paths.test.mjs', import.meta.url)

function crossesWall(a, b) {
  const eps = 1e-7
  for (const wall of WALLS) {
    const av = wall.vertical ? a.x : a.z
    const bv = wall.vertical ? b.x : b.z
    if ((av - wall.edge) * (bv - wall.edge) >= -eps || Math.abs(bv - av) < eps) continue
    const t = (wall.edge - av) / (bv - av)
    const at = wall.vertical ? a.z + (b.z - a.z) * t : a.x + (b.x - a.x) * t
    if (t > eps && t < 1 - eps && at > wall.lo + eps && at < wall.hi - eps) return wall.label
  }
  return null
}

function pointInRect(point, rect, eps = 1e-9) {
  return point.x > rect.x0 + eps && point.x < rect.x1 - eps && point.z > rect.z0 + eps && point.z < rect.z1 - eps
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function onSegment(a, b, p, eps = 1e-9) {
  return p.x >= Math.min(a.x, b.x) - eps && p.x <= Math.max(a.x, b.x) + eps && p.z >= Math.min(a.z, b.z) - eps && p.z <= Math.max(a.z, b.z) + eps
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  const eps = 1e-9

  if (Math.abs(o1) < eps && onSegment(a, b, c)) return true
  if (Math.abs(o2) < eps && onSegment(a, b, d)) return true
  if (Math.abs(o3) < eps && onSegment(c, d, a)) return true
  if (Math.abs(o4) < eps && onSegment(c, d, b)) return true
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)
}

function crossesRect(a, b, rect) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true
  const steps = Math.max(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 8))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    if (pointInRect(point, rect)) return true
  }
  return false
}

function distSqToSegment(point, a, b) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lenSq = dx * dx + dz * dz
  if (!lenSq) return (point.x - a.x) ** 2 + (point.z - a.z) ** 2
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lenSq))
  const px = a.x + dx * t
  const pz = a.z + dz * t
  return (point.x - px) ** 2 + (point.z - pz) ** 2
}

function pathSegments(path) {
  return path.slice(1).map((point, index) => [path[index], point])
}

test('queue board handles join, full, leave compression and independent queues', () => {
  const board = createQueueBoard()
  const joined = Array.from({ length: 6 }, (_, i) => board.join(`A${i}`, 'A1'))
  assert.deepEqual(joined.map((entry) => entry.slot), [0, 1, 2, 3, 4, 5])
  assert.equal(board.head('A1'), 'A0')
  assert.equal(board.occupancy('A1'), 6)
  assert.deepEqual(board.join('A6', 'A1'), { ok: false, reason: 'full' })
  assert.deepEqual(board.join('A0', 'A2'), { ok: false, reason: 'already_queued' })
  assert.deepEqual(board.join('ghost', 'unknown'), { ok: false, reason: 'unknown_target' })

  const leave = board.leave('A2')
  assert.equal(leave.ok, true)
  assert.deepEqual(leave.advance, [
    { agentId: 'A3', from: 3, to: 2, point: FOYER_QUEUES.A1[2] },
    { agentId: 'A4', from: 4, to: 3, point: FOYER_QUEUES.A1[3] },
    { agentId: 'A5', from: 5, to: 4, point: FOYER_QUEUES.A1[4] },
  ])
  assert.equal(board.head('A1'), 'A0')
  assert.equal(board.occupancy('A1'), 5)
  assert.deepEqual(board.leave('A2'), { ok: false, advance: [] })

  const rejoin = board.join('A2', 'A1')
  assert.equal(rejoin.ok, true)
  assert.equal(rejoin.slot, 5)
  assert.deepEqual(rejoin.point, FOYER_QUEUES.A1[5])

  for (const targetId of QUEUE_TARGET_IDS) {
    const res = board.join(`solo-${targetId}`, targetId)
    if (targetId === 'A1') continue
    assert.equal(res.ok, true)
    assert.equal(res.slot, 0)
    assert.equal(board.head(targetId), `solo-${targetId}`)
    assert.equal(board.occupancy(targetId), 1)
  }

  assert.deepEqual(board.snapshot(), {
    A1: ['A0', 'A1', 'A3', 'A4', 'A5', 'A2'],
    A2: ['solo-A2'],
    desk: ['solo-desk'],
    B0: ['solo-B0'],
    B1: ['solo-B1'],
    B2: ['solo-B2'],
    B3: ['solo-B3'],
  })
})

test('visitPlan generates reversible routes for every home and queue target without crossing walls or foyer blockers', () => {
  for (const home of HOMES) for (const targetId of QUEUE_TARGET_IDS) {
    const board = createQueueBoard()
    const plan = visitPlan({ home, targetId, board, agentId: `${home.x},${home.z}:${targetId}` })
    assert.equal(plan.ok, true, `${home.x},${home.z}:${targetId}`)
    assert.equal(plan.slot, 0)
    assert.deepEqual(plan.stand, FOYER_QUEUES[targetId][0])
    assert.deepEqual(plan.go.at(-1), plan.stand)
    assert.deepEqual(plan.back[0], plan.stand)
    assert.deepEqual(plan.back.at(-1), officeExit(home)[0])
    assert.deepEqual(plan.go.slice(0, -1), plan.back.toReversed().slice(0, -1))

    for (const path of [plan.go, plan.back]) {
      for (const point of path) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), `${targetId} has non-finite point`)
      }
      for (const [from, to] of pathSegments(path)) {
        const wall = crossesWall(from, to)
        assert.equal(wall, null, `${targetId} crossed wall ${wall}`)
        for (const blocker of BLOCKERS) assert.equal(crossesRect(from, to, blocker), false, `${targetId} crossed ${blocker.id}`)
        assert.ok(distSqToSegment({ x: CENTRAL_CIRCLE.cx, z: CENTRAL_CIRCLE.cz }, from, to) >= CENTRAL_CIRCLE.r ** 2 - 1e-9, `${targetId} entered central circle`)
      }
    }

    board.leave(`${home.x},${home.z}:${targetId}`)
    assert.equal(board.occupancy(targetId), 0)
  }
})

test('dwellMs covers queue and seat categories with boundary-safe rng', () => {
  assert.equal(dwellMs('A1', () => 0), 90_000)
  assert.equal(dwellMs('desk', () => 0), 30_000)
  assert.equal(dwellMs('b0_table_1', () => 0), 120_000)
  assert.equal(dwellMs('A1', () => 0.999999999), 240_000)
  assert.equal(dwellMs('desk', () => 0.999999999), 90_000)
  assert.equal(dwellMs('south_east_bench_2', () => 0.999999999), 360_000)
})

test('static guard: foyer-paths stays pure and free of forbidden consumer or DOM terms', () => {
  const source = fs.readFileSync(SOURCE_URL, 'utf8')
  const forbidden = ['buy', 'pay', 'purchase', 'wallet', 'balance', 'price', 'innerHTML', 'fetch(', 'Math.random(', 'performance.now(']
  for (const token of forbidden) assert.equal(source.includes(token), false, `foyer-paths.js contains ${token}`)
  for (const token of ['../server.mjs', '../committee.mjs', '../today.mjs', '../standup.mjs']) assert.equal(source.includes(token), false, `foyer-paths.js imports ${token}`)
  assert.match(source, /from '\.\/office-layout\.js'/)
  assert.equal(fs.readFileSync(TEST_URL, 'utf8').includes("from '../foyer-paths.js'"), true)
})

test('existing office-layout consumer and travel helpers stay byte-for-byte stable in behavior', () => {
  const leadHome = workHome(SEATS.Lead)
  const expectedOfficeExit = [
    { x: -24.5, z: -8 },
    { x: -24.5, z: -6.5 },
    { x: -22, z: -6.5 },
    { x: -22, z: -4.5 },
    { x: -22, z: -3 },
    { x: -21.5, z: -3 },
  ]
  const expectedFoyerTrip = [
    { x: -24.5, z: -8 },
    { x: -24.5, z: -6.5 },
    { x: -22, z: -6.5 },
    { x: -22, z: -4.5 },
    { x: -22, z: -3 },
    { x: -21.5, z: -3 },
    { x: -21.5, z: -2.5 },
    { x: 2, z: -2.5 },
    { x: -2, z: -2.5 },
    { x: -2, z: 12 },
    { x: 2, z: 12 },
    { x: -33, z: 12 },
  ]
  const expectedPlazaTrip = [
    { x: -24.5, z: -8 },
    { x: -24.5, z: -6.5 },
    { x: -22, z: -6.5 },
    { x: -22, z: -4.5 },
    { x: -22, z: -3 },
    { x: -21.5, z: -3 },
    { x: -21.5, z: -2.5 },
    { x: 2, z: -2.5 },
    { x: -2, z: -2.5 },
    { x: -2, z: 12 },
    { x: 2, z: 12 },
    { x: 2, z: 13.5 },
    { x: 2, z: 16.5 },
    { x: 7, z: 16.5 },
    { x: 7, z: 18.5 },
    { x: 8, z: 18.5 },
  ]
  const expectedReturn = expectedPlazaTrip.toReversed().map((point) => ({ ...point }))
  const loungeSeat = { x: -11.5, z: 9.5, yaw: -Math.PI / 2, appX: -10.5 }
  const expectedLoungeTrip = [
    { x: -24.5, z: -8 },
    { x: -24.5, z: -6.5 },
    { x: -22, z: -6.5 },
    { x: -22, z: -4.5 },
    { x: -22, z: -3 },
    { x: -21.5, z: -3 },
    { x: -21.5, z: -2.5 },
    { x: 2, z: -2.5 },
    { x: -2, z: -2.5 },
    { x: -2, z: 8.5 },
    { x: 2, z: 8.5 },
    { x: -10.5, z: 8.5 },
    { x: -10.5, z: 9.5 },
    { x: -11.5, z: 9.5 },
  ]
  const expectedMeetingTrip = [
    { x: -24.5, z: -8 },
    { x: -24.5, z: -6.5 },
    { x: -22, z: -6.5 },
    { x: -22, z: -4.5 },
    { x: -22, z: -3 },
    { x: -21.5, z: -3 },
    { x: -21.5, z: -1.5 },
    { x: -38.5, z: -1.5 },
    { x: -38.5, z: -2 },
    { x: -38.5, z: -4.5 },
    { x: -38.5, z: -11 },
    { x: -40, z: -11 },
    { x: -40, z: -10 },
  ]

  assert.deepEqual(officeExit(leadHome), expectedOfficeExit)
  assert.deepEqual(consumerQueue('A1', [{ x: -33, z: 12 }, { x: -32, z: 12 }]), { x: -31, z: 12 })
  assert.deepEqual(foyerTrip(leadHome, 'A1'), expectedFoyerTrip)
  assert.deepEqual(plazaTrip(leadHome, 'B1'), expectedPlazaTrip)
  assert.deepEqual(foyerReturnTrip(leadHome, 'B1'), expectedReturn)
  assert.deepEqual(loungeTrip(leadHome, loungeSeat), expectedLoungeTrip)
  assert.deepEqual(meetingTrip(leadHome, MEETING_SEATS[0]), expectedMeetingTrip)
  assert.equal(CONSUMER_TARGETS.A1.region, 'foyer')
  assert.equal(CONSUMER_TARGETS.B1.region, 'plaza')
  assert.deepEqual(CONSUMER_TARGETS.waiting_sofa.dwell, [30_000, 90_000])
})
