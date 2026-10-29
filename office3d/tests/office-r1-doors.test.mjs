import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Doors } from '../office-vis2/r1-doors.js'
import { buildR1Lounge, r1ReceptionCenter, r1LoungeSpec } from '../office-vis2/r1-lounge.js'
import { buildR1Shell } from '../office-vis2/r1-shell.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { insideOwnFrame } from './helpers/r1-sweep.mjs'
const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { mergeStatic } = await import('../merge.js')
hooks.deregister()

const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)
const bounds = (mesh, instance) => {
  mesh.updateWorldMatrix(true, false)
  const matrix = new THREE.Matrix4(), points = [], p = new THREE.Vector3()
  if (mesh.isInstancedMesh) { mesh.getMatrixAt(instance, matrix); matrix.premultiply(mesh.matrixWorld) } else matrix.copy(mesh.matrixWorld)
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) points.push(p.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(matrix).clone())
  return new THREE.Box3().setFromPoints(points)
}

test('I5 closed leaves match all 26 registered IDs, dimensions and floor; open widths meet all 13 targets after real merge', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), module = buildR1Doors({ THREE, root, layout })
  assert.equal(module.records.length, 26); assert.equal(new Set(module.doors.ids).size, 26)
  assert.ok(module.records.every(row => module.doors.state(row.id).state === 'open'))
  mergeStatic(root)
  assert.equal(module.root.children.length, 2)
  module.doors.setAll('closed'); module.onFrame(1.2)
  const glass = module.root.getObjectByName('r1-door-glass'), metal = module.root.getObjectByName('r1-door-metal')
  assert.equal(metal.count, 26 * 4 + 15, 'two stacked doors have two separate parallel tracks each')
  module.records.forEach((row, i) => {
    const source = layout.r1.elements.find(item => item.id === row.id), box = bounds(glass, i)
    for (let part = 0; part < 4; part++) box.union(bounds(metal, i * 4 + part))
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    near(center.x, source.xM - 26); near(center.z, 18 - source.yM); near(box.min.y, 0)
    near(size.y, source.heightM); near(size[row.axis], source.lengthM); near(size[row.normal], source.widthM)
    assert.equal(module.doors.state(row.id).state, 'closed')
  })
  module.doors.setAll('open'); module.onFrame(1.2)
  for (const door of layout.r1.data.doors) {
    const pair = module.records.filter(row => row.doorId === door.id), axis = pair[0].axis
    const target = layout.r1.data.doorTargetFrames.find(frame => frame.door_id === door.id).clear_target_m
    const center = axis === 'x' ? door.xM - 26 : 18 - door.yM
    let low = center - (door.lengthM - .1) / 2, high = center + (door.lengthM - .1) / 2
    for (const row of pair) {
      const box = bounds(glass, module.records.indexOf(row))
      for (let p = 0; p < 4; p++) box.union(bounds(metal, module.records.indexOf(row) * 4 + p))
      if (row.direction < 0) low = Math.max(low, box.max[axis]); else high = Math.min(high, box.min[axis])
    }
    assert.ok(high - low >= target - .000001, `${door.id}: ${high - low} < ${target}`)
  }
  module.dispose()
})

test('I5 animation pauses when hidden, settles without matrix writes, validates IDs and disposes its resources once', () => {
  const root = new THREE.Group(), module = buildR1Doors({ THREE, root, layout: createOfficeR1Layout() }), id = module.doors.ids[0]
  const glass = module.root.children[0], metal = module.root.children[1], disposed = []
  for (const [name, value] of [['geometry', glass.geometry], ['glass', glass.material], ['metal', metal.material]]) value.addEventListener('dispose', () => disposed.push(name))
  module.doors.set(id, 'closed'); module.onFrame(.6); near(module.doors.state(id).progress, .5)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } })
  try { module.onFrame(.6); near(module.doors.state(id).progress, .5) } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document }
  module.root.visible = false; module.onFrame(.6); near(module.doors.state(id).progress, .5)
  module.root.visible = true; module.onFrame(.6); assert.equal(module.doors.state(id).state, 'closed')
  const version = glass.instanceMatrix.version; module.onFrame(.6); assert.equal(glass.instanceMatrix.version, version)
  assert.throws(() => module.doors.set('missing', 'open')); assert.throws(() => module.doors.set(id, 'invalid'))
  module.dispose(); module.dispose(); module.onFrame(1.2)
  assert.equal(root.children.length, 0); assert.deepEqual(disposed, ['geometry', 'glass', 'metal'])
})

test('I5 all 26 conservative leaf volumes clear real merged shell triangles at 25 sweep samples', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), previous = globalThis.document
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillText() {} }) }) }
  let shell
  try { shell = buildR1Shell({ THREE, root, layout }) } finally { globalThis.document = previous }
  const doors = buildR1Doors({ THREE, root, layout })
  mergeStatic(root); root.updateMatrixWorld(true)
  const obstacles = [], matrix = new THREE.Matrix4()
  shell.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || !/r1-(exterior|interior-walls|low-glass|front|corner|door-frame)/.test(mesh.name)) return
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(instance, matrix); matrix.premultiply(mesh.matrixWorld) } else matrix.copy(mesh.matrixWorld)
      const triangles = []
      for (let j = 0; j < (index?.count ?? pos.count); j += 3) triangles.push(new THREE.Triangle(...[0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(j + k) : j + k).applyMatrix4(matrix))))
      obstacles.push({ name: mesh.name, id: mesh.userData.wallIds?.[instance], bounds: bounds(mesh, instance), triangles })
    }
  })
  const northFrameContacts = []
  for (const row of doors.records) for (let sample = 0; sample <= 24; sample++) {
    const p = doors.positionAt(row, sample / 24), box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x, row.height / 2, p.z), new THREE.Vector3(row.vertical ? row.thickness : row.width, row.height, row.vertical ? row.width : row.thickness))
    // Face contact is allowed; remove 1 micrometre solely to distinguish it from positive volume overlap.
    box.expandByScalar(-.000001)
    for (const obstacle of obstacles) {
      if (!box.intersectsBox(obstacle.bounds)) continue
      const ownFrames = obstacles.filter(o => o.id === row.doorId && /door-frames/.test(o.name)).map(o => o.bounds)
      const intersection = box.clone().intersect(obstacle.bounds)
      if (insideOwnFrame(intersection, ownFrames)) {
        if (sample === 0 && obstacle.name === 'r1-exterior-frames' && row.doorId === '00-D-001') { const size = intersection.getSize(new THREE.Vector3()); northFrameContacts.push({ id: obstacle.id, volume: size.x * size.y * size.z }) }
        continue
      }
      assert.ok(!obstacle.triangles.some(t => box.intersectsTriangle(t)), `${row.id} sample ${sample}: ${obstacle.name}/${obstacle.id}`)
    }
  }
  assert.deepEqual(northFrameContacts.map(row => row.id), ['00-W-003-frame-1', '00-W-004-frame-0'])
  northFrameContacts.forEach(row => near(row.volume, .003375, .000001))
  doors.dispose(); shell.dispose()
})

test('I5 curved furniture fits source bounds within 5 mm, leaves four gaps and has ordinary-mesh collision', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision(), module = buildR1Lounge({ THREE, root, layout, collision })
  mergeStatic(root); root.updateMatrixWorld(true)
  const mesh = module.root.children[0], pos = mesh.geometry.attributes.position
  assert.equal(module.items.length, 5); assert.equal(module.root.children.length, 1)
  for (const item of module.items) {
    const row = layout.r1.elements.find(r => r.id === item.id), box = new THREE.Box3(), p = new THREE.Vector3()
    for (let i = item.startVertex; i < item.startVertex + item.count; i++) box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
    near(box.min.x, row.xM - 26 - row.lengthM / 2, .005); near(box.max.x, row.xM - 26 + row.lengthM / 2, .005)
    near(box.min.z, 18 - row.yM - row.widthM / 2, .005); near(box.max.z, 18 - row.yM + row.widthM / 2, .005)
    near(box.min.y, 0); near(box.max.y, row.heightM)
    const angle = (item.angles[0] + item.angles[1]) / 2 * Math.PI / 180, r = (item.inner + item.outer) / 2
    const hit = collision.hit(item.center[0] - 26 + r * Math.cos(angle), 18 - item.center[1] - r * Math.sin(angle))
    assert.equal(hit?.kind, item.id); assert.ok(hit.group.isMesh && !hit.group.isInstancedMesh)
  }
  for (let i = 0; i < 4; i++) {
    const end = r1LoungeSpec.angles[i][1], next = i === 3 ? r1LoungeSpec.angles[0][0] + 360 : r1LoungeSpec.angles[i + 1][0]
    assert.ok(next > end)
    const angle = (end + next) / 2 * Math.PI / 180, ray = new THREE.Raycaster(new THREE.Vector3(16 + 2.3 * Math.cos(angle), 3, 13.2 - 2.3 * Math.sin(angle)), new THREE.Vector3(0, -1, 0))
    assert.equal(ray.intersectObject(mesh).length, 0)
  }
  for (const id of ['12-T-001', '12-T-002']) { const row = layout.r1.elements.find(r => r.id === id); assert.ok(Math.hypot(row.xM - 42, row.yM - 4.8) + row.lengthM / 2 < r1LoungeSpec.inner) }
  // OFFICE-R1-RECEP：台子翻转后凸面朝入口，接待员坐进凹面，所以余量是从圆心往内半径量。
  const chair = layout.r1.elements.find(r => r.id === '11-CH-001'), centerToEdge = 1.8 - (r1ReceptionCenter[1] - chair.yM)
  assert.ok(centerToEdge >= .3 && centerToEdge <= .6); near(centerToEdge, .4, .02)
  // The card's 0.4 m refers to the registered chair centre; the physical chair front gap is 0.1 m.
  near(centerToEdge - chair.widthM / 2, .1, .02)
  // 排队区后沿必须留在台子凸面最前点（圆心 − 外半径）之前。
  const queue = layout.r1.controls.queue; assert.ok(queue.cy + queue.width / 2 < r1ReceptionCenter[1] - 2.7)
  // 机位随翻转后的圆心 (28, 6.3) → 世界 (2, 11.7) 与角度 [210, 330] 一起走。
  const deskWorld = { x: r1ReceptionCenter[0] - 26, z: 18 - r1ReceptionCenter[1] }
  for (const degrees of [220, 250, 270, 300, 320]) {
    const a = degrees * Math.PI / 180, ray = new THREE.Raycaster(new THREE.Vector3(deskWorld.x + 2.25 * Math.cos(a), 3, deskWorld.z - 2.25 * Math.sin(a)), new THREE.Vector3(0, -1, 0)), hit = ray.intersectObject(mesh)[0]
    assert.ok(hit, `${degrees}°`); near(Math.hypot(hit.point.x - deskWorld.x, hit.point.z - deskWorld.z), 2.25)
  }
  assert.equal(collision.stats().bodies, 5); module.dispose(); assert.equal(collision.stats().bodies, 0)
})

test('I5 builders add nothing outside R1', () => {
  for (const build of [buildR1Doors, buildR1Lounge]) { const root = new THREE.Group(); build({ THREE, root, layout: { plan1Phase: 'L2B' } }).dispose(); assert.equal(root.children.length, 0) }
})

test('I5 R2 fixes approved parking/arc values and never exempts overlap outside the own frame', () => {
  const root = new THREE.Group(), module = buildR1Doors({ THREE, root, layout: createOfficeR1Layout() })
  const front = module.records.filter(row => row.doorId === '11-D-001')
  assert.deepEqual(front.map(row => row.open.x), [-3.19, 7.19])
  assert.deepEqual(r1LoungeSpec, { center: [42, 4.8], inner: 1.9, outer: 2.7, angles: [[130, 190], [198, 258], [266, 326], [334, 410]] })
  const frame = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.1, 2.7, .1))
  const overlap = new THREE.Box3(new THREE.Vector3(.02, 0, .02), new THREE.Vector3(.08, 2.7, .08))
  assert.equal(insideOwnFrame(overlap, [frame]), true)
  assert.equal(insideOwnFrame(overlap, []), false)
  for (const axis of ['x', 'y', 'z']) { const outside = overlap.clone(); outside.max[axis] = frame.max[axis] + .001; assert.equal(insideOwnFrame(outside, [frame]), false) }
  assert.equal(insideOwnFrame(overlap, [frame.clone().translate(new THREE.Vector3(1, 0, 0))]), false)
  module.dispose()
})
