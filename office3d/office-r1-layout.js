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
])
const BOARD_PATCH = new Map(R1_BOARD_OVERRIDES.map(entry => [entry.id, entry.to]))

export function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {
  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()
  // 先按 C-01 候选替换，再叠董事会偏离：两张表的 ID 不相交，顺序只为可复现。
  const deviate = item => { const patch = BOARD_PATCH.get(item.id); return patch ? Object.freeze({ ...item, ...patch }) : item }
  return Object.freeze({ candidateC01, data: R1_DATA, elements: Object.freeze(R1_DATA.elements.map(item => deviate(replacements.get(item.id) || item))), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes: R1_DATA.routes })
}
