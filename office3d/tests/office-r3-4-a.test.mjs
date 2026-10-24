import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { buildOfficeIsland } from '../office-island.js'
import { buildCreativeZone, buildDiningZone, buildLeisureZone, buildOfficeZones } from '../office-zones.js'

const textureStub = () => new THREE.Texture()
const collisionStub = () => { const added = []; return { added, add(mesh, kind) { added.push({ mesh, kind }) }, remove(mesh) { const i = added.findIndex(item => item.mesh === mesh); if (i >= 0) added.splice(i, 1) } } }

test('R3-4 A island uses LAYOUT_V3, ten seats, measured lounge offsets and one collision set', () => {
  const root = new THREE.Group(), collision = collisionStub(), island = buildOfficeIsland({ THREE, root, layout: LAYOUT_V3, canvasTex: textureStub, collision })
  assert.deepEqual(LAYOUT_V3.island.center, { x: 2, z: -6 })
  assert.equal(LAYOUT_V3.island.diameter, 12)
  assert.equal(island.seats.length, 10)
  assert.equal(island.lounges.length, 6)
  assert.equal(island.colliders.length, 12)
  assert.equal(collision.added.length, 12)
  assert.ok(island.lounges.every(seat => seat.sitOffset && Number.isFinite(seat.sitOffset.forward)))
  assert.ok(island.summary().triangles > 0)
  assert.ok(island.root.children.every(item => !item.isMesh || item.castShadow === false))
  island.dispose(); island.dispose(); assert.equal(root.children.length, 0); assert.equal(collision.added.length, 0)
})

test('R3-4 A low island remains ten-seat compatible and reduces geometry', () => {
  const high = buildOfficeIsland({ THREE, root: new THREE.Group(), layout: LAYOUT_V3 })
  const low = buildOfficeIsland({ THREE, root: new THREE.Group(), layout: LAYOUT_V3, low: true })
  assert.equal(low.seats.length, 10); assert.ok(low.summary().triangles < high.summary().triangles)
  high.dispose(); low.dispose()
})

test('R3-4 A feature zones are three non-seat factories with real canvasTex signature', () => {
  const calls = []; const canvasTex = (w, h, draw) => { calls.push([w, h, draw.length]); return textureStub() }
  const root = new THREE.Group(); const values = [buildLeisureZone, buildCreativeZone, buildDiningZone].map(factory => factory({ THREE, root, layout: LAYOUT_V3, canvasTex }))
  assert.deepEqual(values.map(value => value.id), ['leisure', 'creative', 'dining'])
  assert.ok(values.every(value => value.seats.length === 0 && value.summary().triangles > 0))
  assert.equal(calls.length, 3); assert.ok(calls.every(([w, h, arity]) => w === 512 && h === 96 && arity === 3))
  values.forEach(value => value.dispose()); assert.equal(root.children.length, 0)
})

test('R3-4 A aggregate zone factory preserves isolated root and no clickable staff', () => {
  const root = new THREE.Group(); const zones = buildOfficeZones({ THREE, root, layout: LAYOUT_V3 })
  assert.equal(zones.zones.length, 3); assert.equal(zones.summary().seats, 0)
  assert.ok(zones.zones.every(value => !value.root.userData.clickable && value.seats.length === 0))
  zones.dispose(); assert.equal(root.children.length, 0)
})

test('R3-4 A preview pages are static and themeable', () => {
  for (const file of ['office-island-preview.html', 'office-zones-preview.html']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(source, /data-theme|深色主题/); assert.match(source, /three\.module\.js/)
    assert.doesNotMatch(source, /fetch\s*\(|\/state|\/act|Paperclip|Math\.random|Date\.now/)
  }
})
