import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeV2Registry, mergeOfficeStatic } from '../office-v2-registry.js'
import { officeSeats, startOfficeV2, officeV2Modules, buildWing, buildOfficePartitions } from '../office-v2-modules.js'
import { LAYOUT_V1, LAYOUT_V2, SEATS } from '../office-layout.js'

test('O4b isolates failed factories, removes partial objects and never commits their collisions', () => {
  const scene = new THREE.Scene(), old = new THREE.Group(), bodies = []; scene.add(old)
  const registry = createOfficeV2Registry({ THREE, scene, layout: LAYOUT_V2, quality: { tier: 'high' } })
  registry.register('bad', ({ root, scene, collision }) => { root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); scene.add(new THREE.Group()); old.visible = false; collision.add(root, 'bad'); throw new Error('expected') })
  registry.register('nullError', () => { throw null })
  registry.register('good', ({ root, collision, low }) => { assert.equal(low, false); collision.add(root, 'good'); return { value: 7 } })
  registry.buildAll({ collision: { add: (...args) => bodies.push(args) } })
  assert.deepEqual(registry.summary().modules, ['good'])
  assert.equal(registry.summary().skipped[0].name, 'bad')
  assert.equal(registry.summary().skipped[1].error, 'null')
  assert.equal(registry.get('good').value, 7)
  assert.equal(registry.root.name, 'office2-root')
  assert.equal(registry.root.children.length, 1)
  assert.equal(scene.children.length, 2); assert.equal(old.visible, true)
  assert.equal(bodies.length, 1); assert.equal(bodies[0][1], 'good')
  registry.buildAll(); assert.equal(scene.children.length, 2)
  registry.dispose(); assert.equal(scene.children.length, 1)
})

test('O4b material merge preserves world bounds, material identity, dynamic meshes and root visibility', () => {
  const root = new THREE.Group(); root.position.set(7, 0, 2)
  const material = new THREE.MeshStandardMaterial({ color: '#f4f1ea' })
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), material); a.position.x = -3; root.add(a)
  const b = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 1), material, 2)
  b.setMatrixAt(0, new THREE.Matrix4().makeTranslation(2, 0, 0)); b.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0)); root.add(b)
  root.updateWorldMatrix(true, true)
  const before = new THREE.Box3().setFromObject(root)
  const dynamic = new THREE.Mesh(new THREE.BoxGeometry(), material); dynamic.userData.dynamic = true; root.add(dynamic)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(), material); proxy.visible = false; root.add(proxy)
  const otherMaterial = new THREE.MeshBasicMaterial({ color: '#b89b64' }), other = new THREE.Mesh(new THREE.BoxGeometry(), otherMaterial); root.add(other)
  const result = mergeOfficeStatic(THREE, root)
  assert.equal(result.removed, 2); assert.equal(result.added, 1)
  const batch = root.children.find(x => x.name.startsWith('office2-merged'))
  const after = new THREE.Box3().setFromObject(batch)
  assert.deepEqual(after.min.toArray(), before.min.toArray()); assert.deepEqual(after.max.toArray(), before.max.toArray())
  assert.equal(batch.material, material); assert.equal(dynamic.parent, root); assert.equal(proxy.parent, root); assert.equal(other.material, otherMaterial)
  root.visible = false; assert.equal(batch.parent.visible, false)
  root.visible = true; result.dispose(); assert.equal(batch.parent, null)
})

test('O4b leaves pre-batched atlas and instance-color shaders intact', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial()
  const atlas = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1)
  atlas.geometry.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(new Float32Array([1, 0]), 2)); root.add(atlas)
  const colored = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1); colored.setColorAt(0, new THREE.Color('#b89b64')); root.add(colored)
  const result = mergeOfficeStatic(THREE, root)
  assert.equal(result.removed, 0); assert.equal(atlas.parent, root); assert.equal(colored.parent, root)
})

test('O4b a failed disposer does not retain the root or prevent other modules from disposing', () => {
  const scene = new THREE.Scene(), registry = createOfficeV2Registry({ THREE, scene, layout: LAYOUT_V2 })
  let disposed = false
  registry.register('good', () => ({ dispose() { disposed = true } }))
  registry.register('bad', () => ({ dispose() { throw null } }))
  registry.buildAll(); scene.userData.officeV2 = registry; registry.dispose()
  assert.equal(disposed, true); assert.equal(scene.children.length, 0); assert.equal(scene.userData.officeV2, undefined)
  assert.equal(registry.summary().skipped[0].name, 'bad')
})

test('O4b default entry allocates no 3D objects and preserves model cast order', () => {
  assert.equal(startOfficeV2({ layout: LAYOUT_V1 }), null)
  assert.equal(officeSeats(LAYOUT_V1), SEATS)
  const seats = officeSeats(LAYOUT_V2)
  assert.deepEqual(Object.keys(seats), Object.keys(SEATS))
  for (const name of Object.keys(SEATS)) assert.deepEqual(seats[name], LAYOUT_V2.seats[name])
  assert.deepEqual(officeV2Modules.map(([id]) => id), ['navigation', 'shell', 'furniture'])
  const wing = {}, partitions = {}, scene = { userData: { officeV2: { get: () => ({ wing, partitions }) } } }
  assert.equal(buildWing({ scene }), wing); assert.equal(buildOfficePartitions({ scene }), partitions)
})

test('O4b boots both real modules atomically and falls back without leaked scene or collisions', () => {
  const ctx = () => ({ canvas: {}, fillRect() {}, fillText() {}, strokeRect() {}, drawImage() {} })
  const canvasTex = () => ({ image: { getContext: ctx }, dispose() {} })
  const makeScreenTexture = () => ({ ctx: ctx(), tex: { dispose() {} }, scroll: 0, last: '' })
  const A = { furn: Object.fromEntries(['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'table', 'chairModernCushion', 'bookcaseOpen', 'books', 'pottedPlant'].map(name => [name, true])) }
  const placeFurniture = (assets, name, x, z, { y = 0, rotY = 0 }) => { const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); group.position.set(x, y, z); group.rotation.y = rotY; return { group, size: new THREE.Vector3(1, 1, 1) } }
  const scene = new THREE.Scene(), floor = { visible: true }, bodies = []
  const shared = { THREE, scene, floor, quality: { tier: 'high' }, layout: LAYOUT_V2, A, placeFurniture, canvasTex, makeScreenTexture, collision: { add: (...args) => bodies.push(args) } }
  const furniture = startOfficeV2(shared)
  assert.ok(furniture); assert.equal(floor.visible, false)
  const registry = furniture.registry
  assert.equal(scene.userData.officeV2, registry)
  assert.deepEqual(registry.summary().modules, ['navigation', 'shell', 'furniture'])
  assert.ok(registry.summary().merged.removed > 100); assert.equal(registry.summary().merged.added, 1)
  assert.equal(registry.summary().skipped.length, 0)
  assert.equal(furniture.spec.workstations.length, 25)
  assert.equal(registry.get('shell').spec[0].x0, -34)
  assert.ok(bodies.length > 100)
  let visibleMeshes = 0; registry.root.traverse(mesh => { if (mesh.isMesh && mesh.visible) visibleMeshes++ })
  assert.equal(visibleMeshes, 3)
  registry.dispose(); assert.equal(scene.children.length, 0); assert.equal(scene.userData.officeV2, undefined)
  const failedScene = new THREE.Scene(), failedBodies = [], failedFloor = { visible: true }
  assert.equal(startOfficeV2({ ...shared, scene: failedScene, floor: failedFloor, A: null, collision: { add: (...args) => failedBodies.push(args) } }), null)
  assert.equal(failedScene.children.length, 0); assert.equal(failedFloor.visible, true); assert.equal(failedBodies.length, 0)
})

test('O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const before = fs.readFileSync(new URL('../../office3d-backup-o4b/app.js', import.meta.url), 'utf8')
  const lines = app.split(/\r?\n/), old = before.split(/\r?\n/), oldSet = new Set(old)
  const changed = lines.filter(line => !oldSet.has(line))
  assert.ok(changed.length <= 10, `${changed.length} new app lines`)
  assert.ok(lines.length - old.length <= 10)
  assert.match(app, /window.__office.officeV2 = officeFurnitureV2\?\.registry \|\| null/)
  for (const file of ['dr-campus-shell.test.mjs', 'warehouse-shell.test.mjs']) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /priorCardLines|officeFurnitureV2\|placeOfficeFurnitureV2/)
    assert.match(source, /assert.ok\(added.length <= 30/)
  }
  for (const file of ['office-v2-registry.js', 'office-v2-modules.js']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /dr-campus|dr-console|#(?:0d2942|24d7df|d6f8ff)/i)
    assert.doesNotMatch(source, /fetch\s*\(|innerHTML|\beval\s*\(/)
  }
})
