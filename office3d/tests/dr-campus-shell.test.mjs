import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CAMPUS, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { buildCampusShell, buildCampusShellSpec, CAMPUS_FINISHED_FLOOR_Y, campusVehicleClearance, hideCampusEnvironment } from '../dr-campus-shell.js'
import * as THREE from '../vendor/three/three.module.js'
import { createCampusRegistry, mergeCampusStatic } from '../dr-campus-registry.js'

const within = (part, bounds) => part.x0 >= bounds.x0 && part.x1 <= bounds.x1 && part.z0 >= bounds.z0 && part.z1 <= bounds.z1

test('campus shell spec stays static, offset, and within the frozen site', () => {
  const parts = buildCampusShellSpec()
  assert.ok(parts.length > 10)
  for (const part of parts) assert.equal(within(part, CAMPUS), true, part.name)
  assert.equal(parts.some((part) => part.dynamic), false)
  assert.ok(parts.find((part) => part.name === 'campus-paving').offset >= .05)
  for (const part of parts.filter((part) => part.kind === 'thin')) assert.ok(part.offset >= .12, part.name)
  for (const zone of CAMPUS_ZONES.filter((item) => item.v1 === 'reserved')) assert.equal(parts.some((part) => part.name === `campus-zone-${zone.id}`), false)
  assert.ok(parts.some((part) => part.name === 'campus-shuttle-reserve' && part.x0 === CAMPUS_SHUTTLE_STRIP.x0))
})

test('campus hides only environment geometry that conflicts with the building footprint', () => {
  const scene = new THREE.Scene(), campusRoot = new THREE.Group()
  const foreground = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  foreground.name = 'foreground-conflict'; foreground.position.set(-100, 0, 20)
  const distantTower = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  distantTower.name = 'distant-blue-glass-tower'; distantTower.position.set(-46, 0, -30)
  const sky = new THREE.Mesh(new THREE.BoxGeometry(3000, 3000, 3000), new THREE.MeshBasicMaterial())
  sky.isSky = true
  const landmark = new THREE.Group()
  landmark.name = 'landmark-phnom-penh-hill'; landmark.userData.campusOccluder = true; landmark.position.set(-150, 0, 40)
  const landmarkMesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial())
  landmark.add(landmarkMesh)
  scene.add(campusRoot, foreground, distantTower, sky, landmark)
  assert.deepEqual(hideCampusEnvironment(THREE, scene, campusRoot), { 'foreground-conflict': 1, 'landmark-phnom-penh-hill': 1 })
  assert.equal(foreground.visible, false)
  assert.equal(distantTower.visible, true)
  assert.equal(sky.visible, true)
  assert.equal(landmark.visible, false)
  assert.equal(landmarkMesh.visible, true)
})

test('campus clears only the environment mesh that obstructs vehicle corridors, turns, bays, or work strips', () => {
  const scene = new THREE.Scene(), campusRoot = new THREE.Group()
  const tree = new THREE.Group()
  tree.name = 'north-yard-palm'; tree.position.set(-143.7, 0, -22.5)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 6), new THREE.MeshBasicMaterial())
  const leaf = new THREE.Mesh(new THREE.CircleGeometry(1), new THREE.MeshBasicMaterial())
  leaf.position.set(16, 7, 0)
  tree.add(trunk, leaf)
  const block = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), new THREE.MeshBasicMaterial())
  block.name = 'east-yard-block'; block.position.set(-77.2, 0, -29.5)
  const clear = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), new THREE.MeshBasicMaterial())
  clear.name = 'clear-backdrop'; clear.position.set(-170, 0, 40)
  scene.add(campusRoot, tree, block, clear)
  const clearance = campusVehicleClearance()
  assert.ok(clearance.length > 20)
  const hidden = hideCampusEnvironment(THREE, scene, campusRoot, CAMPUS, clearance)
  assert.equal(tree.visible, true)
  assert.equal(trunk.visible, false)
  assert.equal(leaf.visible, true)
  assert.equal(block.visible, false)
  assert.equal(clear.visible, true)
  assert.equal(Object.keys(hidden).some((key) => key.includes('north-yard-palm')), true)
  assert.equal(Object.keys(hidden).some((key) => key.includes('east-yard-block')), true)
})

test('campus registry isolates an individual module failure', () => {
  class Group { constructor() { this.name = ''; this.parent = null; this.userData = {}; this.children = [] } removeFromParent() { this.parent = null } updateMatrixWorld() {} traverse(callback) { callback(this) } }
  const scene = { add(root) { root.parent = this } }
  const registry = createCampusRegistry({ THREE: { Group }, scene, layout: {} })
  registry.register('works', () => ({ dispose() {} }))
  registry.register('broken', () => { throw new Error('expected') })
  registry.buildAll()
  assert.deepEqual(registry.summary().modules, ['works'])
  assert.equal(registry.summary().skipped[0].name, 'broken')
  assert.deepEqual(registry.summary().merged, { removed: 0, added: 0 })
})

test('campus merge collapses regular and instanced static meshes, but keeps dynamic meshes', () => {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color: 0x123456, name: 'mark' })
  for (const x of [0, 2]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); mesh.name = `campus-mark-${x}`; mesh.position.x = x; mesh.receiveShadow = true; root.add(mesh) }
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 2)
  instances.name = 'campus-instances'; instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 0, 0)); instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(6, 0, 0)); root.add(instances)
  const dynamic = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); dynamic.userData.dynamic = true; root.add(dynamic)
  const result = mergeCampusStatic(THREE, root)
  assert.deepEqual(result, { removed: 3, added: 1 })
  const batch = root.children.find(item => item.name.startsWith('campus-opaque-batch-'))
  assert.equal(batch.userData.qualityProxy, true)
  assert.equal(batch.castShadow, false); assert.equal(batch.receiveShadow, false)
  assert.equal(dynamic.parent, root)
})

test('campus app wiring remains limited and local-only', async () => {
  const app = await readFile(new URL('./fixtures/historical/office3d-backup-nav-1d/app.js', import.meta.url), 'utf8')
  const current = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const backup = await readFile(new URL('./fixtures/historical/office3d-backup-s2-4/app.js', import.meta.url), 'utf8')
  const added = app.split('\n').filter((line) => !backup.includes(line)).filter((line) => line.trim())
  assert.ok(added.length <= 30, `added app.js lines: ${added.length}`)
  assert.match(current, /CAMPUS_MODE/)
  assert.doesNotMatch(added.join('\n'), /fetch\s*\(|innerHTML|\beval\s*\(/)
})

for (const tier of ['high', 'low']) test(`R2 ${tier}: ground zones and borders stay flat, unique and translucent after registry merge`, () => {
  const root = new THREE.Group(), noop = () => {}
  const context = new Proxy({}, { get: () => noop, set: () => true })
  const shell = buildCampusShell({ THREE, root, quality: { tier }, canvasTex(w, h, draw) { draw(context, w, h); return new THREE.Texture() } })
  const marks = root.children.filter(mesh => mesh.userData.campusGroundMark)
  const specs = buildCampusShellSpec().filter(part => part.kind === 'volume')
  const keys = new Set(specs.map(part => [part.x0, part.x1, part.z0, part.z1].join(',')))
  assert.equal(marks.length, keys.size)
  assert.ok(marks.length > 0)
  const bounds = new THREE.Box3()
  let markedVertices = 0, roofVertices = 0
  for (const mesh of marks) {
    bounds.setFromObject(mesh)
    assert.ok(bounds.max.y - bounds.min.y < .00001, mesh.name)
    assert.ok(bounds.min.y > CAMPUS_FINISHED_FLOOR_Y && bounds.max.y <= CAMPUS_FINISHED_FLOOR_Y + .02, mesh.name)
    assert.ok(mesh.material.transparent && mesh.material.opacity <= .18, mesh.name)
    assert.equal(mesh.material.depthWrite, false)
    assert.ok(keys.has([bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z].join(',')), mesh.name)
    markedVertices += mesh.geometry.attributes.position.count
    const borders = root.children.filter(edge => edge.name.startsWith(`${mesh.name}-edge-`))
    assert.equal(borders.length, 4)
    for (const border of borders) {
      bounds.setFromObject(border)
      const width = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)
      assert.ok(width >= .06 && width <= .1, border.name)
      assert.ok(bounds.max.y <= CAMPUS_FINISHED_FLOOR_Y + .02)
    }
  }
  for (const mesh of root.children.filter(mesh => mesh.name.startsWith('campus-roof-'))) {
    assert.ok(mesh.material.opacity <= .15)
    assert.equal(mesh.material.depthWrite, false)
    roofVertices += mesh.geometry.attributes.position.count
  }
  const merged = mergeCampusStatic(THREE, root)
  const batches = root.children.filter(mesh => mesh.name.startsWith('campus-transparent-batch-'))
  assert.equal(batches.length, 1)
  const batch = batches[0], color = batch.geometry.attributes.color, position = batch.geometry.attributes.position
  assert.equal(color.itemSize, 4)
  let groundCount = 0, roofCount = 0
  for (let i = 0; i < color.count; i++) {
    const alpha = color.getW(i) * batch.material.opacity
    if (Math.abs(alpha - .16) < 1e-6) {
      groundCount++
      assert.ok(position.getY(i) > CAMPUS_FINISHED_FLOOR_Y && position.getY(i) <= CAMPUS_FINISHED_FLOOR_Y + .02)
    } else if (Math.abs(alpha - .12) < 1e-6) roofCount++
    else assert.ok(Math.abs(alpha - .46) < 1e-6, `unrelated alpha changed: ${alpha}`)
  }
  assert.equal(groundCount, markedVertices)
  assert.equal(roofCount, roofVertices)
  merged.dispose(); shell.dispose()
})

test('R2 merge preserves legacy transparent opacity and batch count alongside scoped surface opacity', () => {
  const root = new THREE.Group()
  for (const [x, opacity, scoped] of [[0, .28, false], [2, .72, false], [4, .16, true], [6, .12, true]]) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity })
    material.userData.campusSurfaceOpacity = scoped
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    mesh.position.x = x; root.add(mesh)
  }
  const originals = root.children.map(mesh => mesh.material)
  const result = mergeCampusStatic(THREE, root)
  assert.equal(result.added, 1)
  assert.equal(result.removed, 4)
  const batch = root.children[0], colors = batch.geometry.attributes.color
  for (let i = 0; i < colors.count; i++) assert.ok(Math.abs(colors.getW(i) * batch.material.opacity - [.46, .46, .16, .12][Math.floor(i / 4)]) < 1e-6)
  result.dispose(); originals.forEach(material => material.dispose())
})
