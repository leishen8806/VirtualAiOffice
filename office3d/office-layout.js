// 空间坐标与门洞是渲染、碰撞和验证的共同来源；房间不开敞口。
export const ENVELOPE = { x0: -44, x1: 22, z0: -13, z1: 13 }
export const MAIN_FLOOR_X0 = -22 // 建筑接缝不随内部房间平移。
export const CORRIDORS = { horizontal: { z0: -4, z1: 0 }, vertical: { x0: 0, x1: 4 } }
export const CORRIDOR_X = (CORRIDORS.vertical.x0 + CORRIDORS.vertical.x1) / 2
// 形象墙两侧各退让2米，保留8米宽展示区；主走道保持4米。
export const LOGO_AREA = { x0: CORRIDORS.vertical.x0 - 2, x1: CORRIDORS.vertical.x1 + 2, z0: -12, z1: -4 }
export const CROSS_Z = (CORRIDORS.horizontal.z0 + CORRIDORS.horizontal.z1) / 2
export const FOYER_Z = 8
export const AISLE_OFFSET = 1.5
export const ENTRANCE = { x0: CORRIDOR_X - 4, x1: CORRIDOR_X + 4, inner: { x: CORRIDOR_X, z: 12 }, gate: [{ x: CORRIDOR_X, z: 13.5 }, { x: CORRIDOR_X, z: 16.5 }] }
export const FOYER_RECEPTION = { x0: 8.5, x1: 14.5, z0: 8.5, z1: 9.5 }
export const RECEPTION = { x: CORRIDOR_X, z: 5.5, width: 5.5, z0: 3.8, z1: 6.5, bypassX: -2 }
const room = (id, name, x0, x1, north, doorX = (x0 + x1) / 2) => ({ id, name, x0, x1, z0: north ? -12 : 0, z1: north ? -4 : 8, doors: [{ side: north ? 'south' : 'north', at: doorX, width: 2 }] })
export const OFFICE_ROOMS = [
  room('product', '产品与设计', -27.5, -16.5, true),
  room('eng', '工程办公室', -16.5, -7.5, true),
  room('quality', '质量与安全', -22, -11, false),
  room('drlife', 'Dr.life+ 工作室', LOGO_AREA.x1, 22, false),
  room('board', '董事会', LOGO_AREA.x1, 22, true, 16),
  room('kb', '知识中心', -33, -27.5, true, -30.5),
  room('ops', '运维办公室', -33, -22, false),
  room('review', '评审室', -44, -33, true),
  room('plan', '计划室', -44, -33, false),
]
export const SEATS = {
  Lead: ['product', -25.5, -9], PM: ['product', -23, -9], Architect: ['product', -20.5, -9], UIUX: ['product', -18, -9],
  FrontendSenior: ['eng', -14.5, -10.5], Frontend1: ['eng', -12, -10.5], Frontend2: ['eng', -10, -10.5],
  BackendSenior: ['eng', -14.5, -7], Backend1: ['eng', -12, -7], Backend2: ['eng', -10, -7],
  QAAutomation: ['quality', -20, 3.5], Reviewer1: ['quality', -17.5, 3.5], Reviewer2: ['quality', -15, 3.5], SecurityReviewer: ['quality', -12.5, 3.5],
  GoSenior: ['drlife', 8.5, 1.5], Go1: ['drlife', 12, 1.5], Go2: ['drlife', 15.5, 1.5], DBEngineer: ['drlife', 19, 1.5],
  LedgerAuditor: ['drlife', 8.5, 5], ReactSenior: ['drlife', 12, 5], React1: ['drlife', 15.5, 5], Localizer: ['drlife', 19, 5],
  OpsLead: ['ops', -30.5, 4], OpsEngineer: ['ops', -25.5, 4], KnowledgeKeeper: ['kb', -30.5, -8],
}
export const workHome = ([, x, z]) => ({ x, z: z + 1, yaw: 0 })
export const BOSS = { desk: { x: 20, z: -8 }, chair: { x: 21, z: -8 }, stand: { x: 18.5, z: -8 }, via: [{ x: 16, z: -5.5 }, { x: 18.5, z: -5.5 }] }
export const BOARD_TABLE = { x: 11, z: -8 }
export const BOARD_DOOR = { x: OFFICE_ROOMS.find(r => r.id === 'board').doors[0].at, zOut: CROSS_Z, zIn: -5.5 }
export const MEETING_ROOMS = ['review', 'plan'].map((id, i) => ({ ...OFFICE_ROOMS.find(r => r.id === id), id: i ? 'B' : 'A', officeId: id, n: i ? 6 : 8 }))
export const MEETING_SEATS = MEETING_ROOMS.flatMap(r => {
  const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, per = r.n === 8 ? [-1.5, 0, 1.5] : [-1.5, 1.5]
  return [...per.flatMap(dx => [{ x: x + dx, z: z - 2, yaw: Math.PI }, { x: x + dx, z: z + 2, yaw: 0 }]),
    { x: x - (r.n === 8 ? 3.5 : 3), z, yaw: -Math.PI / 2 }, { x: x + (r.n === 8 ? 3.5 : 3), z, yaw: Math.PI / 2 }]
    .map(s => ({ ...s, room: r.id, meeting: true, viaZ: s.z <= z ? z - 3 : z + 3 }))
})
export const REGION_FOCUS = Object.fromEntries(OFFICE_ROOMS.map(r => [r.id, { label: ({ eng: '工程', ops: '运维', kb: '知识库' })[r.id] || r.name, t: [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2], r: r.x1 - r.x0 > 11 ? 20 : 14 }]))
REGION_FOCUS.meet = { label: '会议室', t: [REGION_FOCUS.review.t[0], 0, -2], r: 24 }
// DR广场：正门外的铺装空地（2026-10-19 董事会命名）。以主竖走道中线为轴，南北深 14 米，不含台阶和建筑底座。
export const PLAZA = { id: 'plaza', name: 'DR广场', x0: CORRIDOR_X - 12, x1: CORRIDOR_X + 12, z0: 16, z1: 30 }
// 董事会固定完整 28 × 12 m = 336 ㎡ 仓库主体，不得为接缝压缩。
export const WAREHOUSE = Object.freeze({ x0: -42, x1: -14, z0: 17, z1: 29 })
export const DOCK = Object.freeze({ x0: -42, x1: -14, z0: 29, z1: 31.5 })
export const PARKING = Object.freeze({ x0: -42, x1: -14, z0: 31.5, z1: 35.5 })
export const WEST_WALK = Object.freeze({ x0: WAREHOUSE.x1, x1: PLAZA.x0, z0: PLAZA.z0, z1: 35.5 })
export const SERVICE_PASSAGE = Object.freeze({ x0: ENVELOPE.x0, x1: PLAZA.x0, z0: ENVELOPE.z1, z1: WAREHOUSE.z0 })
export const CAMPUS_PAVING = Object.freeze({ x0: -46, x1: PLAZA.x0, z0: ENVELOPE.z1, z1: PARKING.z1 })
export const LOGISTICS_GATE_ZONE = Object.freeze({ x0: -46, x1: -44, z0: 30, z1: 35 })
export const WAREHOUSE_FOCUS = Object.freeze({ label: 'DR 仓库', t: Object.freeze([-28, 0, 23]), r: 26 })
const warehouseItem = (id, name, x0, x1, z0, z1, yaw = 0, blocksFloor = true) => Object.freeze({
  id, name, x0, x1, z0, z1,
  center: Object.freeze({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 }),
  size: Object.freeze({ x: x1 - x0, z: z1 - z0 }),
  yaw, blocksFloor, personAccessible: false,
})
export const WAREHOUSE_ITEMS = Object.freeze([
  warehouseItem('w1_rack_a', 'W1 高位货架 A', -40.5, -36.5, 19, 24),
  warehouseItem('w1_rack_b', 'W1 高位货架 B', -34.5, -30.5, 19, 24),
  warehouseItem('w1_rack_c', 'W1 高位货架 C', -28.5, -24.5, 19, 24),
  warehouseItem('w1_rack_d', 'W1 高位货架 D', -22.5, -18.5, 19, 24),
  warehouseItem('w2_sort', 'W2 分单台', -40.5, -38.5, 25.5, 27.5),
  warehouseItem('w2_review', 'W2 复核台', -36.5, -34.5, 25.5, 27.5),
  warehouseItem('w2_pack', 'W2 包装台', -32.5, -30.5, 25.5, 27.5),
  warehouseItem('w2_aftercare', 'W2 售后暂存台', -28.5, -26.5, 25.5, 27.5),
  warehouseItem('w3_stack_a', 'W3 工程集货堆 A', -17.5, -15.5, 19, 22),
  warehouseItem('w3_stack_b', 'W3 工程集货堆 B', -17.5, -15.5, 23, 26),
  warehouseItem('w3_forklift_bay', 'W3 叉车停靠点', -24.5, -21.5, 25.5, 27.5),
  warehouseItem('dock_buffer_a', '装卸月台缓冲 A', -40.5, -33.5, 29.5, 30.5),
  warehouseItem('dock_buffer_b', '装卸月台缓冲 B', -31.5, -24.5, 29.5, 30.5),
  warehouseItem('dock_buffer_c', '装卸月台缓冲 C', -22.5, -15.5, 29.5, 30.5),
  warehouseItem('truck_bay_1', '卡车泊位一', -40.5, -34.5, 32, 35),
  warehouseItem('truck_bay_2', '卡车泊位二', -32.5, -26.5, 32, 35),
  warehouseItem('service_parking', '作业车辆泊位', -24.5, -20.5, 32, 35, 0, false),
  warehouseItem('logistics_sign', '物流入口导视牌', -18, -16, 32.5, 33.5, 0, false),
  warehouseItem('west_green', '西侧隔离绿化', -45.5, -44.5, 18, 27),
  warehouseItem('logistics_gate', '物流出入口', -46, -44, 30, 35, 0, false),
  warehouseItem('warehouse_sign', 'DR 仓库门牌', -30, -26, 17, 18, 0, false),
  warehouseItem('supply_panel', '商品供给面板', -15, -14, 20, 23, 90, false),
])
const zone = (id, name, x0, x1, z0, z1, note, center = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }) => ({ id, name, x0, x1, z0, z1, center, note })
export const FOYER_ZONES = [
  zone('A1', '咖啡吧', -44, -31, 8, 13, '沿北边布吧台，排队沿南边横向展开'),
  zone('A2', '自助零食', -31, -15, 8, 13, '售货机与零食柜贴北边，小桌靠东'),
  zone('lounge', '休息交流区', -14, -5, 8.5, 12.5, '现有休息区原位保留'),
  zone('foyer_buffer', '入口门厅缓冲区', -5, 8, 8, 13, '不放家具，主通道保持畅通'),
  zone('desk', '前厅服务与等候区', 8, 22, 8, 13, '前厅服务台面向入口'),
  zone('plaza_service', '广场北侧服务带', -10, -4, 16, 18.5, '自行车架与路灯，不侵入门洞', { x: -7, z: 17 }),
  zone('B0', '西侧咖啡区', -10, -4, 18.5, 29, '咖啡车和两张露天桌', { x: -7, z: 23.5 }),
  zone('circle', '中央开阔圆', -2, 6, 19, 27, '直径八米，区域内无实体摆件'),
  zone('B1', '东北摊位区', 8, 14, 16.5, 21.5, '摊位朝西，队列留在西侧'),
  zone('B2', '东中摊位区', 8, 14, 21.5, 24.5, '队列拆成两排，避开中央圆'),
  zone('B3', '东南摊位区', 8, 14, 24.5, 29.5, '与南侧绿化只接边'),
  zone('south_green', '南侧绿化带', -10, 14, 29, 30, '主通道保持为空，花坛分列两侧'),
]
const item = (id, zone, name, x0, x1, z0, z1, facing, blocksFloor = true) => ({ id, zone, name, x0, x1, z0, z1, center: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, z: z1 - z0 }, facing, blocksFloor })
export const FOYER_ITEMS = [
  item('a1_counter', 'A1', 'A1 咖啡吧台', -43, -34, 8.5, 9.5, 'S'), item('a1_stools', 'A1', 'A1 高脚凳组', -42.5, -35.5, 10, 11, 'N'),
  item('a2_vending_wall', 'A2', 'A2 售货机墙', -30, -26, 8.5, 9.5, 'S'), item('a2_snack_cabinet', 'A2', 'A2 零食柜', -24.5, -22.5, 8.5, 9.5, 'S'), item('a2_table', 'A2', 'A2 小桌', -20.5, -18.5, 9.5, 10.5, 'ALL'),
  item('lounge_west_sofa', 'lounge', '休息区西沙发', -13.5, -11.5, 9, 12, 'E'), item('lounge_coffee_table', 'lounge', '休息区茶几', -10.5, -8.5, 9.5, 11.5, 'NONE'), item('lounge_east_sofa', 'lounge', '休息区东沙发', -7.5, -5.5, 9, 12, 'W'),
  item('reception_desk', 'desk', '前厅服务台', 8.5, 14.5, 8.5, 9.5, 'S'), item('handoff_box', 'desk', '交办箱', 14.5, 15.5, 9, 10, 'S'), item('notice_attendance_wall', 'desk', '公告/出勤墙', 16, 21, 8, 9, 'S', false), item('waiting_sofa', 'desk', '等候沙发', 16, 21, 10, 11, 'N'),
  item('plaza_bike_rack', 'plaza_service', '广场自行车架', -9, -5, 16.5, 17.5, 'E'), item('plaza_west_lamp', 'plaza_service', '广场西路灯', -10, -9, 17.5, 18.5, 'NONE'), item('plaza_east_lamp', 'plaza_service', '广场东路灯', 13, 14, 17.5, 18.5, 'NONE'),
  item('b0_coffee_cart', 'B0', 'B0 咖啡车', -9, -5, 19, 22, 'E'), item('b0_table_1', 'B0', 'B0 露天桌一', -9, -7, 23, 25, 'ALL'), item('b0_table_2', 'B0', 'B0 露天桌二', -6, -4, 25.5, 26.5, 'ALL'),
  item('b1_stall', 'B1', 'B1 市集摊位', 9, 13, 17.5, 20.5, 'W'), item('b2_stall', 'B2', 'B2 市集摊位', 9, 13, 21.5, 24.5, 'W'), item('b3_stall', 'B3', 'B3 市集摊位', 9, 13, 25.5, 28.5, 'W'),
  item('south_west_bench_1', 'south_green', '南侧西长椅一', -9.5, -6.5, 28, 29, 'N'), item('south_west_bench_2', 'south_green', '南侧西长椅二', -6.5, -3.5, 28, 29, 'N'),
  item('south_east_bench_1', 'B2', '南侧东长椅一', 13, 14, 21.5, 24.5, 'W'), item('south_east_bench_2', 'B3', '南侧东长椅二', 13, 14, 25.5, 28.5, 'W'),
  item('south_west_planter', 'south_green', '南侧西花坛', -10, -4, 29, 30, 'NONE'), item('south_east_planter', 'south_green', '南侧东花坛', 7, 14, 29, 30, 'NONE'),
]
export const FOYER_TARGETS = Object.fromEntries([
  ['a1_counter', -33.5, 10.5], ['a1_stools', -39, 11.5], ['a2_vending_wall', -25.5, 10], ['a2_snack_cabinet', -22, 10], ['a2_table', -19.5, 11.5],
  ['lounge_west_sofa', -11, 12.5], ['lounge_coffee_table', -9.5, 12], ['lounge_east_sofa', -8, 12.5], ['reception_desk', 11.5, 10.5], ['handoff_box', 15, 10.5], ['notice_attendance_wall', 15.5, 8.5], ['waiting_sofa', 18.5, 11.5],
  ['plaza_bike_rack', -4.5, 17], ['plaza_west_lamp', -9.5, 19], ['plaza_east_lamp', 13.5, 19], ['b0_coffee_cart', -4.5, 20.5], ['b0_table_1', -6.5, 24], ['b0_table_2', -3.5, 26],
  ['b1_stall', 8.5, 19], ['b2_stall', 8.5, 23], ['b3_stall', 8.5, 27], ['south_west_bench_1', -8, 27.5], ['south_west_bench_2', -5, 27.5], ['south_east_bench_1', 13.5, 21], ['south_east_bench_2', 13.5, 25], ['south_west_planter', -3.5, 29.5], ['south_east_planter', 6.5, 30],
].map(([id, x, z]) => [id, { x, z }]))
export const FOYER_QUEUES = {
  A1: [-33, -32, -31, -30, -29, -28].map(x => ({ x, z: 12 })), A2: [-18, -19, -20, -21, -22, -23].map(x => ({ x, z: 12 })), desk: [9, 10, 11, 12, 13, 14].map(x => ({ x, z: 12 })),
  B0: [18.5, 19.5, 20.5, 21.5, 22.5, 23.5].map(z => ({ x: -4.5, z })),
  B1: [[8, 18.5], [7, 18.5], [6, 18.5], [8, 19.5], [7, 19.5], [6, 19.5]].map(([x, z]) => ({ x, z })),
  B2: [[8, 22], [7, 22], [6, 22], [8, 24], [7, 24], [6, 24]].map(([x, z]) => ({ x, z })),
  B3: [[8, 26.5], [7, 26.5], [6, 26.5], [8, 27.5], [7, 27.5], [6, 27.5]].map(([x, z]) => ({ x, z })),
}
const WAITING_SOFA = FOYER_ITEMS.find(item => item.id === 'waiting_sofa')
// 四人站在沙发北侧面向 -Z；固定座位不前移，避免等待中互相换位。
export const WAITING_SEATS = Object.freeze([-1.5, -0.5, 0.5, 1.5].map(dx => Object.freeze({ x: WAITING_SOFA.center.x + dx, z: WAITING_SOFA.z1 + 0.5, yaw: 0 })))
export const WAITING_CAPACITY = WAITING_SEATS.length
export const CENTRAL_CIRCLE = { cx: 2, cz: 23, r: 4 }
export const MAIN_AISLE = { x0: 0, x1: 4 }
REGION_FOCUS.plaza = { label: PLAZA.name, t: [CORRIDOR_X, 0, (PLAZA.z0 + PLAZA.z1) / 2], r: 20 }
REGION_FOCUS.lounge = { label: '休息区', t: [-9.5, 0, 10.5], r: 13 }
REGION_FOCUS.foyer_A1 = { label: '咖啡吧', t: [FOYER_ZONES[0].center.x, 0, FOYER_ZONES[0].center.z], r: 14 }
REGION_FOCUS.foyer_A2 = { label: '自助零食', t: [FOYER_ZONES[1].center.x, 0, FOYER_ZONES[1].center.z], r: 14 }
REGION_FOCUS.foyer_desk = { label: '前厅服务台（接待与等候）', t: [FOYER_ZONES[4].center.x, 0, FOYER_ZONES[4].center.z], r: 14 }
export const VIEW_CENTER = [(ENVELOPE.x0 + ENVELOPE.x1) / 2, 0, 0]
export const MINI_BOUNDS = { x0: CAMPUS_PAVING.x0 - 2, x1: ENVELOPE.x1 + 2, z0: ENVELOPE.z0 - 2, z1: CAMPUS_PAVING.z1 + 2 }

export const roomAt = (p) => OFFICE_ROOMS.find(r => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)

// 左侧前廊安排休息区，大门至主通道保持独立，不摆座椅。
export const LOUNGE_AREA = { x: REGION_FOCUS.lounge.t[0], z: REGION_FOCUS.lounge.t[2], width: 9, depth: 4, entryZ: FOYER_Z + 0.5 }
export const LOUNGE_SEATS = [-1, 0, 1].flatMap((dz) => [
  { x: LOUNGE_AREA.x - 2, z: LOUNGE_AREA.z + dz, yaw: -Math.PI / 2, appX: LOUNGE_AREA.x - 1 },
  { x: LOUNGE_AREA.x + 2, z: LOUNGE_AREA.z + dz, yaw: Math.PI / 2, appX: LOUNGE_AREA.x + 1 },
])
export function loungeTrip(home, seat) {
  const exit = officeExit(home)
  return [...exit, ...corridorPath(exit.at(-1), { x: CORRIDOR_X, z: LOUNGE_AREA.entryZ }),
    { x: seat.appX, z: LOUNGE_AREA.entryZ }, { x: seat.appX, z: seat.z }, { x: seat.x, z: seat.z }]
}

export function officeExit(home) {
  const room = roomAt(home)
  if (!room) return [{ x: home.x, z: home.z }, ...corridorPath(home, { x: CORRIDOR_X, z: CROSS_Z })]
  const door = room.doors[0], north = door.side === 'south'
  const insideZ = north ? room.z1 - 0.5 : room.z0 + 0.5, outsideZ = north ? room.z1 + 1 : room.z0 - 1
  return [{ x: home.x + 1, z: home.z }, { x: home.x + 1, z: home.z + AISLE_OFFSET },
    { x: door.at, z: home.z + AISLE_OFFSET }, { x: door.at, z: insideZ },
    { x: door.at, z: outsideZ }, { x: door.at + (north ? 0.5 : -0.5), z: outsideZ }]
}

export function corridorPath(from, to) {
  // 左右行各占一条线，南北门的汇入点错开，避免三人在同一转角争抢一个点。
  const laneZ = CROSS_Z + (to.x < from.x ? 0.5 : -0.5)
  const result = Math.abs(from.x - to.x) < 0.01 ? [] : [{ x: from.x, z: laneZ }, { x: to.x, z: laneZ }]
  const start = result.at(-1) || from
  // 董事会决定：保留中轴前台（2026-10-20）
  if (Math.abs(start.x - to.x) < 0.01 && Math.abs(start.x - RECEPTION.x) < RECEPTION.width / 2 + 0.4 && Math.min(start.z, to.z) < RECEPTION.z0 && Math.max(start.z, to.z) > RECEPTION.z1) {
    result.push({ x: RECEPTION.bypassX, z: start.z }, { x: RECEPTION.bypassX, z: to.z })
  }
  result.push({ ...to })
  return result
}

const CONSUMER_TARGETS = { A1: FOYER_QUEUES.A1[0], A2: FOYER_QUEUES.A2[0], desk: FOYER_QUEUES.desk[0], B0: FOYER_QUEUES.B0[0], B1: FOYER_QUEUES.B1[0], B2: FOYER_QUEUES.B2[0], B3: FOYER_QUEUES.B3[0] }
const consumerTarget = (targetId) => {
  const target = CONSUMER_TARGETS[targetId] || FOYER_TARGETS[targetId]
  if (!target) throw new Error(`Unknown foyer target: ${targetId}`)
  return target
}

function consumerTrip(home, targetId) {
  const target = consumerTarget(targetId), exit = officeExit(home)
  const path = [...exit, ...corridorPath(exit.at(-1), { x: CORRIDOR_X, z: 12 })]
  if (target.z <= ENTRANCE.inner.z) return [...path, { ...target }]
  const laneX = target.x < 0 ? -3.5 : 7
  return [...path, ...ENTRANCE.gate, { x: laneX, z: ENTRANCE.gate.at(-1).z }, { x: laneX, z: target.z }, { ...target }]
}

export const foyerTrip = (home, targetId) => consumerTrip(home, targetId)
export const plazaTrip = (home, targetId) => consumerTrip(home, targetId)
export const foyerReturnTrip = (home, targetId) => consumerTrip(home, targetId).toReversed().map(p => ({ ...p }))
export function consumerQueue(targetId, occupied = []) {
  const queue = FOYER_QUEUES[targetId]
  if (!queue) throw new Error(`Unknown foyer queue: ${targetId}`)
  return queue.find(p => !occupied.some(o => o.x === p.x && o.z === p.z)) || null
}

export function officeTrip(home, targetHome, stand) {
  const exit = officeExit(home), entry = officeExit(targetHome).reverse().slice(0, -2)
  return [...exit, ...corridorPath(exit.at(-1), entry[0]), ...entry.slice(1), { x: stand.x, z: targetHome.z + AISLE_OFFSET }, stand]
}

export function meetingTrip(home, seat) {
  const room = MEETING_ROOMS.find(r => r.id === seat.room), exit = officeExit(home)
  const insideZ = room.doors[0].side === 'south' ? room.z1 - 0.5 : room.z0 + 0.5
  return [...exit, ...corridorPath(exit.at(-1), { x: room.doors[0].at, z: CROSS_Z }),
    { x: room.doors[0].at, z: insideZ }, { x: room.doors[0].at, z: seat.viaZ },
    { x: seat.x, z: seat.viaZ }, { x: seat.x, z: seat.z }]
}

export function roomSegments(room) {
  const segments = []
  for (const side of ['north', 'south', 'west', 'east']) {
    const vertical = side === 'west' || side === 'east'
    const lo = vertical ? room.z0 : room.x0, hi = vertical ? room.z1 : room.x1
    const holes = room.doors.filter(d => d.side === side).map(d => ({ lo: Math.max(lo, d.at - (d.width || 2.2) / 2), hi: Math.min(hi, d.at + (d.width || 2.2) / 2) })).sort((a, b) => a.lo - b.lo)
    let start = lo
    for (const hole of holes) {
      if (hole.lo > start) segments.push({ side, lo: start, hi: hole.lo })
      start = Math.max(start, hole.hi)
    }
    if (start < hi) segments.push({ side, lo: start, hi })
  }
  return segments
}

const freezeDeep = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freezeDeep(child)
  return Object.freeze(value)
}
const cloneLayoutData = (value) => {
  if (Array.isArray(value)) return value.map(cloneLayoutData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneLayoutData(child)]))
}

const layoutRect = (id, name, x0, x1, z0, z1, door) => ({
  id, name, x0, x1, z0, z1, doors: door ? [{ ...door, width: 1.5 }] : [],
})

const V2_REGIONS = [
  layoutRect('market', '市场展示', -34, -28, -18, -9, { side: 'south', at: -31 }),
  layoutRect('board', '董事会', -27.5, -17, -18, -9, { side: 'south', at: -22.5 }),
  layoutRect('review', '评审室', -16.5, -8.5, -18, -9, { side: 'south', at: -12.5 }),
  layoutRect('plan', '计划室', -8, -3, -18, -9, { side: 'south', at: -5.5 }),
  layoutRect('product', '产品与设计', 7, 16, -18, -9, { side: 'south', at: 11.5 }),
  layoutRect('eng', '工程办公室', 16.5, 28, -18, -9, { side: 'south', at: 22.5 }),
  layoutRect('kb', '知识中心', 28.5, 33, -18, -9, { side: 'south', at: 30.5 }),
  layoutRect('service', '服务展示', 33.5, 38, -18, -9, { side: 'south', at: 35.5 }),
  layoutRect('aftersales', '售后展示', -34, -28, 7, 13, { side: 'north', at: -31 }),
  layoutRect('ops', '运维办公室', -27.5, -18, 7, 13, { side: 'north', at: -22.5 }),
  layoutRect('quality', '质量与安全', -17.5, -5, 7, 13, { side: 'north', at: -11.5 }),
  layoutRect('drlife', 'Dr.life+ 工作室', 9, 27, 7, 13, { side: 'north', at: 24 }),
  layoutRect('marketing', '营销展示', 27.5, 38, 7, 13, { side: 'north', at: 32.5 }),
]

const V2_SEATS = {
  Lead: ['product', 8.5, -15.5], PM: ['product', 12, -15.5], Architect: ['product', 8.5, -12], UIUX: ['product', 12, -12],
  FrontendSenior: ['eng', 19, -15.5], Frontend1: ['eng', 22.5, -15.5], Frontend2: ['eng', 26, -15.5],
  BackendSenior: ['eng', 19, -12], Backend1: ['eng', 22.5, -12], Backend2: ['eng', 26, -12],
  KnowledgeKeeper: ['kb', 30.5, -14],
  QAAutomation: ['quality', -15.5, 9], Reviewer1: ['quality', -12, 9], Reviewer2: ['quality', -8.5, 9], SecurityReviewer: ['quality', -6, 9],
  OpsLead: ['ops', -25, 9], OpsEngineer: ['ops', -21, 9],
  GoSenior: ['drlife', 11.5, 8.5], Go1: ['drlife', 15, 8.5], Go2: ['drlife', 18.5, 8.5], DBEngineer: ['drlife', 22, 8.5],
  LedgerAuditor: ['drlife', 11.5, 11.5], ReactSenior: ['drlife', 15, 11.5], React1: ['drlife', 18.5, 11.5], Localizer: ['drlife', 22, 11.5],
}

const V2_DISPLAY_SEATS = [
  ['market-1', 'market', -32, -15], ['market-2', 'market', -31, -12.5], ['market-3', 'market', -29.5, -15],
  ['service-1', 'service', 35, -15], ['service-2', 'service', 36, -12.5], ['service-3', 'service', 34, -12.5],
  ['aftersales-1', 'aftersales', -32, 9], ['aftersales-2', 'aftersales', -30, 11], ['aftersales-3', 'aftersales', -29.5, 9],
  ['marketing-1', 'marketing', 29.5, 9], ['marketing-2', 'marketing', 32.5, 11], ['marketing-3', 'marketing', 35.5, 9],
].map(([id, region, x, z]) => ({ id, region, x, z, display: true }))

const V2_BAR_CENTER = Object.freeze({ x: 2, z: -1 })
// 复用吧台模块的实体圆弧与缺口口径，避免导航另造碰撞几何。
const V2_BAR_SEGMENTS = barColliders({ center: V2_BAR_CENTER, radius: 3.5, gaps: [{ width: 1.5 }] }).map(({ x0, x1, z0, z1 }, index) => ({ index, x0, x1, z0, z1, angle: index * 30 + 15 }))

const V2_BAR_SEATS = Array.from({ length: 10 }, (_, index) => {
  const angle = (index * 36 + 18) * Math.PI / 180
  const half = (value) => Math.round(value * 2) / 2
  return { id: `bar-seat-${index + 1}`, x: half(V2_BAR_CENTER.x + Math.cos(angle) * 4.2), z: half(V2_BAR_CENTER.z + Math.sin(angle) * 4.2) }
})

const V2_LAYOUT = {
  version: 2,
  envelope: { x0: -34, x1: 38, z0: -18, z1: 16, width: 72, depth: 34, area: 2448 },
  axis: { x: 2 },
  regions: V2_REGIONS,
  rooms: V2_REGIONS,
  seats: V2_SEATS,
  displaySeats: V2_DISPLAY_SEATS,
  corridors: {
    north: { x0: -34, x1: 38, z0: -9, z1: -7, width: 2 },
    south: { x0: -34, x1: 38, z0: 5, z1: 7, width: 2 },
    northPortal: { x0: 0, x1: 4, z0: -9, z1: -8, width: 4 },
    southPortal: { x0: 0, x1: 4, z0: 6, z1: 7, width: 4 },
    centralRing: { center: { x: 2, z: -1 }, r0: 6, r1: 8, width: 2 },
  },
  passages: {
    northAxis: { x0: 0, x1: 4, z0: -18, z1: -8, width: 4 },
    southAxis: { x0: 0, x1: 4, z0: 6, z1: 16, width: 4 },
    entranceSpine: { x0: 0, x1: 4, z0: -18, z1: 16, width: 4, lockedNorth: true },
    foyerWest: { x0: -14, x1: -5, z0: 13, z1: 16, width: 3 },
  },
  bar: {
    center: V2_BAR_CENTER,
    radius: 3.5,
    seats: V2_BAR_SEATS,
    gaps: [{ side: 'east', width: 1.5 }, { side: 'west', width: 1.5 }],
    segments: V2_BAR_SEGMENTS,
  },
  frontDesk: { x0: -0.75, x1: 4.75, z0: 13.75, z1: 15.25, center: { x: 2, z: 14.5 } },
  serviceBar: { x0: -14, x1: -5, z0: 13, z1: 14.5 },
  waitingArc: { x0: 9, x1: 18, z0: 13, z1: 15.5 },
  doors: {
    south: { x0: -2, x1: 6, z: 16, width: 8 },
    north: { x0: -1, x1: 5, z: -18, width: 6, locked: true },
  },
  boss: { desk: { x: -24.5, z: -14.5 }, stand: { x: -24.5, z: -12.5 }, region: 'board' },
  boardTable: { x: -22, z: -14 },
  meetingSeats: { A: 8, B: 6 },
  regionFocus: Object.fromEntries(V2_REGIONS.map((region) => [region.id, {
    label: region.name,
    t: [(region.x0 + region.x1) / 2, 0, (region.z0 + region.z1) / 2],
    r: Math.max(region.x1 - region.x0, region.z1 - region.z0) + 8,
  }])),
  miniBounds: { x0: -36, x1: 40, z0: -20, z1: 32 },
  plaza: PLAZA,
}

const V3_REGIONS = [
  layoutRect('market', '市场部（展示）', -28, -20, -18, -12, { side: 'east', at: -15 }),
  layoutRect('board', '会议与决策', -18.5, -8.5, -18, -12, { side: 'west', at: -15 }),
  layoutRect('review', '评审室 A', -28, -18, -10.5, -4.5, { side: 'east', at: -7.5 }),
  layoutRect('plan', '计划室 B', -16.5, -8.5, -10.5, -4.5, { side: 'west', at: -7.5 }),
  layoutRect('ops', '运营', -28, -18, -3, 4, { side: 'east', at: .5 }),
  layoutRect('quality', '质量与安全', -16.5, -8.5, -3, 4, { side: 'west', at: .5 }),
  layoutRect('aftersales', '售后部（展示）', -28, -20, 5.5, 11.5, { side: 'east', at: 8.5 }),
  layoutRect('leisure', '休闲展示区', -18.5, -10.5, 5.5, 11.5, { side: 'west', at: 8.5 }),
  layoutRect('kb', '知识', 12.5, 20.5, -18, -12, { side: 'east', at: -15 }),
  layoutRect('service', '客服部（展示）', 24, 32, -18, -12, { side: 'west', at: -15 }),
  layoutRect('product', '产品', 12.5, 21.5, -10.5, -3, { side: 'east', at: -7 }),
  layoutRect('eng', '工程', 23, 32, -10.5, -3, { side: 'west', at: -7 }),
  layoutRect('creative', '创意讨论区', 12.5, 21.5, -1.5, 3.5, { side: 'east', at: 1 }),
  layoutRect('dining', '餐饮休憩角', 23, 32, -1.5, 3.5, { side: 'west', at: 1 }),
  layoutRect('drlife', 'D.life 工坊', 12.5, 22.5, 5, 12, { side: 'east', at: 8.5 }),
  layoutRect('marketing', '营销部（展示）', 24, 32, 5, 12, { side: 'west', at: 8.5 }),
]

const V3_SEATS = {
  Lead: ['product', 14.2, -8], PM: ['product', 17.5, -8], Architect: ['product', 14.2, -4.5], UIUX: ['product', 17.5, -4.5],
  FrontendSenior: ['eng', 24.2, -8], Frontend1: ['eng', 27, -8], Frontend2: ['eng', 29.8, -8],
  BackendSenior: ['eng', 24.2, -4.5], Backend1: ['eng', 27, -4.5], Backend2: ['eng', 29.8, -4.5],
  KnowledgeKeeper: ['kb', 16.5, -15],
  QAAutomation: ['quality', -15.5, -1.5], Reviewer1: ['quality', -12.5, -1.5], Reviewer2: ['quality', -15.5, 1.5], SecurityReviewer: ['quality', -12.5, 1.5],
  OpsLead: ['ops', -25, 0], OpsEngineer: ['ops', -21, 0],
  GoSenior: ['drlife', 14, 6], Go1: ['drlife', 16.5, 6], Go2: ['drlife', 19, 6], DBEngineer: ['drlife', 21, 6],
  LedgerAuditor: ['drlife', 14, 9.5], ReactSenior: ['drlife', 16.5, 9.5], React1: ['drlife', 19, 9.5], Localizer: ['drlife', 21, 9.5],
}

const V3_DISPLAY_SEATS = [
  ['market-1', 'market', -26.5, -15], ['market-2', 'market', -24, -15], ['market-3', 'market', -21.5, -15],
  ['service-1', 'service', 25.5, -15], ['service-2', 'service', 28, -15], ['service-3', 'service', 30.5, -15],
  ['aftersales-1', 'aftersales', -26.5, 8], ['aftersales-2', 'aftersales', -24, 8], ['aftersales-3', 'aftersales', -21.5, 8],
  ['marketing-1', 'marketing', 25.5, 8], ['marketing-2', 'marketing', 28, 8], ['marketing-3', 'marketing', 30.5, 8],
].map(([id, region, x, z]) => ({ id, region, x, z, display: true }))

const V3_CENTER = Object.freeze({ x: 2, z: -6 })
const V3_BAR_SEATS = Array.from({ length: 10 }, (_, index) => {
  const angle = (index * 36 + 18) * Math.PI / 180
  const tenth = (value) => Math.round(value * 10) / 10
  return { id: `bar-seat-${index + 1}`, x: tenth(V3_CENTER.x + Math.cos(angle) * 4.2), z: tenth(V3_CENTER.z + Math.sin(angle) * 4.2) }
})

const V3_PLAZA = {
  center: { x: 2, z: 21 }, radius: 9, diameter: 18, rings: 3, radialSeams: 8,
  steps: { x0: -2, x1: 6, z0: 11, z1: 12 },
  carts: [{ id: 'food-cart-1', x: -9, z: 21 }],
  kiosks: [{ id: 'kiosk-1', x: 13, z: 18 }, { id: 'kiosk-2', x: 13, z: 21 }, { id: 'kiosk-3', x: 13, z: 24 }],
  umbrellaTables: [{ x: -8, z: 15 }, { x: -8, z: 27 }, { x: 12, z: 15 }, { x: 12, z: 27 }],
  lamps: [{ x: -8.5, z: 16 }, { x: -9, z: 20 }, { x: -8.5, z: 25 }, { x: -5, z: 30 }, { x: 9, z: 30 }, { x: 12.5, z: 25 }, { x: 13, z: 20 }, { x: 12.5, z: 16 }],
  benches: [{ x: -7, z: 13.5 }, { x: -10, z: 23 }, { x: -6, z: 29.5 }, { x: 10, z: 29.5 }, { x: 14, z: 23 }, { x: 11, z: 13.5 }],
  flowerBands: [{ x: -8.5, z: 21 }, { x: 12.5, z: 21 }, { x: -4, z: 29 }, { x: 8, z: 29 }],
}

const V3_LAYOUT = {
  version: 3,
  envelope: { x0: -28, x1: 32, z0: -18, z1: 12, width: 60, depth: 30, area: 1800 },
  site: { x0: -28, x1: 32, z0: -18, z1: 30, width: 60, depth: 48, area: 2880 },
  foyer: { id: 'foyer', x0: -6, x1: 10, z0: 4, z1: 12, width: 16, depth: 8 },
  axis: { x: 2 },
  regions: V3_REGIONS,
  rooms: V3_REGIONS,
  seats: V3_SEATS,
  displaySeats: V3_DISPLAY_SEATS,
  corridors: {
    westNorthCross: { x0: -28, x1: -8.5, z0: -12, z1: -10.5, width: 1.5 },
    westMiddleCross: { x0: -28, x1: -8.5, z0: -4.5, z1: -3, width: 1.5 },
    westSouthCross: { x0: -28, x1: -10.5, z0: 4, z1: 5.5, width: 1.5 },
    eastNorthCross: { x0: 12.5, x1: 32, z0: -12, z1: -10.5, width: 1.5 },
    eastMiddleCross: { x0: 12.5, x1: 32, z0: -3, z1: -1.5, width: 1.5 },
    eastSouthCross: { x0: 12.5, x1: 32, z0: 3.5, z1: 5, width: 1.5 },
    entranceAxis: { x0: 0, x1: 4, z0: 4, z1: 12, width: 4 },
    centralRing: { center: V3_CENTER, r0: 6, r1: 10, width: 4 },
  },
  passages: {
    entranceAxis: { x0: 0, x1: 4, z0: 4, z1: 12, width: 4 },
    entranceSpine: { x0: 0, x1: 4, z0: -18, z1: 30, width: 4 },
    westLoop: { center: V3_CENTER, side: 'west', r0: 6, r1: 10, width: 4 },
    eastLoop: { center: V3_CENTER, side: 'east', r0: 6, r1: 10, width: 4 },
  },
  ring: { center: V3_CENTER, inner: 6, outer: 10, width: 4 },
  island: { center: V3_CENTER, radius: 6, diameter: 12, treeRadius: 1.2, barOuter: 3.5, stoolRadius: 4.2, sofaOuter: 5.8 },
  bar: { center: V3_CENTER, radius: 3.5, seats: V3_BAR_SEATS, gaps: [{ side: 'east', width: 1.5 }, { side: 'west', width: 1.5 }] },
  frontDesk: { x0: -1, x1: 5, z0: 8.1, z1: 9.5, center: { x: 2, z: 8.8 } },
  serviceBar: { x0: -5.3, x1: -2.3, z0: 7.3, z1: 9.3, center: { x: -3.8, z: 8.3 } },
  waitingArc: { x0: 4, x1: 9, z0: 6.8, z1: 9.8, center: { x: 6.5, z: 8.3 } },
  doors: {
    south: { x0: 0, x1: 4, z: 12, width: 4 },
    north: { x0: 0, x1: 4, z: -18, width: 4, locked: true },
  },
  boss: { desk: { x: -16.5, z: -15 }, stand: { x: -16.5, z: -13 }, region: 'board' },
  boardTable: { x: -13.5, z: -15 },
  meetingSeats: { A: 8, B: 6 },
  // V3 会议动线使用真实门洞之间的空隙和北侧公共转接带；不复用 V1 西翼入口。
  meetingAccess: {
    northZ: -11.25,
    westSpineX: -17.25,
    eastSpineX: 22.25,
    westMiddleZ: -3.75,
    eastMiddleZ: -2.25,
    eastSouthZ: 4.25,
  },
  regionFocus: Object.fromEntries([
    ...V3_REGIONS.map((region) => [region.id, { label: region.name, t: [(region.x0 + region.x1) / 2, 0, (region.z0 + region.z1) / 2], r: Math.max(region.x1 - region.x0, region.z1 - region.z0) + 8 }]),
    ['foyer', { label: '前厅接待区', t: [2, 0, 8], r: 24 }],
    ['plaza', { label: 'DR 广场', t: [2, 0, 21], r: 27 }],
  ]),
  miniBounds: { x0: -30.5, x1: 34.5, z0: -20.5, z1: 32.5 },
  plaza: V3_PLAZA,
  greenBuffer: { width: 2.5, x0: -30.5, x1: 34.5, z0: -20.5, z1: 32.5 },
  wallHeight: {
    standard: 4.5, atrium: 6, windowBandBottom: 3.5,
    occlusion: { triggerElevation: 40, loweredHeight: .9, glassOpacity: .08, transitionMs: 250 },
  },
  monitorFit: { source: 'MONITOR_GLASS_SOURCE', helper: 'monitorScreenFit', offsetMin: .001, offsetMax: .002, handWrittenTransform: false, extraCalls: 0 },
  cameraDefaults: {
    overview: { az: 0, el: 58, r: 78, target: [2, 0, 2], wallMode: 'full' },
    orbit: { az: 35, el: 50, r: 72, target: [2, 0, -1], wallMode: 'camera-side-below-40' },
    top: { az: 0, el: 82, r: 68, target: [2, 0, 1], wallMode: 'full' },
    isometric: { az: -38, el: 48, r: 62, target: [2, 0, -1], wallMode: 'full' },
    low: { az: -20, el: 28, r: 44, target: [2, 0, -1], wallMode: 'camera-side-lowered' },
    follow: { az: 0, el: 34, r: 14, target: ['agent', 0, 'agent'], wallMode: 'camera-side-lowered' },
  },
}

const LAYOUT_V1_DATA = {
  ENVELOPE, MAIN_FLOOR_X0, CORRIDORS, CORRIDOR_X, LOGO_AREA, CROSS_Z, FOYER_Z, AISLE_OFFSET,
  ENTRANCE, FOYER_RECEPTION, RECEPTION, OFFICE_ROOMS, SEATS, BOSS, BOARD_TABLE, BOARD_DOOR,
  MEETING_ROOMS, MEETING_SEATS, REGION_FOCUS, PLAZA, WAREHOUSE, DOCK, PARKING, WEST_WALK,
  SERVICE_PASSAGE, CAMPUS_PAVING, LOGISTICS_GATE_ZONE, WAREHOUSE_FOCUS, WAREHOUSE_ITEMS,
  FOYER_ZONES, FOYER_ITEMS, FOYER_TARGETS, FOYER_QUEUES, WAITING_SEATS, WAITING_CAPACITY,
  CENTRAL_CIRCLE, MAIN_AISLE, VIEW_CENTER, MINI_BOUNDS, LOUNGE_AREA, LOUNGE_SEATS,
  roomAt, loungeTrip, officeExit, corridorPath, foyerTrip, plazaTrip, foyerReturnTrip,
  consumerQueue, officeTrip, meetingTrip, roomSegments,
}

export const LAYOUT_V1 = freezeDeep(cloneLayoutData(LAYOUT_V1_DATA))
export const LAYOUT_V2 = freezeDeep(cloneLayoutData(V2_LAYOUT))
export const LAYOUT_V3 = freezeDeep(cloneLayoutData(V3_LAYOUT))
export const resolveOfficeLayout = (search = '') => {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''))
  const values = params.getAll('layout')
  if (values.length !== 1) return LAYOUT_V1
  if (values[0] === '2') return LAYOUT_V2
  if (values[0] === '3') return LAYOUT_V3
  return LAYOUT_V1
}

const CAMPUS_DATA = { x0: -174, x1: -72, z0: -26, z1: 42, width: 102, depth: 68, area: 6936, westRoadBuffer: 8 }
const CAMPUS_BUILDING_DATA = { x0: -168, x1: -80, z0: -18, z1: 30, width: 88, depth: 48, area: 4224 }
const campusZone = (id, name, label, x0, x1, z0, z1, kind, v1, ref) => ({ id, name, label, x0, x1, z0, z1, kind, v1, ref })
const CAMPUS_ZONES_DATA = [
  campusZone('receiving', '收货月台', '收货月台（示意）', -164, -128, -18, -12, 'building', 'visible', 'W1 / 物流入库示意'),
  campusZone('inspection', '入库质检', '入库质检（示意）', -128, -104, -18, -10, 'building', 'visible', 'W1 / 平台服务示意'),
  campusZone('highRack', '高位货架仓储区', '高位货架仓储区（示意）', -152, -104, -10, 8, 'building', 'visible', 'W1 / 智慧云仓示意'),
  campusZone('picking', '拣货区', '拣货区（示意）', -152, -128, 8, 18, 'building', 'visible', 'W2 / 周转示意'),
  campusZone('packing', '包装区', '包装区（示意）', -128, -104, 8, 18, 'building', 'visible', 'W2 / 周转示意'),
  campusZone('shipping', '发货月台', '发货月台（示意）', -104, -80, -4, 18, 'building', 'visible', 'W3 / 集货配送示意'),
  campusZone('dispatch', '调度中控', '调度中控（示意）', -168, -154, 0, 16, 'building', 'visible', '平台运营示意'),
  campusZone('visitor', '访客接待区', '访客接待区（示意）', -168, -154, 20, 30, 'building', 'visible', '设计服务示意'),
  campusZone('showcase', '服务中心展示区', '服务中心展示区（示意）', -154, -130, 20, 30, 'building', 'visible', '中央展示示意'),
  campusZone('officeMeeting', '办公与会议区', '办公与会议区（示意）', -130, -104, 20, 30, 'building', 'mark', '设计会议示意'),
  campusZone('maintenance', '设备与维护区', '设备与维护区（示意）', -104, -80, 20, 30, 'building', 'mark', '维护演示示意'),
  campusZone('frontPlaza', '前广场水景门牌', '前广场水景门牌（示意）', -154, -94, 30, 38, 'outdoor', 'visible', '主入口示意'),
  campusZone('parking', '园区停车场', '园区停车场（示意）', -94, -76, 30, 42, 'outdoor', 'mark', '客户停车示意'),
  campusZone('logisticsGate', '物流出入口', '物流出入口（示意）', -80, -72, 18, 30, 'outdoor', 'visible', '物流门架示意'),
]
const CAMPUS_SHUTTLE_STRIP_DATA = { x0: -148, x1: -144, z0: -8, z1: 6, kind: 'mark', label: '穿梭机展示带（示意）' }
const CAMPUS_WALKABLE_DATA = [
  { id: 'frontApproach', x0: -154, x1: -94, z0: 38, z1: 42 },
  { id: 'frontAxis', x0: -126, x1: -122, z0: 30, z1: 42 },
  { id: 'frontBridge', x0: -154, x1: -104, z0: 28, z1: 34 },
  { id: 'visitorHall', x0: -168, x1: -104, z0: 24, z1: 30 },
  { id: 'serviceAxis', x0: -166, x1: -160, z0: 10, z1: 25 },
  { id: 'showcaseHall', x0: -154, x1: -104, z0: 24, z1: 28 },
]
const CAMPUS_FLOWS_DATA = [
  { id: 'customer', name: '客户动线（示意）', type: 'walk', points: [[-124, 42], [-124, 34], [-142, 27], [-117, 27]] },
  { id: 'cargo', name: '货物动线（示意）', type: 'mark', points: [[-146, -18], [-116, -14], [-128, -1], [-140, 13], [-116, 13], [-92, 8]], sequence: ['receiving', 'inspection', 'highRack', 'picking', 'packing', 'shipping'] },
  { id: 'platform', name: '平台服务动线（示意）', type: 'walk', points: [[-166, 25], [-163, 18], [-163, 25], [-117, 25]] },
]

export const CAMPUS = freezeDeep(CAMPUS_DATA)
export const CAMPUS_BUILDING = freezeDeep(CAMPUS_BUILDING_DATA)
export const CAMPUS_ZONES = freezeDeep(CAMPUS_ZONES_DATA)
export const CAMPUS_SHUTTLE_STRIP = freezeDeep(CAMPUS_SHUTTLE_STRIP_DATA)
export const CAMPUS_WALKABLE = freezeDeep(CAMPUS_WALKABLE_DATA)
export const CAMPUS_FLOWS = freezeDeep(CAMPUS_FLOWS_DATA)
export const CAMPUS_FOCUS = freezeDeep({ label: 'DR 仓配服务中心（示意）', t: [-124, 0, 6], r: 68 })
export const CAMPUS_MINI_BOUNDS = freezeDeep({ x0: -178, x1: 24, z0: -28, z1: 44 })
import { barColliders, barLounges } from './office-bar-geometry.js'

const routePoint = (point) => ({ x: point.x, z: point.z })
const roomCenter = (room) => ({ x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 })
const roomDoor = (room) => {
  const door = room?.doors?.[0]
  if (!door || !Number.isFinite(door.at) || !Number.isFinite(door.width) || door.width <= 0) throw new Error(`房间没有可用门洞: ${room?.id || 'unknown'}`)
  return door
}
const doorInterior = (room, door = roomDoor(room)) => {
  if (door.side === 'east') return { x: room.x1 - .6, z: door.at }
  if (door.side === 'west') return { x: room.x0 + .6, z: door.at }
  if (door.side === 'south') return { x: door.at, z: room.z1 - .6 }
  return { x: door.at, z: room.z0 + .6 }
}
const doorExterior = (room, door = roomDoor(room)) => {
  if (door.side === 'east') return { x: room.x1 + .75, z: door.at }
  if (door.side === 'west') return { x: room.x0 - .75, z: door.at }
  if (door.side === 'south') return { x: door.at, z: room.z1 + .75 }
  return { x: door.at, z: room.z0 - .75 }
}
const dedupeRoute = (points) => points.filter((point, index, all) => !index || Math.hypot(point.x - all[index - 1].x, point.z - all[index - 1].z) > .001)

function createOfficeV3Navigation(layout) {
  const rooms = layout.regions, access = layout.meetingAccess
  if (!access || !Object.values(access).every(Number.isFinite)) throw new Error('缺少 V3 会议通行合同')
  const findRoom = point => rooms.find(room => point.x > room.x0 && point.x < room.x1 && point.z > room.z0 && point.z < room.z1)
  const entrance = {
    x0: layout.doors.south.x0,
    x1: layout.doors.south.x1,
    inner: { x: layout.axis.x, z: layout.doors.south.z - .75 },
    gate: [{ x: layout.axis.x, z: layout.doors.south.z + .75 }, { x: layout.axis.x, z: layout.doors.south.z + 1.75 }],
  }
  const lanes = {
    westNorth: { x: -19.25, z: -11.25 },
    westMiddle: { x: -17.25, z: -3.75 },
    westSouth: { x: -19.25, z: 4.75 },
    eastNorth: { x: 22.25, z: -11.25 },
    eastMiddle: { x: 22.25, z: -2.25 },
    eastSouth: { x: 23.25, z: 4.75 },
    foyer: { x: -2, z: 4.75 },
  }
  const same = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < .001
  const append = (points, ...next) => {
    for (const point of next.flat()) if (!points.length || !same(points.at(-1), point)) points.push(routePoint(point))
    return points
  }
  const exit = (home) => {
    const room = findRoom(home)
    if (!room) return [routePoint(home)]
    const door = roomDoor(room), inside = doorInterior(room, door), outside = doorExterior(room, door)
    if (door.side === 'east' || door.side === 'west') {
      const aisleZ = home.z < door.at ? room.z0 + .7 : room.z1 - .7
      return dedupeRoute([routePoint(home), { x: home.x, z: aisleZ }, { x: inside.x, z: aisleZ }, { x: inside.x, z: door.at }, outside])
    }
    const aisleX = home.x < door.at ? room.x0 + .7 : room.x1 - .7
    return dedupeRoute([routePoint(home), { x: home.x, z: inside.z }, { x: aisleX, z: inside.z }, { x: door.at, z: inside.z }, outside])
  }

  // 所有公共路线都先汇入对应侧的门外走廊，再走过前厅公共带。
  // 每行走廊的 x 不同，避免跨过两排房间之间的实墙。
  const toHub = (point) => {
    const result = [routePoint(point)]
    if (point.x < -8.5) {
      if (point.z < -10.5) append(result, { x: lanes.westNorth.x, z: point.z }, lanes.westNorth, { x: lanes.westMiddle.x, z: lanes.westNorth.z }, lanes.westMiddle)
      else if (point.z < 4.5) append(result, { x: lanes.westMiddle.x, z: point.z }, lanes.westMiddle)
      else append(result, { x: lanes.westSouth.x, z: point.z }, lanes.westSouth, { x: lanes.westMiddle.x, z: lanes.westSouth.z }, lanes.westMiddle)
      append(result, { x: lanes.westMiddle.x, z: lanes.westSouth.z }, lanes.westSouth, lanes.foyer)
      return result
    }
    if (point.x > 12.5) {
      if (point.z < -10.5) append(result, { x: lanes.eastNorth.x, z: point.z }, lanes.eastNorth, lanes.eastMiddle)
      else if (point.z < 4.5) append(result, { x: lanes.eastMiddle.x, z: point.z }, lanes.eastMiddle)
      else append(result, { x: lanes.eastSouth.x, z: point.z }, lanes.eastSouth)
      append(result, { x: lanes.eastMiddle.x, z: lanes.eastSouth.z }, lanes.eastSouth, lanes.foyer)
      return result
    }
    // 前厅服务台占用中轴，南侧入口从其西侧通过。
    if (point.z > lanes.foyer.z) append(result, { x: lanes.foyer.x, z: point.z }, lanes.foyer)
    else append(result, lanes.foyer)
    return result
  }
  const publicPath = (from, to) => dedupeRoute([...toHub(from), ...toHub(to).toReversed().slice(1)])
  const meetingInterior = (room, seat) => {
    const door = roomDoor(room), inside = doorInterior(room, door), center = roomCenter(room)
    const aisleZ = seat.z < center.z - .2 ? room.z0 + .65 : room.z1 - .65
    return dedupeRoute([inside, { x: inside.x, z: aisleZ }, { x: seat.x, z: aisleZ }, routePoint(seat)])
  }
  const meetings = (home, seat) => {
    const room = rooms.find(item => item.id === (seat?.room === 'A' ? 'review' : seat?.room === 'B' ? 'plan' : ''))
    if (!room || !Number.isFinite(seat?.x) || !Number.isFinite(seat?.z)) throw new Error('无效 V3 会议座位')
    const departure = exit(home), outside = doorExterior(room)
    return dedupeRoute([...departure, ...publicPath(departure.at(-1), outside).slice(1), ...meetingInterior(room, seat)])
  }
  const entry = home => exit(home).toReversed().slice(1)
  const trip = (home, targetHome, stand = targetHome) => {
    const departure = exit(home), arrival = entry(targetHome)
    return dedupeRoute([...departure, ...publicPath(departure.at(-1), arrival[0]).slice(1), ...arrival.slice(1), routePoint(stand)])
  }
  const lounge = (home, seat) => {
    if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.z) || !Number.isFinite(seat?.appX) || !Number.isFinite(seat?.appZ)) throw new Error('无效 V3 休息座位')
    const departure = exit(home), approach = { x: seat.appX, z: seat.appZ }
    const { center } = layout.ring
    const east = seat.side === 'east'
    // 休息座位在吧岛内侧，只能从对应一侧的吧台开口进入；公共路线不可直穿吧台。
    const ringRoute = east
      ? [{ x: center.x + 7, z: lanes.foyer.z }, { x: center.x + 7, z: center.z }, { x: center.x + layout.bar.radius + .25, z: center.z }]
      : [{ x: center.x - 7, z: lanes.foyer.z }, { x: center.x - 7, z: center.z }, { x: center.x - layout.bar.radius - .25, z: center.z }]
    return dedupeRoute([...departure, ...toHub(departure.at(-1)).slice(1), ...ringRoute, approach, routePoint(seat)])
  }
  const boardRoom = rooms.find(room => room.id === 'board')
  const boardDoor = roomDoor(boardRoom), boardOutside = doorExterior(boardRoom, boardDoor), boardInside = doorInterior(boardRoom, boardDoor)
  const boardTrip = (home, stand) => {
    if (!Number.isFinite(stand?.x) || !Number.isFinite(stand?.z)) throw new Error('无效 V3 董事会目标')
    const departure = exit(home)
    return dedupeRoute([...departure, ...publicPath(departure.at(-1), boardOutside).slice(1), boardInside, { x: boardInside.x, z: stand.z }, routePoint(stand)])
  }
  const consumerTargets = {
    A1: { x: -3.2, z: 6.5 },
    A2: { x: -5.2, z: 6.5 },
    desk: { x: 2, z: 10.5 },
    B0: { x: -8.5, z: 19 },
    B1: { x: 11.5, z: 18 },
    B2: { x: 11.5, z: 21 },
    B3: { x: 11.5, z: 24 },
    waiting: { x: 6.5, z: 6.4 },
  }
  const consumerQueues = {
    A1: [-3.2, -4.2, -5.2, -6.2].map(x => ({ x, z: 6.5 })),
    A2: [-5.2, -6.2, -7.2, -8.2].map(x => ({ x, z: 6.5 })),
    desk: [10.5, 11.35, 12.2, 13.05].map(z => ({ x: 2, z })),
    B0: [19, 20, 21, 22].map(z => ({ x: -8.5, z })),
    B1: [11.5, 10.5, 9.5, 8.5].map(x => ({ x, z: 18 })),
    B2: [11.5, 10.5, 9.5, 8.5].map(x => ({ x, z: 21 })),
    B3: [11.5, 10.5, 9.5, 8.5].map(x => ({ x, z: 24 })),
    waiting: [5.4, 6.2, 6.8, 7.6].map(x => ({ x, z: 6.4 })),
  }
  const consumer = (home, targetId, stand = consumerTargets[targetId]) => {
    if (!consumerTargets[targetId] || !Number.isFinite(stand?.x) || !Number.isFinite(stand?.z)) throw new Error(`未知或无效 V3 访客目标: ${targetId}`)
    const departure = exit(home)
    return dedupeRoute([...departure, ...publicPath(departure.at(-1), stand).slice(1)])
  }
  const consumerAdvance = (targetId, from, to) => {
    if (!consumerQueues[targetId] || !Number.isFinite(from?.x) || !Number.isFinite(from?.z) || !Number.isFinite(to?.x) || !Number.isFinite(to?.z)) throw new Error(`无效 V3 队列移动: ${targetId}`)
    // 即使前后槽位重合也返回一个有限路径；导演以当前位置判断“无需移动”。
    return dedupeRoute([routePoint(from), routePoint(to)])
  }
  const consumerDeparture = (targetId, stand, back) => {
    if (!consumerQueues[targetId] || !Number.isFinite(stand?.x) || !Number.isFinite(stand?.z) || !Array.isArray(back) || !back.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.z))) throw new Error(`无效 V3 队列离开路径: ${targetId}`)
    return dedupeRoute([routePoint(stand), ...back.slice(1)])
  }
  return {
    roomAt: findRoom, standAt: home => ({ x: home.x, z: home.z }), officeExit: exit, meetingTrip: meetings, officeTrip: trip, boardTrip, corridorPath: publicPath, loungeTrip: lounge,
    consumerTrip: consumer, foyerTrip: consumer, plazaTrip: consumer, foyerReturnTrip: (home, id, stand) => consumer(home, id, stand).toReversed().map(routePoint), consumerAdvance, consumerDeparture, consumerTargets, consumerQueues,
    ENTRANCE: entrance, CORRIDOR_X: layout.axis.x, BOARD_DOOR: { x: boardDoor.side === 'west' ? boardRoom.x0 : boardRoom.x1, zOut: boardOutside.z, zIn: boardInside.z, outside: boardOutside, inside: boardInside, side: boardDoor.side }, FOYER_Z: layout.foyer.z1, AISLE_OFFSET: 1.5,
    LOUNGE_AREA: { x: layout.bar.center.x, z: layout.bar.center.z, width: 12, depth: 6, entryZ: lanes.foyer.z },
    LOUNGE_SEATS: barLounges(layout),
    COFFEE_SEATS: layout.bar.seats.map(seat => ({ ...seat, yaw: Math.atan2(seat.x - layout.axis.x, seat.z - layout.bar.center.z), appX: seat.x })),
  }
}

// 调用方持有选定版本；旧版导出和数据不参与重写。
export function createOfficeNavigation(layout = LAYOUT_V1) {
  if (layout.version === 3) return createOfficeV3Navigation(layout)
  if (layout.version !== 2) return LAYOUT_V1
  const rooms = layout.regions, center = layout.bar.center, corridors = layout.corridors
  const northZ = (corridors.north.z0 + corridors.north.z1) / 2, southZ = (corridors.south.z0 + corridors.south.z1) / 2
  const ringRadius = (corridors.centralRing.r0 + corridors.centralRing.r1) / 2
  const point = p => ({ x: p.x, z: p.z })
  const atRoom = p => rooms.find(r => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)
  const outside = r => ({ x: r.doors[0].at, z: r.doors[0].side === 'south' ? northZ : southZ })
  const entrance = { x0: -2, x1: 6, inner: { x: -2, z: 12.5 }, gate: [{ x: -1.5, z: 16.5 }, { x: -1.5, z: 17.5 }] }
  const ringPoint = (angle, radius = ringRadius) => ({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius })
  const radial = p => {
    const angle = Math.atan2(p.z - center.z, p.x - center.x)
    return { angle, point: ringPoint(angle) }
  }
  const ringArc = (a, b, side) => {
    let delta = b - a
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    if (Math.abs(Math.abs(delta) - Math.PI) < .01) delta = (Math.cos(a + Math.PI / 2) * side > 0 ? 1 : -1) * Math.PI
    const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 24)))
    return Array.from({ length: count }, (_, i) => ringPoint(a + delta * (i + 1) / count))
  }
  const connector = p => {
    if (p.z <= corridors.north.z1) return [point(p), { x: p.x, z: northZ }]
    if (p.z <= corridors.south.z1 && p.z >= corridors.south.z0) return [point(p), { x: p.x, z: southZ }]
    if (p.z <= 7) return [point(p), radial(p).point]
    const result = [point(p)]
    if (p.z > 16) result.push({ x: -1.5, z: p.z }, { x: -1.5, z: 15.5 }, { x: -2, z: 15.5 })
    else if (p.x > 4.75) result.push({ x: 6, z: p.z }, { x: 6, z: 13.25 }, { x: -2, z: 13.25 })
    else result.push({ x: -2, z: p.z })
    return [...result, { x: -2, z: southZ }, { x: center.x, z: southZ }]
  }
  const publicPath = (from, to) => {
    if ([from, to].some(p => p.z < layout.envelope.z0 + .3)) throw new Error('北门锁闭，不可导航')
    const left = connector(from), right = connector(to).reverse(), a = left.at(-1), b = right[0], result = [...left]
    const aBand = a.z === northZ ? -1 : a.z === southZ ? 1 : 0, bBand = b.z === northZ ? -1 : b.z === southZ ? 1 : 0
    if (aBand && aBand === bBand) result.push(b)
    else {
      const start = aBand ? { x: 2, z: a.z } : a, end = bBand ? { x: 2, z: b.z } : b
      result.push(start, ...ringArc(radial(start).angle, radial(end).angle, from.x < 2 ? -1 : 1), b)
    }
    result.push(...right.slice(1))
    return result.filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > .001)
  }
  const standAt = home => ({ x: home.x + (atRoom(home)?.doors[0]?.at < home.x ? -1 : 1), z: home.z })
  const exit = home => {
    const room = atRoom(home)
    if (!room) return publicPath(home, { x: 2, z: home.z < -1 ? -8 : 6 })
    const door = room.doors[0]
    if (!door || door.width < .52) throw new Error(`房间没有可用门洞: ${room.id}`)
    const innerZ = door.side === 'south' ? room.z1 - .6 : room.z0 + .6
    const stand = standAt(home)
    return [stand, { x: stand.x, z: innerZ }, { x: door.at, z: innerZ }, outside(room)]
  }
  const trip = (home, targetHome, stand) => {
    const a = exit(home), b = exit(targetHome).reverse()
    return [...a, ...publicPath(a.at(-1), b[0]), ...b.slice(1), point(stand)]
  }
  const meetings = (home, seat) => {
    const room = rooms.find(r => r.id === (seat.room === 'A' ? 'review' : 'plan')), a = exit(home), door = room.doors[0]
    const cx = (room.x0 + room.x1) / 2, cz = -14, result = [...a, ...publicPath(a.at(-1), outside(room)), { x: door.at, z: -9.6 }]
    const sideX = seat.x < cx ? room.x0 + .7 : room.x1 - .7
    if (seat.z < cz - .5) result.push({ x: sideX, z: -10.6 }, { x: sideX, z: -16.3 }, { x: seat.x, z: -16.3 })
    else if (seat.z > cz + .5) result.push({ x: seat.x, z: -11.7 })
    else result.push({ x: sideX, z: -10.6 }, { x: sideX, z: seat.z })
    return [...result, point(seat)]
  }
  const lounge = (home, seat) => {
    const a = exit(home), approach = radial(seat).point
    return [...a, ...publicPath(a.at(-1), approach), point(seat)]
  }
  const targets = { ...FOYER_TARGETS, A1: { x: -8, z: 15.2 }, A2: { x: -6, z: 15.2 }, desk: { x: 8, z: 14 }, waiting_sofa: { x: 13.5, z: 15 } }
  const consumer = (home, id) => {
    const target = targets[id] || consumerTarget(id), a = exit(home)
    if (target.z <= 16) return [...a, ...publicPath(a.at(-1), target)]
    const laneX = target.x < 2 ? -3.5 : 7
    return [...a, ...publicPath(a.at(-1), entrance.inner), ...entrance.gate, { x: laneX, z: 17.5 }, { x: laneX, z: target.z }, point(target)]
  }
  return {
    roomAt: atRoom, standAt, officeExit: exit, corridorPath: publicPath, officeTrip: trip, meetingTrip: meetings, loungeTrip: lounge,
    consumerTrip: consumer, foyerTrip: consumer, plazaTrip: consumer, foyerReturnTrip: (home, id) => consumer(home, id).toReversed().map(point),
    consumerAdvance: (id, from, to) => publicPath(from, to), consumerDeparture: (id, stand, back) => back.map(point),
    ENTRANCE: entrance, CORRIDOR_X: 2, BOARD_DOOR: { x: -22.5, zOut: -8, zIn: -10 }, FOYER_Z: 12.5, AISLE_OFFSET: 1.5,
    LOUNGE_AREA: { x: 2, z: -1, width: 12, depth: 6, entryZ: southZ },
    LOUNGE_SEATS: barLounges(layout),
    COFFEE_SEATS: layout.bar.seats.map(seat => ({ ...seat, yaw: Math.atan2(seat.x - 2, seat.z + 1), appX: seat.x })),
  }
}
