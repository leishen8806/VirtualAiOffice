import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePlaceMode } from '../place-mode.js'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_DOORS, WH_R1_SHELL_SPEC, WH_R1_WALLS } from '../dr-wh-r1-shell.js'
import { WH_R1_BUILDING, WH_R1_SITE, WH_R1_ZONES } from '../dr-wh-r1-zones.js'

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= .005, `${message}: ${actual} !== ${expected}`)
const intervalsOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) > Math.max(a0, b0) + .001

test('WH-R1 I2 keeps the registered 34 walls, 68 faces and 19 door openings', () => {
  assert.equal(WH_R1_WALLS.length, 34)
  assert.equal(WH_R1_SHELL_SPEC.wallFaces.length, 68)
  assert.equal(WH_R1_DOORS.length, 19)
  assert.equal(new Set(WH_R1_WALLS.map((wall) => wall.id)).size, 34)
  assert.equal(new Set(WH_R1_DOORS.map((door) => door.id)).size, 19)
  for (const face of WH_R1_SHELL_SPEC.wallFaces) assert.ok(WH_R1_WALLS.some((wall) => wall.id === face.wallId), face.id)
})

test('WH-R1 I2 converts registered wall endpoints and preserves every door gap', () => {
  near(WH_R1_WALLS[0].endpoints[0].x, -167.86, 'first wall x')
  near(WH_R1_WALLS[0].endpoints[0].z, -17.86, 'first wall z')
  for (const door of WH_R1_DOORS) {
    const horizontal = Math.abs(Math.sin(door.yaw)) < .01
    for (const wall of WH_R1_WALLS) {
      const [a, b] = wall.endpoints
      const wallHorizontal = Math.abs(a.z - b.z) < .005
      if (horizontal !== wallHorizontal) continue
      if (horizontal && Math.abs(a.z - door.z) < .005) {
        assert.equal(intervalsOverlap(Math.min(a.x, b.x), Math.max(a.x, b.x), door.x - door.width / 2, door.x + door.width / 2), false, `${door.id} overlaps ${wall.id}`)
      }
      if (!horizontal && Math.abs(a.x - door.x) < .005) {
        assert.equal(intervalsOverlap(Math.min(a.z, b.z), Math.max(a.z, b.z), door.z - door.width / 2, door.z + door.width / 2), false, `${door.id} overlaps ${wall.id}`)
      }
    }
  }
})

test('WH-R1 I2 uses independent site and exact zone bounds', () => {
  assert.deepEqual(WH_R1_SITE, { x0: -174, x1: -72, z0: -26, z1: 42, width: 102, depth: 68 })
  assert.deepEqual(WH_R1_BUILDING, { x0: -168, x1: -80, z0: -18, z1: 30, width: 88, depth: 48 })
  assert.equal(WH_R1_ZONES.length, 14)
  for (const zone of WH_R1_ZONES) {
    const source = WH_R1_DATA.zones.find((item) => item.id === zone.id)
    assert.deepEqual([zone.x0, zone.x1, zone.z0, zone.z1], source.worldBboxXZ, zone.id)
  }
})

test('WH-R1 I2 activates only the unique whr1=1 warehouse and campus entries', () => {
  const warehouse = resolvePlaceMode('?place=drlife-warehouse&whr1=1')
  assert.equal(warehouse.whr1, true)
  assert.equal(warehouse.place, 'dr')
  assert.deepEqual(warehouse.miniBounds, WH_R1_SITE)
  assert.equal(resolvePlaceMode('?campus=1&whr1=1').whr1, true)
  assert.equal(resolvePlaceMode('?place=drlife-warehouse&whr1=1&whr1=1').whr1, undefined)
  assert.equal(resolvePlaceMode('?place=drlife-warehouse&whr1=0').whr1, undefined)
})

