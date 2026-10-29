import { C01_DELTA, R1_DATA } from './office-r1/data.js'

export const DEFAULT_CANDIDATE_C01 = true
const coordinate = value => Number(value.toFixed(6))
export const r1ToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM - 26), z: coordinate(18 - yM) })
export const r1ElementWorld = row => Object.freeze({ ...r1ToWorld(row.xM, row.yM), y: row.zM })
export const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }

// ── 董事会批准的登记位置偏离表（冻结）──
// R1 的登记数值一律不得改（通用规则 §1.4），所以董事会批准的位置变更只在这里一处覆盖，
// office-r1/data.js 与 MANIFEST 的数据哈希保持原样；每条带 ID / 原值 / 新值 / 原因 / 日期。
// 消费方（r1-plaza 的餐车·摊亭·伞，r1-furniture 的区 14 圆桌·椅子）都读 layout.r1.elements，无需改算法。
const FAN_REASON = '董事会 2026-10-28："摊位应该是‘八’字形的摆列"；广场两侧各一排，自正门向南斜向展开，每排与中线 X = 28 成 40°，柜台朝向中间步道'
const SHIFT_REASON = '董事会 2026-10-28：左侧遮阳伞桌一套（20 个 ID）整体平移到原餐车处，给"八"字形左排腾出场地；朝向与角度不变'
const LEFT_FACING = Object.freeze([.766, -.643]), RIGHT_FACING = Object.freeze([-.766, -.643]), REGISTERED_FACING = Object.freeze([0, -1])
const override = (id, from, to, reason) => Object.freeze({ id, date: '2026-10-28', reason, from: Object.freeze(from), to: Object.freeze(to) })
// 伞桌一套只平移 (ΔX, ΔY) = (−6.5, +2.6)：中心 (15, −8.6) → (8.5, −6.0)，整套相对位置不变。
const shifted = (id, xM, yM) => override(id, { xM, yM }, { xM: Number((xM - 6.5).toFixed(3)), yM: Number((yM + 2.6).toFixed(3)) }, SHIFT_REASON)
const stall = (id, from, to) => override(id, { xM: from[0], yM: from[1], yawDeg: 0, facingLocal: REGISTERED_FACING },
  { xM: to[0], yM: to[1], yawDeg: to[2], facingLocal: to[2] === 50 ? LEFT_FACING : RIGHT_FACING }, FAN_REASON)
// 接待台翻转后凹面在后方，椅子按原来的 0.4 m 规则整组前移到凹面里；朝向不变，所以只进 xM / yM。
const RECEP_REASON = '董事会 2026-10-28："前台的桌子反了。" 接待台 11-CT-001 翻转为凸面朝入口后，接待椅整组沿 −Y 平移 0.9 m 坐进凹面，离内半径弧 0.4 m（与翻转前的 0.4 m 规则相同）'
const reception = (id, xM, yM) => override(id, { xM, yM }, { xM, yM: Number((yM - .9).toFixed(3)) }, RECEP_REASON)
export const R1_BOARD_OVERRIDES = Object.freeze([
  stall('14-KS-001', [8, -6], [15.14, -3.88, 50]),
  stall('14-KS-002', [42, -6], [12.44, -7.1, 50]),
  stall('14-KS-003', [45.2, -6], [40.86, -3.88, 310]),
  stall('14-KS-004', [48.4, -6], [43.17, -6.64, 310]),
  shifted('14-UM-002', 15, -8.6), shifted('14-UM-002-CANOPY', 15, -8.6), shifted('14-UM-002-POLE', 15, -8.6), shifted('14-T-002', 15, -8.6),
  shifted('14-CH-005', 16, -8.6), shifted('14-CH-005-BACK', 16.222, -8.6), shifted('14-CH-005-BASE', 16, -8.6), shifted('14-CH-005-SEAT', 16, -8.6),
  shifted('14-CH-006', 15, -7.6), shifted('14-CH-006-BACK', 15, -7.378), shifted('14-CH-006-BASE', 15, -7.6), shifted('14-CH-006-SEAT', 15, -7.6),
  shifted('14-CH-007', 14, -8.6), shifted('14-CH-007-BACK', 13.778, -8.6), shifted('14-CH-007-BASE', 14, -8.6), shifted('14-CH-007-SEAT', 14, -8.6),
  shifted('14-CH-008', 15, -9.6), shifted('14-CH-008-BACK', 15, -9.822), shifted('14-CH-008-BASE', 15, -9.6), shifted('14-CH-008-SEAT', 15, -9.6),
  reception('11-CH-001', 28, 5.8), reception('11-CH-001-BASE', 28, 5.8), reception('11-CH-001-SEAT', 28, 5.8), reception('11-CH-001-BACK', 28, 6.022),
])
const BOARD_PATCH = new Map(R1_BOARD_OVERRIDES.map(entry => [entry.id, entry.to]))
export const R1_BOARD_ROUTE_OVERRIDES = Object.freeze([
  Object.freeze({ id: 'Z14', date: '2026-10-29', reason: '董事会 2026-10-29 广场中心建喷泉',
    from: Object.freeze([28, -10]), to: Object.freeze([28, -5]) }),
])
const ROUTE_PATCH = new Map(R1_BOARD_ROUTE_OVERRIDES.map(entry => [entry.id, entry.to]))

// ── 董事会新增件表（冻结）──
// 和上面的偏离表同一个道理：登记数值不得改，所以董事会在验收里新加的实体也不进 office-r1/data.js，
// 只在这里登记，每条带尺寸 / 位置 / 朝向 / 原因 / 日期；createR1Layout 把它们追加到 elements 末尾，
// 字段与 data.js 的登记行一致，消费方（r1-furniture 等）照常按 category 读，不用改算法。
const ADDED_SHELF_REASON = '董事会 2026-10-29："这面墙可以摆放一个书架（堆满互联网、AI 相关书籍）"，指 Dr.life+ 工作室（区 08）东侧外墙 00-W-002 内侧那段空墙'
export const R1_BOARD_ADDED_ELEMENTS = Object.freeze([
  Object.freeze({
    category: '书架', facingLocal: Object.freeze([-1, 0]), geometry: null, heightM: 2.2, id: '08-BK-002',
    lengthM: 6, parentId: null, regionId: '08', status: 'BOARD_ADDED', unknown: false, widthM: .4,
    // 背面与墙内侧面贴平：00-W-002 登记 X = 56、厚 .2，内侧面在 X = 55.9，深 .4 ⇒ 中心 X = 55.9 − .2 = 55.7。
    // 补充卡写的是"约 55.65"，那样背面离墙 5 cm，超过"≤ 2 cm"的硬判据，所以取 55.7，差 5 cm 在"约"的范围内。
    xM: 55.7, yM: 15.6,
    // 长边沿 Y、正面朝西（朝办公区）：yawFor 取 −yawDeg，yawDeg = 90 把局部长度轴转到世界 Z、深度轴转向 −X。
    yawDeg: 90, zM: 0,
    date: '2026-10-29', reason: ADDED_SHELF_REASON,
  }),
])

export function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {
  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()
  // 先按 C-01 候选替换，再叠董事会偏离：两张表的 ID 不相交，顺序只为可复现。
  const deviate = item => { const patch = BOARD_PATCH.get(item.id); return patch ? Object.freeze({ ...item, ...patch }) : item }
  const routes = Object.freeze(R1_DATA.routes.map(route => ROUTE_PATCH.has(route.id)
    ? Object.freeze({ ...route, points_m: Object.freeze([...route.points_m.slice(0, -1), ROUTE_PATCH.get(route.id)]) }) : route))
  return Object.freeze({ candidateC01, data: R1_DATA, elements: Object.freeze([...R1_DATA.elements.map(item => deviate(replacements.get(item.id) || item)), ...R1_BOARD_ADDED_ELEMENTS]), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes })
}
