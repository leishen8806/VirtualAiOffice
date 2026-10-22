import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { createCampusRackPlan } from '../dr-campus-racks-spec.mjs'
import {
  applyShuttleEvent,
  confirmedShuttleEvents,
  createDemoShuttleEventSource,
  initialShuttleState,
  palletCount,
  SHUTTLE_MAX_LIFT,
  shuttleFrame,
  shuttlePlan,
} from '../dr-campus-shuttle-logic.mjs'
import { buildCampusShuttle, CAMPUS_SHUTTLE_SPEC } from '../dr-campus-shuttle.js'
import { mergeCampusStatic } from '../dr-campus-registry.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }

function canvasTexFixture() {
  const calls = []
  return {
    calls,
    canvasTex(width, height, draw) {
      const operations = []
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 0,
        fillRect: (...args) => operations.push(['fillRect', ...args]),
        beginPath: () => operations.push(['beginPath']),
        moveTo: (...args) => operations.push(['moveTo', ...args]),
        lineTo: (...args) => operations.push(['lineTo', ...args]),
        stroke: () => operations.push(['stroke']),
      }
      draw(ctx, width, height)
      const texture = new THREE.Texture()
      calls.push({ width, height, operations, texture })
      return texture
    },
  }
}

const positions = module => Array.from(
  module.root.children.find(item => item.name === 'campus-shuttle-vehicle')?.geometry.attributes.position.array || [],
)

test('plan keeps one double rail and all vehicle envelopes inside the 4x14m strip without rack overlap', () => {
  const plan = shuttlePlan(layout)
  const racks = createCampusRackPlan().racks
  assert.equal(plan.rails.length, 2)
  assert.equal(plan.slots.length, 3)
  assert.equal(plan.strip.x1 - plan.strip.x0, 4)
  assert.equal(plan.strip.z1 - plan.strip.z0, 14)
  for (const slot of plan.slots) {
    const envelope = {
      x0: slot.x - CAMPUS_SHUTTLE_SPEC.bodyWidth / 2,
      x1: slot.x + CAMPUS_SHUTTLE_SPEC.bodyWidth / 2,
      z0: slot.z - CAMPUS_SHUTTLE_SPEC.bodyLength / 2,
      z1: slot.z + CAMPUS_SHUTTLE_SPEC.bodyLength / 2,
    }
    assert.ok(envelope.x0 >= plan.strip.x0 && envelope.x1 <= plan.strip.x1)
    assert.ok(envelope.z0 >= plan.strip.z0 && envelope.z1 <= plan.strip.z1)
    for (const rack of racks) {
      const overlap = envelope.x1 > rack.x0 && envelope.x0 < rack.x1 &&
        envelope.z1 > rack.z0 && envelope.z0 < rack.z1
      assert.equal(overlap, false, `${slot.id} intersects ${rack.id}`)
    }
  }
})

test('fixed seed event sources return the same sequence and subscriptions emit each id once', () => {
  const plan = shuttlePlan(layout)
  let now = 0
  const first = createDemoShuttleEventSource({ now: () => now, seed: 1212, plan })
  const second = createDemoShuttleEventSource({ now: () => now, seed: 1212, plan })
  const emitted = []
  first.subscribe(event => emitted.push(event))
  for (now of [0, 3000, 5200, 11800, 16000, 19000]) {
    assert.deepEqual(first.snapshot(), second.snapshot())
    first.advance()
  }
  first.advance()
  assert.equal(new Set(emitted.map(event => event.id)).size, emitted.length)
  assert.deepEqual(emitted.map(event => event.type).slice(0, 4), [
    'shuttle_move', 'shuttle_pick', 'shuttle_move', 'shuttle_put',
  ])
})

test('confirmed events are idempotent and pallet count stays constant through pick and put', () => {
  const plan = shuttlePlan(layout)
  const events = [
    { id: 'move-source', type: 'shuttle_move', at: 0, aisleId: plan.aisleId, slotId: 'slot-a' },
    { id: 'pick-source', type: 'shuttle_pick', at: 3000, aisleId: plan.aisleId, slotId: 'slot-a' },
    { id: 'move-target', type: 'shuttle_move', at: 5200, aisleId: plan.aisleId, slotId: 'slot-b' },
    { id: 'put-target', type: 'shuttle_put', at: 11800, aisleId: plan.aisleId, slotId: 'slot-b' },
  ]
  const confirmed = confirmedShuttleEvents([
    ...events,
    events[0],
    { ...events[0], id: 'future', at: 12001 },
    { ...events[0], id: 'wrong-type', type: 'inventory_write' },
    { ...events[0], id: 'wrong-aisle', aisleId: 'other' },
  ], 12000, plan)
  assert.deepEqual(confirmed, events)
  let state = initialShuttleState(plan)
  assert.equal(palletCount(shuttleFrame(state, 0)), 2)
  for (const event of confirmed) {
    state = applyShuttleEvent(state, event, plan)
    assert.equal(palletCount(shuttleFrame(state, event.at)), 2)
  }
  assert.deepEqual(state.occupied, [false, true, true])
  assert.equal(state.carrying, false)
  assert.equal(SHUTTLE_MAX_LIFT, .12)
})

test('high module honors canvasTex contract and stays within one call and 2k triangles', () => {
  const root = new THREE.Group(), fixture = canvasTexFixture()
  const module = buildCampusShuttle({
    THREE, root, layout, quality: { tier: 'high' }, canvasTex: fixture.canvasTex, now: () => 0,
  })
  const summary = module.summary()
  assert.equal(summary.calls, 1)
  assert.ok(summary.triangles > 0 && summary.triangles <= 2000, JSON.stringify(summary))
  assert.equal(summary.vehicles, 1)
  assert.equal(summary.pallets, 2)
  assert.equal(fixture.calls.length, 1)
  assert.deepEqual(fixture.calls[0].operations[0], ['fillRect', 0, 0, 128, 128])
  assert.ok(fixture.calls[0].operations.some(operation => operation[0] === 'stroke'))
  assert.equal(module.root.children.filter(item => item.isMesh).length, 1)
  assert.ok(Math.abs(
    CAMPUS_SHUTTLE_SPEC.wheel - CAMPUS_SHUTTLE_SPEC.wheelRadius - CAMPUS_SHUTTLE_SPEC.railTop,
  ) < 1e-6)
  assert.ok(CAMPUS_SHUTTLE_SPEC.slabTop < CAMPUS_SHUTTLE_SPEC.sleeperTop)
  const staticGroup = root.getObjectByName('campus-shuttle-static')
  root.updateMatrixWorld(true)
  for (const rail of staticGroup.children.filter(item => item.name.includes('-rail-'))) {
    const bounds = new THREE.Box3().setFromObject(rail)
    assert.ok(bounds.min.y >= CAMPUS_SHUTTLE_SPEC.sleeperTop - 1e-6)
  }
  module.dispose()
})

test('low tier adds zero calls and merges the parked vehicle with static rails', () => {
  const root = new THREE.Group(), fixture = canvasTexFixture()
  const module = buildCampusShuttle({
    THREE, root, layout, quality: { tier: 'low' }, canvasTex: fixture.canvasTex, now: () => 0,
  })
  const before = positions(module)
  for (let index = 0; index < 30; index++) module.onFrame(.1)
  assert.deepEqual(positions(module), before)
  assert.equal(module.summary().calls, 0)
  assert.equal(module.summary().triangles, 0)
  assert.equal(fixture.calls.length, 0)
  const merged = mergeCampusStatic(THREE, root)
  assert.ok(merged.removed > 1)
  assert.equal(module.root.children.length, 1)
  assert.equal(module.root.children[0].name, 'campus-shuttle-lifecycle')
  assert.equal(module.root.children[0].isMesh, undefined)
  module.dispose()
  merged.dispose()
})

test('pause and root invisibility keep source advancing and resume without a first-frame jump', () => {
  const root = new THREE.Group(), plan = shuttlePlan(layout)
  let time = 0
  const source = createDemoShuttleEventSource({ now: () => time, seed: 1212, plan })
  const module = buildCampusShuttle({
    THREE, root, layout, quality: { tier: 'high' }, eventSource: source, now: () => time,
  })
  module.onFrame(0)
  time = 100
  module.onFrame(.1)
  const before = positions(module)
  module.setPaused(true)
  for (time = 200; time <= 3300; time += 100) module.onFrame(.1)
  assert.deepEqual(positions(module), before)
  assert.equal(module.summary().sourceMs, 3300)
  assert.ok(module.summary().queued >= 1)
  module.setPaused(false)
  time = 3400
  module.onFrame(.1)
  assert.deepEqual(positions(module), before)
  time = 3500
  module.onFrame(.1)
  assert.notDeepEqual(positions(module), before)
  root.visible = false
  const hidden = positions(module)
  time = 3600
  module.onFrame(.1)
  assert.deepEqual(positions(module), hidden)
  assert.equal(module.summary().sourceMs, 3600)
  module.dispose()
})

test('campusMotion=0 stays static while the event source continues', () => {
  const root = new THREE.Group(), plan = shuttlePlan(layout)
  let time = 0
  const source = createDemoShuttleEventSource({ now: () => time, plan })
  const module = buildCampusShuttle({
    THREE, root, layout, quality: { tier: 'high' }, eventSource: source, search: '?campusMotion=0',
  })
  const before = positions(module)
  for (time = 0; time <= 6000; time += 100) module.onFrame(.1)
  assert.deepEqual(positions(module), before)
  assert.equal(module.summary().enabled, false)
  assert.equal(module.summary().sourceMs, 6000)
  module.dispose()
})

test('shuttle code is deterministic, warehouse-isolated and registered without app changes', () => {
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  for (const file of [
    'dr-campus-shuttle.js',
    'dr-campus-shuttle-logic.js',
    'dr-campus-shuttle-logic.mjs',
    'dr-campus-shuttle-preview.html',
  ]) {
    const source = read(file)
    assert.doesNotMatch(source, /Math\.random|Date\.now|\bfetch\s*\(|innerHTML|\/state|\/act/)
    assert.doesNotMatch(source, /office-theme-v2|office-bar|display-staff/)
  }
  assert.doesNotMatch(read('dr-campus-shuttle-logic.js'), /\bTHREE\b|\bdocument\b|\bwindow\b|performance\.now/)
  assert.match(read('dr-campus-modules.js'), /\['shuttle', \(context\) => buildCampusShuttle\(context\)\]/)
  assert.doesNotMatch(read('app.js'), /dr-campus-shuttle/)
})
