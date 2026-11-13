import test from 'node:test'
import assert from 'node:assert/strict'
import { createLive3StageB, live3StageBConstants } from '../wh-r1/live3-stage-b.js'

test('stage B drives inbound and outbound vehicles from the registered bays', () => {
  const sim = createLive3StageB()
  for (let i = 0; i < 600; i++) sim.advance(100)
  const state = sim.snapshot()
  assert.ok(state.counters.inbound > 0)
  assert.ok(state.counters.outbound > 0)
  assert.ok(state.active.every(row => row.position && Number.isFinite(row.position.x) && Number.isFinite(row.position.z)))
})

test('stage B keeps the vehicle clearance guard at 0.5 m', () => {
  const sim = createLive3StageB()
  for (let i = 0; i < 600; i++) {
    const state = sim.advance(100)
    assert.ok(state.minClearanceM >= live3StageBConstants.MIN_CLEARANCE_M)
    assert.equal(state.minClearanceOk, true)
  }
})

test('stage B rotates the whole registered fleet and exposes a reverse-in trailer within 60 seconds', () => {
  const sim = createLive3StageB(), seen = { inbound: new Set(), outbound: new Set(), reverse: false }
  for (let i = 0; i < 900; i++) for (const row of sim.advance(100).active) {
    seen[row.kind].add(row.id)
    if (row.status === 'reverse_in') seen.reverse = true
  }
  assert.deepEqual([...seen.inbound].sort(), ['WH-01-VH-001', 'WH-01-VH-002', 'WH-01-VH-003', 'WH-01-VH-004', 'WH-01-VH-005'])
  assert.deepEqual([...seen.outbound].sort(), ['WH-06-VH-001', 'WH-06-VH-002', 'WH-06-VH-003', 'WH-06-VH-004'])
  assert.equal(seen.reverse, true)
})

test('stage B vehicle endpoints follow adjacent-frame motion except reverse-in', () => {
  const sim = createLive3StageB(), previous = new Map(), signs = new Map()
  for (let i = 0; i < 900; i++) for (const row of sim.advance(100).active) {
    const prior = previous.get(row.id), front = row.position.front, rear = row.position.rear
    if (prior && prior.startedAt === row.startedAt) {
      const motion = { x: row.position.x - prior.x, z: row.position.z - prior.z }
      if (Math.hypot(motion.x, motion.z) < 1e-9) { previous.set(row.id, { ...row.position, startedAt: row.startedAt }); continue }
      const frontDelta = { x: front.x - row.position.x, z: front.z - row.position.z }, rearDelta = { x: rear.x - row.position.x, z: rear.z - row.position.z }
      const frontDot = motion.x * frontDelta.x + motion.z * frontDelta.z, rearDot = motion.x * rearDelta.x + motion.z * rearDelta.z
      signs.set(row.id + ':' + row.status, [frontDot, rearDot])
    }
    previous.set(row.id, { ...row.position, startedAt: row.startedAt })
  }
  for (const [key, [frontDot, rearDot]] of signs) {
    if (key.endsWith(':reverse_in')) assert.ok(rearDot > 0 && frontDot < 0, key)
    else if (key.endsWith(':approach') || key.endsWith(':depart')) assert.ok(frontDot > 0 && rearDot < 0, key)
  }
})

test('stage B derives phase, road position, and heading from one clock at coarse and fine frame rates', () => {
  for (const frameMs of [1000, 250, 1000 / 60]) {
    const sim = createLive3StageB(), previous = new Map(), seen = new Set()
    for (let elapsed = 0; elapsed < 40_000; elapsed += frameMs) for (const row of sim.advance(frameMs).active) {
      if (row.kind !== 'inbound') continue
      seen.add(row.status)
      const end = row.route.points.at(-1)
      if (row.status === 'unloading') {
        assert.equal(row.routeProgress, 1, `unloading is parked at ${frameMs}ms`)
        assert.ok(Math.hypot(row.position.x - end.x, row.position.z - end.z) < 1e-9, `unloading bay position at ${frameMs}ms`)
      }
      if (row.status === 'reverse_in') assert.ok(row.routeProgress < 1 && row.routeProgress > 0, `reverse-in road segment at ${frameMs}ms`)
      if (row.status === 'depart') assert.ok(row.routeProgress < 1, `depart has left the bay at ${frameMs}ms`)
      const prior = previous.get(row.id)
      if (prior?.startedAt === row.startedAt) {
        const motion = { x: row.position.x - prior.x, z: row.position.z - prior.z }
        if (Math.hypot(motion.x, motion.z) > 1e-9) {
          const front = { x: row.position.front.x - row.position.x, z: row.position.front.z - row.position.z }
          const rear = { x: row.position.rear.x - row.position.x, z: row.position.rear.z - row.position.z }
          const frontDot = motion.x * front.x + motion.z * front.z, rearDot = motion.x * rear.x + motion.z * rear.z
          if (row.status === 'reverse_in') assert.ok(rearDot > 0 && frontDot < 0, `reverse heading at ${frameMs}ms`)
          if (row.status === 'depart') assert.ok(frontDot > 0 && rearDot < 0, `depart heading at ${frameMs}ms`)
        }
      }
      previous.set(row.id, { ...row.position, startedAt: row.startedAt })
    }
    assert.deepEqual([...seen].sort(), ['approach', 'depart', 'reverse_in', 'unloading'], `two rounds at ${frameMs}ms`)
  }
})
