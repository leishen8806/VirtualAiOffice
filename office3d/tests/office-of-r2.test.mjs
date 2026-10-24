import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficePlaza, plazaFlowerArcs } from '../office-vis2/plaza.js'
import { wholeFloorSpec } from '../office-vis2/whole-floor.js'

const intersects = (a, b) => a.x1 > b.x0 && a.x0 < b.x1 && a.z1 > b.z0 && a.z0 < b.z1

test('OF-R2 both tiers retain all 18 facilities and add 8 trees / 4 arcs clear of plaza circulation', () => {
  const results = []
  for (const low of [false, true]) {
    const root = new THREE.Group(), batch = createSampleBatch(THREE), before = JSON.stringify(LAYOUT_V3)
    const placements = appendOfficePlaza({ THREE, batch, layout: LAYOUT_V3, low }), built = batch.build(root, 'probe')
    try {
      const trees = placements.filter(p => p.kind === 'trees'), arcs = placements.filter(p => p.kind === 'flower-arc'), additions = [...trees, ...arcs]
      assert.equal(trees.length, 8); assert.equal(arcs.length, 4); assert.equal(placements.length - additions.length, 18)
      for (const p of additions) {
        assert.ok(!intersects(p.bounds, { x0: 0, x1: 4, z0: 12, z1: 32.5 }), p.id + ' entrance axis')
        const x = Math.max(p.bounds.x0, Math.min(LAYOUT_V3.plaza.center.x, p.bounds.x1)), z = Math.max(p.bounds.z0, Math.min(LAYOUT_V3.plaza.center.z, p.bounds.z1))
        assert.ok(Math.hypot(x - 2, z - 21) >= LAYOUT_V3.plaza.radius + .28, p.id + ' clears the entire plaza disk and pedestrian padding')
        for (const other of placements) if (p.id !== other.id) assert.ok(!intersects(p.bounds, other.bounds), p.id + ' / ' + other.id)
        for (const b of wholeFloorSpec(LAYOUT_V3).beds) assert.ok(!intersects(p.bounds, { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }), p.id + ' clears existing garden')
      }
      for (const a of arcs) {
        const spec = plazaFlowerArcs(LAYOUT_V3).find(p => p.id === a.id)
        assert.ok(a.bounds.x0 >= spec.bounds.x0 - .001 && a.bounds.x1 <= spec.bounds.x1 + .001)
        assert.ok(a.bounds.z0 >= spec.bounds.z0 - .001 && a.bounds.z1 <= spec.bounds.z1 + .001)
      }
      assert.equal(root.children.length, 1, 'greenery stays in the existing material batch')
      assert.equal(JSON.stringify(LAYOUT_V3), before)
      results.push({ total: built.triangles(), trees: trees.reduce((n,p)=>n+p.triangles,0), arcs: arcs.reduce((n,p)=>n+p.triangles,0) })
    } finally { built.dispose() }
  }
  for (const key of ['total', 'trees', 'arcs']) assert.ok(results[1][key] < results[0][key], key + ' has a real low-tier geometry reduction')
  console.log('OF-R2 geometry', JSON.stringify(results))
})

test('OF-R2 private umbrella correction points the apex upwards in the current shared baseline', () => {
  const batch = createSampleBatch(THREE), root = new THREE.Group()
  appendOfficePlaza({ THREE, batch, layout: LAYOUT_V3 })
  const built = batch.build(root, 'plaza'), mesh = built.mesh
  try {
    mesh.updateMatrixWorld(true)
    const hit = x => new THREE.Raycaster(new THREE.Vector3(x, 5, 15), new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0]?.point.y
    assert.ok(hit(-8) > hit(-7.2) + .12, 'private clone apex is above skirt, not inverted')
  } finally { built.dispose() }
})
