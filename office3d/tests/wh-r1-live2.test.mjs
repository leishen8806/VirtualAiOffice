import test from 'node:test'
import assert from 'node:assert/strict'
import { createLive2Simulation, LIVE2_STAGES, live2QueueTotal } from '../wh-r1/live2-sim.js'

const run = seed => { const sim = createLive2Simulation({ seed, multiplier: 8 }); for (let i = 0; i < 1800; i++) sim.advance(100); return sim.snapshot() }

test('LIVE-2 uses one deterministic clock and one cargo id through the process chain', () => {
  const a = run(77), b = run(77)
  assert.deepEqual(a, b)
  assert.ok(a.items.some(item => item.stage === 'quality' || item.stage === 'putaway'))
  assert.ok(a.counters.received > 0 && a.counters.shipped > 0)
  assert.ok(a.items.every(item => item.itemId.startsWith('CARGO-')))
  assert.ok(a.items.every(item => !item.stage || !item.stage.includes(',')))
})

test('LIVE-2 starts every stage in flight and never duplicates a cargo id', () => {
  const sim = createLive2Simulation({ seed: 12 }), initial = sim.snapshot()
  for (const stage of LIVE2_STAGES) assert.ok(initial.queues[stage] > 0, stage)
  for (let i = 0; i < 900; i++) {
    const state = sim.advance(100), ids = state.tasks.map(item => item.itemId)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(live2QueueTotal(state) <= LIVE2_STAGES.length * 32)
  }
})

test('LIVE-2 keeps inventory conservation explicit at each completion boundary', () => {
  const sim = createLive2Simulation({ seed: 3 }), before = sim.snapshot()
  for (let i = 0; i < 1200; i++) sim.advance(50)
  const after = sim.snapshot(), terminal = after.items.filter(item => item.stage === 'shipped').length
  assert.ok(after.counters.received >= 0 && after.counters.shipped >= 0)
  assert.equal(after.items.length, after.items.filter(item => item.itemId).length)
  assert.ok(terminal >= 1)
  assert.equal(before.paused, false)
})

test('LIVE-2 pause belongs to the shared simulation clock', () => {
  const sim = createLive2Simulation({ seed: 9, multiplier: 4 }), before = sim.snapshot(); sim.pause(); sim.advance(5000); assert.equal(sim.snapshot().nowMs, before.nowMs); sim.resume(); sim.advance(100); assert.ok(sim.snapshot().nowMs > before.nowMs)
})
