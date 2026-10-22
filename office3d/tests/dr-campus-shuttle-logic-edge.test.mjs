import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const moduleUrl = (() => {
  const override = process.env.SHUTTLE_LOGIC_MODULE
  if (!override) return new URL('../dr-campus-shuttle-logic.js', import.meta.url).href
  return override.startsWith('file:') ? override : pathToFileURL(override).href
})()

const {
  SHUTTLE_MAX_LIFT,
  applyShuttleEvent,
  confirmedShuttleEvents,
  createDemoShuttleEventSource,
  initialShuttleState,
  palletCount,
  shuttleCycle,
  shuttleFrame,
  shuttlePlan,
} = await import(moduleUrl)

const strip = { x0: 0, x1: 4, z0: 0, z1: 14 }
const plan = shuttlePlan({ shuttle: strip })
const event = (id, type, at, slotId) => ({ id, type, at, aisleId: plan.aisleId, slotId })

const snapshotTimes = [
  0, 1, 2999, 3000, 5199, 5200, 11799, 11800, 15999, 16000,
  19000, 27800, 32000, 50000, 51000, 59800, 1e9,
]

function collectSnapshots(source, clock) {
  return snapshotTimes.map(time => {
    clock.time = time
    return source.snapshot()
  })
}

test('shuttlePlan rejects missing, non-finite and undersized strips at the boundary', () => {
  assert.throws(() => shuttlePlan({}), /Invalid shuttle strip/)
  assert.throws(() => shuttlePlan({ shuttle: { x0: 0, x1: 4, z0: 0 } }), /Invalid shuttle strip/)
  assert.throws(() => shuttlePlan({ shuttle: { x0: 0, x1: 4, z0: 0, z1: NaN } }), /Invalid shuttle strip/)
  assert.throws(() => shuttlePlan({ shuttle: { x0: 0, x1: 2.9, z0: 0, z1: 14 } }), /Shuttle strip too small/)
  assert.throws(() => shuttlePlan({ shuttle: { x0: 0, x1: 4, z0: 0, z1: 10.2 } }), /Shuttle strip too small/)
  assert.doesNotThrow(() => shuttlePlan({ shuttle: { x0: 0, x1: 3, z0: 0, z1: 10.4 } }))
})

test('shuttlePlan freezes a fresh plan and spaces three slots evenly', () => {
  const source = { ...strip }
  const built = shuttlePlan({ shuttle: source })
  assert.equal(built.centerX, 2)
  assert.equal(built.rails.length, 2)
  assert.ok(Math.abs(built.rails[0] - 1.3) < 1e-12)
  assert.ok(Math.abs(built.rails[1] - 2.7) < 1e-12)
  assert.deepEqual(built.slots.map(slot => slot.id), ['slot-a', 'slot-b', 'slot-c'])
  assert.ok(Math.abs(built.path.z0 - 1.15) < 1e-12)
  assert.ok(Math.abs(built.path.z1 - 12.85) < 1e-12)
  const firstGap = built.slots[1].z - built.slots[0].z
  const total = built.slots[2].z - built.slots[0].z
  assert.ok(Math.abs(firstGap - total / 2) < 1e-12)
  assert.equal(Object.isFrozen(built), true)
  assert.equal(Object.isFrozen(built.slots), true)
  assert.equal(built.slots.every(slot => Object.isFrozen(slot)), true)
  assert.notEqual(built.strip, source)
  source.x0 = -99
  assert.equal(built.strip.x0, 0)
})

test('shuttleCycle clamps non-finite and negative slices and wraps modulo three', () => {
  assert.deepEqual(shuttleCycle(undefined), { slice: 0, source: 0, target: 1 })
  assert.deepEqual(shuttleCycle(NaN), { slice: 0, source: 0, target: 1 })
  assert.deepEqual(shuttleCycle(Infinity), { slice: 0, source: 0, target: 1 })
  assert.deepEqual(shuttleCycle(-3.5), { slice: 0, source: 0, target: 1 })
  assert.deepEqual(shuttleCycle(2.9), { slice: 2, source: 1, target: 2 })
  assert.deepEqual(shuttleCycle(3), { slice: 3, source: 0, target: 1 })
  assert.deepEqual(shuttleCycle(1e15), { slice: 1e15, source: 2, target: 0 })
  assert.equal(Object.isFrozen(shuttleCycle(0)), true)
})

test('demo source defaults to time zero and seed 1212', () => {
  const implicit = createDemoShuttleEventSource({ plan })
  const explicit = createDemoShuttleEventSource({ now: 0, seed: 1212, plan })
  assert.deepEqual(implicit.snapshot(), explicit.snapshot())
  const first = implicit.snapshot()
  assert.equal(first.at, 0)
  assert.equal(first.slice, 0)
  assert.deepEqual(first.events.map(item => item.id), ['demo-shuttle-source-0'])
  assert.equal(createDemoShuttleEventSource({ now: -50, plan }).snapshot().at, 0)
  assert.equal(createDemoShuttleEventSource({ now: NaN, plan }).snapshot().at, 0)
  assert.equal(createDemoShuttleEventSource({ now: Infinity, plan }).snapshot().at, 0)

  const clock = { time: 0 }
  const byFunction = createDemoShuttleEventSource({ now: () => clock.time, plan })
  const bySeed = createDemoShuttleEventSource({ now: () => clock.time, seed: 1212, plan })
  assert.deepEqual(collectSnapshots(byFunction, clock), collectSnapshots(bySeed, clock))
})

test('identical seed and now series produce identical snapshots and event counts', () => {
  const clockA = { time: 0 }
  const clockB = { time: 0 }
  const first = createDemoShuttleEventSource({ now: () => clockA.time, seed: 1212, plan })
  const second = createDemoShuttleEventSource({ now: () => clockB.time, seed: 1212, plan })
  const left = collectSnapshots(first, clockA)
  const right = collectSnapshots(second, clockB)
  assert.deepEqual(left, right)
  assert.deepEqual(left.map(snapshot => snapshot.events.length), [
    1, 1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 4, 1, 1, 2, 4, 1,
  ])
  assert.equal(left.every(snapshot => Object.isFrozen(snapshot)), true)
  assert.equal(left.every(snapshot => Object.isFrozen(snapshot.events)), true)
})

test('seed changes route choice while equivalent u32 seeds stay deterministic', () => {
  const atZero = seed => createDemoShuttleEventSource({ now: 0, seed, plan }).snapshot()
  const base = atZero(1212)
  const other = atZero(1213)
  const third = atZero(1214)
  assert.equal(base.events[0].slotId, 'slot-a')
  assert.equal(other.events[0].slotId, 'slot-c')
  assert.equal(third.events[0].slotId, 'slot-b')
  assert.notDeepEqual(other, base)
  assert.deepEqual(atZero(1215), base)
  assert.deepEqual(atZero(-1), base)
})

test('advance emits every event once, isolates throwing listeners and unsubscribes', () => {
  const clock = { time: 0 }
  const source = createDemoShuttleEventSource({ now: () => clock.time, seed: 1212, plan })
  const received = []
  const afterThrow = []
  const unsubscribe = source.subscribe(item => received.push(item))
  source.subscribe(() => { throw new Error('listener failure') })
  source.subscribe(item => afterThrow.push(item.id))
  clock.time = 11800
  const first = source.advance()
  assert.equal(first.events.length, 4)
  source.advance()
  clock.time = 15999
  source.advance()
  assert.equal(received.length, 4)
  assert.equal(new Set(received.map(item => item.id)).size, 4)
  assert.equal(afterThrow.length, 4)
  assert.notEqual(received[0], first.events[0])
  assert.equal(unsubscribe(), true)
  assert.equal(unsubscribe(), false)
  clock.time = 16000
  source.advance()
  assert.equal(received.length, 4)
  assert.equal(afterThrow.length, 5)
})

test('confirmedShuttleEvents accepts exactly the confirmation time', () => {
  const events = [
    event('before', 'shuttle_move', 999, 'slot-a'),
    event('exact', 'shuttle_move', 1000, 'slot-a'),
    event('after', 'shuttle_move', 1001, 'slot-a'),
    event('zero', 'shuttle_move', 0, 'slot-a'),
    event('negative-zero', 'shuttle_move', -0, 'slot-a'),
    event('negative', 'shuttle_move', -1, 'slot-a'),
  ]
  assert.deepEqual(
    confirmedShuttleEvents(events, 1000, plan).map(item => item.id),
    ['before', 'exact', 'zero', 'negative-zero'],
  )
  assert.deepEqual(
    confirmedShuttleEvents(events, 0, plan).map(item => item.id),
    ['zero', 'negative-zero'],
  )
  assert.deepEqual(confirmedShuttleEvents(events, -1, plan), [])
})

test('duplicate ids keep the first valid event and results are copies', () => {
  const first = event('same', 'shuttle_pick', 10, 'slot-a')
  const duplicate = event('same', 'shuttle_put', 20, 'slot-b')
  const result = confirmedShuttleEvents([first, duplicate], 100, plan)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], first)
  assert.notEqual(result[0], first)
  result[0].at = 99
  assert.equal(first.at, 10)
  assert.deepEqual(confirmedShuttleEvents(null, 100, plan), [])
  assert.deepEqual(confirmedShuttleEvents({ length: 1, 0: first }, 100, plan), [])
})

test('confirmedShuttleEvents rejects invalid ids, types, aisles, slots and times', () => {
  const valid = event('valid', 'shuttle_move', 5, 'slot-a')
  const longId = 'a'.repeat(128)
  const rejected = [
    event('bad id', 'shuttle_move', 5, 'slot-a'),
    event('', 'shuttle_move', 5, 'slot-a'),
    event('a'.repeat(129), 'shuttle_move', 5, 'slot-a'),
    { ...valid, id: 'unknown-type', type: 'inventory_write' },
    { ...valid, id: 'missing-type', type: undefined },
    { ...valid, id: 'wrong-aisle', aisleId: 'other' },
    { ...valid, id: 'wrong-slot', slotId: 'slot-z' },
    { ...valid, id: 'missing-slot', slotId: undefined },
    { ...valid, id: 'nan-at', at: NaN },
    { ...valid, id: 'infinite-at', at: Infinity },
    { ...valid, id: 'string-at', at: '5' },
    null,
  ]
  const accepted = confirmedShuttleEvents([...rejected, valid, event(longId, 'shuttle_put', 5, 'slot-b')], 10, plan)
  assert.deepEqual(accepted.map(item => item.id), ['valid', longId])
})

test('applyShuttleEvent is a no-op for unknown slots, types and invalid transitions', () => {
  const state = initialShuttleState(plan)
  assert.equal(applyShuttleEvent(state, event('x', 'shuttle_move', 10, 'slot-z'), plan), state)
  assert.equal(applyShuttleEvent(state, event('x', 'shuttle_unknown', 10, 'slot-a'), plan), state)
  assert.equal(applyShuttleEvent(state, event('put-empty', 'shuttle_put', 10, 'slot-b'), plan), state)
  assert.equal(applyShuttleEvent(state, event('pick-empty', 'shuttle_pick', 10, 'slot-b'), plan), state)

  const picked = applyShuttleEvent(state, event('pick-a', 'shuttle_pick', 20, 'slot-a'), plan)
  assert.notEqual(picked, state)
  assert.equal(picked.carrying, true)
  assert.equal(picked.status, 'pickup')
  assert.deepEqual(picked.occupied, [false, false, true])
  assert.equal(picked.position, plan.slots[0].z)
  assert.equal(picked.lastAt, 20)
  assert.equal(applyShuttleEvent(picked, event('pick-a', 'shuttle_pick', 20, 'slot-a'), plan), picked)
  assert.equal(applyShuttleEvent(picked, event('pick-c', 'shuttle_pick', 21, 'slot-c'), plan), picked)
  assert.equal(applyShuttleEvent(picked, event('put-c', 'shuttle_put', 22, 'slot-c'), plan), picked)

  const put = applyShuttleEvent(picked, event('put-b', 'shuttle_put', 30, 'slot-b'), plan)
  assert.notEqual(put, picked)
  assert.equal(put.carrying, false)
  assert.equal(put.status, 'idle')
  assert.deepEqual(put.occupied, [false, true, true])
  assert.equal(applyShuttleEvent(put, event('put-b', 'shuttle_put', 30, 'slot-b'), plan), put)

  assert.deepEqual(state.occupied, [true, false, true])
  assert.equal(Object.isFrozen(picked), true)
  assert.equal(Object.isFrozen(picked.occupied), true)
  assert.notEqual(picked.occupied, state.occupied)
})

test('out-of-order events apply without a time-monotonic guard', () => {
  const state = initialShuttleState(plan)
  const targetMove = applyShuttleEvent(state, event('move-b', 'shuttle_move', 5200, 'slot-b'), plan)
  assert.equal(targetMove.target, plan.slots[1].z)
  assert.equal(targetMove.movingAt, 5200)

  const latePick = applyShuttleEvent(targetMove, event('pick-a', 'shuttle_pick', 1000, 'slot-a'), plan)
  assert.equal(latePick.carrying, true)
  assert.equal(latePick.lastAt, 1000)
  assert.equal(latePick.position, plan.slots[0].z)
  assert.ok(latePick.lastAt < targetMove.movingAt)
  assert.equal(applyShuttleEvent(latePick, event('pick-a', 'shuttle_pick', 1000, 'slot-a'), plan), latePick)

  const earlyPut = applyShuttleEvent(latePick, event('put-b', 'shuttle_put', 500, 'slot-b'), plan)
  assert.equal(earlyPut.carrying, false)
  assert.equal(earlyPut.lastAt, 500)
  assert.deepEqual(earlyPut.occupied, [false, true, true])
})

test('shuttleFrame interpolates between endpoints and stays finite at extreme times', () => {
  const state = applyShuttleEvent(initialShuttleState(plan), event('move-c', 'shuttle_move', 0, 'slot-c'), plan)
  const start = plan.slots[0].z
  const end = plan.slots[2].z
  assert.equal(shuttleFrame(state, 0).position, start)
  assert.ok(Math.abs(shuttleFrame(state, 1100).position - (start + end) / 2) < 1e-9)
  assert.equal(shuttleFrame(state, 2200).position, end)

  const samples = [0, 275, 550, 1100, 1650, 2200, 2201, 1e15, -1, NaN, Infinity]
  const frames = samples.map(time => shuttleFrame(state, time))
  for (const [index, frame] of frames.entries()) {
    assert.ok(Number.isFinite(frame.position), `position ${frame.position} at sample ${samples[index]}`)
    assert.ok(frame.position >= start - 1e-12 && frame.position <= end + 1e-12)
  }
  const ordered = frames.slice(0, 6).map(frame => frame.position)
  for (let index = 1; index < ordered.length; index++) assert.ok(ordered[index] >= ordered[index - 1])

  const frame = shuttleFrame(state, 100)
  assert.equal(Object.isFrozen(frame), true)
  frame.occupied[0] = false
  assert.deepEqual(state.occupied, [true, false, true])
})

test('lift honors SHUTTLE_MAX_LIFT at pickup, delivery and put boundaries', () => {
  assert.equal(SHUTTLE_MAX_LIFT, 0.12)
  const initial = initialShuttleState(plan)
  assert.equal(shuttleFrame(initial, 0).lift, 0.12)
  assert.equal(shuttleFrame(initial, 300).lift, 0.06)
  assert.equal(shuttleFrame(initial, 600).lift, 0)
  assert.equal(shuttleFrame(initial, -1).lift, 0.12)
  assert.equal(shuttleFrame(initial, NaN).lift, 0.12)

  const picked = applyShuttleEvent(initial, event('pick-a', 'shuttle_pick', 10000, 'slot-a'), plan)
  assert.equal(shuttleFrame(picked, 10000).lift, 0)
  assert.equal(shuttleFrame(picked, 10300).lift, 0.06)
  assert.equal(shuttleFrame(picked, 10600).lift, 0.12)
  assert.equal(shuttleFrame(picked, 1e15).lift, 0.12)

  const delivery = applyShuttleEvent(picked, event('move-b', 'shuttle_move', 11000, 'slot-b'), plan)
  assert.equal(delivery.status, 'delivery')
  assert.equal(shuttleFrame(delivery, 11000).lift, 0.12)
  assert.equal(shuttleFrame(delivery, 1e15).lift, 0.12)

  const put = applyShuttleEvent(delivery, event('put-b', 'shuttle_put', 12000, 'slot-b'), plan)
  assert.equal(put.status, 'idle')
  assert.equal(shuttleFrame(put, 12000).lift, 0.12)
  assert.equal(shuttleFrame(put, 12300).lift, 0.06)
  assert.equal(shuttleFrame(put, 12600).lift, 0)
  assert.equal(shuttleFrame(put, 1e15).lift, 0)

  for (const time of [0, 300, 600, -1, NaN, Infinity, 1e15]) {
    const lift = shuttleFrame(delivery, time).lift
    assert.ok(lift >= 0 && lift <= SHUTTLE_MAX_LIFT && Number.isFinite(lift))
  }
})

test('palletCount counts carried pallets plus occupied slots for empty and full states', () => {
  const initial = initialShuttleState(plan)
  assert.equal(palletCount(shuttleFrame(initial, 0)), 2)
  const empty = { ...initial, occupied: [false, false, false], carrying: false }
  assert.equal(palletCount(empty), 0)
  assert.equal(palletCount({ occupied: [true, true, true], carrying: true }), 4)
  assert.equal(palletCount({ occupied: [false, false, false], carrying: true }), 1)
  for (const time of [0, -1, NaN, Infinity, 1e15]) {
    const frame = shuttleFrame(empty, time)
    assert.equal(Number.isFinite(frame.position), true)
    assert.equal(Number.isFinite(frame.lift), true)
    assert.equal(palletCount(frame), 0)
  }
})

