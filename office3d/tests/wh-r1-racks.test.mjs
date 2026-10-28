import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { buildWhR1Racks } from '../dr-wh-r1-racks.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { WH_R1_DATA } from '../wh-r1/data.js'

test('I3 builds four instanced WH-R1 pallet racks and real mesh collision proxies', () => {
  const root = new THREE.Group(), collision = createFurnitureCollision(), value = buildWhR1Racks({ THREE, root, collision, canvasTex: () => new THREE.Texture() })
  assert.deepEqual(value.counts, { racks: 4, frames: 40, cells: 96, pallets: 192, beams: 128, guards: 8, shuttleRails: 8, shuttleCars: 4 })
  const group = root.getObjectByName('wh-r1-racks')
  assert.equal(group.getObjectByName('wh-r1-rack-structure').isInstancedMesh, true)
  assert.equal(group.getObjectByName('wh-r1-rack-pallets').count, 192)
  const frame = group.getObjectByName('wh-r1-rack-structure'), point = new THREE.Vector3(), matrix = new THREE.Matrix4()
  const frameZ = Array.from({ length: frame.count }, (_, index) => { frame.getMatrixAt(index, matrix); return point.setFromMatrixPosition(matrix).z })
  assert.ok(Math.abs(Math.min(...frameZ) + 14.8) <= .005, '登记中心生成的北端')
  assert.ok(Math.abs(Math.max(...frameZ) + 3.5) <= .005, '登记中心生成的南端')
  const centres = WH_R1_DATA.racks.map(rack => WH_R1_DATA.elements.find(item => item.id === rack.id).xM - 168).sort((a, b) => a - b)
  assert.ok(centres.every((center, index) => index === 0 || Math.abs(center - centres[index - 1] - 2.4 - 3.6) <= .005), '相邻货架保留 3,600mm 巷道')
  assert.equal(collision.stats().bodies, 4)
  assert.ok(collision.hit(-108.55, -9.15), 'real proxy blocks rack face')
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
      scene.traverse(object => { if (object.userData?.whR1LabelIds) labels.push(object); if (object.userData?.whR1Id && object.name.startsWith('wh-r1-door-') && object.userData.collisionProxy === false) doors.push(object) })
      assert.equal(labels.length, 1, tier); assert.equal(labels[0].userData.whR1LabelIds.length, 4, tier); assert.ok(labels.every(label => label.userData.noMerge), tier)
      assert.equal(doors.length, 19, tier)
      registry.dispose()
    }
  } finally { globalThis.location = prior }
})

test('I3 appends racks only to the WH-R1 registry source order', () => {
  const prior = globalThis.location, scene = new THREE.Scene()
  globalThis.location = { search: '?place=drlife-warehouse&whr1=1' }
  try {
    const registry = createCampusRegistry({ THREE, scene, quality: { tier: 'low' }, layout: {} })
    registry.buildAll(); assert.deepEqual(registry.summary().modules, ['wh-r1-shell', 'wh-r1-zones', 'wh-r1-racks']); assert.deepEqual(registry.summary().skipped, []); registry.dispose()
  } finally { globalThis.location = prior }
})
