import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout, buildR1Site } from '../office-vis2/r1-site.js'
import { buildR1Island } from '../office-vis2/r1-island.js'
import { buildR1Plants } from '../office-vis2/r1-plants.js'
import { buildHeartBanyan } from '../office-heart-banyan.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
hooks.deregister()
const bytes = readFileSync(new URL('../assets/models/furniture/pottedPlant.glb', import.meta.url))
const A = { furn: { pottedPlant: (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene } }
const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)
const expanded = mesh => {
  mesh.updateWorldMatrix(true, false)
  const points = [], matrix = new THREE.Matrix4(), vertex = new THREE.Vector3()
  for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld) } else matrix.copy(mesh.matrixWorld)
    for (let j = 0; j < mesh.geometry.attributes.position.count; j++) points.push(vertex.fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(matrix).clone())
  }
  return points
}

test('I4 rectangular green band lies outside the site, leaving all building corners and 25 desks bare', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), site = buildR1Site({ THREE, root, layout })
  root.updateMatrixWorld(true)
  const mesh = root.getObjectByName('r1-site-green-buffer'), ray = new THREE.Raycaster()
  const green = (x, z) => { ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(mesh).length > 0 }
  for (const x of [-26, 30]) for (const z of [-25, 18]) assert.equal(green(x, z), false)
  for (const seat of Object.values(layout.seats)) assert.equal(green(seat[1], seat[2]), false)
  for (const [x, z] of [[-39, 0], [43, 0], [0, -32], [0, 45]]) assert.equal(green(x, z), true)
  site.dispose()
})

test('I4 island matches physical envelopes, source arc bounds and both entry widths in the real collision engine', () => {
  for (const candidateC01 of [false, true]) {
    const layout = createOfficeR1Layout({ candidateC01 }), root = new THREE.Group(), collision = createFurnitureCollision()
    const island = buildR1Island({ THREE, root, layout, collision })
    near(island.opening, candidateC01 ? 1.5 : 1.2)
    assert.equal(island.items.length, 21); assert.equal(island.proxies.length, 22)
    assert.ok(island.proxies.every(mesh => mesh.isMesh && !mesh.isInstancedMesh))
    assert.ok(collision.hit(2 + 3.25, -4.1)); assert.ok(collision.hit(2, -4.1))
    for (const z of [-8, -7.4, -7.05, -6.9]) assert.equal(collision.hit(2, z), null, `entry ${z}`)
    for (const [x, z] of [[2 + 5.2, -4.1], [2 - 5.2, -4.1]]) assert.equal(collision.hit(x, z), null)
    const barProxy = island.proxies[0], vertices = expanded(barProxy)
    for (const side of [-1, 1]) {
      const cut = vertices.filter(p => Math.abs(p.x - 2 - side * island.opening / 2) < .00001 && p.z < -6.8)
      assert.ok(cut.length >= 4, 'parallel cut ends retain the exact clear width')
    }
    for (const item of island.items.filter(row => row.id.startsWith('07-CH'))) {
      const row = layout.r1.elements.find(row => row.id === item.id)
      near(item.position.x, row.xM - 26); near(item.position.z, 18 - row.yM)
      near(item.bounds.getSize(new THREE.Vector3()).x, .46)
      assert.ok(-Math.sin(item.yaw) * (2 - item.position.x) - Math.cos(item.yaw) * (-4.1 - item.position.z) > 0)
      // 4.55 is the 900 mm usage envelope's radial edge, not the 460 mm stool's physical edge.
      near(Math.hypot(item.position.x - 2, item.position.z + 4.1) + .45, 4.55)
      assert.ok(collision.hit(item.position.x, item.position.z), item.id)
    }
    for (const item of island.items.filter(row => row.id.startsWith('07-SF'))) {
      const row = layout.r1.elements.find(row => row.id === item.id), center = item.bounds.getCenter(new THREE.Vector3()), size = item.bounds.getSize(new THREE.Vector3())
      near(center.x, row.xM - 26, .005); near(center.z, 18 - row.yM, .005)
      near(size.x, row.lengthM, .005); near(size.z, row.widthM, .005)
    }
    island.dispose(); assert.equal(collision.stats().bodies, 0)
  }
})

test('I4 fitted banyan real leaves meet both crown diameters and head height while default hashes stay frozen', () => {
  for (const low of [false, true]) {
    const original = buildHeartBanyan({ THREE, root: new THREE.Group(), low }), hash = createHash('sha256')
    original.root.traverse(mesh => {
      if (!mesh.isMesh) return
      hash.update(mesh.name)
      for (const a of Object.values(mesh.geometry.attributes)) hash.update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength))
      if (mesh.geometry.index) hash.update(new Uint8Array(mesh.geometry.index.array.buffer))
      if (mesh.instanceMatrix) hash.update(new Uint8Array(mesh.instanceMatrix.array.buffer))
      if (mesh.instanceColor) hash.update(new Uint8Array(mesh.instanceColor.array.buffer))
    })
    assert.equal(hash.digest('hex'), low ? 'b9874386e0f007647ee4144ceff4e7afa82f207aa4a644d1ff5bb9331b77127e' : '18e456ad6b7bda147e34533136472c5f792b507c46353a66c07c10fc12ab4040')
    original.dispose()
    const island = buildR1Island({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout(), low })
    const leaf = island.tree.root.getObjectByName('heart-banyan-small-leaf-clusters'), box = new THREE.Box3().setFromPoints(expanded(leaf)), size = box.getSize(new THREE.Vector3())
    near(size.x, 4.2); near(size.z, 4.2); assert.ok(box.min.y >= 2.2 - 1e-12); near(box.max.y, 3.6)
    const pool = new THREE.Box3().setFromPoints(expanded(island.tree.root.getObjectByName('heart-banyan-pool')))
    near(pool.min.y, 0); near(pool.max.y, .45); near(pool.getSize(new THREE.Vector3()).x, 2.4)
    const wood = island.tree.root.getObjectByName('heart-banyan-trunk-and-branches'), trunk = new THREE.Box3().setFromPoints(expanded(wood).slice(0, wood.userData.trunkVertices.count))
    near(trunk.min.y, .45); near(trunk.max.y, 2.65); near(trunk.getSize(new THREE.Vector3()).x, .34); near(trunk.getSize(new THREE.Vector3()).z, .34)
    island.dispose()
  }
})

test('I4 35 real GLB plants preserve every registered layer and every low crown vertex clears all 17 routes', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
    const plants = buildR1Plants({ THREE, root, layout, A, low, collision })
    assert.equal(plants.records.length, 35); assert.equal(new Set(plants.records.map(row => row.id)).size, 35)
    assert.equal(layout.r1.routes.length, 17)
    const distance = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy) / (dx*dx+dy*dy || 1))); return Math.hypot(x-a[0]-t*dx, y-a[1]-t*dy) }
    let minimum = Infinity
    for (const record of plants.records) {
      assert.ok(collision.hit(record.position.x, record.position.z), record.id)
      for (const suffix of ['POT', 'CR']) {
        const part = record.parts[suffix], row = layout.r1.elements.find(row => row.id === part.id), size = part.bounds.getSize(new THREE.Vector3()), center = part.bounds.getCenter(new THREE.Vector3())
        near(size.x, row.lengthM); near(size.z, row.widthM); near(size.y, row.heightM); near(part.bounds.min.y, row.zM)
        near(center.x, row.xM - 26); near(center.z, 18 - row.yM)
      }
      const p = record.parts.CR.vertices
      for (let i = 0; i < p.length; i += 3) if (p[i+1] <= 2.1) for (const route of layout.r1.routes) for (let j = 1; j < route.points_m.length; j++) {
        const d = distance(p[i]+26, 18-p[i+2], route.points_m[j-1], route.points_m[j]); minimum = Math.min(minimum, d)
        assert.ok(d >= .6, `${record.id} ${route.id}: ${d}`)
      }
    }
    assert.ok(minimum >= .6)
    plants.dispose(); assert.equal(collision.stats().bodies, 0)
  }
})
