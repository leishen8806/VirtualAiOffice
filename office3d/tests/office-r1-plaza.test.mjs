import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B } from '../office-layout.js'
import { officeV3Modules, officeV3ModulesFor } from '../office-v3-modules.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Plaza } from '../office-vis2/r1-plaza.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (±${tolerance})`)
const REGISTERED = { 植物总成: 10, 植物冠幅: 10, '树池/花盆': 10, 树干占位: 10, 连续花境: 6, 餐车: 1, 摊亭: 3, 遮阳伞: 2, 伞面: 2, 伞柱: 2, 室外长椅: 4 }
const PROXY_CATEGORIES = ['餐车', '摊亭', '室外长椅', '连续花境', '树池/花盆', '伞柱']
const region14 = (layout, category) => layout.r1.elements.filter(item => item.regionId === '14' && item.category === category)
// 登记件是局部 length × width；旋转后的轴对齐包围盒按 |cos| / |sin| 混合，而不是断言角度相等。
const envelope = (item, yaw) => ({ x: Math.abs(Math.cos(yaw)) * item.lengthM + Math.abs(Math.sin(yaw)) * item.widthM, z: Math.abs(Math.sin(yaw)) * item.lengthM + Math.abs(Math.cos(yaw)) * item.widthM })
const pointOnRoute = (route, t) => {
  const spans = route.points_m.slice(1).map((point, index) => Math.hypot(point[0] - route.points_m[index][0], point[1] - route.points_m[index][1]))
  const total = spans.reduce((sum, value) => sum + value, 0)
  let travelled = t * total
  for (const [index, span] of spans.entries()) {
    if (travelled > span && index < spans.length - 1) { travelled -= span; continue }
    const a = route.points_m[index], b = route.points_m[index + 1], k = span ? Math.min(1, travelled / span) : 0
    return { x: a[0] + (b[0] - a[0]) * k - 26, z: 18 - (a[1] + (b[1] - a[1]) * k) }
  }
  return { x: route.points_m[0][0] - 26, z: 18 - route.points_m[0][1] }
}
const segmentDistance = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}

test('I6-1 the plaza ring reuses the registered centre and radii and stays within 5 mm of the R1 ground', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group()
  assert.deepEqual(layout.r1.data.plaza, { center_m: [28, -10], inner_radius_m: 5.5, level_difference_to_interior_mm: null, outer_radius_m: 8.1 })
  const plaza = buildR1Plaza({ THREE, root, layout })
  near(plaza.paving.center.x, 2); near(plaza.paving.center.z, 28)
  near(plaza.paving.innerRadius, 5.5); near(plaza.paving.outerRadius, 8.1)
  // 高差未知：数据里 level_difference_to_interior_mm 为 null，模块不得编造台阶或坡道。
  assert.equal(plaza.paving.levelDifferenceMm, null)
  assert.ok(plaza.paving.bounds.min.y >= 0, `${plaza.paving.bounds.min.y}`)
  assert.ok(plaza.paving.bounds.max.y <= .005, `${plaza.paving.bounds.max.y}`)
  const size = plaza.paving.bounds.getSize(new THREE.Vector3())
  near(size.x, 16.2, .02); near(size.z, 16.2, .02)
  root.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0)
  const paved = (x, z) => { ray.set(new THREE.Vector3(x, 10, z), down); return ray.intersectObject(plaza.mesh, true).length > 0 }
  for (const [dx, dz] of [[6.8, 0], [-6.8, 0], [0, 6.8], [0, -6.8]]) assert.equal(paved(2 + dx, 28 + dz), true, `${dx},${dz}`)
  for (const [dx, dz] of [[5, 0], [0, -5], [8.5, 0], [0, 8.5]]) assert.equal(paved(2 + dx, 28 + dz), false, `${dx},${dz}`)
  plaza.dispose()
})

test('I6-2 all 60 registered plaza IDs land on their registered position, envelope and base height', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group()
  const plaza = buildR1Plaza({ THREE, root, layout })
  assert.equal(plaza.records.length, 60)
  assert.equal(new Set(plaza.records.map(record => record.id)).size, 60)
  const counts = {}
  for (const record of plaza.records) counts[record.category] = (counts[record.category] || 0) + 1
  assert.deepEqual(counts, REGISTERED)
  for (const record of plaza.records) {
    const item = layout.r1.elements.find(value => value.id === record.id)
    assert.ok(item, record.id)
    const size = record.bounds.getSize(new THREE.Vector3()), center = record.bounds.getCenter(new THREE.Vector3()), expected = envelope(item, record.yaw)
    near(center.x, item.xM - 26, .005); near(center.z, 18 - item.yM, .005)
    near(size.x, expected.x, .005); near(size.z, expected.z, .005)
    near(size.y, item.heightM, .005); near(record.bounds.min.y, item.zM, .005)
    assert.ok(record.count > 0, `${record.id} has no baked triangles`)
  }
  // 合并成一个网格后仍可按 ID 寻址：顶点区间与 itemIds 同时留在真实页面的网格上。
  assert.deepEqual([...plaza.mesh.userData.itemIds].sort(), plaza.records.map(record => record.id).sort())
  const vertexCount = plaza.mesh.geometry.attributes.position.count
  for (const record of plaza.records) assert.ok(record.startVertex + record.count <= vertexCount, record.id)
  plaza.dispose()
})

test('I6-3 every crown and parasol vertex at or below 2.1 m keeps 0.6 m from all 17 route centre lines', () => {
  for (const low of [false, true]) {
    const layout = createOfficeR1Layout(), root = new THREE.Group()
    const plaza = buildR1Plaza({ THREE, root, layout, low })
    assert.equal(layout.r1.routes.length, 17)
    const canopies = plaza.records.filter(record => record.category === '植物冠幅' || record.category === '伞面')
    assert.equal(canopies.length, 12)
    let low21 = 0, minimum = Infinity
    for (const record of canopies) {
      assert.ok(record.vertices.length > 0, record.id)
      for (let i = 0; i < record.vertices.length; i += 3) {
        if (record.vertices[i + 1] > 2.1) continue
        low21++
        for (const route of layout.r1.routes) for (let j = 1; j < route.points_m.length; j++) {
          const d = segmentDistance(record.vertices[i] + 26, 18 - record.vertices[i + 2], route.points_m[j - 1], route.points_m[j])
          minimum = Math.min(minimum, d)
          assert.ok(d >= .6, `${record.id} ${route.id}: ${d}`)
        }
      }
      // 顶点取自 Float32 属性，单位是米：1e-5 的容差只吸收单精度舍入，远小于 2.1 m 的净高判据。
      assert.ok(record.bounds.min.y >= (record.category === '伞面' ? 2.3 : 2.2) - 1e-5, `${record.id} ${record.bounds.min.y}`)
    }
    assert.equal(low21, 0)
    assert.ok(minimum === Infinity || minimum >= .6)
    plaza.dispose()
  }
})

test('I6-4 plain-mesh proxies block every registered plaza body in the real collision engine while route Z14 stays clear', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const plaza = buildR1Plaza({ THREE, root, layout, collision })
  // 26 个登记实体 + 餐车与 3 座摊亭各一层腰部挡板（它们比 1.48 m 的直立胶囊高）。
  assert.equal(plaza.proxies.length, 30)
  assert.ok(plaza.proxies.every(mesh => mesh.isMesh && !mesh.isInstancedMesh))
  assert.equal(collision.stats().bodies, 30)
  assert.equal(new Set(plaza.proxies.map(mesh => mesh.userData.r1Id)).size, 26)
  for (const category of PROXY_CATEGORIES) {
    const items = region14(layout, category)
    assert.ok(items.length > 0, category)
    for (const item of items) assert.ok(collision.hit(item.xM - 26, 18 - item.yM), item.id)
  }
  const z14 = layout.r1.routes.find(route => route.id === 'Z14')
  assert.deepEqual(z14.points_m, [[28, -1], [28, -4], [28, -10]])
  for (let i = 0; i <= 60; i++) {
    const point = pointOnRoute(z14, i / 60)
    assert.equal(collision.hit(point.x, point.z), null, `Z14 ${point.x},${point.z}`)
  }
  plaza.dispose()
  assert.equal(collision.stats().bodies, 0)
  assert.equal(root.children.length, 0)
})

test('I6-6 the plaza slot is appended last for R1 only and builds nothing for any other layout', () => {
  assert.deepEqual(officeV3Modules.map(([name]) => name), ['shell3', 'furniture3', 'island', 'zones', 'plaza', 'displayDepartments', 'displayStaff'])
  assert.deepEqual(officeV3ModulesFor(LAYOUT_V3_ALIGN_L2B).map(([name]) => name), officeV3Modules.map(([name]) => name))
  assert.deepEqual(officeV3ModulesFor(LAYOUT_V3_ALIGN).map(([name]) => name), officeV3Modules.map(([name]) => name))
  assert.deepEqual(officeV3ModulesFor(createOfficeR1Layout()).map(([name]) => name), ['shell3', 'furniture3', 'r1Island', 'r1Plants', 'r1Doors', 'r1Lounge', 'r1Plaza'])
  for (const layout of [LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN, undefined]) {
    const root = new THREE.Group(), collision = createFurnitureCollision()
    const plaza = buildR1Plaza({ THREE, root, layout, collision })
    assert.equal(root.children.length, 0)
    assert.equal(collision.stats().bodies, 0)
    assert.equal(plaza.records, undefined)
    plaza.dispose()
  }
})

const r1Assets = () => ({ furn: Object.fromEntries(['desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded'].map(name => [name, name])) })
const r1PlaceFurniture = (_A, name, x, z, { y = 0, rotY = 0 } = {}) => {
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  mesh.position.y = .5; group.add(mesh); group.position.set(x, y, z); group.rotation.y = rotY
  return { group, size: new THREE.Vector3(1, 1, 1), name }
}

test('I6-2 I3 stops drawing outdoor bench blocks and keeps the region 14 round tables and chairs untouched', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const furniture = buildR1Furniture({ THREE, root, layout, collision, A: r1Assets(), placeFurniture: r1PlaceFurniture, makeScreenTexture: () => ({ ctx: {}, tex: { dispose() {} } }) })
  assert.equal(Object.keys(furniture.instanceIds).includes('r1-室外长椅'), false)
  assert.equal([...furniture.itemCategories.values()].includes('室外长椅'), false)
  for (const item of region14(layout, '室外长椅')) assert.equal(furniture.itemBounds.has(item.id), false, item.id)
  assert.deepEqual(furniture.instanceIds['r1-圆桌'].filter(id => id.startsWith('14-')), region14(layout, '圆桌').map(item => item.id))
  assert.deepEqual(furniture.instanceIds['r1-椅子'].filter(id => id.startsWith('14-')), region14(layout, '椅子').map(item => item.id))
  for (const item of region14(layout, '圆桌')) assert.ok(furniture.itemBounds.get(item.id)?.isBox3, item.id)
  furniture.dispose()
})

test('I6-8 the plaza slot stays inside one merged draw call and its own triangle budget on both tiers', () => {
  const layout = createOfficeR1Layout()
  for (const low of [false, true]) {
    const root = new THREE.Group()
    const plaza = buildR1Plaza({ THREE, root, layout, low })
    const meshes = []
    root.traverse(object => { if (object.isMesh) meshes.push(object) })
    assert.ok(meshes.length <= 4, `${low ? 'low' : 'high'} draw calls ${meshes.length}`)
    assert.ok(plaza.triangles() <= 25000, `${low ? 'low' : 'high'} triangles ${plaza.triangles()}`)
    assert.ok(plaza.triangles() > 0)
    plaza.dispose()
  }
})
