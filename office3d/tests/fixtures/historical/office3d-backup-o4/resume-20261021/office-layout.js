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
  layoutRect('drlife', 'Dr.life+ 工作室', 9, 27, 7, 13, { side: 'north', at: 18 }),
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
const V2_BAR_SEGMENTS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * 30 + 15) * Math.PI / 180
  const cx = V2_BAR_CENTER.x + Math.cos(angle) * 3.5
  const cz = V2_BAR_CENTER.z + Math.sin(angle) * 3.5
  const half = (value) => Math.round(value * 2) / 2
  return { index, x0: half(cx - 0.9), x1: half(cx + 0.9), z0: half(cz - 0.9), z1: half(cz + 0.9), angle: index * 30 + 15 }
})

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
export const resolveOfficeLayout = (search = '') => {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''))
  return params.getAll('layout').length === 1 && params.get('layout') === '2' ? LAYOUT_V2 : LAYOUT_V1
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
