import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN_SAMPLE, resolveOfficeLayout } from '../office-layout.js'
import { buildOfficeBackdropTrees, officeBackdropCanopy } from '../office-vis2/plants.js'

function fixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(), geometry = new THREE.IcosahedronGeometry(1, 1)
  scene.add(root)
  const trees = Array.from({length: 54}, (_, i) => {
    const id = i < 14 ? `north-garden-${String(i + 1).padStart(2, '0')}` : i < 26 ? `north-row-${String(i - 13).padStart(2, '0')}` : i < 38 ? `south-row-${String(i - 25).padStart(2, '0')}` : i < 46 ? `west-row-${String(i - 37).padStart(2, '0')}` : `east-row-${String(i - 45).padStart(2, '0')}`
    const group = new THREE.Group(); group.position.set(i, 0, -20 - i); group.name = id; group.userData.officeBackdropTreeId = id; scene.add(group); return group
  })
  scene.userData.officeBackdropTreeGroups = trees
  const sources = [0x4f8a3c, 0x5d9a44, 0x3f7a39, 0x6aa04f].map((color, m) => {
    const list = [
      {m, x:m*4, y:3, z:-20, r:1.5, ph:.1, treeId:'north-garden-01'},
      {m, x:m*4, y:3, z:-38, r:2, ph:.2, treeId:'north-row-01'},
    ]
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({color}), list.length)
    mesh.userData = {dynamic:true, list}
    list.forEach((c, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(c.r, c.r, c.r).setPosition(c.x, c.y, c.z)))
    scene.add(mesh); return mesh
  })
  return {scene, root, trees, sources, dispose(){sources.forEach(x=>{x.material.dispose();x.dispose()});geometry.dispose()}}
}

test('B3 moves only the 14 tagged north-garden trees and their real crown instances in L2B', () => {
  const f = fixture(), value = buildOfficeBackdropTrees({...f, THREE, layout:LAYOUT_V3_ALIGN_L2B}), matrix = new THREE.Matrix4()
  try {
    assert.equal(value.summary().enabled, true)
    for (const [i, tree] of f.trees.entries()) {
      assert.equal(tree.position.z, -20 - i - (i < 14 ? 2.1 : 0), tree.name)
      assert.equal(tree.parent === (i < 14 ? f.root : f.scene), true, tree.name)
    }
    const owned = value.root.children[0]
    const geometry = officeBackdropCanopy(THREE, false, true), vertex = new THREE.Vector3(), rooms = LAYOUT_V3_ALIGN_L2B.regions
    try {
      for (let color = 0; color < 4; color++) {
        owned.getMatrixAt(color * 2, matrix)
        for (let i = 0; i < geometry.attributes.position.count; i++) {
          vertex.fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(matrix)
          assert.ok(!rooms.some(r => vertex.x >= r.x0 && vertex.x <= r.x1 && vertex.z >= r.z0 && vertex.z <= r.z1), `rendered crown vertex ${color}:${i} stays outside room rectangles`)
        }
      }
    } finally { geometry.dispose() }
    for (let color = 0; color < 4; color++) {
      owned.getMatrixAt(color * 2, matrix); assert.ok(Math.abs(matrix.elements[14] + 22.1) < 1e-5)
      owned.getMatrixAt(color * 2 + 1, matrix); assert.ok(Math.abs(matrix.elements[14] + 38) < 1e-5)
      assert.equal(f.sources[color].userData.list[0].z, -20, 'shared source census remains unchanged')
    }
    value.dispose()
    assert.ok(f.trees.every(x => x.parent === f.scene))
    assert.ok(f.trees.every((x, i) => x.position.z === -20 - i), 'dispose restores all original transforms')
  } finally { value.dispose(); f.dispose() }
})

test('B3 leaves shared canopy matrices and trunks byte-for-byte positioned in L1/L2', () => {
  for (const layout of [{...LAYOUT_V3_ALIGN_SAMPLE,plan1Phase:'L1'},LAYOUT_V3_ALIGN_SAMPLE]) {
    const f = fixture(), before = f.sources.map(x => Array.from(x.instanceMatrix.array)), value = buildOfficeBackdropTrees({...f, THREE, layout})
    try {
      assert.equal(value.summary().enabled, true)
      assert.ok(f.trees.every((x, i) => x.parent === f.scene && x.position.z === -20 - i))
      value.dispose()
      for (const [i, source] of f.sources.entries()) assert.deepEqual(Array.from(source.instanceMatrix.array), before[i])
    } finally { value.dispose(); f.dispose() }
  }
})

test('default exact sample query enters L2B while explicit L2 and non-sample parsing remain frozen', () => {
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1'), LAYOUT_V3_ALIGN_L2B)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=0'), LAYOUT_V3_ALIGN_SAMPLE)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=1'), LAYOUT_V3_ALIGN_L2B)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=1&l2b=1'), LAYOUT_V3_ALIGN_SAMPLE)
  assert.equal(resolveOfficeLayout('?layout=3&align=1'), LAYOUT_V3_ALIGN)
})
