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
