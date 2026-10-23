import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LAYOUT_V3 } from '../office-layout.js'
import { barSeats, barLounges, barColliders } from '../office-bar-geometry.js'
import { buildOfficeBar } from '../office-bar.js'
import { officeVis2Enabled, loadOfficeVis2Assets } from '../office-vis2/assets.js'
import { createOfficeVis2Controller } from '../office-vis2/sample.js'
import { buildOfficeBrandMarks } from '../office-vis2/brand.js'
import { createSceneQuality } from '../quality.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'
import { buildOfficePreviewContext } from '../office-vis2/preview-context.js'

const loader = () => { const state = { created: 0, disposed: 0 }; return { state, async loadAsync() { state.created++; const t = new THREE.Texture(); t.addEventListener('dispose', () => state.disposed++); return t } } }
const canvasTex = (w, h, draw) => { assert.equal(draw.length, 3); draw({ clearRect() {}, fillText() {}, set fillStyle(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set font(v) {} }, w, h); return new THREE.Texture() }

test('VIS2 defaults closed for missing or malformed config and requests no textures', async () => {
  const l = loader()
  for (const config of [undefined, null, true, 'true', [], { enabled: 'true' }, { enabled: 1 }]) {
    assert.equal(officeVis2Enabled(config), false)
    assert.equal(await loadOfficeVis2Assets(THREE, config, l), null)
  }
  assert.equal(l.state.created, 0)
})

test('VIS2 material loading configures sRGB and releases partial successes on failure', async () => {
  const l = loader(), original = l.loadAsync
  l.loadAsync = url => url.includes('stone-floor') ? Promise.reject(new Error('unavailable')) : original(url)
  await assert.rejects(loadOfficeVis2Assets(THREE, { enabled: true }, l))
  assert.equal(l.state.created, 2); assert.equal(l.state.disposed, 2)
  const complete = loader(), assets = await loadOfficeVis2Assets(THREE, { enabled: true }, complete)
  assert.equal(assets.oak.colorSpace, THREE.SRGBColorSpace)
  assets.dispose(); assets.dispose(); assert.equal(complete.state.disposed, 4)
})

test('VIS2 logo loading is optional and absent logos use named replacement slots', async () => {
  const l = loader(), original = l.loadAsync
  l.loadAsync = url => url.includes('logo.png') ? Promise.reject(new Error('logo unavailable')) : original(url)
  const assets = await loadOfficeVis2Assets(THREE, { enabled: true }, l)
  assert.equal(assets.logo, null); assets.dispose(); assert.equal(l.state.disposed, 3)
  const marks = buildOfficeBrandMarks({ THREE, root: new THREE.Group(), layout: LAYOUT_V3, assets, canvasTex })
  assert.equal(marks.placeholder, true); assert.equal(marks.marks.length, 3)
  assert.equal(marks.root.getObjectByName('office-vis2-brand-placeholder-slots').userData.replaceable, true)
  assert.equal(marks.root.getObjectByName('office-vis2-brushed-metal-brand-backing').userData.depthOffset, .026)
  marks.dispose()
})

test('VIS2 brand marks preserve the approved logo ratio and avoid co-planar backing', () => {
  const assets = { logo: new THREE.Texture() }, root = new THREE.Group()
  const marks = buildOfficeBrandMarks({ THREE, root, layout: LAYOUT_V3, assets, canvasTex })
  assert.equal(marks.placeholder, false); assert.equal(marks.marks.length, 3)
  for (const mark of marks.marks) assert.ok(Math.abs(mark.width / mark.height - 979 / 544) < 1e-12)
  assert.equal(marks.root.getObjectByName('office-vis2-approved-logo-marks').material.map, assets.logo)
  assert.equal(marks.root.getObjectByName('office-vis2-brushed-metal-brand-backing').userData.depthOffset, .026)
  const fascia = marks.marks.find(m => m.id === 'bar-fascia'), center = LAYOUT_V3.bar.center
  const radial = new THREE.Vector3(fascia.x - center.x, 0, fascia.z - center.z)
  assert.ok(Math.abs(radial.length() - LAYOUT_V3.bar.radius - .04) < 1e-10)
  const actual = new THREE.Matrix4(); marks.root.getObjectByName('office-vis2-approved-logo-marks').getMatrixAt(0, actual)
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(actual)
  assert.ok(normal.dot(radial.normalize()) > .999999)
  assert.ok(normal.z > .9, 'logo still faces the entrance')
  assert.ok(fascia.y + (fascia.height + .14) / 2 < .95, 'backing stays below the stone countertop')
  let released = 0
  marks.root.traverse(mesh => { if (mesh.isInstancedMesh) mesh.addEventListener('dispose', () => released++) })
  marks.dispose(); marks.dispose(); assert.equal(released, 2)
})

test('VIS2 reception labels clear the brand wall and construction failure releases mounted resources', async () => {
  const root = new THREE.Group(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: loader(), canvasTex })
  assert.equal(await ctl.setConfig({ enabled: true }), true)
  const wall = ctl.mapping.brandMarks.find(m => m.id === 'reception-wall'), label = ctl.root.getObjectByName('vis2-reception-wayfinding')
  assert.ok(label.position.y - label.geometry.parameters.height / 2 > wall.y + wall.height / 2)
  ctl.dispose()
  const allocated = new Set(), released = new Set(), registered = new Set()
  const failing = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: loader(), collision: { add(v) { registered.add(v) }, remove(v) { registered.delete(v) } }, canvasTex() {
    root.traverse(mesh => { if (mesh.isMesh) for (const value of [mesh.geometry, ...[mesh.material].flat()]) { allocated.add(value.uuid); value.addEventListener('dispose', () => released.add(value.uuid)) } })
    throw new Error('simulated host canvas failure')
  } })
  assert.equal(await failing.setConfig({ enabled: true }), false)
  assert.equal(failing.status, 'fallback'); assert.equal(root.children.length, 0); assert.equal(registered.size, 0)
  assert.deepEqual([...released].sort(), [...allocated].sort()); failing.dispose()
})

test('VIS2 closing while images load prevents late mounting and releases owned images', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve }), l = loader(), original = l.loadAsync
  l.loadAsync = async url => { await gate; return original(url) }
  const root = new THREE.Group(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l })
  const opening = ctl.setConfig({ enabled: true }); await ctl.setConfig(null); release()
  assert.equal(await opening, false); assert.equal(root.children.length, 0); assert.equal(l.state.disposed, 4)
  ctl.dispose()
})

test('VIS2 preserves its owned shader surfaces through the actual host quality and merge contracts', async () => {
  const scene = new THREE.Scene(), ctl = createOfficeVis2Controller({ THREE, root: scene, layout: LAYOUT_V3, textureLoader: loader(), canvasTex })
  assert.equal(await ctl.setConfig({ enabled: true }), true)
  const before = []
  ctl.root.traverse(mesh => { if (mesh.isMesh) before.push({ mesh, material: mesh.material.uuid, geometry: mesh.geometry.uuid }) })
  const policy = createSceneQuality(THREE, { scene, renderer: { shadowMap: {}, compile() {} }, camera: new THREE.PerspectiveCamera(), env: { setQuality() {} }, characters: () => [], mergeStatic: root => mergeOfficeStatic(THREE, root) })
  policy.prepare('low'); policy.activate('medium'); policy.activate('high')
  assert.equal(policy.summary().sourceMeshes, 0)
  assert.equal(mergeOfficeStatic(THREE, ctl.root).removed, 0)
  for (const { mesh, material, geometry } of before) { assert.equal(mesh.material.uuid, material); assert.equal(mesh.geometry.uuid, geometry) }
  ctl.dispose(); assert.equal(scene.getObjectByName('office-sample-zone'), undefined)
})

test('office context reuses the 25 layout workstations and never disposes injected model assets', () => {
  const names = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'table', 'chairModernCushion', 'bookcaseOpen', 'books', 'pottedPlant']
  const A = { furn: Object.fromEntries(names.map(name => [name, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())])) }
  let sharedDisposed = 0
  for (const mesh of Object.values(A.furn)) { mesh.geometry.addEventListener('dispose', () => sharedDisposed++); mesh.material.addEventListener('dispose', () => sharedDisposed++) }
  const canvasTex = (w, h, draw) => { const ctx = { clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, canvas: {} }, image = { getContext: () => ctx }; draw(ctx, w, h); const texture = new THREE.Texture(); texture.image = image; return texture }
  const placeFurniture = (assets, name, x, z, options) => { const group = new THREE.Group(); group.add(assets.furn[name].clone()); group.position.set(x, options.y, z); group.rotation.y = options.rotY; return { group, size: new THREE.Vector3(1, 1, 1) } }
  const root = new THREE.Group(), value = buildOfficePreviewContext({ THREE, root, layout: LAYOUT_V3, A, placeFurniture, canvasTex })
  assert.deepEqual(value.seats, Object.entries(LAYOUT_V3.seats).map(([name, [region, x, z]]) => ({ name, region, x, z })))
  assert.equal(value.seats.length, 25); value.onFrame(new THREE.PerspectiveCamera())
  value.dispose(); value.dispose(); assert.equal(root.children.length, 0); assert.equal(sharedDisposed, 0)
  for (const mesh of Object.values(A.furn)) { mesh.geometry.dispose(); mesh.material.dispose() }
})

test('VIS2 repeated entry/exit preserves host objects and cleans collisions and textures', async () => {
  const root = new THREE.Group(), sentinel = new THREE.Group(); root.add(sentinel)
  const registered = [], collision = { add(p) { registered.push(p) }, remove(p) { const i = registered.indexOf(p); if (i >= 0) registered.splice(i, 1) } }
  const l = loader(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l, collision, canvasTex })
  for (let i = 0; i < 5; i++) {
    assert.equal(await ctl.setConfig({ enabled: true }), true)
    assert.equal(registered.length, 12); assert.ok(ctl.summary().calls <= 12); assert.ok(ctl.summary().triangles < 28000)
    assert.equal(ctl.mapping.frontage.entrance.width, 4)
    await ctl.setConfig(null); assert.equal(root.children.length, 1); assert.equal(registered.length, 0)
  }
  ctl.dispose(); ctl.dispose(); assert.equal(l.state.created, 20); assert.equal(l.state.disposed, 20); assert.equal(root.children[0].uuid, sentinel.uuid)
})

test('VIS2 public bar hook preserves closed B0 geometry and active seat IDs/positions', async () => {
  const baseline = buildOfficeBar({ THREE, root: new THREE.Group(), layout: LAYOUT_V2 })
  for (const visualSample of [undefined, { enabled: 'true' }, { enabled: true, assets: null }]) {
    const value = buildOfficeBar({ THREE, root: new THREE.Group(), layout: LAYOUT_V2, visualSample })
    assert.deepEqual(value.summary(), baseline.summary()); value.dispose()
  }
  const l = loader(), assets = await loadOfficeVis2Assets(THREE, { enabled: true }, l), root = new THREE.Group()
  class Collision { items = new Set(); add(item) { this.items.add(item) } remove(item) { this.items.delete(item) } }
  const collision = new Collision()
  const active = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, collision, visualSample: { enabled: true, assets } })
  const anchors = rows => rows.map(({ id, x, z, yaw }) => ({ id, x, z, yaw }))
  assert.deepEqual(anchors(active.seats), anchors(barSeats(LAYOUT_V2)))
  assert.deepEqual(anchors(active.lounges), anchors(barLounges(LAYOUT_V2)))
  assert.deepEqual(active.colliders, barColliders(LAYOUT_V2))
  assert.equal(collision.items.size, 12)
  active.dispose(); active.dispose(); assert.equal(collision.items.size, 0); assert.equal(root.children.length, 0); assert.equal(l.state.disposed, 0); assets.dispose(); baseline.dispose()
})

test('VIS2 bar surfaces leave centre, both entry openings and operation floor clear', async () => {
  const assets = await loadOfficeVis2Assets(THREE, { enabled: true }, loader()), root = new THREE.Group()
  const value = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, visualSample: { enabled: true, assets } })
  const body = value.root.getObjectByName('tea-bar-body-top-equipment'), c = LAYOUT_V2.bar.center; body.updateMatrixWorld(true)
  const height = (x, z) => new THREE.Raycaster(new THREE.Vector3(c.x + x, 2, c.z + z), new THREE.Vector3(0, -1, 0)).intersectObject(body)[0]?.point.y
  assert.equal(height(0, 0), undefined); assert.equal(height(2.8, 0), undefined); assert.equal(height(-2.8, 0), undefined)
  assert.ok(height(0, 2.8) > .95); assert.ok(height(1.6, 0) < .05)
  assert.ok(body.geometry.attributes.sampleUv.count > 0)
  assert.equal(value.root.getObjectByName('tea-bar-instanced-stools').isInstancedMesh, true)
  value.dispose(); assets.dispose()
})
