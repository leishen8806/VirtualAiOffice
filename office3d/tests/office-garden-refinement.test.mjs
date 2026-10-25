import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficeGardenBed } from '../office-vis2/plants.js'
import { officeShellFinishSpec } from '../office-vis2/shell-finish.js'
import { buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { wholeFloorSpec } from '../office-vis2/whole-floor.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'

test('organic and perimeter gardens are deterministic, contained and released in both tiers', () => {
  for (const low of [false, true]) for (const organic of [false, true]) {
    const bed = organic ? { x: -20, z: 24.5, w: 5.2, d: 4.8 } : { x: 34, z: 0, w: 1.8, d: 2.37 }
    let previous
    for (let repeat = 0; repeat < 2; repeat++) {
      const root = new THREE.Group(), batch = createSampleBatch(THREE), before = JSON.stringify(bed)
      appendOfficeGardenBed({ THREE, batch, bed, low, organic, seed: 9 })
      assert.equal(JSON.stringify(bed), before)
      const built = batch.build(root, 'garden'), geometry = built.mesh.geometry, p = geometry.attributes.position, n = geometry.attributes.normal
      assert.equal(root.children.length, 1)
      assert.ok(built.triangles() < (organic ? 6000 : 1200))
      const digest = createHash('sha256').update(Buffer.from(p.array.buffer)).digest('hex')
      if (previous) assert.equal(digest, previous)
      previous = digest
      for (let i = 0; i < p.count; i++) {
        assert.ok(p.getX(i) >= bed.x - bed.w / 2 - 1e-5 && p.getX(i) <= bed.x + bed.w / 2 + 1e-5)
        assert.ok(p.getZ(i) >= bed.z - bed.d / 2 - 1e-5 && p.getZ(i) <= bed.z + bed.d / 2 + 1e-5)
        assert.ok(p.getY(i) >= 0 && p.getY(i) <= 1.6)
        assert.ok(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > .99)
      }
      let geometryReleased = false, materialReleased = false
      geometry.addEventListener('dispose', () => { geometryReleased = true })
      built.mesh.material.addEventListener('dispose', () => { materialReleased = true })
      built.dispose(); built.dispose()
      assert.equal(root.children.length, 0); assert.ok(geometryReleased && materialReleased)
    }
  }
})

test('north warm panels stay inside existing wall segments, never close the north door', () => {
  const spec = buildOfficeShellV3Spec(layout), north = spec.outer.filter(s => s.side === 'north')
  const panels = officeShellFinishSpec(layout, spec).solid.filter(p => p.kind === 'north-wall-panel')
  assert.equal(panels.length, north.length)
  for (const p of panels) {
    assert.ok(north.some(s => p.x - p.w / 2 >= s.lo && p.x + p.w / 2 <= s.hi && p.z - p.d / 2 >= s.fixed0 && p.z + p.d / 2 <= s.fixed1))
    assert.ok(p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= layout.wallHeight.standard)
  }
})

test('bookcase and meeting details remain inside original furniture with measured shelf clearance', () => {
  const asset = readFileSync(new URL('../assets/models/furniture/bookcaseOpen.glb', import.meta.url))
  assert.equal(createHash('sha256').update(asset).digest('hex'), '750702218d68c062b15dfef6ab06a4014d1cfa8bd05f02e57c53b7e13bec157c', 'source changed: remeasure shelf surfaces')
  const furniture = officeFurnitureV2Spec(layout), details = wholeFloorSpec(layout).details
  const books = details.filter(p => p.kind === 'shelf-book')
  assert.ok(books.length > 40)
  for (const p of books) {
    assert.ok(furniture.shelves.some(s => p.x - p.w / 2 >= s.x - s.w / 2 && p.x + p.w / 2 <= s.x + s.w / 2 && p.z - p.d / 2 >= s.z - s.d / 2 && p.z + p.d / 2 <= s.z + s.d / 2))
    assert.ok([[.2733, .7148], [.7778, 1.2193], [1.2824, 1.7239]].some(([bottom, top]) => p.y - p.h / 2 > bottom && p.y + p.h / 2 < top))
  }
  const tables = [...furniture.meetings, { ...furniture.board, region: 'board' }]
  for (const p of details.filter(p => p.kind.startsWith('meeting-'))) {
    const t = tables.find(t => t.region === p.owner)
    assert.ok(t)
    if (t.round) assert.ok(Math.hypot(Math.abs(p.x - t.x) + p.w / 2, Math.abs(p.z - t.z) + p.d / 2) < .9)
    else assert.ok(Math.abs(p.x - t.x) + p.w / 2 <= t.w / 2 && Math.abs(p.z - t.z) + p.d / 2 <= t.d / 2)
    assert.ok(p.y - p.h / 2 > (t.round ? .8175 : .76))
  }
})
