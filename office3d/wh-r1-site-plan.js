import { WH_R1_ASSIGNMENT, WH_R1_DATA } from './wh-r1/data.js'

const frozenRows = rows => Object.freeze(rows.map(row => Object.freeze(row)))

export const WH_R1_PARKING_BAYS = frozenRows([
  { id: 'WH-01-VH-001', doorId: 'WH-01-D-002', xM: 9.5, yM: 56.8, displayXM: 9.5, displayYM: 52.55, yawDeg: 270, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-01-VH-002', doorId: 'WH-01-D-003', xM: 15, yM: 56.8, displayXM: 15, displayYM: 52.55, yawDeg: 270, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-01-VH-003', doorId: 'WH-01-D-004', xM: 20.5, yM: 56.8, displayXM: 20.5, displayYM: 52.55, yawDeg: 270, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-01-VH-004', doorId: 'WH-01-D-005', xM: 26, yM: 56.8, displayXM: 26, displayYM: 52.55, yawDeg: 270, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-01-VH-005', doorId: 'WH-01-D-001', xM: 4, yM: 56.8, displayXM: 4, displayYM: 52.55, yawDeg: 270, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-06-VH-001', doorId: 'R5-SHIP-D-1', xM: 120.8, yM: 16, displayXM: 116.55, displayYM: 16, yawDeg: 180, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-06-VH-002', doorId: 'R5-SHIP-D-2', xM: 120.8, yM: 23, displayXM: 116.55, displayYM: 23, yawDeg: 180, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-06-VH-003', doorId: 'R5-SHIP-D-3', xM: 120.8, yM: 30, displayXM: 116.55, displayYM: 30, yawDeg: 180, lengthM: 16.5, widthM: 2.55, heightM: 4 },
  { id: 'WH-06-VH-004', doorId: 'R5-SHIP-D-4', xM: 120.8, yM: 37, displayXM: 116.55, displayYM: 37, yawDeg: 180, lengthM: 16.5, widthM: 2.55, heightM: 4 },
])

export const WH_R1_ANNEX = Object.freeze({
  bboxSource: Object.freeze([88, 12, 112, 42]),
  floorLevel: 'UNKNOWN',
  connectionDoorId: 'WH-14-D-001',
  walls: frozenRows([
    { id: 'R5-SHIP-W-N', xM: 100, yM: 41.86, lengthM: 24, widthM: .28, heightM: 4.5, yawDeg: 0 },
    { id: 'R5-SHIP-W-S', xM: 100, yM: 12.14, lengthM: 24, widthM: .28, heightM: 4.5, yawDeg: 0 },
    { id: 'R5-SHIP-W-E-2', xM: 111.86, yM: 12.95, lengthM: 1.9, widthM: .28, heightM: 4.5, yawDeg: 90 },
    { id: 'R5-SHIP-W-E-3', xM: 111.86, yM: 19.5, lengthM: 2.8, widthM: .28, heightM: 4.5, yawDeg: 90 },
    { id: 'R5-SHIP-W-E-4', xM: 111.86, yM: 26.5, lengthM: 2.8, widthM: .28, heightM: 4.5, yawDeg: 90 },
    { id: 'R5-SHIP-W-E-5', xM: 111.86, yM: 33.5, lengthM: 2.8, widthM: .28, heightM: 4.5, yawDeg: 90 },
    { id: 'R5-SHIP-W-E-END', xM: 111.86, yM: 40.55, lengthM: 2.9, widthM: .28, heightM: 4.5, yawDeg: 90 },
  ]),
  doors: frozenRows([16, 23, 30, 37].map((yM, index) => ({ id: `R5-SHIP-D-${index + 1}`, xM: 111.86, yM, lengthM: 4.2, widthM: .18, heightM: 4.5, yawDeg: 90, sweep: 'UNKNOWN' }))),
})

const i7 = new Set(WH_R1_ASSIGNMENT.filter(row => row.card === 'I7').map(row => row.id))
const logisticsOverride = row => {
  if (row.id === 'WH-14-BED-001') return { ...row, xM: 154.5, yM: 6 }
  if (row.id === 'WH-14-GT-001') return { ...row, xM: 158.5, yM: 6, yawDeg: 90 }
  if (row.id.startsWith('WH-14-PL-001')) return { ...row, xM: 155, yM: 1 }
  if (row.id.startsWith('WH-14-PL-002')) return { ...row, xM: 155, yM: 11 }
  return row
}
export const WH_R1_I7_ROWS = frozenRows(WH_R1_DATA.elements.filter(row => i7.has(row.id)).map(logisticsOverride))

export const WH_R1_RESERVED_YARDS = frozenRows([
  { id: 'WH-R1-NORTH-HEAD-YARD', label: '北侧 30 m 车头空场 · 规划预留', bboxSource: Object.freeze([-6, 74, 34, 104]) },
  { id: 'WH-R1-EAST-HEAD-YARD', label: '东侧 30 m 车头空场 · 规划预留', bboxSource: Object.freeze([130, 12, 160, 42]) },
])

export const WH_R1_DEVIATIONS = Object.freeze([
  Object.freeze({ id: 'WH-R1-WORLD-ORIGIN', date: '2026-10-31', from: 'xM - 168', to: 'xM - 232', reason: '仓配整组西移 64 m，东边界保持 -72，与办公室绿带保持 32 m' }),
  Object.freeze({ id: 'WH-14-D-001', date: '2026-10-31', from: '外部车辆接口', to: '主仓与东侧附建区连接口', reason: '外部靠泊转移到 R5-SHIP-D-1…4' }),
  Object.freeze({ id: 'WH-R1-PARKING-BAYS', date: '2026-10-31', from: '9 辆 8 m 登记车位', to: '9 个 16.5 m 半挂规划车位', reason: '董事会批准扩地，现有 8 m 展示车车尾对门，B2 再替换半挂模型' }),
  Object.freeze({ id: 'WH-14-LOGISTICS-GATE', date: '2026-10-31', from: '原东侧 8 m 物流带', to: '新地块东边物流出入口标示', reason: '附建区与东侧空场取代原侧向物流带；不代表已验证道路' }),
])

export function whR1VehicleForSite(row) {
  const bay = WH_R1_PARKING_BAYS.find(item => item.id === row.id)
  return bay ? Object.freeze({ ...row, xM: bay.displayXM, yM: bay.displayYM, yawDeg: bay.yawDeg }) : row
}
