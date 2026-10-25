import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { LAYOUT_V3_ALIGN } from '../office-layout.js'

const plan = JSON.parse(readFileSync(new URL('./v3-layout-align-plan.json', import.meta.url)))
const baseline = JSON.parse(execFileSync('git', ['show', '83ecc1b:office3d/docs/v3-layout-align-plan.json'], { encoding: 'utf8' }))
const compare = (actual, expected, label) => assert.deepEqual(actual, expected, label)
const region = ({ id, kind, walled, x0, x1, z0, z1, doors }) => ({ id, kind, walled, x0, x1, z0, z1, doors })
const runtimeRegions = LAYOUT_V3_ALIGN.regions.map(region)
const runtimeWorkers = Object.entries(LAYOUT_V3_ALIGN.seats).map(([name, [region, x, z]]) => ({ name, region, x, z }))
const runtimeIsland = {
  center: LAYOUT_V3_ALIGN.island.center,
  barOuter: LAYOUT_V3_ALIGN.island.barOuter,
  collisionRadius: LAYOUT_V3_ALIGN.bar.radius,
  stoolRadius: LAYOUT_V3_ALIGN.island.stoolRadius,
  sofaOuter: LAYOUT_V3_ALIGN.island.sofaOuter,
  ring: { inner: LAYOUT_V3_ALIGN.ring.inner, outer: LAYOUT_V3_ALIGN.ring.outer, width: LAYOUT_V3_ALIGN.ring.width },
}

assert.equal(plan.version, LAYOUT_V3_ALIGN.version)
assert.equal(plan.variant, LAYOUT_V3_ALIGN.variant)
compare(plan.site, { x0: LAYOUT_V3_ALIGN.site.x0, x1: LAYOUT_V3_ALIGN.site.x1, z0: LAYOUT_V3_ALIGN.site.z0, z1: LAYOUT_V3_ALIGN.site.z1 }, 'site')
compare(plan.island, runtimeIsland, 'island')
compare(plan.regions, runtimeRegions, 'regions')
compare(plan.workstations, runtimeWorkers, 'workstations')
compare(plan.displaySeats, LAYOUT_V3_ALIGN.displaySeats.map(({ id, region, x, z }) => ({ id, region, x, z })), 'display seats')
compare(plan.meetingRooms.map(({ id, seats }) => [id, seats]), [['board', 0], ['review', 8], ['plan', 6]], 'meeting rooms')
compare(plan.publicPathNodes, LAYOUT_V3_ALIGN.publicPathNodes.map(({ x, z }) => [x, z]), 'public path nodes')

compare(plan.site, baseline.site, 'approved site')
const baselineRegions = new Map(baseline.regions.map(item => [item.id, item]))
const northRooms = { board: ['room', -20, -10, -18, -12], review: ['room', -10, -5, -18, -13], plan: ['room', -5, 0, -18, -13] }
for (const item of plan.regions) {
  const approved = baselineRegions.get(item.id)
  assert.ok(approved, `unknown approved region: ${item.id}`)
  compare(
    [item.kind, item.x0, item.x1, item.z0, item.z1],
    northRooms[item.id] ?? [approved.kind, approved.x0, approved.x1, approved.z0, approved.z1],
    `approved coordinates: ${item.id}`,
  )
}
compare(plan.workstations.map(({ name, region, x, z }) => ({ name, region, x, z })), baseline.workstations.map(({ name, region, x, z }) => ({ name, region, x, z })), 'approved workstations')
compare(plan.displaySeats, baseline.displaySeats, 'approved display seats')
compare(
  { center: plan.island.center, barOuter: plan.island.barOuter, collisionRadius: plan.island.collisionRadius, stoolRadius: plan.island.stoolRadius, ring: plan.island.ring },
  { center: { x: 2, z: -3 }, barOuter: baseline.island.counterRadius, collisionRadius: baseline.island.collisionRadius, stoolRadius: baseline.island.stoolRadius, ring: baseline.island.ring },
  'approved island geometry',
)
assert.equal(baseline.island.sofaRadius, 5.8, 'approved sofa baseline')
assert.equal(plan.island.sofaOuter, 5.45, 'Board-approved sofa radius')

console.log('允许差异：island.sofaOuter 5.8 → 5.45（董事会裁决）')
console.log('V3 align plan matches runtime; O1 north-room and centre amendments are explicit, other 83ecc1b coordinates unchanged')
