import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { buildOfficeIsland } from '../office-island.js'
import { buildOfficeSampleHost, officeSampleRequested } from '../office-vis2/host.js'
import { startOfficeV3 } from '../office-v3-modules.js'

const canvasTex = (w, h, draw) => { draw({ clearRect() {}, fillRect() {}, fillText() {} }, w, h); return new THREE.Texture() }
function fixture(search = '?layout=3&officeSample=1') {
  const live = new Set(), textures = new Set()
  return { THREE, root: new THREE.Group(), scene: new THREE.Scene(), layout: LAYOUT_V3, search, canvasTex,
    quality: { tier: 'high' }, live, textures,
    collision: { add: mesh => live.add(mesh.uuid), remove: mesh => live.delete(mesh.uuid) },
    textureLoader: { async loadAsync() { const t = new THREE.Texture(); textures.add(t.uuid); t.addEventListener('dispose', () => textures.delete(t.uuid)); return t } },
  }
}

test('sample gate is exact, default closed and closed registry retains original batching', () => {
  for (const search of ['', '?officeSample=0', '?officeSample=true', '?officeSample=1&officeSample=1', '?officeSample=%31x']) assert.equal(officeSampleRequested(search), false)
  assert.equal(officeSampleRequested('?officeSample=1'), true)
  const a = fixture(''), b = fixture('')
  const old = buildOfficeIsland(a), current = buildOfficeSampleHost(b)
  assert.deepEqual(current.summary(), old.summary()); assert.deepEqual(current.seats, old.seats); assert.deepEqual(current.colliders, old.colliders)
  assert.equal(b.root.userData.dynamic, undefined); assert.equal(current.ready, undefined); assert.equal(b.textures.size, 0)
  old.dispose(); current.dispose(); assert.equal(b.live.size, 0)
})

test('real registry opens sample without moving desks, duplicating collision or preview enclosure', async () => {
  const context = fixture(), before = JSON.stringify(LAYOUT_V3)
  const registry = startOfficeV3(context), island = registry.get('island')
  const initialColliders = context.live.size
  assert.equal(await island.ready, true); assert.equal(island.status, 'open')
  assert.equal(island.root.visible, false); assert.equal(island.sampleRoot.parent.uuid, island.root.parent.uuid)
  assert.equal(context.live.size, initialColliders); assert.equal(island.colliders.length, 12)
  assert.equal(Object.keys(LAYOUT_V3.seats).length, 25); assert.equal(JSON.stringify(LAYOUT_V3), before)
  assert.deepEqual(island.mapping.frontage, { glass: [], gatePosts: [], entrance: null })
  assert.equal(island.sampleRoot.getObjectByName('vis2-neutral-transparent-glass'), undefined)
  const surface = island.sampleRoot.getObjectByName('sample-zone-static-surfaces').geometry.attributes.position
  assert.ok(Array.from({length:surface.count}, (_,i) => surface.getY(i)).some(y => Math.abs(y - .092) < 1e-5), 'rings sit above existing 0.08 m floor')
  for (let i = 0; i < 5; i++) {
    assert.equal(await island.setConfig({ enabled: false }), false); assert.equal(island.root.visible, true); assert.equal(context.textures.size, 0)
    assert.equal(await island.setConfig({ enabled: true }), true); assert.equal(context.textures.size, 4); assert.equal(context.live.size, initialColliders)
    assert.equal(island.root.parent.children.filter(c => c.name === 'office-sample-zone').length, 1)
  }
  registry.dispose(); assert.equal(context.textures.size, 0); assert.equal(island.root.parent, null); assert.equal(island.status, 'closed')
})

test('missing texture restores legacy; destruction and stale loads cannot resurrect the sample', async () => {
  const bad = fixture(); bad.textureLoader.loadAsync = async () => { throw new Error('missing asset') }
  const failed = buildOfficeSampleHost(bad); assert.equal(await failed.ready, false); assert.equal(failed.status, 'fallback'); assert.equal(failed.root.visible, true); failed.dispose()
  const context = fixture(), pending = []
  const original = context.textureLoader.loadAsync
  context.textureLoader.loadAsync = () => new Promise(resolve => pending.push(async () => resolve(await original())))
  const host = buildOfficeSampleHost(context)
  await new Promise(resolve => setImmediate(resolve)); assert.equal(pending.length, 3)
  host.dispose(); for (const resolve of pending.splice(0)) await resolve()
  await new Promise(resolve => setImmediate(resolve)); for (const resolve of pending.splice(0)) await resolve()
  assert.equal(await host.ready, false); assert.equal(context.textures.size, 0); assert.equal(context.root.children.length, 0); assert.equal(context.live.size, 0)
})
