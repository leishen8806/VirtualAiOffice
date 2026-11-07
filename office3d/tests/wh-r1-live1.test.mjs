import test from 'node:test'
import assert from 'node:assert/strict'
import { createLive1Simulation, inventoryDelta } from '../wh-r1/live1-sim.js'
import { WH_R1_DATA } from '../wh-r1/data.js'

const run = seed => { const sim = createLive1Simulation({ seed, multiplier: 8 }); for (let i = 0; i < 600; i++) sim.advance(100); return sim }

test('LIVE-1 fixed seed replays ten minutes and keeps a populated start', () => {
  const first = createLive1Simulation({ seed: 42 }), bootEvents = first.drainEvents().map(event => event.type)
  assert.deepEqual(bootEvents.slice(0, 3), ['task_created', 'task_assigned', 'task_started'])
  const a = run(42).snapshot(), b = run(42).snapshot()
  assert.deepEqual(a, b); assert.ok(a.slots.filter(slot => slot.status === 'occupied').length >= 110); assert.ok(a.counters.completed > 0)
})

test('LIVE-1 starts with inventory across all four high-rack rows', () => {
  const slotIds = WH_R1_DATA.elements.filter(row => row.category === '托位载荷控制体').map(row => row.id)
  const occupied = createLive1Simulation({ slotIds }).snapshot().slots.filter(slot => slot.status === 'occupied')
  for (const rackId of ['WH-03-RK-01', 'WH-03-RK-02', 'WH-03-RK-03', 'WH-03-RK-04']) assert.ok(occupied.some(slot => slot.id.startsWith(rackId)), rackId)
})

test('LIVE-1 inventory conservation and no slot races', () => {
  const sim = createLive1Simulation({ seed: 77, multiplier: 12 }), before = sim.snapshot()
  for (let i = 0; i < 1200; i++) { sim.advance(50); const moving = sim.snapshot().tasks.filter(task => task.status === 'moving'); assert.equal(new Set(moving.map(task => task.slotId)).size, moving.length) }
  const after = sim.snapshot(), physical = slots => slots.filter(slot => slot.status === 'occupied' || slot.status === 'reserved_out').length
  assert.equal(physical(after.slots) - physical(before.slots), inventoryDelta(after) - inventoryDelta(before))
})

test('LIVE-1 pause and multiplier are owned by the simulation clock', () => {
  const sim = createLive1Simulation({ seed: 9, multiplier: 2 }), before = sim.snapshot(); sim.pause(); sim.advance(5000); const paused = sim.snapshot(); assert.equal(paused.nowMs, before.nowMs); assert.deepEqual(paused.slots, before.slots); assert.deepEqual(paused.tasks, before.tasks); sim.resume(); sim.setMultiplier(4); sim.advance(100); assert.ok(sim.snapshot().nowMs > before.nowMs)
})

test('LIVE-1 completion event and inventory state share the same frame', () => {
  const sim = createLive1Simulation({ seed: 2, multiplier: 1 }); sim.drainEvents()
  let completions = 0
  for (let i = 0; i < 40; i++) { sim.advance(100); const state = sim.snapshot(); for (const event of sim.drainEvents().filter(item => item.type === 'task_completed')) { completions++; assert.equal(state.slots.find(slot => slot.id === event.slotId).status, event.inventoryStatus) } }
  assert.ok(completions > 0)
})
