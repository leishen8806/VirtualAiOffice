import { withApprovedPlantMove } from './helpers/r1-plant-footprints.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B } from '../office-layout.js'
import { R1_DATA } from '../office-r1/data.js'
import { createR1Layout, R1_BACKWALL, R1_BOARD_ADDED_ELEMENTS, R1_BOARD_FACING_OVERRIDES, R1_BOARD_OVERRIDES, R1_BOARD_TRUNK_OVERRIDES, R1_GATE, r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Plaza } from '../office-vis2/r1-plaza.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { createFurnitureCollision } from '../furniture-collision.js'

// 董事会 2026-10-28 批准的"八"字形新位置（需求卡《新位置》表，R1 本地坐标，米）。
const STALLS = Object.freeze({
  '14-KS-001': { xM: 15.14, yM: -3.88, yawDeg: 50, facingLocal: [.766, -.643] },
  '14-KS-002': { xM: 12.44, yM: -7.1, yawDeg: 50, facingLocal: [.766, -.643] },
  '14-KS-003': { xM: 40.86, yM: -3.88, yawDeg: 310, facingLocal: [-.766, -.643] },
  '14-KS-004': { xM: 43.17, yM: -6.64, yawDeg: 310, facingLocal: [-.766, -.643] },
})
const UMBRELLA_SET = Object.freeze(['14-UM-002', '14-UM-002-CANOPY', '14-UM-002-POLE', '14-T-002',
  ...['005', '006', '007', '008'].flatMap(n => [`14-CH-${n}`, `14-CH-${n}-BACK`, `14-CH-${n}-BASE`, `14-CH-${n}-SEAT`])])
const SHIFT = Object.freeze({ dxM: -6.5, dyM: 2.6 })
// OFFICE-R1-RECEP（董事会 2026-10-28 批准）后来又往同一张偏离表加了 4 条接待椅平移；
// I6C 这条测试只负责锁住自己这 24 条，接待椅的数值由 office-r1-recep-brand.test.mjs 的 RC-2 锁。
const RECEP_SET = Object.freeze(['11-CH-001', '11-CH-001-BACK', '11-CH-001-BASE', '11-CH-001-SEAT'])
// OFFICE-R1-AMBIENCE 补充 R2（董事会 2026-10-29 批准）又加了 12 条：三个预留座位的椅子推进桌下。
// 同样不归 I6C 管，数值由 office-r1-ambience.test.mjs 的 AM-7c 锁。
const RESERVED_SET = Object.freeze(['08-CH-011', '08-CH-012', '08-CH-013']
  .flatMap(id => [id, `${id}-BACK`, `${id}-BASE`, `${id}-SEAT`]))
const LATER_SET = Object.freeze([...RECEP_SET, ...RESERVED_SET])
// 代码基线 main a6aa91f3fb91a9e9158575977f69694582703ed7 上 office-r1/data.js 的 SHA-256：偏离表不得改登记数据文件。
// 先把 CRLF 归一成 LF 再算：本机不同工作树的签出行尾不一致（pc-worktrees 是 CRLF、新建工作树是 LF），
// 直接对原始字节取哈希会在换一个工作树复核时假失败。
const DATA_SHA256 = 'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf'
const normalized = file => Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8')
const MM = .001
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (±${tolerance})`)
const rawOf = id => R1_DATA.elements.find(item => item.id === id)
const yawOf = item => runtimeYawFromFacing(Number(item.facingLocal?.[0]) || 0, -(Number(item.facingLocal?.[1]) || 0))
const unit = ([x, y]) => { const n = Math.hypot(x, y); return [x / n, y / n] }

test('I6C-1 the board deviation table is frozen, covers exactly the 24 approved IDs and leaves office-r1/data.js untouched', () => {
  assert.equal(createHash('sha256').update(normalized(new URL('../office-r1/data.js', import.meta.url))).digest('hex'), DATA_SHA256)
  assert.ok(Object.isFrozen(R1_BOARD_OVERRIDES))
  const ids = R1_BOARD_OVERRIDES.map(entry => entry.id), i6c = ids.filter(id => !LATER_SET.includes(id))
  assert.deepEqual([...i6c].sort(), [...Object.keys(STALLS), ...UMBRELLA_SET].sort())
  assert.equal(new Set(i6c).size, 24)
  // 整张表不得有重复 ID，后加的条目也不许覆盖 I6C 的任何一条。
  assert.equal(new Set(ids).size, ids.length)
  for (const entry of R1_BOARD_OVERRIDES) {
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.from) && Object.isFrozen(entry.to), entry.id)
    assert.equal(entry.date, RESERVED_SET.includes(entry.id) ? '2026-10-29' : '2026-10-28', entry.id)
    assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, entry.id)
    // 原值必须与登记数据逐值相符，否则登记数据漂移了而偏离表没跟上。
    const raw = rawOf(entry.id)
    assert.ok(raw, entry.id)
    for (const key of Object.keys(entry.from)) assert.deepEqual(entry.from[key], raw[key], `${entry.id}.${key}`)
  }
  const byId = new Map(R1_BOARD_OVERRIDES.map(entry => [entry.id, entry]))
  for (const [id, want] of Object.entries(STALLS)) {
    const { to } = byId.get(id)
    near(to.xM, want.xM, MM); near(to.yM, want.yM, MM)
    assert.equal(to.yawDeg, want.yawDeg, id)
    assert.deepEqual(to.facingLocal, want.facingLocal, id)
  }
  for (const id of UMBRELLA_SET) {
    const { from, to } = byId.get(id)
    near(to.xM, from.xM + SHIFT.dxM, MM); near(to.yM, from.yM + SHIFT.dyM, MM)
    // 伞桌整套只平移：朝向与角度不进偏离表。
    assert.deepEqual(Object.keys(to).sort(), ['xM', 'yM'])
  }
  // 本表的偏离只落在这 24 个 ID 上：登记段其余 1106 条逐值与 data.js 相同（大门抬高的 2 片门扇走
  // BACKWALL 补充 R2 的另一张表，尾部 4 片门扇是 BACKWALL 两樘新门新增的，书架 08-BK-002 是本卡
  // R2 的董事会新增件，都不属于本表）。
  const layout = createR1Layout({ candidateC01: false })
  const TRUNK_IDS = new Set(R1_BOARD_TRUNK_OVERRIDES.map(entry => entry.id))
  assert.equal(TRUNK_IDS.size, 35)
  // 树干表只碰 <id>-TR，与本表的 ID 不相交。
  assert.equal(ids.filter(id => TRUNK_IDS.has(id)).length, 0)
  assert.equal(layout.elements.length, R1_DATA.elements.length + R1_BACKWALL.leaves.length + R1_BOARD_ADDED_ELEMENTS.length)
  for (const [index, item] of layout.elements.slice(0, R1_DATA.elements.length).entries()) {
    // 2026-10-29 长椅转向另有一张董事会表（R1_BOARD_FACING_OVERRIDES），由 office-r1-bench-facing.test.mjs 单独锁住；
    // 室内绿植树干改细同样另有一张表（R1_BOARD_TRUNK_OVERRIDES），由 office-r1-trunk.test.mjs 的 TK-2 单独锁住。
    if (byId.has(item.id) || R1_GATE.leafIds.includes(item.id) || R1_BOARD_FACING_OVERRIDES.some(entry => entry.id === item.id) || TRUNK_IDS.has(item.id)) continue
    assert.deepEqual(item, withApprovedPlantMove(R1_DATA.elements[index]), item.id)
  }
  assert.deepEqual(layout.elements.slice(R1_DATA.elements.length), [...R1_BACKWALL.leaves, ...R1_BOARD_ADDED_ELEMENTS])
  // 非 R1 布局（稳定 V3 / L2B 对齐）不受偏离表影响。
  for (const other of [LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B]) assert.equal(other.r1Phase, undefined)
})

test('I6C-2 the four stalls land on the approved fan positions and the parasol set moves as one rigid body', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group()
  const plaza = buildR1Plaza({ THREE, root, layout })
  assert.equal(plaza.records.length, 60)
  for (const [id, want] of Object.entries(STALLS)) {
    const record = plaza.byId.get(id)
    assert.ok(record, id)
    const world = r1ToWorld(want.xM, want.yM)
    near(record.position.x, world.x, .005); near(record.position.z, world.z, .005)
    // 朝向按点积判定，不断言角度相等（通用规则 §5）。
    const item = layout.r1.elements.find(value => value.id === id)
    const got = unit([Math.sin(record.yaw) * -1, Math.cos(record.yaw) * -1])
    const wantWorld = unit([want.facingLocal[0], -want.facingLocal[1]])
    assert.ok(got[0] * wantWorld[0] + got[1] * wantWorld[1] > .99, `${id} facing ${got} vs ${wantWorld}`)
    assert.equal(item.yawDeg, want.yawDeg, id)
    // 长轴与所在排线（与中线成 40°）平行：|点积| > 0.99。
    const axis = [Math.cos(record.yaw), Math.sin(record.yaw)]
    const sign = want.xM < 28 ? -1 : 1
    const line = [sign * Math.sin(40 * Math.PI / 180), -Math.cos(40 * Math.PI / 180)]
    assert.ok(Math.abs(axis[0] * line[0] + axis[1] * line[1]) > .99, `${id} axis ${axis} vs ${line}`)
  }
  // 左右两排关于中线 X = 28 镜像：成"八"字而不是平行。
  const mirror = (a, b) => near(28 - STALLS[a].xM, STALLS[b].xM - 28, .02)
  mirror('14-KS-001', '14-KS-003')
  for (const id of UMBRELLA_SET) {
    const item = layout.r1.elements.find(value => value.id === id)
    const raw = rawOf(id)
    near(item.xM, raw.xM + SHIFT.dxM, MM); near(item.yM, raw.yM + SHIFT.dyM, MM)
    assert.equal(item.yawDeg, raw.yawDeg, id)
    assert.deepEqual(item.facingLocal, raw.facingLocal, id)
  }
  // 整套 20 个 ID 的相对位置不变：两两间距与偏离前逐值相同。
  for (const a of UMBRELLA_SET) for (const b of UMBRELLA_SET) {
    const ia = layout.r1.elements.find(v => v.id === a), ib = layout.r1.elements.find(v => v.id === b)
    near(Math.hypot(ia.xM - ib.xM, ia.yM - ib.yM), Math.hypot(rawOf(a).xM - rawOf(b).xM, rawOf(a).yM - rawOf(b).yM), MM)
  }
  near(layout.r1.elements.find(v => v.id === '14-UM-002').xM, 8.5, MM)
  near(layout.r1.elements.find(v => v.id === '14-UM-002').yM, -6, MM)
  plaza.dispose()
})

const hull = points => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = list => { const out = []; for (const p of list) { while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop(); out.push(p) } return out }
  const lower = half(sorted), upper = half([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}
const segGap = (p, q, r, s) => {
  const toSeg = (a, b, c) => {
    const vx = c[0] - b[0], vy = c[1] - b[1]
    const t = Math.max(0, Math.min(1, ((a[0] - b[0]) * vx + (a[1] - b[1]) * vy) / (vx * vx + vy * vy || 1)))
    return Math.hypot(a[0] - b[0] - t * vx, a[1] - b[1] - t * vy)
  }
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  if (side(p, q, r) !== side(p, q, s) && side(r, s, p) !== side(r, s, q)) return 0
  return Math.min(toSeg(p, r, s), toSeg(q, r, s), toSeg(r, p, q), toSeg(s, p, q))
}
const polyGap = (A, B) => {
  let min = Infinity
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++)
    min = Math.min(min, segGap(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length]))
  return min
}

test('I6C-3 every moved body keeps 0.6 m of real-mesh clearance and the stalls block while route Z14 and both entry walkways stay clear', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const plaza = buildR1Plaza({ THREE, root, layout, collision })
  const position = plaza.mesh.geometry.attributes.position
  // 真实网格足迹：取该 ID 在合并网格里的顶点区间，投到 XZ 平面后求凸包。
  const footprint = record => {
    const points = []
    for (let i = record.startVertex; i < record.startVertex + record.count; i++) points.push([position.getX(i), position.getZ(i)])
    assert.ok(points.length > 0, record.id)
    return hull(points)
  }
  const moved = new Set([...Object.keys(STALLS), ...UMBRELLA_SET])
  const prints = new Map(plaza.records.map(record => [record.id, footprint(record)]))
  const parentOf = id => layout.r1.elements.find(item => item.id === id)?.parentId || id
  const table = []
  for (const id of [...Object.keys(STALLS), '14-UM-002']) {
    let best = { gap: Infinity, id: null }
    for (const record of plaza.records) {
      if (record.id === id || parentOf(record.id) === id) continue
      // 伞桌整套是一个刚体，彼此之间不算净距。
      if (moved.has(id) && moved.has(record.id) && UMBRELLA_SET.includes(id) && UMBRELLA_SET.includes(record.id)) continue
      const gap = polyGap(prints.get(id), prints.get(record.id))
      if (gap < best.gap) best = { gap, id: record.id }
    }
    table.push(`${id} -> ${best.id} ${best.gap.toFixed(3)} m`)
    assert.ok(best.gap >= .6, `${id} nearest ${best.id} gap ${best.gap}`)
  }
  assert.equal(table.length, 5)
  // 碰撞代理：4 个摊位与 2 根伞柱在真实碰撞引擎里挡住行人。
  for (const [id, want] of Object.entries(STALLS)) assert.ok(collision.hit(want.xM - 26, 18 - want.yM), id)
  for (const pole of layout.r1.elements.filter(item => item.category === '伞柱')) assert.ok(collision.hit(pole.xM - 26, 18 - pole.yM), pole.id)
  // 中间步道（Z14）与正门两侧步道仍然通行。
  for (const id of ['Z14', 'entry_left', 'entry_right']) {
    const route = layout.r1.routes.find(value => value.id === id)
    assert.ok(route, id)
    for (let j = 1; j < route.points_m.length; j++) {
      const a = route.points_m[j - 1], b = route.points_m[j]
      for (let k = 0; k <= 40; k++) {
        const x = a[0] + (b[0] - a[0]) * k / 40, y = a[1] + (b[1] - a[1]) * k / 40
        assert.equal(collision.hit(x - 26, 18 - y), null, `${id} ${x},${y}`)
      }
    }
  }
  plaza.dispose()
  assert.equal(collision.stats().bodies, 0)
})

const fanAssets = () => ({ furn: Object.fromEntries(['desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded'].map(name => [name, Object.assign(new THREE.Group(), { name })])) })
const fanPlaceFurniture = (_A, name, x, z, { y = 0, rotY = 0 } = {}) => {
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  mesh.position.y = .5; group.add(mesh); group.position.set(x, y, z); group.rotation.y = rotY
  return { group, size: new THREE.Vector3(1, 1, 1), name }
}

test('I6C-2 I3 draws the shifted region 14 round table and chairs at their deviated positions', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const furniture = buildR1Furniture({ THREE, root, layout, collision, A: fanAssets(), placeFurniture: fanPlaceFurniture, makeScreenTexture: () => ({ ctx: {}, tex: { dispose() {} } }) })
  for (const id of ['14-T-002', '14-CH-005', '14-CH-006', '14-CH-007', '14-CH-008']) {
    const box = furniture.itemBounds.get(id)
    assert.ok(box?.isBox3, id)
    const centre = box.getCenter(new THREE.Vector3()), raw = rawOf(id)
    near(centre.x, raw.xM + SHIFT.dxM - 26, .005)
    near(centre.z, 18 - (raw.yM + SHIFT.dyM), .005)
  }
  furniture.dispose()
})

// MOVE R5 changes one coordinate in the existing four-entry bench table; no new data rows.
test('MOVE R5 bench override count and exact positional exception remain frozen', () => {
  assert.equal(R1_BOARD_FACING_OVERRIDES.length, 4)
  assert.deepEqual(R1_BOARD_FACING_OVERRIDES.filter(e => 'xM' in e.to).map(e => [e.id, e.from.xM, e.to.xM]), [['14-BN-003', 49, 48.5]])
})
