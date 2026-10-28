import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Shell } from '../office-vis2/r1-shell.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { buildR1Island } from '../office-vis2/r1-island.js'
import { buildR1Plants } from '../office-vis2/r1-plants.js'
import { buildR1Decor, R1_DECOR, r1DoorSweepMargin } from '../office-vis2/r1-decor.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { officeV3Modules, officeV3ModulesFor } from '../office-v3-modules.js'
import { LAYOUT_V3, resolveOfficeLayout } from '../office-layout.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

const MODELS = ['coatRack', 'trashcan', 'speaker', 'lampSquareFloor', 'sideTable', 'rugRectangle',
  'desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded', 'pottedPlant']
const loader = new GLTFLoader(), furn = {}
for (const name of MODELS) {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  furn[name] = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const A = { furn }

const stubContext = () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {} })
const withCanvas = callback => {
  const old = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext() }) }
  try { return callback() } finally { globalThis.document = old }
}
const makeScreenTexture = () => ({ ctx: { canvas: { width: 256, height: 144 }, drawImage() {} }, tex: { needsUpdate: false, dispose() {} } })

// 点到线段距离（R1 米坐标）
const segmentDistance = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}
const routeDistance = (layout, worldX, worldZ) => {
  let minimum = Infinity
  const x = worldX + 26, y = 18 - worldZ
  for (const route of layout.r1.routes) for (let i = 1; i < route.points_m.length; i++) minimum = Math.min(minimum, segmentDistance(x, y, route.points_m[i - 1], route.points_m[i]))
  return minimum
}
const r1Scene = () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const shell = buildR1Shell({ THREE, root, layout, collision })
  const furniture = buildR1Furniture({ THREE, root, layout, collision, A, placeFurniture, makeScreenTexture })
  const island = buildR1Island({ THREE, root, layout, collision })
  const plants = buildR1Plants({ THREE, root, layout, A, collision })
  root.updateMatrixWorld(true)
  return { layout, root, collision, dispose() { plants.dispose(); island.dispose(); furniture.dispose(); shell.dispose() } }
}

test('I6B-1 R1 小物件按卡面清单落位：每区件数与模型固定', () => {
  assert.equal(R1_DECOR.length, 13)
  const byModel = {}
  for (const row of R1_DECOR) byModel[row.model] = (byModel[row.model] || 0) + 1
  assert.deepEqual(byModel, { coatRack: 1, trashcan: 7, speaker: 1, lampSquareFloor: 2, sideTable: 1, rugRectangle: 1 })
  // 衣帽架在门口（区 11）、音箱在会议区（区 02）、垃圾桶一区一只
  assert.deepEqual(R1_DECOR.filter(r => r.model === 'coatRack').map(r => r.regionId), ['11'])
  assert.deepEqual(R1_DECOR.filter(r => r.model === 'speaker').map(r => r.regionId), ['02'])
  assert.deepEqual(R1_DECOR.filter(r => r.model === 'trashcan').map(r => r.regionId).sort(), ['01', '04', '05', '06', '08', '09', '13'])
  assert.deepEqual(R1_DECOR.filter(r => r.model === 'lampSquareFloor').map(r => r.regionId).sort(), ['10', '12'])
  assert.deepEqual(R1_DECOR.filter(r => ['sideTable', 'rugRectangle'].includes(r.model)).map(r => r.regionId), ['12', '12'])
  assert.equal(new Set(R1_DECOR.map(r => r.id)).size, 13)
})

test('I6B-1 每件小物件落地、在本区框内、不进 17 条路线 H2 通道、不进门扇扫掠盘', () => withCanvas(() => {
  const { layout, collision, dispose } = r1Scene()
  const root = new THREE.Group()
  const decor = buildR1Decor({ THREE, root, layout, A, placeFurniture, collision })
  root.updateMatrixWorld(true)
  assert.equal(decor.items.length, 13)
  const vertex = new THREE.Vector3()
  for (const item of decor.items) {
    const zone = layout.regions.find(region => region.id === item.regionId)
    // 底面贴地 <= 5 mm
    assert.ok(Math.abs(item.bounds.min.y) <= .005, `${item.id} baseY ${item.bounds.min.y}`)
    // 在本区框内，也在建筑外轮廓内
    assert.ok(item.bounds.min.x >= zone.x0 - 1e-6 && item.bounds.max.x <= zone.x1 + 1e-6, `${item.id} x ${item.bounds.min.x}..${item.bounds.max.x} vs ${zone.x0}..${zone.x1}`)
    assert.ok(item.bounds.min.z >= zone.z0 - 1e-6 && item.bounds.max.z <= zone.z1 + 1e-6, `${item.id} z ${item.bounds.min.z}..${item.bounds.max.z} vs ${zone.z0}..${zone.z1}`)
    assert.ok(item.bounds.min.x >= layout.envelope.x0 && item.bounds.max.x <= layout.envelope.x1, `${item.id} envelope x`)
    assert.ok(item.bounds.min.z >= layout.envelope.z0 && item.bounds.max.z <= layout.envelope.z1, `${item.id} envelope z`)
    // 真实几何顶点：H2 带（<= 2.1 m）内每个顶点距路线中心线 >= .6 m，且不在门扇扫掠盘里
    let checked = 0
    for (const mesh of item.meshes) {
      mesh.updateWorldMatrix(true, false)
      const position = mesh.geometry.attributes.position
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        if (vertex.y > 2.1) continue
        checked++
        assert.ok(routeDistance(layout, vertex.x, vertex.z) >= .6, `${item.id} route ${routeDistance(layout, vertex.x, vertex.z)}`)
        assert.ok(r1DoorSweepMargin(layout, vertex.x, vertex.z) >= 0, `${item.id} door sweep ${r1DoorSweepMargin(layout, vertex.x, vertex.z)}`)
      }
    }
    assert.ok(checked > 0, `${item.id} 没有参与净距检查的顶点`)
  }
  decor.dispose(); dispose()
}))

test('I6B-1 落地小物件用普通 Mesh 代理注入真实碰撞并挡住；地毯是地面饰面不挡人', () => withCanvas(() => {
  const { layout, collision, dispose } = r1Scene()
  const before = collision.stats().bodies
  const root = new THREE.Group()
  const decor = buildR1Decor({ THREE, root, layout, A, placeFurniture, collision })
  root.updateMatrixWorld(true)
  assert.equal(decor.proxies.length, 12) // 13 件减去地毯
  assert.ok(decor.proxies.every(mesh => mesh.isMesh && !mesh.isInstancedMesh), '碰撞代理必须是普通 Mesh')
  assert.equal(collision.stats().bodies, before + 12)
  for (const item of decor.items) {
    const hit = collision.hit(item.position.x, item.position.z)
    if (item.model === 'rugRectangle') assert.equal(hit, null, `${item.id} 地毯不应挡住行人`)
    else assert.ok(hit, `${item.id} 应被碰撞挡住`)
  }
  decor.dispose()
  assert.equal(collision.stats().bodies, before)
  dispose()
}))

test('I6B-5 小物件按材质合批：两档各不超过 +4 draw call 与 +30,000 三角', () => withCanvas(() => {
  for (const low of [false, true]) {
    const layout = createOfficeR1Layout(), root = new THREE.Group()
    const decor = buildR1Decor({ THREE, root, layout, A, placeFurniture, low })
    root.updateMatrixWorld(true)
    let calls = 0, triangles = 0
    decor.root.traverse(mesh => {
      if (!mesh.isMesh) return
      calls++
      const geometry = mesh.geometry
      triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1)
    })
    assert.ok(calls <= 4, `low=${low} draw calls ${calls}`)
    assert.ok(triangles <= 30000, `low=${low} triangles ${triangles}`)
    assert.equal(decor.summary().calls, calls)
    decor.dispose()
    assert.equal(root.children.length, 0)
  }
}))

test('I6B-4 隔离：非 R1 入口拿不到小物件模块，V3 模块表逐值不变', () => {
  assert.deepEqual(officeV3Modules.map(([name]) => name), ['shell3', 'furniture3', 'island', 'zones', 'plaza', 'displayDepartments', 'displayStaff'])
  assert.deepEqual(officeV3ModulesFor(LAYOUT_V3).map(([name]) => name), officeV3Modules.map(([name]) => name))
  const r1 = resolveOfficeLayout('?place=drlife-office&layout=3&align=1&officeSample=1&r1=1')
  assert.equal(r1.r1Phase, 'R1')
  assert.deepEqual(officeV3ModulesFor(r1).map(([name]) => name), ['shell3', 'furniture3', 'r1Island', 'r1Plants', 'r1Decor'])
  // 非 R1 布局调用构造器时必须是空实现，不往场景里加东西
  const root = new THREE.Group()
  const empty = buildR1Decor({ THREE, root, layout: LAYOUT_V3, A, placeFurniture })
  assert.equal(root.children.length, 0)
  assert.deepEqual(empty.items, [])
  empty.dispose()
})
