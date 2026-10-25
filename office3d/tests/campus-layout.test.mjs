import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as current from '../office-layout.js'
import * as baseline from './fixtures/office-layout.pre-s2-3.js'
import { barColliders } from '../office-bar-geometry.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const currentSource = fs.readFileSync(path.join(root, 'office-layout.js'), 'utf8')
const baselineSource = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'office-layout.pre-s2-3.js'), 'utf8')
const area = (box) => (box.x1 - box.x0) * (box.z1 - box.z0)
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1
const grid = (value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
const pointIn = ([x, z], box) => x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1
const samples = (a, b) => {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4))
  return Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)])
}
const comparable = (value) => {
  if (typeof value === 'function') return String(value)
  if (Array.isArray(value)) return value.map(comparable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, comparable(child)]))
}

test('all pre-S2-3 exports keep values and source prefix', () => {
  const revisedDoor = "layoutRect('drlife', 'Dr.life+ 工作室', 9, 27, 7, 13, { side: 'north', at: 24 })"
  // O5 经董事会授权仅替换吧台碰撞段；仍逐字守住其余旧源码。
  const barBlock = /(?:\/\/ 复用吧台模块[^\n]*\n)?const V2_BAR_SEGMENTS = [\s\S]*?(?=\r?\n\r?\nconst V2_BAR_SEATS)/
  // R3-2 仅追加独立 V3 数据与选择分支；还原后继续逐字守住旧布局源码。
  const v3Block = /\r?\nconst V3_REGIONS = [\s\S]*?(?=\r?\n(?:const alignRect|const LAYOUT_V1_DATA))/
  // V3-F1 仅为 V3 焦点加入会议室，不能放宽其他 V3 源码。
  const v3FocusMeet = /\r?\n    \['meet', \{ label: '会议室', t: \[-23, 0, -7\.5\], r: 18 \}\],/
  // V3-A1/R2 仅追加独立 ALIGN 数据（包含经批准的 5.45m 沙发半径）。
  const alignBlock = /\r?\nconst alignRect = [\s\S]*?(?=\r?\nconst LAYOUT_V1_DATA)/
  const alignExport = /^export const LAYOUT_V3_ALIGN = .*\r?\n/m
  const sampleExport = /^export const LAYOUT_V3_ALIGN_SAMPLE = freezeDeep\(\{ \.\.\.cloneLayoutData\(V3_ALIGN_LAYOUT\), furnitureSample: true,\r?\n  seats: \{ \.\.\.cloneLayoutData\(V3_ALIGN_SEATS\), \.\.\.cloneLayoutData\(FACING_SEATS\) \} \}\)\r?\n/m
  const approvedHome = 'export const workHome = (seat) => facingHome(seat) || ({ x: seat[1], z: seat[2] + 1, yaw: 0 })'
  const legacyHome = 'export const workHome = ([, x, z]) => ({ x, z: z + 1, yaw: 0 })'
  assert.ok(currentSource.includes(approvedHome)); assert.match(currentSource, sampleExport)
  const regionFocusExport = /^export const regionFocusOf = .*\r?\n/m
  const resolverBlock = /export const resolveOfficeLayout = \(search = ''\) => \{[\s\S]*?\r?\n\}/
  assert.match(currentSource, v3FocusMeet)
  assert.match(currentSource, alignBlock)
  assert.match(currentSource, alignExport)
  assert.match(currentSource, regionFocusExport)
  const restored = currentSource
    .replace(approvedHome, legacyHome)
    .replace(sampleExport, '')
    .replace(v3FocusMeet, '')
    .replace(v3Block, '')
    .replace(alignBlock, '')
    .replace(/^export const LAYOUT_V3 = .*\r?\n/m, '')
    .replace(alignExport, '')
    .replace(regionFocusExport, '')
    .replace(resolverBlock, baselineSource.match(resolverBlock)[0])
    .replace(barBlock, baselineSource.match(barBlock)[0])
  assert.equal(restored.replace(revisedDoor, revisedDoor.replace('at: 24', 'at: 18')).startsWith(baselineSource), true)
  for (const key of Object.keys(baseline)) {
    if (key === 'workHome') {
      for (const seats of [current.SEATS, current.LAYOUT_V2.seats, current.LAYOUT_V3.seats, current.LAYOUT_V3_ALIGN.seats])
        for (const seat of Object.values(seats)) assert.deepEqual(current.workHome(seat), baseline.workHome(seat))
      continue
    }
    const expected = comparable(baseline[key])
    if (key === 'resolveOfficeLayout') {
      assert.equal(current.resolveOfficeLayout('?layout=2'), current.LAYOUT_V2)
      assert.equal(current.resolveOfficeLayout(''), current.LAYOUT_V1)
      assert.equal(current.resolveOfficeLayout('?layout=2&layout=1'), current.LAYOUT_V1)
      assert.equal(current.resolveOfficeLayout('?layout=3'), current.LAYOUT_V3)
      continue
    }
    if (key === 'LAYOUT_V2') {
      for (const rooms of [expected.regions, expected.rooms]) rooms.find(room => room.id === 'drlife').doors[0].at = 24
      expected.bar.segments = barColliders(expected).map(({ x0, x1, z0, z1 }, index) => ({ index, x0, x1, z0, z1, angle: index * 30 + 15 }))
    }
    assert.deepEqual(comparable(current[key]), expected, key)
  }
})

test('campus and building meet the frozen planning envelope', () => {
  assert.equal(area(current.CAMPUS), 6936)
  assert.ok(area(current.CAMPUS) >= 6500)
  assert.equal(area(current.CAMPUS_BUILDING), 4224)
  assert.ok(area(current.CAMPUS_BUILDING) >= 4000)
  assert.equal(current.CAMPUS.westRoadBuffer, 8)
  assert.equal(current.CAMPUS_BUILDING.x0, -168)
  assert.equal(current.CAMPUS_BUILDING.x1, -80)
  assert.equal(current.CAMPUS_BUILDING.z0, -18)
  assert.equal(current.CAMPUS_BUILDING.z1, 30)
  assert.ok(inside(current.CAMPUS_BUILDING, current.CAMPUS))
})

test('fourteen zones are unique, inside, non-overlapping and labelled as示意', () => {
  const zones = current.CAMPUS_ZONES
  assert.equal(zones.length, 14)
  assert.equal(new Set(zones.map((zone) => zone.id)).size, 14)
  for (const [i, zone] of zones.entries()) {
    assert.ok(inside(zone, current.CAMPUS), zone.id)
    assert.match(zone.label, /示意/)
    assert.ok(['building', 'outdoor'].includes(zone.kind))
    assert.ok(['visible', 'mark', 'reserved'].includes(zone.v1))
    for (const other of zones.slice(i + 1)) assert.equal(overlaps(zone, other), false, `${zone.id}/${other.id}`)
    for (const value of [zone.x0, zone.x1, zone.z0, zone.z1]) assert.equal(grid(value), true, zone.id)
  }
  assert.equal(current.CAMPUS_ZONES.find((zone) => zone.id === 'highRack').x0, -152)
  assert.equal(current.CAMPUS_ZONES.find((zone) => zone.id === 'logisticsGate').x1, -72)
})

test('campus stays clear of existing office, plaza, waiting and A4 regions', () => {
  const protectedAreas = [
    current.ENVELOPE,
    current.LAYOUT_V2.envelope,
    current.PLAZA,
    ...current.FOYER_ITEMS,
    ...current.WAITING_SEATS.map((seat) => ({ x0: seat.x - 0.25, x1: seat.x + 0.25, z0: seat.z - 0.25, z1: seat.z + 0.25 })),
    { x0: 62, x1: 78, z0: -38, z1: -22 },
  ]
  assert.equal(protectedAreas.some((areaBox) => overlaps(current.CAMPUS, areaBox)), false)
  assert.ok(current.CAMPUS.x1 <= -72)
})

test('road buffer, shuttle strip, flows and walk segments obey planning data', () => {
  assert.equal(current.CAMPUS.x1 - (-64), -8)
  assert.ok(inside(current.CAMPUS_SHUTTLE_STRIP, current.CAMPUS_ZONES.find((zone) => zone.id === 'highRack')))
  assert.deepEqual(current.CAMPUS_FLOWS.map((flow) => flow.type), ['walk', 'mark', 'walk'])
  for (const flow of current.CAMPUS_FLOWS) {
    assert.ok(flow.points.length >= 2)
    assert.ok(flow.points.every((point) => pointIn(point, current.CAMPUS)), flow.id)
    if (flow.type === 'walk') {
      for (let i = 0; i < flow.points.length - 1; i++) {
        assert.ok(samples(flow.points[i], flow.points[i + 1]).every((point) => current.CAMPUS_WALKABLE.some((box) => pointIn(point, box))), flow.id)
      }
    }
  }
  assert.deepEqual(current.CAMPUS_FLOWS.find((flow) => flow.id === 'cargo').sequence, ['receiving', 'inspection', 'highRack', 'picking', 'packing', 'shipping'])
})

test('focus, minimap and deep freezing are stable', () => {
  assert.deepEqual(current.CAMPUS_FOCUS, { label: 'DR 仓配服务中心（示意）', t: [-124, 0, 6], r: 68 })
  assert.deepEqual(current.CAMPUS_MINI_BOUNDS, { x0: -178, x1: 24, z0: -28, z1: 44 })
  assert.equal(current.MINI_BOUNDS.x0, -48)
  assert.equal(Object.isFrozen(current.CAMPUS), true)
  assert.equal(Object.isFrozen(current.CAMPUS_ZONES[0]), true)
  assert.equal(Object.isFrozen(current.CAMPUS_FLOWS[0].points), true)
  assert.throws(() => { current.CAMPUS.x0 = 0 }, TypeError)
  assert.throws(() => { current.CAMPUS_ZONES[0].x0 = 0 }, TypeError)
})

test('mutation sentinels detect an escaped or overlapping zone', () => {
  const outside = current.CAMPUS_ZONES.map((zone) => ({ ...zone }))
  outside[0].x0 = -175
  assert.equal(outside.every((zone) => inside(zone, current.CAMPUS)), false)
  const overlap = current.CAMPUS_ZONES.map((zone) => ({ ...zone }))
  overlap[1].x0 = overlap[0].x0
  assert.equal(overlap.some((zone, index) => overlap.slice(index + 1).some((other) => overlaps(zone, other))), true)
})

test('S2-3 appended data stays offline and simulation-only', () => {
  const added = currentSource.slice(baselineSource.length)
  assert.doesNotMatch(added, /\b(?:document|window|fetch|Math\.random|Date\.now)\b/)
  assert.doesNotMatch(added, /\b(?:buy|purchase|price|balance|wallet)\b/i)
  assert.doesNotMatch(added, /订单|库存|地址|客户名称|商户/)
})
