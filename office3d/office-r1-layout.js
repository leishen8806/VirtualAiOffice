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

// ── 董事会批准的后墙与门新增（冻结）── OFFICE-R1-BACKWALL
// R1 登记数据只在区 11 背后有墙（00-W-034…038，Y = 9），区 10（咖啡与交流）与区 12（休闲会客）
// 的后沿 Y = 9.5 是空的。这里按相邻隔墙 00-W-032 / 033 的规格补两段玻璃隔墙，各开一樘 2.0 m
// 平移门；office-r1/data.js 与 MANIFEST 保持原样，新增项只在本文件与登记数据合并。
const BACKWALL_DATE = '2026-10-29'
const BACKWALL_REASON = '董事会 2026-10-29："第二张图的红线这里，是有墙和门的存在"；区 10 与区 12 后沿 Y = 9.5 补齐隔墙与平移门'
const BACKWALL_Y = 9.5, BACKWALL_HEIGHT = 2.7, BACKWALL_THICKNESS = .1, BACKWALL_DOOR_WIDTH = 2, BACKWALL_LEAF_WIDTH = 1, BACKWALL_JAMB = .1
const backwallPoint = xM => Object.freeze([xM, BACKWALL_Y])
const backwallDoor = (id, regionId, xM, stackDirection) => Object.freeze({
  category: '门洞/门总成', facingLocal: Object.freeze([0, -1]), geometry: null, heightM: BACKWALL_HEIGHT, id,
  lengthM: BACKWALL_DOOR_WIDTH, parentId: null, regionId, status: 'PROPOSED', unknown: false, widthM: BACKWALL_THICKNESS,
  xM, yM: BACKWALL_Y, yawDeg: 0, zM: 0,
  // 两扇都叠放到离墙角远的一侧（区 10 往 +X，区 12 往 −X），停靠面退到大厅一侧，与 11-D-002 / 003 同向。
  stackDirection, parkNormalSign: -1, boardDate: BACKWALL_DATE, boardReason: BACKWALL_REASON,
})
const backwallWall = (id, x0, x1, door) => Object.freeze({
  category: '墙体', facingLocal: Object.freeze([0, -1]),
  geometry: Object.freeze({
    exterior: false, height: BACKWALL_HEIGHT, inside_side: null,
    openings: Object.freeze([Object.freeze({ doorId: door.id, fromM: backwallPoint(door.xM - door.lengthM / 2), toM: backwallPoint(door.xM + door.lengthM / 2) })]),
    points: Object.freeze([backwallPoint(x0), backwallPoint(x1)]), thickness: BACKWALL_THICKNESS, type: 'wall',
  }),
  heightM: BACKWALL_HEIGHT, id, lengthM: x1 - x0, parentId: null, regionId: '00', status: 'PROPOSED', unknown: false,
  widthM: BACKWALL_THICKNESS, xM: (x0 + x1) / 2, yM: BACKWALL_Y, yawDeg: 0, zM: 0, boardDate: BACKWALL_DATE, boardReason: BACKWALL_REASON,
})
const backwallFaces = wall => ['A', 'B'].map(side => Object.freeze({
  endM: wall.geometry.points[1], heightM: wall.heightM, id: `${wall.id}-${side}`, lengthM: wall.lengthM,
  openingAreaM2: BACKWALL_DOOR_WIDTH * wall.heightM, side, source: `董事会 ${BACKWALL_DATE} 偏离；非实测`,
  startM: wall.geometry.points[0], status: 'PROPOSED', thicknessM: wall.widthM, wallId: wall.id,
}))
const backwallLeaves = door => [0, 1].map(index => Object.freeze({
  category: '门扇', facingLocal: door.facingLocal, geometry: null, heightM: door.heightM, id: `${door.id}-LF${index + 1}`,
  lengthM: BACKWALL_LEAF_WIDTH, parentId: door.id, regionId: door.regionId, status: 'PROPOSED', unknown: false, widthM: .05,
  xM: door.xM + (index ? .5 : -.5) * BACKWALL_LEAF_WIDTH, yM: BACKWALL_Y, yawDeg: 0, zM: 0,
}))
// 口径与登记门一致：净宽 = 名义宽 − 两侧门樘各 0.1 m。
const backwallTargetFrames = door => ['a', 'b'].map((side, index) => Object.freeze({
  a_m: backwallPoint(door.xM - door.lengthM / 2), b_m: backwallPoint(door.xM + door.lengthM / 2),
  basis: 'nominal_minus_clear_split_equally', clear_target_m: door.lengthM - BACKWALL_JAMB * 2, door_id: door.id,
  geometry_m: Object.freeze({ base: 0, cx: door.xM + (index ? 1 : -1) * (door.lengthM / 2 - BACKWALL_JAMB / 2), cy: BACKWALL_Y, height: door.heightM, length: BACKWALL_JAMB, type: 'rect', width: BACKWALL_THICKNESS, yaw: 0 }),
  id: `${door.id}:target_frame_${side}`, jamb_width_each_m: BACKWALL_JAMB, nominal_width_m: door.lengthM, open_motion: 'UNVERIFIED',
}))
const backwallStates = door => [door.id, `${door.id}-LF1`, `${door.id}-LF2`].map(id =>
  Object.freeze({ closed_geometry: 'EXCLUDED_CONDITIONALLY', id, open_motion: 'NOT_RUN', open_parking: 'UNVERIFIED' }))
const BACKWALL_DOORS = Object.freeze([backwallDoor('10-D-002', '10', 8.4, 1), backwallDoor('12-D-002', '12', 47.6, -1)])
const BACKWALL_WALLS = Object.freeze([backwallWall('00-W-043', 6, 21, BACKWALL_DOORS[0]), backwallWall('00-W-044', 35, 50, BACKWALL_DOORS[1])])
// Z09 / Z13 原来在 X = 6.80 / 49.20 直接穿过 Y = 9.5；穿墙段移到门中心 8.4 / 47.6，其余登记点不变。
// Z13 不能像 Z09 那样一路直下：登记绿植 12-PL-003 (47.8, 7.7) 正好挡在 X = 47.6 上，所以在 Y = 8.7
// 折回登记点 (49.2, 7.8)（植物不动，净距 0.68 m > H2 半径 0.6 m）。
const BACKWALL_ROUTES = Object.freeze(new Map([
  ['Z09', Object.freeze([[25.7, -1], [25.7, .8], [23.9, 2.7], [23.9, 11], [20.2, 10.8], [18.8, 11.2], [16.8, 12], [8.4, 10.7], [8.4, 7.8], [6, 7.8], [5.275, 7.8]].map(Object.freeze))],
  ['Z13', Object.freeze([[30.3, -1], [30.3, .8], [32.1, 2.7], [32.1, 11], [47.6, 11], [47.6, 8.7], [49.2, 8.7], [49.2, 7.8], [50, 7.8], [50.725, 7.8]].map(Object.freeze))],
]))
export const R1_BACKWALL = Object.freeze({
  date: BACKWALL_DATE, reason: BACKWALL_REASON, walls: BACKWALL_WALLS, doors: BACKWALL_DOORS,
  wallFaces: Object.freeze(BACKWALL_WALLS.flatMap(backwallFaces)),
  leaves: Object.freeze(BACKWALL_DOORS.flatMap(backwallLeaves)),
  doorTargetFrames: Object.freeze(BACKWALL_DOORS.flatMap(backwallTargetFrames)),
  doorStateConditions: Object.freeze(BACKWALL_DOORS.flatMap(backwallStates)),
  routes: BACKWALL_ROUTES,
})

// ── 董事会批准的大门轨道抬高（冻结）── OFFICE-R1-BACKWALL 补充 R2
// 大门 11-D-001 的轨道原来横在门洞里，比门楣低 0.84 m。门扇由 2.7 m 抬到 3.5 m 后，轨道中心高
// = 门扇高 + 0.06 = 3.56 m，顶面正好贴齐门楣底面 3.6 m。门洞总成一起抬高：门樘上框按 heightM − 0.05
// 生成，留在 2.7 m 会把净高卡死在 2.6 m，BW-9 要求的 3.4 m 就无从谈起。data.js 与 MANIFEST 保持原样。
const GATE_DATE = '2026-10-29'
const GATE_REASON = '董事会 2026-10-29："推拉门的轨道改成与大门高度一致"；大门 11-D-001 门扇由 2.7 m 抬到 3.5 m，轨道中心高 3.56 m、顶面贴齐门楣底面 3.6 m，门柱外侧悬空的两端各加一根铜色细立杆'
const GATE_DOOR_ID = '11-D-001', GATE_HEIGHT = 3.5
// 托杆：0.06 m 见方，站在栅栏底座顶 0.3 m，顶到轨道底 3.52 m，两端各内缩 0.03 m 使杆身落在轨道跨度内。
// 轨道（z 17.80–17.88）与门扇停靠面（z 17.815–17.865）同心，而轨道长度正好等于门扇行程，所以立杆
// 没有既在轨道正下方又避开停靠门扇的位置；贴轨道朝建筑一侧的背面立（z 17.88–17.94），落在栅栏底座
// （z 17.90–18.10）上，与停靠的门扇留 15 mm。
const GATE_TRACK_POSTS = Object.freeze({ sizeM: .06, baseM: .3, insetM: .03, normalSign: 1 })
export const R1_GATE = Object.freeze({
  date: GATE_DATE, reason: GATE_REASON, doorId: GATE_DOOR_ID, heightM: GATE_HEIGHT, posts: GATE_TRACK_POSTS,
  leafIds: Object.freeze([`${GATE_DOOR_ID}-LF1`, `${GATE_DOOR_ID}-LF2`]),
})
const gateDoor = door => door.id === GATE_DOOR_ID
  ? Object.freeze({ ...door, heightM: GATE_HEIGHT, trackPosts: GATE_TRACK_POSTS, boardDate: GATE_DATE, boardReason: GATE_REASON })
  : door
const GATE_PATCH = new Map(R1_GATE.leafIds.map(id => [id, Object.freeze({ heightM: GATE_HEIGHT })]))

// 登记数据 + 偏离表合并后的墙 / 面 / 门 / 路线：下游（r1-shell、r1-doors、r1-decor）只读这一份。
const mergedData = Object.freeze({
  ...R1_DATA,
  walls: Object.freeze([...R1_DATA.walls, ...R1_BACKWALL.walls]),
  wallFaces: Object.freeze([...R1_DATA.wallFaces, ...R1_BACKWALL.wallFaces]),
  doors: Object.freeze([...R1_DATA.doors.map(gateDoor), ...R1_BACKWALL.doors]),
  doorTargetFrames: Object.freeze([...R1_DATA.doorTargetFrames, ...R1_BACKWALL.doorTargetFrames]),
  doorStateConditions: Object.freeze([...R1_DATA.doorStateConditions, ...R1_BACKWALL.doorStateConditions]),
  routes: Object.freeze(R1_DATA.routes.map(route => R1_BACKWALL.routes.has(route.id) ? Object.freeze({ ...route, points_m: R1_BACKWALL.routes.get(route.id) }) : route)),
})

export function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {
  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()
  // 先按 C-01 候选替换，再叠董事会偏离：三张表的 ID 不相交，顺序只为可复现。
  const deviate = item => { const patch = BOARD_PATCH.get(item.id) || GATE_PATCH.get(item.id); return patch ? Object.freeze({ ...item, ...patch }) : item }
  return Object.freeze({ candidateC01, data: mergedData, elements: Object.freeze([...R1_DATA.elements.map(item => deviate(replacements.get(item.id) || item)), ...R1_BACKWALL.leaves]), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes: mergedData.routes })
}
