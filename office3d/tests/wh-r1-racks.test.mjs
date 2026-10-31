import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { buildWhR1Racks } from '../dr-wh-r1-racks.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { whToWorld, WH_R1_FLOOR_Y } from '../wh-r1-layout.js'
import { WH_R1_WALLS } from '../dr-wh-r1-shell.js'

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= .005, `${message}: ${actual} !== ${expected}`)
const instances = mesh => {
  mesh.geometry.computeBoundingBox()
  const matrix = new THREE.Matrix4()
  return mesh.userData.instanceToRegisterId.map((id, index) => {
    mesh.getMatrixAt(index, matrix)
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(matrix), center = new THREE.Vector3(), size = new THREE.Vector3()
    box.getCenter(center); box.getSize(size)
    return { id, box, center, size }
  })
}

test('I3 builds four instanced WH-R1 pallet racks and real mesh collision proxies', () => {
  const root = new THREE.Group(); root.position.y = -WH_R1_FLOOR_Y // Test the ground-relative collision library with the whole scene at floor zero.
  const collision = createFurnitureCollision(), value = buildWhR1Racks({ THREE, root, collision, canvasTex: () => new THREE.Texture() })
  assert.deepEqual(value.counts, { racks: 4, frames: 40, cells: 96, pallets: 192, beams: 128, guards: 8, shuttleRails: 8, shuttleCars: 4 })
  const group = root.getObjectByName('wh-r1-racks')
  const specs = [
    ['货架立柱框占位', 'wh-r1-rack-frames'], ['货架横梁占位', 'wh-r1-rack-beams'], ['托盘占位子件', 'wh-r1-rack-pallets'], ['架端防撞占位', 'wh-r1-rack-guards'], ['货架格控制体', 'wh-r1-rack-cells'],
  ]
  const rendered = new Map()
  for (const [category, name] of specs) {
    const rows = WH_R1_DATA.elements.filter(item => item.category === category), mesh = group.getObjectByName(name), records = instances(mesh)
    assert.equal(mesh.isInstancedMesh, true, name); assert.equal(mesh.material.vertexColors, false, `${name} 不启用无顶点色的 vertexColors`)
    assert.deepEqual(mesh.userData.instanceToRegisterId, rows.map(row => row.id), `${category} 登记 ID 一一对应`)
    assert.equal(new Set(mesh.userData.instanceToRegisterId).size, rows.length, `${category} ID 唯一`)
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], actual = records[index], world = whToWorld(row.xM, row.yM)
      near(actual.center.x, world.x, `${row.id} x`); near(actual.center.y, row.zM + row.heightM / 2, `${row.id} y`); near(actual.center.z, world.z, `${row.id} z`)
      near(actual.size.x, row.lengthM, `${row.id} length`); near(actual.size.y, row.heightM, `${row.id} height`); near(actual.size.z, row.widthM, `${row.id} width`)
      rendered.set(row.id, actual)
    }
  }
  assert.equal(group.getObjectByName('wh-r1-rack-cells').visible, false, '控制体不参与渲染')
  assert.equal(rendered.size, 464)
  const rackId = id => id.match(/^WH-03-RK-\d+/)?.[0]
  const rackExtents = WH_R1_DATA.racks.map(rack => {
    const boxes = [...rendered].filter(([id]) => rackId(id) === rack.id && !id.startsWith('WH-03-GD-')).map(([, value]) => value.box)
    return [Math.min(...boxes.map(box => box.min.x)), Math.max(...boxes.map(box => box.max.x))]
  }).sort((a, b) => a[0] - b[0])
  const guardExtents = WH_R1_DATA.racks.map(rack => {
    const boxes = WH_R1_DATA.elements.filter(row => row.category === '架端防撞占位' && row.parentId === rack.id).map(row => rendered.get(row.id).box)
    return [Math.min(...boxes.map(box => box.min.x)), Math.max(...boxes.map(box => box.max.x))]
  }).sort((a, b) => a[0] - b[0])
  for (let index = 1; index < rackExtents.length; index++) near(rackExtents[index][0] - rackExtents[index - 1][1], 3.6, `中段巷道 ${index}`)
  for (let index = 1; index < guardExtents.length; index++) near(guardExtents[index][0] - guardExtents[index - 1][1], 3.3, `端部巷道 ${index}`)
  const northWall = WH_R1_WALLS.find(wall => wall.id === 'WH-00-W-006'), northGuard = Math.min(...WH_R1_DATA.elements.filter(row => row.category === '架端防撞占位').map(row => rendered.get(row.id).box.min.z))
  near(northGuard - (northWall.z + northWall.thickness / 2), 2.77, '后侧横通道')
  assert.equal(collision.stats().bodies, 12)
  assert.ok(collision.hit(-108.55, -9.15), 'real proxy blocks rack face')
  assert.ok(collision.hit(-109.6, -3.425), 'real proxy blocks rack guard')
  assert.equal(collision.hit(-106.6, -9.15), null, '3.6m aisle remains clear')
  assert.equal(group.getObjectByName('wh-r1-shuttle').count, 12)
  assert.deepEqual(group.getObjectByName('wh-r1-rack-labels').userData.whR1LabelIds, ['WH-03-RK-01-label', 'WH-03-RK-02-label', 'WH-03-RK-03-label', 'WH-03-RK-04-label'])
  assert.deepEqual(value.yellowReview, [{ id: 'F03', margin_mm: 61, status: 'SMALL_MARGIN_NOT_ACCEPTED', marker: 'yellow' }, { id: 'R02', margin_mm: 290, status: 'VERTICAL_UNRESOLVED', marker: 'yellow' }])
  value.dispose(); assert.equal(collision.stats().bodies, 0)
})

test('I3 preserves WH-R1 rack labels, rails and door IDs through high and low static merges', async () => {
  const source = readFileSync(new URL('../merge.js', import.meta.url), 'utf8').replace("from 'three'", `from '${new URL('../vendor/three/three.module.js', import.meta.url).href}'`)
  const { mergeStatic } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
  const prior = globalThis.location
  try {
    globalThis.location = { search: '?place=drlife-warehouse&whr1=1' }
    for (const tier of ['low', 'high']) {
      const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier }, layout: {}, collision: createFurnitureCollision() })
      registry.buildAll({ collision: createFurnitureCollision(), canvasTex: () => new THREE.Texture() })
      mergeStatic(scene, undefined)
      const labels = [], doors = []
      scene.traverse(object => { if (object.userData?.whR1LabelIds) labels.push(object); if (object.userData?.whR1DoorIds) doors.push(object) })
      assert.equal(labels.length, 1, tier); assert.equal(labels[0].userData.whR1LabelIds.length, 4, tier); assert.ok(labels.every(label => label.userData.noMerge), tier)
      assert.equal(doors.length, 1, tier); assert.deepEqual(doors[0].userData.whR1DoorIds, WH_R1_DATA.doors.map(door => door.id), tier); assert.equal(doors[0].count, 19, tier)
      registry.dispose()
    }
  } finally { globalThis.location = prior }
})

test('I3 appends racks only to the WH-R1 registry source order', () => {
  const prior = globalThis.location, scene = new THREE.Scene()
  globalThis.location = { search: '?place=drlife-warehouse&whr1=1' }
  try {
    const registry = createCampusRegistry({ THREE, scene, quality: { tier: 'low' }, layout: {} })
    registry.buildAll(); assert.deepEqual(registry.summary().modules, ['wh-r1-shell', 'wh-r1-zones', 'wh-r1-racks', 'wh-r1-workflow', 'wh-r1-vehicles']); assert.deepEqual(registry.summary().skipped, []); registry.dispose()
  } finally { globalThis.location = prior }
})
