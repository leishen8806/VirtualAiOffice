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
