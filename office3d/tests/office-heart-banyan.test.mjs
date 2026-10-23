import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { buildHeartBanyan } from '../office-heart-banyan.js'

test('heart banyan keeps the calibrated size, genuine depth and 3-call/8k budget', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), tree = buildHeartBanyan({ THREE, root, low })
    const size = new THREE.Box3().setFromObject(tree.root).getSize(new THREE.Vector3())
    assert.ok(size.x >= 3.5 && size.x <= 4.3, `width ${size.x}`)
    assert.ok(size.y >= 3.5 && size.y <= 4.1, `height ${size.y}`)
    assert.ok(size.z >= 2.3 && size.z <= 3.1, `depth ${size.z}`)
    assert.equal(tree.summary().calls, 3); assert.ok(tree.summary().triangles <= 8000)
    assert.equal(tree.summary().face, '+z'); assert.equal(tree.summary().static, true)
    tree.dispose(); tree.dispose(); assert.equal(root.children.length, 0)
  }
})

test('heart banyan has two separated high lobes and a central notch in real geometry', () => {
  const tree = buildHeartBanyan({ THREE, root: new THREE.Group() })
  const mesh = tree.root.getObjectByName('heart-banyan-small-leaf-clusters')
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), peaks = { left: 0, middle: 0, right: 0 }
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
      v.fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(m)
      const key = v.x < -.55 ? 'left' : v.x > .55 ? 'right' : Math.abs(v.x) < .18 ? 'middle' : null
      if (key) peaks[key] = Math.max(peaks[key], v.y)
    }
  }
  assert.ok(Math.min(peaks.left, peaks.right) - peaks.middle > .12, JSON.stringify(peaks))
  tree.dispose()
})

test('fixed-seed leaves repeat exactly, remain instanced and dispose only owned resources', () => {
  const root = new THREE.Group(), shared = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(shared)
  let sharedDisposed = false; shared.geometry.addEventListener('dispose', () => { sharedDisposed = true })
  const a = buildHeartBanyan({ THREE, root }), b = buildHeartBanyan({ THREE, root })
  const leaves = item => item.root.getObjectByName('heart-banyan-small-leaf-clusters')
  assert.equal(leaves(a).isInstancedMesh, true)
  assert.deepEqual(leaves(a).instanceMatrix.array, leaves(b).instanceMatrix.array)
  a.dispose(); b.dispose(); assert.equal(sharedDisposed, false); assert.equal(root.children.length, 1)
  shared.geometry.dispose(); shared.material.dispose()
})
