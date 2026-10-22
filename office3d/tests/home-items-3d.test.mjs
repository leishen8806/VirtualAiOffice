import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from '../vendor/three/three.module.js'
import { CATALOG, ITEM_IDS as CATALOG_IDS } from '../town/home-catalog.mjs'
import { buildItem, createMaterials, disposeItem, ITEM_DEFS, ITEM_IDS, ITEM_STATS } from '../home-items-3d.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(HERE)
const triangles = geometry => geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3

test('12件模型符合目录、包围盒、朝向和单件预算', () => {
  assert.deepEqual(ITEM_IDS, CATALOG_IDS)
  assert.deepEqual(ITEM_DEFS.map(({ id, name, footprint, height }) => ({ id, name, footprint, height })), CATALOG.map(({ id, name, footprint, height }) => ({ id, name, footprint, height })))
  assert.deepEqual(Object.keys(ITEM_STATS), CATALOG_IDS)
  const materials = createMaterials(THREE)
  let totalMeshes = 0
  let totalTriangles = 0
  for (const item of CATALOG) {
    const group = buildItem(THREE, item.id, { materials })
    group.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(group)
    const size = bounds.getSize(new THREE.Vector3())
    assert.ok(bounds.min.y >= -0.001, `${item.id} must start at ground`)
    assert.ok(size.x <= item.footprint.w * 0.5 + 0.03, `${item.id} width ${size.x}`)
    assert.ok(size.z <= item.footprint.d * 0.5 + 0.03, `${item.id} depth ${size.z}`)
    assert.ok(bounds.max.y <= item.height + 0.05, `${item.id} height ${bounds.max.y}`)
    const meshes = []
    group.traverse(object => { if (object.isMesh) meshes.push(object) })
    assert.equal(group.getObjectByProperty('isLight', true), undefined, `${item.id} has no Light`)
    const tris = meshes.reduce((sum, mesh) => sum + triangles(mesh.geometry), 0)
    const materialCount = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])).size
    assert.deepEqual({ meshes: meshes.length, triangles: tris, materials: materialCount }, ITEM_STATS[item.id], item.id)
    assert.ok(meshes.length <= 8, `${item.id} mesh budget`)
    assert.ok(tris <= 1500, `${item.id} triangle budget`)
    totalMeshes += meshes.length
    totalTriangles += tris

    for (const degrees of [90, 270]) {
      group.rotation.y = THREE.MathUtils.degToRad(degrees)
      group.updateMatrixWorld(true)
      const rotated = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())
      assert.ok(rotated.x <= item.footprint.d * 0.5 + 0.03, `${item.id} ${degrees}° width`)
      assert.ok(rotated.z <= item.footprint.w * 0.5 + 0.03, `${item.id} ${degrees}° depth`)
    }
    disposeItem(group)
  }
  assert.ok(totalMeshes <= 60, `total meshes ${totalMeshes}`)
  assert.ok(totalTriangles <= 12000, `total triangles ${totalTriangles}`)
})

test('模型目录没有缺项、多余项或新增灯光', () => {
  assert.equal(new Set(ITEM_IDS).size, 12)
  assert.deepEqual([...ITEM_IDS].sort(), CATALOG.map(item => item.id).sort())
  assert.ok(CATALOG.every(item => ITEM_STATS[item.id]))
})

test('disposeItem释放自有几何与实际使用的材质', () => {
  const group = buildItem(THREE, 'bed_single')
  let geometries = 0
  let materials = 0
  group.traverse(object => {
    if (!object.isMesh) return
    object.geometry.dispose = () => { geometries++ }
    object.material.dispose = () => { materials++ }
  })
  disposeItem(group)
  assert.equal(geometries, ITEM_STATS.bed_single.meshes)
  assert.equal(materials, ITEM_STATS.bed_single.materials)
})

test('A7保持独立、静态安全且不引用app.js', () => {
  const source = fs.readFileSync(path.join(ROOT, 'home-items-3d.js'), 'utf8')
  assert.doesNotMatch(source, /fetch|Math\.random|innerHTML|eval\s*\(|new Function/i)
  assert.doesNotMatch(source, /\b(?:buy|purchase|price|balance|wallet)\b/i)
  assert.doesNotMatch(source, /app\.js/)
})
