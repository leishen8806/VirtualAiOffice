import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import * as layout from '../office-layout.js'

const rectOverlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const oldSource = fs.readFileSync(new URL('./fixtures/historical/office3d-backup-o2/office-layout.js', import.meta.url), 'utf8')

test('layout1 preserves every pre-O2 export value and order', async () => {
  const old = await import('./fixtures/historical/office3d-backup-o2/office-layout.js')
  const currentSource = fs.readFileSync(new URL('../office-layout.js', import.meta.url), 'utf8')
  const approvedHome = 'export const workHome = (seat) => facingHome(seat) || ({ x: seat[1], z: seat[2] + 1, yaw: 0 })'
  const legacyHome = 'export const workHome = ([, x, z]) => ({ x, z: z + 1, yaw: 0 })'
  const plan1Import = /^import \{ makeOfficePlan1Layout, makeOfficePlan1L2BLayout, officePlan1Phase \} from '\.\/office-plan1-layout\.js'\r?\n/m
  const r1Import = /^import \{ createOfficeR1Layout \} from '\.\/office-vis2\/r1-site\.js'\r?\n\r?\n/m
  const r1Export = /^export const LAYOUT_V3_R1 = createOfficeR1Layout\(\)\r?\n/m
  assert.ok(currentSource.includes(approvedHome))
  assert.match(currentSource, r1Import); assert.match(currentSource, r1Export)
  // L1 仅增加样板数据导入；其余旧源码仍逐字冻结。
  const frozenSource = currentSource.replace(plan1Import, '').replace(r1Import, '').replace(/^export const LAYOUT_V3_ALIGN_L2B = .*\r?\n/m, '').replace(r1Export, '').replace(approvedHome, legacyHome)
    .replace("if (['L1', 'L2'].includes(officePlan1Phase(layout))) {", "if (['L1', 'L2'].includes(layout.plan1Phase)) {")
    .replace("const inset = officePlan1Phase(layout) === 'L2' ? .32 : .35", "const inset = layout.plan1Phase === 'L2' ? .32 : .35")
  assert.equal(frozenSource.startsWith(oldSource), true)
  for (const name of Object.keys(old)) {
    if (name === 'workHome') {
      for (const seats of [layout.SEATS, layout.LAYOUT_V2.seats, layout.LAYOUT_V3.seats, layout.LAYOUT_V3_ALIGN.seats])
        for (const seat of Object.values(seats)) assert.deepEqual(layout.workHome(seat), old.workHome(seat))
      continue
    }
    if (typeof old[name] === 'function') assert.equal(String(layout[name]), String(old[name]), name)
    else assert.deepEqual(layout[name], old[name], name)
  }
  assert.equal(Object.isFrozen(layout.LAYOUT_V1), true)
  assert.equal(hash(layout.LAYOUT_V1.ENVELOPE), hash(old.ENVELOPE))
})

test('v2 contains the rev2 envelope, all regions and preserved seat mapping', () => {
  const v2 = layout.LAYOUT_V2
  assert.deepEqual(v2.envelope, { x0: -34, x1: 38, z0: -18, z1: 16, width: 72, depth: 34, area: 2448 })
  assert.equal(v2.regions.length, 13)
  assert.deepEqual(v2.regions.map((r) => r.id), ['market', 'board', 'review', 'plan', 'product', 'eng', 'kb', 'service', 'aftersales', 'ops', 'quality', 'drlife', 'marketing'])
  assert.equal(Object.keys(v2.seats).length, 25)
  for (const name of Object.keys(layout.SEATS)) assert.equal(v2.seats[name][0], layout.SEATS[name][0], name)
  assert.equal(v2.displaySeats.length, 12)
  assert.ok(v2.displaySeats.every((seat) => seat.display === true))
})

test('v2 rooms, seats, corridors and plaza obey the rev2 geometry contract', () => {
  const v2 = layout.LAYOUT_V2
  for (const [i, a] of v2.regions.entries()) {
    assert.ok((a.x0 * 2) % 1 === 0 && (a.x1 * 2) % 1 === 0 && (a.z0 * 2) % 1 === 0 && (a.z1 * 2) % 1 === 0)
    for (const b of v2.regions.slice(i + 1)) assert.equal(rectOverlap(a, b), false, `${a.id}/${b.id}`)
    assert.equal(a.doors[0].width, 1.5)
  }
  for (const [name, [regionId, x, z]] of Object.entries(v2.seats)) {
    const region = v2.regions.find((item) => item.id === regionId)
    assert.ok(x > region.x0 && x < region.x1 && z > region.z0 && z < region.z1, name)
    assert.ok((x * 2) % 1 === 0 && (z * 2) % 1 === 0, name)
  }
  for (const seat of v2.displaySeats) {
    const region = v2.regions.find((item) => item.id === seat.region)
    assert.ok(seat.x > region.x0 && seat.x < region.x1 && seat.z > region.z0 && seat.z < region.z1, seat.id)
  }
  assert.equal(v2.bar.center.x, 2)
  assert.equal(v2.bar.segments.length, 12)
  assert.equal(v2.bar.gaps.length, 2)
  assert.equal(v2.corridors.north.width, 2)
  assert.equal(v2.corridors.south.width, 2)
  assert.equal(v2.corridors.centralRing.width, 2)
  assert.equal(rectOverlap(v2.frontDesk, layout.PLAZA), false)
  assert.equal(v2.regions.find((r) => r.id === 'drlife').x1 - v2.regions.find((r) => r.id === 'drlife').x0, 18)
  assert.equal(v2.regions.find((r) => r.id === 'drlife').z1 - v2.regions.find((r) => r.id === 'drlife').z0, 6)
  assert.deepEqual(v2.regions.find((r) => r.id === 'drlife').doors, [{ side: 'north', at: 24, width: 1.5 }])
})

test('resolver preserves layout=2 and rejects unsupported values', () => {
  assert.equal(layout.resolveOfficeLayout('?layout=2'), layout.LAYOUT_V2)
  assert.equal(layout.resolveOfficeLayout('layout=2'), layout.LAYOUT_V2)
  for (const search of ['', '?layout=1', '?layout=4', '?layout=2&layout=1', '?layout=%32x']) assert.equal(layout.resolveOfficeLayout(search), layout.LAYOUT_V1)
  assert.equal(Object.isFrozen(layout.LAYOUT_V2), true)
  assert.equal(Object.isFrozen(layout.LAYOUT_V2.regions[0]), true)
  assert.throws(() => { layout.LAYOUT_V2.envelope.x0 = 0 }, TypeError)
})

test('mutation sentinels detect overlap, lost region id and spine intrusion', () => {
  const v2 = layout.LAYOUT_V2
  const overlap = [...v2.regions, { ...v2.regions[0], id: 'mutated' }]
  assert.ok(rectOverlap(overlap[0], overlap.at(-1)))
  assert.equal(v2.regions.some((region) => region.id === 'lostid'), false)
  const spine = { x0: 1, x1: 8, z0: -18, z1: 13 }
  assert.ok(v2.regions.some((region) => rectOverlap(region, spine)) === true)
})

test('new layout source stays data-only', () => {
  const source = fs.readFileSync(new URL('../office-layout.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:document|window|fetch|Math\.random|Date\.now)\b/)
})
