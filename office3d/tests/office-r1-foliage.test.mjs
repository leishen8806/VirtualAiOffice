import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Plants } from '../office-vis2/r1-plants.js'
import { createOfficePottedFoliage } from '../office-vis2/plants.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()
const bytes = readFileSync(new URL('../assets/models/furniture/pottedPlant.glb', import.meta.url))
const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
const A = { furn: { pottedPlant: source } }
const near = (a, b, tolerance = .005, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message} ${a} != ${b}`)

// GLB 冠源包围盒的长宽高比：R1 等比缩放之后必须保持这个比例（= 旧版 L2B 绿植的外形）
const sourceCrownAspect = low => {
  const foliage = createOfficePottedFoliage(THREE, source, low), box = new THREE.Box3()
  foliage.source.updateWorldMatrix(true, true)
  foliage.source.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'plant') return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geometry.computeBoundingBox()
    box.union(geometry.boundingBox); geometry.dispose()
  })
  const size = box.getSize(new THREE.Vector3())
  foliage.dispose()
  return { x: size.x / size.y, z: size.z / size.y }
}

const segmentDistance = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}

test('I6B-2 35 株绿植保持登记位置、盆尺寸与总高，冠改等比缩放（不再分轴拉伸）', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
    const plants = buildR1Plants({ THREE, root, layout, A, low, collision })
    const aspect = sourceCrownAspect(low)
    assert.equal(plants.records.length, 35)
    for (const record of plants.records) {
      const assembly = layout.r1.elements.find(row => row.id === record.id)
      const potRow = layout.r1.elements.find(row => row.id === `${record.id}-POT`)
      const crownRow = layout.r1.elements.find(row => row.id === `${record.id}-CR`)
      const pot = record.parts.POT, crown = record.parts.CR
      const potSize = pot.bounds.getSize(new THREE.Vector3()), potCenter = pot.bounds.getCenter(new THREE.Vector3())
      const crownSize = crown.bounds.getSize(new THREE.Vector3()), crownCenter = crown.bounds.getCenter(new THREE.Vector3())
      // 盆：尺寸与位置仍逐值等于登记值
      near(potSize.x, potRow.lengthM, .005, `${record.id} pot x`)
      near(potSize.z, potRow.widthM, .005, `${record.id} pot z`)
      near(potSize.y, potRow.heightM, .005, `${record.id} pot y`)
      near(pot.bounds.min.y, potRow.zM, .005, `${record.id} pot base`)
      // 位置：平面中心仍在登记点上
      near(potCenter.x, potRow.xM - 26, .005, `${record.id} pot cx`)
      near(potCenter.z, 18 - potRow.yM, .005, `${record.id} pot cz`)
      near(crownCenter.x, crownRow.xM - 26, .005, `${record.id} crown cx`)
      near(crownCenter.z, 18 - crownRow.yM, .005, `${record.id} crown cz`)
      // 总高：冠顶 = 总成登记高度
      near(crown.bounds.min.y, crownRow.zM, .005, `${record.id} crown base`)
      near(crown.bounds.max.y, assembly.heightM, .005, `${record.id} 总高`)
      near(crownSize.y, crownRow.heightM, .005, `${record.id} crown height`)
      // 冠：等比缩放 —— 长宽高比等于 GLB 源，且不再被拉成登记的 0.64 方框
      near(crownSize.x / crownSize.y, aspect.x, .0005, `${record.id} crown aspect x`)
      near(crownSize.z / crownSize.y, aspect.z, .0005, `${record.id} crown aspect z`)
      // 等比之后冠缩进登记包络内（登记 0.64），净距只会变好
      assert.ok(crownSize.x <= crownRow.lengthM + 1e-9, `${record.id} crown x ${crownSize.x} > ${crownRow.lengthM}`)
      assert.ok(crownSize.z <= crownRow.widthM + 1e-9, `${record.id} crown z ${crownSize.z} > ${crownRow.widthM}`)
    }
    // 真实顶点：H2 带内每个冠顶点距 17 条路线中心线 >= .6 m
    assert.equal(layout.r1.routes.length, 17)
    let minimum = Infinity
    for (const record of plants.records) {
      const p = record.parts.CR.vertices
      for (let i = 0; i < p.length; i += 3) {
        if (p[i + 1] > 2.1) continue
        for (const route of layout.r1.routes) for (let j = 1; j < route.points_m.length; j++) {
          const d = segmentDistance(p[i] + 26, 18 - p[i + 2], route.points_m[j - 1], route.points_m[j])
          minimum = Math.min(minimum, d)
          assert.ok(d >= .6, `${record.id} ${route.id}: ${d}`)
        }
      }
    }
    assert.ok(minimum >= .6)
    plants.dispose()
    assert.equal(collision.stats().bodies, 0)
  }
})

test('I6B-2 R1 冠外形与旧版 L2B 绿植逐值同比例（沿用旧版绿植外形）', () => {
  const foliage = createOfficePottedFoliage(THREE, source, false)
  const placed = placeFurniture({ furn: { pottedPlant: foliage.source } }, 'pottedPlant', 0, 0, {})
  placed.group.updateWorldMatrix(true, true)
  const legacy = new THREE.Box3()
  placed.group.traverse(mesh => { if (mesh.isMesh && mesh.material?.name === 'plant') { mesh.updateWorldMatrix(true, false); legacy.union(new THREE.Box3().setFromObject(mesh)) } })
  const legacySize = legacy.getSize(new THREE.Vector3())
  foliage.dispose()

  const root = new THREE.Group(), layout = createOfficeR1Layout()
  const plants = buildR1Plants({ THREE, root, layout, A })
  const crown = plants.records[0].parts.CR.bounds.getSize(new THREE.Vector3())
  near(crown.x / crown.y, legacySize.x / legacySize.y, .0005, '冠 x/y 比例应与旧版一致')
  near(crown.z / crown.y, legacySize.z / legacySize.y, .0005, '冠 z/y 比例应与旧版一致')
  plants.dispose()
})
