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
const override = (id, from, to, reason, date = '2026-10-28') => Object.freeze({ id, date, reason, from: Object.freeze(from), to: Object.freeze(to) })
// 伞桌一套只平移 (ΔX, ΔY) = (−6.5, +2.6)：中心 (15, −8.6) → (8.5, −6.0)，整套相对位置不变。
const shifted = (id, xM, yM) => override(id, { xM, yM }, { xM: Number((xM - 6.5).toFixed(3)), yM: Number((yM + 2.6).toFixed(3)) }, SHIFT_REASON)
const stall = (id, from, to) => override(id, { xM: from[0], yM: from[1], yawDeg: 0, facingLocal: REGISTERED_FACING },
  { xM: to[0], yM: to[1], yawDeg: to[2], facingLocal: to[2] === 50 ? LEFT_FACING : RIGHT_FACING }, FAN_REASON)
// 接待台翻转后凹面在后方，椅子按原来的 0.4 m 规则整组前移到凹面里；朝向不变，所以只进 xM / yM。
const RECEP_REASON = '董事会 2026-10-28："前台的桌子反了。" 接待台 11-CT-001 翻转为凸面朝入口后，接待椅整组沿 −Y 平移 0.9 m 坐进凹面，离内半径弧 0.4 m（与翻转前的 0.4 m 规则相同）'
const reception = (id, xM, yM) => override(id, { xM, yM }, { xM, yM: Number((yM - .9).toFixed(3)) }, RECEP_REASON)

// ── 预留座位（冻结）──
// 董事会 2026-10-29："清点办公室座位数量，预留座位：Dr、苏晨、大旺"。
// 三个空工位在 Dr.life+ 工作室（区 08）东侧一排，朝向相同，与 Go / DB / React 组相邻；
// 登记数据不改，座位不派人（三把椅子都不在 25 条 workstations 里），椅子整把推进桌下。
// 走动卡（OFFICE-R1-MOVE）与 NPC 卡（I7B）读 isReservedSeat 判定，不得把人安排到这三个座位。
const RESERVED_REASON = '董事会 2026-10-29："清点办公室座位数量，预留座位：Dr、苏晨、大旺"；区 08 东侧一排三个空工位改为预留，座位不派人，椅子沿 +Y 推进桌下 0.26 m'
export const R1_RESERVED_TUCK_M = .26
export const R1_RESERVED_SEATS = Object.freeze([
  Object.freeze({ name: '苏晨', chair: '08-CH-011', desk: '08-T-011', date: '2026-10-29', reason: RESERVED_REASON }),
  Object.freeze({ name: 'Dr', chair: '08-CH-012', desk: '08-T-012', date: '2026-10-29', reason: RESERVED_REASON }),
  Object.freeze({ name: '大旺', chair: '08-CH-013', desk: '08-T-013', date: '2026-10-29', reason: RESERVED_REASON }),
])
const RESERVED_CHAIRS = new Set(R1_RESERVED_SEATS.map(row => row.chair))
const RESERVED_DESKS = new Set(R1_RESERVED_SEATS.map(row => row.desk))
// 子件 ID（-BACK / -BASE / -SEAT）算同一个座位，所以消费方拿到哪一级 ID 都判得出来。
export const isReservedSeat = chairId => RESERVED_CHAIRS.has(String(chairId ?? '').replace(/-(BACK|BASE|SEAT)$/, ''))
// 配对的桌子：r1-furniture 用它决定这三张桌上不放个人物品（显示器与键盘照常保留）。
// 桌面物件 ID 形如 `08-T-011/keyboard`，所以先把 `/…` 后缀切掉。
export const isReservedDesk = deskId => RESERVED_DESKS.has(String(deskId ?? '').split('/')[0])
// 推椅子是位置变更，所以照旧走偏离表一处覆盖；原值直接从登记行读，偏离表不会跟登记数据脱节。
// 推进量 0.26 m 是上限内取的值：再往前椅心离邻桌 08-T-0{14,15,16} 就不足 1.2 m，I3B 的桌椅配对会多出一把椅子。
const RESERVED_TUCK = R1_RESERVED_SEATS.flatMap(seat => ['', '-BACK', '-BASE', '-SEAT'].map(suffix => {
  const raw = R1_DATA.elements.find(row => row.id === `${seat.chair}${suffix}`)
  if (!raw) throw new Error(`R1 预留座位 ${seat.chair}${suffix}: 登记数据里没有这一行`)
  return override(raw.id, { xM: raw.xM, yM: raw.yM },
    { xM: raw.xM, yM: Number((raw.yM + R1_RESERVED_TUCK_M).toFixed(3)) }, RESERVED_REASON, seat.date)
}))

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
  ...RESERVED_TUCK,
])
const BOARD_PATCH = new Map(R1_BOARD_OVERRIDES.map(entry => [entry.id, entry.to]))

export function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {
  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()
  // 先按 C-01 候选替换，再叠董事会偏离：两张表的 ID 不相交，顺序只为可复现。
  const deviate = item => { const patch = BOARD_PATCH.get(item.id); return patch ? Object.freeze({ ...item, ...patch }) : item }
  return Object.freeze({ candidateC01, data: R1_DATA, elements: Object.freeze(R1_DATA.elements.map(item => deviate(replacements.get(item.id) || item))), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes: R1_DATA.routes })
}
