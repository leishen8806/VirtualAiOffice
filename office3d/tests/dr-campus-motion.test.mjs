import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { CAMPUS, CAMPUS_DOCKS, CAMPUS_VEHICLE_CORRIDORS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRackPlan } from '../dr-campus-racks-spec.mjs'
import { confirmedEvents, conveyorLoop, createDemoCampusEventSource, createMotionClock, forkliftPath, pathPoint, phaseAt, routePointAt, truckPlan } from '../dr-campus-motion-logic.mjs'
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
    assert.ok(p.x >= -167.72 && p.x <= -80.28 && p.z >= -17.72 && p.z <= 29.72, 'B4 includes approved Z11 parking')
    for (const rack of racks) assert.equal(p.x > rack.x0 - 1.5 && p.x < rack.x1 + 1.5 && p.z > rack.z0 - 1.5 && p.z < rack.z1 + 1.5, false)
  }
})
test('conveyors are closed and contained in picking and packing display lanes', () => {
  const picking = CAMPUS_ZONES.find((zone) => zone.id === 'picking'), packing = CAMPUS_ZONES.find((zone) => zone.id === 'packing')
  for (const path of conveyorLoop(layout)) {
    assert.deepEqual(path[0], path.at(-1))
    assert.ok(path.every(p => p.x >= picking.x0 && p.x <= packing.x1 && p.z >= picking.z0 && p.z <= picking.z1))
  }
})
test('truck slots are unique, deterministic and only one dock selected per slice', () => {
  const plan = truckPlan(layout)
  assert.equal(new Set(plan.map(row => row.id)).size, 8)
  assert.equal(new Set(plan.map(row => JSON.stringify(row.parked))).size, 8)
  for (let time = 0; time < 100000; time += 100) assert.ok(phaseAt(time).dockIndex >= 0 && phaseAt(time).dockIndex < 8)
  assert.equal(phaseAt(11999).slice, 0)
  assert.equal(phaseAt(12000).slice, 1)
  assert.deepEqual(phaseAt(15000, 2606), phaseAt(15000, 2606))
})
test('truck animation follows every declared B1 route segment rather than interpolating directly to the bay', () => {
  for (const dock of truckPlan(layout)) {
    const midpoint = routePointAt(dock.route, .5)
    assert.ok(dock.route.some((point) => Math.abs(point.x - midpoint.x) < 1e-6 || Math.abs(point.z - midpoint.z) < 1e-6), dock.id)
    const start = routePointAt(dock.route, 0), end = routePointAt(dock.route, 1)
    assert.ok(Math.abs(start.x - dock.route[0].x) < 1e-9 && Math.abs(start.z - dock.route[0].z) < 1e-9)
    assert.ok(Math.abs(end.x - dock.parked.x) < 1e-9 && Math.abs(end.z - dock.parked.z) < 1e-9)
  }
})
const envelope = (point, angle) => {
  const length = 4.5, width = 1.275
  const dx = Math.abs(Math.sin(angle)) * length + Math.abs(Math.cos(angle)) * width
  const dz = Math.abs(Math.cos(angle)) * length + Math.abs(Math.sin(angle)) * width
  return { x0: point.x - dx, x1: point.x + dx, z0: point.z - dz, z1: point.z + dz }
}
const coveredBy = (area, allowed) => {
  const intersections = allowed.flatMap((item) => {
    const x0 = Math.max(area.x0, item.x0), x1 = Math.min(area.x1, item.x1)
    return x0 < x1 ? [x0, x1] : []
  })
  const boundaries = [...new Set([area.x0, area.x1, ...intersections])].sort((a, b) => a - b)
  for (let index = 0; index < boundaries.length - 1; index++) {
    const x = (boundaries[index] + boundaries[index + 1]) / 2
    const intervals = allowed.filter((item) => item.x0 <= x && item.x1 >= x).map((item) => [item.z0, item.z1]).sort((a, b) => a[0] - b[0])
    let end = area.z0
    for (const [z0, z1] of intervals) if (z0 <= end + 1e-9) end = Math.max(end, z1)
    if (end < area.z1 - 1e-9) return false
  }
  return true
}
test('every parked truck keeps its unloading rear inside the working strip without a direction flip', () => {
  const docks = new Map(CAMPUS_DOCKS.map((dock) => [dock.id, dock]))
  for (const truck of truckPlan(layout)) {
    const dock = docks.get(truck.id), endpoint = routePointAt(truck.route, 1)
    assert.equal(truck.reverseSegments.length, 0, `${truck.id} is forward parked`)
    const angle = endpoint.angle
    const rear = { x: endpoint.x - Math.sin(angle) * 4.5, z: endpoint.z - Math.cos(angle) * 4.5 }
    assert.ok(rear.x >= dock.work.x0 - 1e-9 && rear.x <= dock.work.x1 + 1e-9, `${truck.id} rear x`)
    assert.ok(rear.z >= dock.work.z0 - 1e-9 && rear.z <= dock.work.z1 + 1e-9, `${truck.id} rear z`)
  }
})
test('truck bodies remain in their dock zone or the declared vehicle corridors throughout every route', () => {
  const zones = new Map(CAMPUS_ZONES.map((zone) => [zone.id, zone]))
  const docks = new Map(CAMPUS_DOCKS.map((dock) => [dock.id, dock]))
  for (const truck of truckPlan(layout)) {
    const dock = docks.get(truck.id), allowed = [zones.get(dock.zone), ...CAMPUS_VEHICLE_CORRIDORS]
    for (let step = 0; step <= 100; step++) {
      const point = routePointAt(truck.route, step / 100)
      const angle = point.angle + (truck.reverseSegments.includes(point.segment) ? Math.PI : 0)
      assert.equal(coveredBy(envelope(point, angle), allowed), true, `${truck.id} route sample ${step}`)
    }
  }
})
test('truck headings never jump more than 90 degrees at route segment boundaries', () => {
  const normalize = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))
  for (const truck of truckPlan(layout)) {
    const headings = truck.route.slice(0, -1).map((from, index) => Math.atan2(truck.route[index + 1].x - from.x, truck.route[index + 1].z - from.z) + (truck.reverseSegments.includes(index) ? Math.PI : 0))
    for (let index = 1; index < headings.length; index++) assert.ok(Math.abs(normalize(headings[index] - headings[index - 1])) <= Math.PI / 2 + 1e-9, `${truck.id} segment ${index}`)
  }
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
    assert.ok(dock.parked.z - 4.5 > Math.max(...doors.map(door => door.z1)))
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
test('real vehicle instances use the B1 vehicle envelope and stay in the expanded campus', () => {
  let time = 0
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3()
  for (const seed of [1, 2, 3]) {
  time = 0
  const source = createDemoCampusEventSource({ now: () => time, seed })
  const motion = buildCampusMotion({ THREE, root: new THREE.Group(), layout, quality: { tier: 'high' }, eventSource: source, search: '' })
  const mesh = motion.root.children[0]
  for (time = 0; time <= 25000; time += 100) {
    motion.onFrame(.1)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix)
      const bounds = new THREE.Box3().makeEmpty()
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        point.set(x, y, z).applyMatrix4(matrix); bounds.expandByPoint(point)
      }
      assert.ok(bounds.min.x >= CAMPUS.x0 && bounds.max.x <= CAMPUS.x1 && bounds.min.z >= CAMPUS.z0 && bounds.max.z <= CAMPUS.z1, `instance ${i}: campus`)
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
