import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN } from '../office-layout.js'
import { buildOfficeVis2Frontage } from '../office-vis2/frontage.js'
import { receptionBackdrop } from '../office-vis2/foyer.js'
import { appendOfficePlazaPaving } from '../office-vis2/completion.js'
import { createSampleBatch } from '../office-vis2/batch.js'

test('ALIGN wall and entrance lettering share one atlas and one draw without changing frontage mapping', () => {
  const root = new THREE.Group(), writes = [], images = [], layout = LAYOUT_V3_ALIGN
  const sign = buildOfficeVis2Frontage({ THREE, root, layout, includeEnclosure: false, canvasTex(w, h, draw) {
    const ctx = { clearRect() {}, fillText(text, x, y) { writes.push({ text, x, y, font: this.font }) } }
    draw(ctx, w, h); const texture = new THREE.Texture(); images.push({ w, h, texture }); return texture
  } })
  try {
    assert.deepEqual(writes.map(w => w.text), ['前厅接待  ·  RECEPTION', '欢 迎 光 临'])
    assert.deepEqual(images.map(({ w, h }) => [w, h]), [[1024, 256]])
    assert.equal(sign.summary().calls, 1); assert.equal(sign.summary().triangles, 4)
    assert.deepEqual(sign.mapping, { glass: [], gatePosts: [], entrance: null })
    const mesh = root.getObjectByName('vis2-reception-wayfinding'), { position: p, normal: n, uv } = mesh.geometry.attributes
    assert.equal(p.count, 8); assert.equal(mesh.geometry.index.count, 12)
    const face = receptionBackdrop(layout.frontDesk).grille
    for (let i = 0; i < 4; i++) {
      assert.ok(Math.abs(p.getZ(i) - face.faceZ - .002) < 1e-6)
      assert.ok(p.getY(i) < face.height && p.getY(i) > 2)
      assert.ok(n.getZ(i) > .999 && uv.getY(i) >= .5, 'wall keeps its orientation and upper atlas cell')
    }
    const batch = createSampleBatch(THREE), pavingRoot = new THREE.Group()
    appendOfficePlazaPaving({ THREE, batch, layout }); const paving = batch.build(pavingRoot, 'real-paving')
    try {
      const ray = new THREE.Raycaster(new THREE.Vector3(layout.axis.x, 1, layout.foyer.z1 + .9), new THREE.Vector3(0, -1, 0))
      const surface = ray.intersectObject(paving.mesh)[0]; assert.ok(surface)
      for (let i = 4; i < 8; i++) {
        assert.ok(p.getY(i) - surface.point.y > .001 && p.getY(i) - surface.point.y < .003, 'actual paving clearance is 1–3mm')
        assert.ok(p.getX(i) > layout.doors.south.x0 && p.getX(i) < layout.doors.south.x1, 'stays within the data-owned entrance')
        assert.ok(p.getZ(i) >= layout.foyer.z1 + .59 && p.getZ(i) <= layout.foyer.z1 + 1.21)
        assert.ok(n.getY(i) > .999 && uv.getY(i) <= .5, 'floor is upward-facing with its own atlas cell')
      }
    } finally { paving.dispose() }
    let geometry = 0, material = 0, texture = 0
    mesh.geometry.addEventListener('dispose', () => geometry++); mesh.material.addEventListener('dispose', () => material++)
    images[0].texture.addEventListener('dispose', () => texture++)
    sign.dispose(); sign.dispose()
    assert.deepEqual([geometry, material, texture, root.children.length], [1, 1, 1, 0])
  } finally { sign.dispose() }
})

test('legacy sample retains its single reception sign, texture dimensions and rendering budget', () => {
  const root = new THREE.Group(), writes = [], dimensions = []
  const sign = buildOfficeVis2Frontage({ THREE, root, layout: LAYOUT_V3, includeEnclosure: false, canvasTex(w, h, draw) {
    dimensions.push([w, h]); draw({ clearRect() {}, fillText: text => writes.push(text) }, w, h); return new THREE.Texture()
  } })
  try {
    assert.deepEqual(dimensions, [[1024, 64]]); assert.deepEqual(writes, ['前厅接待  ·  RECEPTION'])
    assert.equal(sign.summary().triangles, 2); assert.equal(sign.summary().calls, 1)
    assert.equal(root.getObjectByName('vis2-reception-wayfinding').geometry.attributes.position.count, 4)
  } finally { sign.dispose() }
})
