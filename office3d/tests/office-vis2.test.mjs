import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LAYOUT_V3 } from '../office-layout.js'
import { barSeats, barLounges, barColliders } from '../office-bar-geometry.js'
import { buildOfficeBar } from '../office-bar.js'
import { officeVis2Enabled, loadOfficeVis2Assets } from '../office-vis2/assets.js'
import { createOfficeVis2Controller } from '../office-vis2/sample.js'

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
  assets.dispose(); assets.dispose(); assert.equal(complete.state.disposed, 3)
})

test('VIS2 closing while images load prevents late mounting and releases owned images', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve }), l = loader(), original = l.loadAsync
  l.loadAsync = async url => { await gate; return original(url) }
  const root = new THREE.Group(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l })
  const opening = ctl.setConfig({ enabled: true }); await ctl.setConfig(null); release()
  assert.equal(await opening, false); assert.equal(root.children.length, 0); assert.equal(l.state.disposed, 3)
  ctl.dispose()
})

test('VIS2 repeated entry/exit preserves host objects and cleans collisions and textures', async () => {
  const root = new THREE.Group(), sentinel = new THREE.Group(); root.add(sentinel)
  const registered = [], collision = { add(p) { registered.push(p) }, remove(p) { const i = registered.indexOf(p); if (i >= 0) registered.splice(i, 1) } }
  const l = loader(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l, collision, canvasTex })
  for (let i = 0; i < 5; i++) {
    assert.equal(await ctl.setConfig({ enabled: true }), true)
    assert.equal(registered.length, 12); assert.ok(ctl.summary().calls <= 10); assert.ok(ctl.summary().triangles < 28000)
    assert.equal(ctl.mapping.frontage.entrance.width, 4)
    await ctl.setConfig(null); assert.equal(root.children.length, 1); assert.equal(registered.length, 0)
  }
  ctl.dispose(); ctl.dispose(); assert.equal(l.state.created, 15); assert.equal(l.state.disposed, 15); assert.equal(root.children[0].uuid, sentinel.uuid)
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
