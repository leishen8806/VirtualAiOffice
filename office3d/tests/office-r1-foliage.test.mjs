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
hooks.deregister()
const bytes = readFileSync(new URL('../assets/models/furniture/pottedPlant.glb', import.meta.url))
const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
const A = { furn: { pottedPlant: source } }
const near = (a, b, tolerance = .005, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message} ${a} != ${b}`)

// 一株绿植的冠源（叶片 + 分枝）三角形数：加密层复用同一叶源，所以每层面数相同
const sourceCrown = low => {
  const foliage = createOfficePottedFoliage(THREE, source, low), box = new THREE.Box3()
  let triangles = 0
  foliage.source.updateWorldMatrix(true, true)
  foliage.source.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'plant') return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geometry.computeBoundingBox()
    box.union(geometry.boundingBox); triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
    geometry.dispose()
  })
  foliage.dispose()
  return { triangles, size: box.getSize(new THREE.Vector3()) }
}

const segmentDistance = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}

const routeClearance = (layout, vertices) => {
  let minimum = Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i + 1] > 2.1) continue
    for (const route of layout.r1.routes) for (let j = 1; j < route.points_m.length; j++) {
      minimum = Math.min(minimum, segmentDistance(vertices[i] + 26, 18 - vertices[i + 2], route.points_m[j - 1], route.points_m[j]))
    }
  }
  return minimum
}

// 裁定 D（裁定-绿植外形-R2.md）：不改登记值、不改缩放方式、不缩窄。
test('I6B-2 35 株绿植的盆尺寸、冠包络与总高仍逐值等于登记值（裁定 D 不改缩放方式）', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
    const plants = buildR1Plants({ THREE, root, layout, A, low, collision })
    assert.equal(plants.records.length, 35)
    for (const record of plants.records) {
      const assembly = layout.r1.elements.find(row => row.id === record.id)
      for (const suffix of ['POT', 'CR']) {
        const part = record.parts[suffix], row = layout.r1.elements.find(row => row.id === part.id)
        const size = part.bounds.getSize(new THREE.Vector3()), center = part.bounds.getCenter(new THREE.Vector3())
        near(size.x, row.lengthM, .005, `${part.id} x`)
        near(size.z, row.widthM, .005, `${part.id} z`)
        near(size.y, row.heightM, .005, `${part.id} y`)
        near(part.bounds.min.y, row.zM, .005, `${part.id} base`)
        near(center.x, row.xM - 26, .005, `${part.id} cx`)
        near(center.z, 18 - row.yM, .005, `${part.id} cz`)
      }
      near(record.parts.CR.bounds.max.y, assembly.heightM, .005, `${record.id} 总高`)
    }
    plants.dispose(); assert.equal(collision.stats().bodies, 0)
  }
})

test('I6B-2 冠包络内加密一层叶片：高档两层（内层 72% 并绕竖轴旋转），低档只保留外层', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), layout = createOfficeR1Layout()
    const plants = buildR1Plants({ THREE, root, layout, A, low })
    const crown = sourceCrown(low)
    for (const record of plants.records) {
      const part = record.parts.CR, row = layout.r1.elements.find(row => row.id === part.id)
      const layers = part.layers
      assert.ok(Array.isArray(layers), `${part.id} 冠应逐层记录`)
      assert.equal(layers.length, low ? 1 : 2, `${part.id} 低档只留外层、高档两层`)
      // 外层正好顶到登记冠包络
      near(layers[0].shrink, 1, 1e-9, `${part.id} 外层`)
      near(layers[0].bounds.getSize(new THREE.Vector3()).x, row.lengthM, .005, `${part.id} 外层 x`)
      // 每层复用同一叶源，面数相同：高档整株冠面数 = 源的 2 倍
      for (const layer of layers) assert.equal(layer.triangles, crown.triangles, `${part.id} 每层面数应等于叶源`)
      assert.equal(part.count / 3, crown.triangles * (low ? 1 : 2), `${part.id} 冠面数加密倍数`)
      if (low) continue
      // 内层：缩到 72 %、绕竖轴转过一个角度，整体仍在登记冠包络之内
      const inner = layers[1], size = inner.bounds.getSize(new THREE.Vector3()), center = inner.bounds.getCenter(new THREE.Vector3())
      near(inner.shrink, .72, 1e-9, `${part.id} 内层缩放`)
      assert.ok(Math.abs(inner.yaw) > .1, `${part.id} 内层应绕竖轴旋转，实际 ${inner.yaw}`)
      near(size.x, row.lengthM * .72, .005, `${part.id} 内层 x`)
      near(size.z, row.widthM * .72, .005, `${part.id} 内层 z`)
      near(size.y, row.heightM * .72, .005, `${part.id} 内层 y`)
      near(center.x, row.xM - 26, .005, `${part.id} 内层 cx`)
      near(center.z, 18 - row.yM, .005, `${part.id} 内层 cz`)
      near(center.y, row.zM + row.heightM / 2, .005, `${part.id} 内层应在冠包络内居中`)
    }
    // 所有叶片顶点仍在登记冠包络内（≤ 5 mm）
    for (const record of plants.records) {
      const part = record.parts.CR, row = layout.r1.elements.find(row => row.id === part.id)
      const limit = { x: [row.xM - 26 - row.lengthM / 2, row.xM - 26 + row.lengthM / 2], y: [row.zM, row.zM + row.heightM], z: [18 - row.yM - row.widthM / 2, 18 - row.yM + row.widthM / 2] }
      for (let i = 0; i < part.vertices.length; i += 3) for (const [axis, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
        const v = part.vertices[i + axis]
        assert.ok(v >= limit[k][0] - .005 && v <= limit[k][1] + .005, `${part.id} 顶点 ${k}=${v} 超出登记冠包络 ${limit[k]}`)
      }
    }
    plants.dispose()
  }
})

test('I6B-2 加密不改路线净距：加密层顶点到 17 条路线中心线仍 >= .6 m，且不比外层更近', () => {
  assert.equal(createOfficeR1Layout().r1.routes.length, 17)
  for (const low of [false, true]) {
    const root = new THREE.Group(), layout = createOfficeR1Layout()
    const plants = buildR1Plants({ THREE, root, layout, A, low })
    let all = Infinity, outer = Infinity
    for (const record of plants.records) {
      all = Math.min(all, routeClearance(layout, record.parts.CR.vertices))
      outer = Math.min(outer, routeClearance(layout, record.parts.CR.layers[0].vertices))
    }
    assert.ok(all >= .6, `加密后净距 ${all}`)
    near(all, outer, 1e-9, '加密层不得让净距变差')
    plants.dispose()
  }
})
