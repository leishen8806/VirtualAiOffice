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
// 董事会 2026-10-29："广场的长椅子方向反了"。登记朝向背对广场圆环，原地转 180°，面向广场；占地不变。
// 单独成表；MOVE R5 另批准 BN-003 向西平移 0.50 m，其余三张仍原地转向。
const BENCH_REASON = '董事会 2026-10-29："广场的长椅子方向反了"；原地转 180°，面向广场圆环与喷泉'
const benchFlip = (id, from, to, reason = BENCH_REASON) => Object.freeze({ id, date: '2026-10-29', reason, from: Object.freeze(from), to: Object.freeze(to) })
export const R1_BOARD_FACING_OVERRIDES = Object.freeze([
  benchFlip('14-BN-001', { yawDeg: 0, facingLocal: [0, -1] }, { yawDeg: 180, facingLocal: Object.freeze([0, 1]) }),
  benchFlip('14-BN-002', { yawDeg: 0, facingLocal: [0, -1] }, { yawDeg: 180, facingLocal: Object.freeze([0, 1]) }),
  benchFlip('14-BN-003', { xM: 49, yawDeg: 90, facingLocal: [1, 0] }, { xM: 48.5, yawDeg: 270, facingLocal: Object.freeze([-1, 0]) }, `${BENCH_REASON}；MOVE R5：长椅与花境重叠，向西平移 0.50 m`),
  benchFlip('14-BN-004', { yawDeg: 0, facingLocal: [0, -1] }, { yawDeg: 180, facingLocal: Object.freeze([0, 1]) }),
])
const BOARD_PATCH = new Map([...R1_BOARD_OVERRIDES, ...R1_BOARD_FACING_OVERRIDES].map(entry => [entry.id, entry.to]))
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

// ── 董事会批准的室内绿植树干改细（冻结）── OFFICE-R1-TRUNK
// 和上面几张表同一个道理：登记数值不得改，所以树干直径也只在这里一处覆盖。
// 覆盖面是 35 株室内登记绿植的 <id>-TR，判据与 r1-plants.js 第 27 行完全相同
// （category 为「植物总成」，排除区 14 广场的 10 株景观树与中央大榕树 07-PL-001）。
// 只进 lengthM / widthM 这两项（圆柱直径）；高度 1.0 m 与底高 0.45 m（盆顶）都不动，
// 树干照旧从盆顶接进冠里。盆、冠不进表；碰撞只挂在盆上（-POT 代理），树干本来就不进碰撞，
// 所以通行判定逐值不变。r1-plants.js 读的是合并后的元素，改这张表即可生效，渲染代码不用动。
const TRUNK_DATE = '2026-10-29'
const TRUNK_REASON = '董事会 2026-10-29："树干改细，走偏离表另开小卡"；室内 35 株登记绿植的树干由 Ø0.16 m 改细到 Ø0.05 m，高度、底高、冠、盆、位置与碰撞都不变'
// 0.05 m 是在近景机位上把 0.03 / 0.04 / 0.05 / 0.06 四档同机位拍出来实测选的：近景树干像素宽
// 由 0.16 m 的 24 px 降到 6 px，看得出是一根木质的茎，但不再是原来那根挡视线的深色柱子。
// 不取 0.03：区域远景里几乎看不见，绿植会变成「浮在空中的叶子」。
// 候选对比图与逐档像素量测见 review-artifacts/OFFICE-R1-TRUNK-R1-01/（对比-候选直径-tight.png）。
export const R1_TRUNK_DIAMETER_M = .05
// 株数不写死：按与 r1-plants.js 相同的判据从登记数据派生，登记数据若增减绿植这张表会跟着走；
// 条数恰好 35 条由 office-r1-trunk.test.mjs 的 TK-2 锁住。
const INDOOR_TRUNK_PLANTS = R1_DATA.elements.filter(row => row.category === '植物总成' && row.regionId !== '14' && row.id !== '07-PL-001')
export const R1_BOARD_TRUNK_OVERRIDES = Object.freeze(INDOOR_TRUNK_PLANTS.map(plant => {
  const raw = R1_DATA.elements.find(row => row.id === `${plant.id}-TR`)
  if (!raw) throw new Error(`R1 室内绿植 ${plant.id}: 登记数据里没有树干行 ${plant.id}-TR`)
  return override(raw.id, { lengthM: raw.lengthM, widthM: raw.widthM },
    { lengthM: R1_TRUNK_DIAMETER_M, widthM: R1_TRUNK_DIAMETER_M }, TRUNK_REASON, TRUNK_DATE)
}))
const TRUNK_PATCH = new Map(R1_BOARD_TRUNK_OVERRIDES.map(entry => [entry.id, entry.to]))

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
  // 先按 C-01 候选替换，再叠董事会偏离：各张偏离表的 ID 互不相交，顺序只为可复现。
  // 树干表只落在 <id>-TR 上，与位置表 / 门扇表的 ID 不相交。
  const deviate = item => { const patch = BOARD_PATCH.get(item.id) || GATE_PATCH.get(item.id) || TRUNK_PATCH.get(item.id); return patch ? Object.freeze({ ...item, ...patch }) : item }
  // 背墙改道（Z09 / Z13）已并进 mergedData.routes；喷泉只改 Z14 终点，两者不重叠。
  const routes = Object.freeze(mergedData.routes.map(route => ROUTE_PATCH.has(route.id)
    ? Object.freeze({ ...route, points_m: Object.freeze([...route.points_m.slice(0, -1), ROUTE_PATCH.get(route.id)]) }) : route))
  // 追加顺序固定：登记行 → 背墙门扇（OFFICE-R1-BACKWALL）→ 董事会新增件（本卡 R2）。
  return Object.freeze({ candidateC01, data: mergedData, elements: Object.freeze([...R1_DATA.elements.map(item => deviate(replacements.get(item.id) || item)), ...R1_BACKWALL.leaves, ...R1_BOARD_ADDED_ELEMENTS]), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes })
}
