import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN_SAMPLE, resolveOfficeLayout } from '../office-layout.js'
import { wholeFloorSpec } from '../office-vis2/whole-floor.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const bedKey = bed => `${bed.side}:${bed.x.toFixed(1)}:${bed.z.toFixed(1)}`
const overlapArea = (bed, room, margin = 0) =>
  Math.max(0, Math.min(bed.x + bed.w / 2 + margin, room.x1) - Math.max(bed.x - bed.w / 2 - margin, room.x0)) *
  Math.max(0, Math.min(bed.z + bed.d / 2 + margin, room.z1) - Math.max(bed.z - bed.d / 2 - margin, room.z0))

test('L2B removes exactly beds intersecting walled rooms with 0.30 m margin', () => {
  const baselineLayout = structuredClone(LAYOUT_V3_ALIGN_L2B)
  baselineLayout.plan1Phase = 'L2'
  const base = wholeFloorSpec(baselineLayout).beds
  const spec = wholeFloorSpec(LAYOUT_V3_ALIGN_L2B)
  const rooms = LAYOUT_V3_ALIGN_L2B.regions.filter(room => room.walled === true || room.id === 'product-eng-knowledge')
  const productEngineering = rooms.find(room => room.id === 'product-eng-knowledge')
  assert.equal(productEngineering.walled, false)
  assert.ok(productEngineering.walls.some(wall => wall === 'solid' || wall === 'glass'))
  assert.equal(hash(base), '54aa01429ae278b0390aec38ddb18ea527489b2c2e9c4fbee414f930c6eafd1b')
  const removed = base.filter(bed => rooms.some(room => overlapArea(bed, room, .3) > 0))
  assert.equal(rooms.length, 8)
  assert.deepEqual(removed.map(bedKey), [
    'north:-21.8:-16.0', 'north:-19.4:-16.0', 'north:-17.0:-16.0', 'north:-14.6:-16.0',
    'north:-12.2:-16.0', 'north:-9.8:-16.0', 'north:-7.4:-16.0', 'north:-5.0:-16.0',
    'north:-2.6:-16.0', 'north:-0.2:-16.0', 'north:4.6:-16.0', 'north:7.0:-16.0',
    'north:9.4:-16.0', 'north:11.8:-16.0', 'north:14.2:-16.0', 'north:16.6:-16.0', 'north:19.0:-16.0', 'north:21.4:-16.0',
    'north:23.8:-16.0', 'north:26.2:-16.0',
  ])
  assert.equal(removed.length, 20)
  assert.equal(spec.beds.length, 56)
  assert.deepEqual(spec.beds, base.filter(bed => !removed.includes(bed)))
  assert.deepEqual(spec.bedSeeds, base.map((_, index) => index).filter(index => !removed.includes(base[index])))
  assert.deepEqual(spec.details, wholeFloorSpec(baselineLayout).details)
  assert.equal(hash(spec.beds), '10c0ebca839569d6d68d3b57384368e70cf833bce80a92f4a36613a2dd1d0d3f')
  assert.equal(spec.beds.some(bed => rooms.some(room => overlapArea(bed, room, .3) > 0)), false)
})

test('L1, L2 and l2b=0 retain the baseline garden list; only explicit sample L2B filters beds', () => {
  const l1 = structuredClone(LAYOUT_V3_ALIGN_SAMPLE)
  l1.plan1Phase = 'L1'
  const l2 = LAYOUT_V3_ALIGN_SAMPLE
  const l2b0 = resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=0')
  const l2b1 = resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=1')
  const baselineHash = '113bf61305f1ca76f6d20556cc20b4f94c3c983ecf300887f95a949d608f764a'
  for (const layout of [l1, l2, l2b0]) {
    const spec = wholeFloorSpec(layout)
    assert.equal(spec.beds.length, 76)
    assert.equal(hash(spec.beds), baselineHash)
    assert.equal(spec.bedSeeds, undefined)
  }
  assert.equal(l2b1.plan1Phase, 'L2B')
  assert.equal(wholeFloorSpec(l2b1).beds.length, 56)
})
