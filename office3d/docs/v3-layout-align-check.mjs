import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAYOUT_V3_ALIGN } from '../office-layout.js'

const plan = JSON.parse(readFileSync(new URL('./v3-layout-align-plan.json', import.meta.url)))
const regions = LAYOUT_V3_ALIGN.regions.map((region) => {
  const door = region.doors[0]
  return [region.id, region.x0, region.x1, region.z0, region.z1, door.side, door.at]
})
const seats = Object.fromEntries(Object.entries(LAYOUT_V3_ALIGN.seats).map(([id, seat]) => [id, seat.slice(0, 3)]))

assert.equal(plan.version, LAYOUT_V3_ALIGN.version)
assert.equal(plan.variant, LAYOUT_V3_ALIGN.variant)
assert.deepEqual(plan.regions, regions)
assert.deepEqual(plan.seats, seats)
assert.deepEqual(plan.meetingSeats, LAYOUT_V3_ALIGN.meetingSeats)
assert.equal(plan.displaySeatCount, LAYOUT_V3_ALIGN.displaySeats.length)
assert.deepEqual(plan.publicPathNodes, LAYOUT_V3_ALIGN.publicPathNodes.map(({ x, z }) => [x, z]))
assert.deepEqual(plan.ring, { inner: LAYOUT_V3_ALIGN.ring.inner, outer: LAYOUT_V3_ALIGN.ring.outer })
assert.equal(plan.barRadius, LAYOUT_V3_ALIGN.bar.radius)
assert.deepEqual(plan.westOpen, {
  id: 'west-open',
  x0: -28,
  x1: -8.5,
  z0: -3,
  z1: 7,
})

console.log('V3 align plan matches LAYOUT_V3_ALIGN')
