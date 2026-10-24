import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'

test('actual room crowns reduce overhead coverage, retain original clearance and separate soffit from trim', () => {
  const before = JSON.stringify(layout)
  for (const low of [false, true]) {
    const root = new THREE.Group(), shell = buildOfficeAlignedShell({ THREE, root, layout, low, search: '?officeSample=1' })
    try {
      const frames = root.getObjectByName('office-aligned-frames-and-inlays'), spec = shell.finishSpec.solid
      for (const room of layout.regions) {
        const entries = spec.filter(p => p.owner === room.id && /^(ceiling-|light-recess)/.test(p.kind))
        assert.equal(entries.length, room.walled ? 16 : 0)
        if (!room.walled) continue
        const width = room.x1 - room.x0, depth = room.z1 - room.z0
        const crowns = entries.filter(p => p.kind === 'ceiling-edge')
        const originalCoverage = 2 * width * .42 + 2 * .42 * (depth - .84)
        assert.ok(crowns.reduce((area, p) => area + p.w * p.d, 0) < originalCoverage * .65)
        const measured = entries.map(p => {
          const matrix = new THREE.Matrix4(); frames.getMatrixAt(spec.indexOf(p), matrix)
          const box = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)).applyMatrix4(matrix)
          assert.ok(box.min.x >= room.x0 - 1e-5 && box.max.x <= room.x1 + 1e-5)
          assert.ok(box.min.z >= room.z0 - 1e-5 && box.max.z <= room.z1 + 1e-5)
          assert.ok(box.min.y >= 2.68 && box.max.y <= 2.95)
          const interior = new THREE.Box3(new THREE.Vector3(room.x0 + .42, 0, room.z0 + .42), new THREE.Vector3(room.x1 - .42, 3, room.z1 - .42))
          assert.equal(box.intersectsBox(interior), false, p.kind + ' remains in former perimeter')
          return { p, box }
        })
        for (let i = 0; i < measured.length; i++) for (let j = 0; j < i; j++) {
          assert.equal(measured[i].box.intersectsBox(measured[j].box.clone().expandByScalar(-1e-5)), false, 'distinct finishes do not penetrate')
        }
      }
    } finally { shell.dispose() }
    assert.equal(root.children.length, 0)
  }
  assert.equal(JSON.stringify(layout), before); assert.equal(Object.keys(layout.seats).length, 25)
})
