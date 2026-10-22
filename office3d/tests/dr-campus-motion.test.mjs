import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRackPlan } from '../dr-campus-racks-spec.mjs'
import { confirmedEvents, conveyorLoop, createDemoCampusEventSource, createMotionClock, forkliftPath, pathPoint, phaseAt, truckPlan } from '../dr-campus-motion-logic.mjs'
import * as browserLogic from '../dr-campus-motion-logic.js'
import * as THREE from '../vendor/three/three.module.js'
import { buildCampusMotion } from '../dr-campus-motion.js'
import { createCampusRegistry, mergeCampusStatic } from '../dr-campus-registry.js'
const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
test('forklift closed aisle avoids racks and office routes with physical clearance', () => {
  const path = forkliftPath(layout), racks = createCampusRackPlan().racks
  assert.deepEqual(path[0], path.at(-1))
  for (let time = 0; time < 100000; time += 40) {
    const p = pathPoint(path, time)
    assert.ok(p.x < -100)
    for (const rack of racks) assert.equal(p.x > rack.x0 - 1.5 && p.x < rack.x1 + 1.5 && p.z > rack.z0 - 1.5 && p.z < rack.z1 + 1.5, false)
  }
})
test('conveyors are closed and contained in picking and packing display lanes', () => {
  for (const path of conveyorLoop(layout)) {
    assert.deepEqual(path[0], path.at(-1))
    assert.ok(path.every(p => p.x >= -152 && p.x <= -104 && p.z >= 8 && p.z <= 18))
  }
})
test('truck slots are unique, deterministic and only one dock selected per slice', () => {
  const plan = truckPlan(layout)
  assert.equal(new Set(plan.map(row => row.id)).size, 3)
  assert.equal(new Set(plan.map(row => JSON.stringify(row.parked))).size, 3)
  for (let time = 0; time < 100000; time += 100) assert.ok(phaseAt(time).dockIndex >= 0 && phaseAt(time).dockIndex < 3)
  assert.equal(phaseAt(11999).slice, 0)
  assert.equal(phaseAt(12000).slice, 1)
  assert.deepEqual(phaseAt(15000, 2606), phaseAt(15000, 2606))
})
test('event source confirmed events are deterministic and subscription is independent of playback', () => {
  let now = 0
  const source = createDemoCampusEventSource({ now: () => now, seed: 2606 })
  const events = []
  const unsubscribe = source.subscribe(event => events.push(event))
  assert.deepEqual(source.snapshot(), source.snapshot())
  source.advance(); source.advance()
  assert.equal(events.length, 3)
  now = 9000
  assert.ok(source.snapshot().events.some(row => row.type === 'truck_depart'))
  now = 12000
  source.advance()
  assert.equal(events.length, 6)
  unsubscribe()
  now = 24000; source.advance()
  assert.equal(events.length, 6)
})
test('motion clock pause and visibility reset never jump on resume', () => {
  const clock = createMotionClock()
  clock.update(0, true); clock.update(30, true)
  clock.update(9000, false); clock.update(9030, true)
  assert.equal(clock.value(), 60)
  clock.reset(); clock.update(50000, true)
  assert.equal(clock.value(), 60)
  clock.update(50030, true)
  assert.equal(clock.value(), 90)
})
test('dedupe rejects future and unconfirmed event kinds', () => {
  const event = { id: 'demo-event', at: 0, type: 'forklift_move' }
  assert.equal(confirmedEvents([event, event, { ...event, id: 'demo-future', at: 20 }, { ...event, id: 'demo-other', type: 'order' }], 10).length, 1)
})
test('module uses registry, no business requests, shared geometry and no new lights', () => {
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  for (const file of ['dr-campus-motion.js', 'dr-campus-motion-logic.mjs', 'dr-campus-motion-logic.js', 'dr-campus-motion-preview.html']) {
    assert.doesNotMatch(read(file), /Date\.now|Math\.random|\bfetch\s*\(|innerHTML|Paperclip|\/state|\/act/)
  }
  assert.doesNotMatch(read('dr-campus-motion-logic.mjs'), /THREE|document|window|performance\.now/)
  assert.doesNotMatch(read('dr-campus-motion.js'), /new THREE\.\w*Light/)
  assert.match(read('dr-campus-motion.js'), /userData\.dynamic = !low/)
  assert.match(read('dr-campus-modules.js'), /\['motion', \(context\) => buildCampusMotion\(context\)\]/)
  assert.match(read('dr-campus-registry.js'), /onBeforeRender/)
})
test('browser uses the exact pure implementation tested by Node; truck envelope clears receiving doors', () => {
  assert.equal(browserLogic.forkliftPath, forkliftPath)
  assert.equal(browserLogic.phaseAt, phaseAt)
  const doors = createCampusRackPlan().receivingDoors
  for (const dock of truckPlan(layout).slice(0, 2)) {
    assert.ok(dock.parked.z + 3.45 < Math.min(...doors.map(door => door.z0)))
  }
})

const matrices = motion => Array.from(motion.root.children.find(child => child.isInstancedMesh)?.instanceMatrix.array || [])
test('event dockId drives truck without index; pause and offscreen keep source advancing without matrix jumps', () => {
  let time = 0
  const root = new THREE.Group(), source = createDemoCampusEventSource({ now: () => time })
  const motion = buildCampusMotion({ THREE, root, layout, quality: { tier: 'high' }, eventSource: source, search: '' })
  motion.onFrame(0)
  time = 100; motion.onFrame(.1)
  const before = matrices(motion)
  motion.setPaused(true); time = 9000; motion.onFrame(.1)
  assert.deepEqual(matrices(motion), before)
  assert.equal(motion.summary().sourceMs, 9000)
  motion.setPaused(false); time = 9100; motion.onFrame(.1)
  assert.deepEqual(matrices(motion), before)
  time = 9200; motion.onFrame(.1)
  assert.notDeepEqual(matrices(motion), before)
  root.visible = false
  const hidden = matrices(motion)
  time = 9500; motion.onFrame(.1)
  assert.deepEqual(matrices(motion), hidden)
  assert.equal(motion.summary().paused, true)
  root.visible = true; time = 9600; motion.onFrame(.1)
  assert.ok(motion.summary().animationMs <= 400)
  motion.dispose(); motion.dispose()
})
test('low and URL-off matrices remain static, low shares existing static batch with zero added calls', () => {
  for (const tier of ['high', 'low']) {
    const root = new THREE.Group(), source = createDemoCampusEventSource({ now: 15000 })
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    root.add(base)
    const motion = buildCampusMotion({ THREE, root, layout, quality: { tier }, eventSource: source, search: '?campusMotion=0' })
    const before = matrices(motion)
    for (let i = 0; i < 100; i++) motion.onFrame(.1)
    assert.deepEqual(matrices(motion), before)
    if (tier === 'low') {
      mergeCampusStatic(THREE, root)
      assert.equal(root.children.filter(m => m.isMesh).length, 1)
      assert.equal(motion.root.children.length, 1)
      assert.equal(motion.root.children[0].name, 'campus-motion-lifecycle')
      assert.equal(motion.root.children[0].isMesh, undefined)
      assert.equal(motion.summary().calls, 0)
    }
    motion.dispose()
  }
})
test('confirmed abstract ids need no demo prefix, malformed dock and future events discarded', () => {
  const events = [
    { id: 'confirmed_1', type: 'truck_arrive', at: 0, dockId: 'demo-ship-1' },
    { id: 'invalid', type: 'truck_arrive', at: 0 },
    { id: 'future', type: 'truck_depart', at: 20, dockId: 'demo-ship-1' },
  ]
  assert.deepEqual(confirmedEvents(events, 10), [events[0]])
})
test('registry scene callback runs even without visible campus batch and restores previous callback', () => {
  const scene = new THREE.Scene(), old = scene.onBeforeRender
  let count = 0
  const registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout })
  registry.register('motion', context => { assert.equal(typeof context.now, 'function'); return { onFrame(dt) { assert.ok(dt >= 0 && dt <= .1); count++ } } })
  registry.buildAll(); registry.root.visible = false
  scene.onBeforeRender(null, scene, null)
  assert.equal(count, 1)
  registry.dispose()
  assert.equal(scene.onBeforeRender, old)
})
test('real vehicle instances clear racks, dock doors, outer walls and stay in campus through 25 seconds', () => {
  let time = 0
  const obstacles = createCampusRackPlan(), matrix = new THREE.Matrix4(), point = new THREE.Vector3()
  const walls = [{ x0: -168, x1: -80, z0: -18, z1: -17.72 }, { x0: -80.28, x1: -80, z0: -18, z1: 30 }]
  for (const seed of [1, 2, 3]) {
  time = 0
  const source = createDemoCampusEventSource({ now: () => time, seed })
  const motion = buildCampusMotion({ THREE, root: new THREE.Group(), layout, quality: { tier: 'high' }, eventSource: source, search: '' })
  const mesh = motion.root.children[0]
  for (time = 0; time <= 25000; time += 100) {
    motion.onFrame(.1)
    for (let i = 0; i < 2 * 12 + 3 * 9; i++) {
      mesh.getMatrixAt(i, matrix)
      const bounds = new THREE.Box3().makeEmpty()
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        point.set(x, y, z).applyMatrix4(matrix); bounds.expandByPoint(point)
      }
      assert.ok(bounds.min.x >= CAMPUS.x0 && bounds.max.x <= CAMPUS.x1 && bounds.min.z >= CAMPUS.z0 && bounds.max.z <= CAMPUS.z1, `instance ${i}: campus`)
      for (const b of [...obstacles.racks, ...obstacles.receivingDoors, ...obstacles.shippingDoors, ...walls]) {
        assert.equal(bounds.max.x > b.x0 && bounds.min.x < b.x1 && bounds.max.z > b.z0 && bounds.min.z < b.z1, false, `instance ${i}: ${b.id || 'wall'}`)
      }
    }
  }
  motion.dispose()
  }
})

test('pure body and renderer remain isolated from office modules and network clocks', () => {
  for (const file of ['dr-campus-motion.js', 'dr-campus-motion-logic.js', 'dr-campus-motion-preview.html']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /office-theme-v2|office-bar|display-staff|Math\.random|Date\.now|\bfetch\s*\(|innerHTML/)
  }
  assert.doesNotMatch(fs.readFileSync(new URL('../dr-campus-motion-logic.js', import.meta.url), 'utf8'), /\bTHREE\b|\bdocument\b|\bwindow\b|performance\.now/)
})
