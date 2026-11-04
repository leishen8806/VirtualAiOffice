// WH-R1-I6：07 调度中控 / 08 访客接待 / 09 展示 / 10 办公会议 / 11 设备维护 五区的登记对象与室内绿植。
// 表现与模拟数据接口按卡片「按文件摘取并适配」从 dr-vis2-dispatch-suite.js（B5 调度套件，已在 main 上，未改动该文件）复用：
// drawDispatchWall / drawDeskAtlas / drawShowcaseAtlas 都是纯函数，没有快照时显示「–」并常驻「模拟数据 · 示意」。
// 本模块不编造运行数值、不加定时器 / RAF / 随机数；屏幕内容只在 build 时按传入快照画一次。
// 坐标、尺寸、底标高一律取 wh-r1/data.js 的登记值（只读）：世界 y = 楼板基准 WH_R1_FLOOR_Y + 登记 zM。
import { WH_R1_DATA, WH_R1_ASSIGNMENT } from './wh-r1/data.js'
import { WH_R1_FLOOR_Y, runtimeYawFromFacing, whToWorld } from './wh-r1-layout.js'
import { VIS2B_COLORS, drawDeskAtlas, drawDispatchWall, drawShowcaseAtlas } from './dr-vis2-dispatch-suite.js'

const assigned = new Set(WH_R1_ASSIGNMENT.filter(row => row.card === 'I6').map(row => row.id))
export const WH_R1_FRONT = Object.freeze(WH_R1_DATA.elements.filter(row => assigned.has(row.id)))
const byId = new Map(WH_R1_DATA.elements.map(row => [row.id, row]))
const zoneById = new Map(WH_R1_DATA.zones.map(zone => [zone.id, zone]))
// H01 是 1.75 m 的站立人体头部高度，用于绿植冠幅的通行高度登记（见 I6-3）。
export const WH_R1_HEAD_BAND_M = WH_R1_DATA.bodyProfiles.find(row => row.id === 'H01').height_mm / 1000
const SEAT_CATEGORIES = ['椅子', '休闲椅']
// 只有这三类父对象用「子件包围盒并集」代表自己；工作台的子件是显示终端，不并入台面包围盒。
const ASSEMBLY_PARENTS = ['椅子', '休闲椅', '绿植总成']

// 登记表里 facingLocal 对座位是「靠背方向」（与朝向相反），对面板类是「法向」，两者口径不一致，
// 因此座位朝向一律由登记的 BACK 子件与座位中心推出：facing = 座位 − 靠背（世界轴）。
// 实测 36/36 座位满足 facing = (−facingLocal.x, facingLocal.y)，见 wh-r1-front.test.mjs。
export const whR1FacingFromRear = seat => {
  const back = byId.get(`${seat.id}-BACK`), s = whToWorld(seat.xM, seat.yM), b = whToWorld(back.xM, back.yM)
  const x = s.x - b.x, z = s.z - b.z, n = Math.hypot(x, z) || 1
  return Object.freeze({ x: x / n, z: z / n })
}
export const WH_R1_FRONT_SEATS = Object.freeze(WH_R1_FRONT.filter(row => SEAT_CATEGORIES.includes(row.category)).map(seat => {
  const facing = whR1FacingFromRear(seat)
  return Object.freeze({ id: seat.id, category: seat.category, regionId: seat.regionId, facing, yaw: runtimeYawFromFacing(facing.x, facing.z) })
}))
// 图纸冲突（保留为失败，不在本卡修正）：08 区两个座谈组的休闲椅，靠背被登记在座位与茶几之间，
// 两把椅子背对背、都背朝自己的茶几。数据文件 wh-r1/data.js 本卡只读，故原样呈现并登记。
export const WH_R1_FRONT_SEAT_CONFLICTS = Object.freeze(WH_R1_FRONT_SEATS
  .filter(seat => seat.category === '休闲椅')
  .map(seat => {
    const row = byId.get(seat.id), tables = WH_R1_FRONT.filter(r => r.category === '工作台')
    const table = tables.reduce((best, t) => { const d = Math.hypot(t.xM - row.xM, t.yM - row.yM); return d < best.d ? { t, d } : best }, { t: null, d: Infinity }).t
    const a = whToWorld(row.xM, row.yM), b = whToWorld(table.xM, table.yM)
    return Object.freeze({ id: seat.id, tableId: table.id, dot: Number((seat.facing.x * (b.x - a.x) + seat.facing.z * (b.z - a.z)).toFixed(6)), reason: '登记靠背位于座位与茶几之间，朝向背离本组茶几' })
  }))
// 绿植总成逐株分层登记：盆器 / 树干 / 冠幅各自的底标高与高度，以及冠幅切入 H01 头部高度带的量。
export const WH_R1_FRONT_PLANTING = Object.freeze(WH_R1_FRONT.filter(row => row.category === '绿植总成').map(row => {
  const layers = ['POT', 'TRUNK', 'CROWN'].map(suffix => byId.get(`${row.id}-${suffix}`))
  const crown = layers[2]
  return Object.freeze({
    id: row.id, regionId: row.regionId, layers: Object.freeze(layers.map(part => part.id)),
    spans: Object.freeze(layers.map(part => Object.freeze({ id: part.id, category: part.category, baseM: part.zM, topM: Number((part.zM + part.heightM).toFixed(6)) }))),
    headBandIntrusionM: Number(Math.max(0, Math.min(crown.zM + crown.heightM, WH_R1_HEAD_BAND_M) - crown.zM).toFixed(6)),
  })
}))

const ATLAS = Object.freeze({ width: 2048, height: 1024 })
// 大屏 10.5:2.5 = 4.2、展示背景面 13:3 = 4.333、终端 0.65:0.45 = 1.444，三块图集区按同比例切，避免拉伸。
const REGIONS = Object.freeze({
  wall: Object.freeze({ x: 0, y: 0, w: 1536, h: 366 }),
  showcase: Object.freeze({ x: 0, y: 384, w: 1536, h: 354 }),
  desk: Object.freeze({ x: 1536, y: 0, w: 512, h: 352 }),
})
const uvRect = region => [region.x / ATLAS.width, 1 - (region.y + region.h) / ATLAS.height,
  (region.x + region.w) / ATLAS.width, 1 - region.y / ATLAS.height]
const SCREEN_REGION = Object.freeze({ 调度大屏: REGIONS.wall, 展示背景面: REGIONS.showcase, 显示终端: REGIONS.desk })

export function buildWhR1Front({ THREE, root, collision, canvasTex, quality, snapshot = null } = {}) {
  const group = new THREE.Group(); group.name = 'wh-r1-front'; group.position.y = WH_R1_FLOOR_Y; root.add(group)
  const low = quality?.tier === 'low'
  const parts = { boxes: [], cylinders: [], foliage: [], glass: [], zones: [], markers: [] }
  const meshes = [], proxies = [], screens = []

  // 子件在父对象的本地系里定位：本地 +x → 世界 (cos yaw, −sin yaw)，本地 +z → 世界 (sin yaw, cos yaw)。
  const place = (row, [x, y, z]) => {
    const p = whToWorld(row.xM, row.yM), yaw = row.yawDeg * Math.PI / 180
    return { x: p.x + x * Math.cos(yaw) + z * Math.sin(yaw), y: row.zM + y, z: p.z - x * Math.sin(yaw) + z * Math.cos(yaw), yaw }
  }
  const put = (kind, row, offset, size, color, rotationX = 0) => {
    const parent = byId.get(row.parentId)
    parts[kind].push({ id: row.id, parentId: ASSEMBLY_PARENTS.includes(parent?.category) ? row.parentId : null, ...place(row, offset), size, color, rotationX })
  }
  const box = (row, offset, size, color) => put('boxes', row, offset, size, color)
  const proxy = row => {
    const p = whToWorld(row.xM, row.yM)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(row.lengthM, row.heightM, row.widthM), new THREE.MeshBasicMaterial({ visible: false }))
    mesh.position.set(p.x, row.zM + row.heightM / 2, p.z); mesh.rotation.y = row.yawDeg * Math.PI / 180
    mesh.name = `wh-r1-front-proxy-${row.id}`; mesh.userData = { whR1Id: row.id, noMerge: true, collisionProxy: true }
    group.add(mesh); collision?.add(mesh, row.category); proxies.push(mesh)
  }
  // 正面在「薄轴」上：登记的 lengthM 沿本地 x、widthM 沿本地 z，哪个短就是进深方向。
  // 展示柜 1.5×3 的正面在本地 x，调度大屏 / 背景面 / 显示终端 / 设备柜的正面在本地 z。
  // 本地 +x → 世界 (cos yaw, −sin yaw)，本地 +z → 世界 (sin yaw, cos yaw)，据此把世界向量投到本地轴上取符号。
  const project = (row, dx, dz, axis) => {
    const yaw = row.yawDeg * Math.PI / 180
    return axis === 'x' ? dx * Math.cos(yaw) - dz * Math.sin(yaw) : dx * Math.sin(yaw) + dz * Math.cos(yaw)
  }
  const frontFace = (row, toward) => {
    const axis = row.lengthM <= row.widthM ? 'x' : 'z', half = (axis === 'x' ? row.lengthM : row.widthM) / 2
    const p = whToWorld(row.xM, row.yM)
    let target = toward?.(row, p)
    if (!target) { const [x0, x1, z0, z1] = zoneById.get(row.regionId).worldBboxXZ; target = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 } }
    return { axis, half, sign: project(row, target.x - p.x, target.z - p.z, axis) >= 0 ? 1 : -1 }
  }
  // 显示终端朝使用它的座位；同区最近的座位决定正面，没有座位时退回朝区域内部。
  const nearestSeat = (row, p) => {
    let best = null, dist = Infinity
    for (const seat of WH_R1_FRONT) {
      if (!SEAT_CATEGORIES.includes(seat.category) || seat.regionId !== row.regionId) continue
      const s = whToWorld(seat.xM, seat.yM), d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < dist) { dist = d; best = s }
    }
    return best
  }
  const offsetAlong = (face, y, inset = 0) => face.axis === 'x'
    ? [face.sign * (face.half - inset), y, 0]
    : [0, y, face.sign * (face.half - inset)]
  const sizeAcross = (row, face, thickness, margin) => face.axis === 'x'
    ? [thickness, row.heightM - margin.h, row.widthM - margin.a]
    : [row.lengthM - margin.a, row.heightM - margin.h, thickness]
  // 屏幕只画在薄轴为本地 z 的面板上（大屏 / 背景面 / 终端都是），展示柜走玻璃不走贴图。
  const screen = (row, face) => { if (face.axis === 'z') screens.push({ row, face, region: SCREEN_REGION[row.category] }) }

  // 台面：顶板给足长宽，四条腿补到地面，并集正好是登记体积。
  const table = row => {
    const { lengthM: l, widthM: w, heightM: h } = row
    box(row, [0, h - .04, 0], [l, .08, w], VIS2B_COLORS.oak)
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(row, [x * (l / 2 - .05), (h - .08) / 2, z * (w / 2 - .05)], [.1, h - .08, .1], VIS2B_COLORS.chairFrame)
  }
  // 柜体：四角立柱撑满登记体积（并集正好是登记体积），顶底板与背板留在体积内部。
  const cabinet = (row, body, door) => {
    const { lengthM: l, widthM: w, heightM: h } = row, face = frontFace(row)
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(row, [x * (l / 2 - .04), h / 2, z * (w / 2 - .04)], [.08, h, .08], door)
    box(row, [0, .03, 0], [l, .06, w], body); box(row, [0, h - .03, 0], [l, .06, w], body)
    const back = { ...face, sign: -face.sign }
    box(row, offsetAlong(back, h / 2, .03), sizeAcross(row, back, .06, { h: .12, a: .08 }), body)
    return face
  }

  for (const row of WH_R1_FRONT) {
    const { category: cat, lengthM: l, widthM: w, heightM: h } = row
    if (cat === '工作台') { table(row); proxy(row) }
    else if (SEAT_CATEGORIES.includes(cat)) proxy(row)                       // 外形来自 BASE / SEAT / BACK 子件
    else if (cat === '椅子子件') {
      const parent = byId.get(row.parentId)
      if (row.id.endsWith('-BASE') && parent.category === '椅子') {           // 转椅：十字脚 + 气压柱
        box(row, [0, .03, 0], [l, .06, .1], VIS2B_COLORS.chairFrame)
        box(row, [0, .03, 0], [.1, .06, w], VIS2B_COLORS.chairFrame)
        box(row, [0, (h + .06) / 2, 0], [.12, h - .06, .12], VIS2B_COLORS.steel)
      } else box(row, [0, h / 2, 0], [l, h, w], row.id.endsWith('-BASE') ? VIS2B_COLORS.sofa : VIS2B_COLORS.chairSeat)
    }
    else if (cat === '显示终端') { box(row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.graphite); screen(row, frontFace(row, nearestSeat)); proxy(row) }
    else if (cat === '调度大屏') {                                            // 中控后墙大屏：机身 + 内框
      box(row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.graphite)
      if (!low) for (const y of [.04, h - .04]) box(row, [0, y, 0], [l - .1, .03, w], VIS2B_COLORS.steel)
      screen(row, frontFace(row)); proxy(row)
    }
    else if (cat === '展示背景面') { box(row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.wall); screen(row, frontFace(row)); proxy(row) }
    else if (cat === '展示岛') {                                              // 展示岛：台面 + 内缩基座
      box(row, [0, h - .03, 0], [l, .06, w], VIS2B_COLORS.stone)
      box(row, [0, (h - .06) / 2, 0], [l - .2, h - .06, w - .2], VIS2B_COLORS.oakDark); proxy(row)
    }
    else if (cat === '展示样品占位') {                                        // 样品占位：本体 + 腰线（占位，不代表真实样品）
      box(row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.niche)
      if (!low) box(row, [0, h * .2, 0], [l - .06, .02, w - .06], VIS2B_COLORS.gold); proxy(row)
    }
    else if (cat === '展示柜') {                                              // 展示柜：柱架 + 层板 + 正面玻璃（进深 1.5 m 在本地 x，玻璃随薄轴走）
      const face = cabinet(row, VIS2B_COLORS.oakDark, VIS2B_COLORS.graphite)
      for (const y of [h * .33, h * .66]) box(row, [0, y, 0], [l - .1, .04, w - .1], VIS2B_COLORS.stone)
      put('glass', row, offsetAlong(face, h / 2, .02), sizeAcross(row, face, .01, { h: .14, a: .1 }), VIS2B_COLORS.glass); proxy(row)
    }
    else if (cat === '设备柜') { cabinet(row, VIS2B_COLORS.steel, VIS2B_COLORS.graphite); proxy(row) }
    else if (cat === '检修控制区') {                                          // nonphysical_control：地面标记 + 四角立柱，不参与碰撞
      put('zones', row, [0, .002, 0], [l, .004, w], VIS2B_COLORS.gold)
      for (const x of [-1, 1]) for (const z of [-1, 1]) put('zones', row, [x * (l / 2 - .04), h / 2, z * (w / 2 - .04)], [.08, h, .08], VIS2B_COLORS.gold)
    }
    else if (cat === '盆器') { put('cylinders', row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.pot); proxy(row) }
    else if (cat === '树干') { put('cylinders', row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.oakDark); proxy(row) }
    else if (cat === '冠幅') { put('foliage', row, [0, h / 2, 0], [l, h, w], VIS2B_COLORS.leaf); proxy(row) }
    else if (cat !== '绿植总成') throw new Error(`Unknown WH-R1 front category: ${cat}`)
  }
  // 图纸冲突可见化：在背朝茶几的休闲椅靠背一侧画一块地面标记，复审可直接看到，不得靠移动椅子消除。
  for (const conflict of WH_R1_FRONT_SEAT_CONFLICTS) {
    const seat = byId.get(conflict.id), facing = WH_R1_FRONT_SEATS.find(s => s.id === conflict.id).facing
    const p = whToWorld(seat.xM, seat.yM)
    parts.markers.push({ id: `${conflict.id}-facing-conflict`, parentId: null, x: p.x - facing.x * .6, y: .004, z: p.z - facing.z * .6, yaw: 0, size: [.5, .008, .5], color: 0xe24636 })
  }

  const object = new THREE.Object3D()
  const setMatrix = (mesh, index, item) => {
    object.position.set(item.x, item.y, item.z); object.rotation.set(0, item.yaw, 0)
    object.rotateX(item.rotationX || 0); object.scale.set(...item.size); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix)
  }
  const batch = (name, geometry, rows, material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length)
    mesh.name = `wh-r1-front-${name}`
    mesh.userData = { instanceToRegisterId: rows.map(r => r.id), assemblyIds: rows.map(r => r.parentId), noMerge: true }
    rows.forEach((r, i) => { setMatrix(mesh, i, r); mesh.setColorAt(i, new THREE.Color(r.color ?? 0xb58a54)) })
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    group.add(mesh); meshes.push(mesh); return mesh
  }
  for (const [name, rows] of Object.entries(parts)) {
    const geometry = name === 'foliage' ? new THREE.SphereGeometry(.5, low ? 8 : 12, low ? 6 : 8)
      : name === 'cylinders' ? new THREE.CylinderGeometry(.5, .5, 1, low ? 8 : 12)
        : new THREE.BoxGeometry(1, 1, 1)
    const material = name === 'zones' || name === 'markers'
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: name === 'zones' ? .18 : .5, depthWrite: false })
      : name === 'glass'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .08, metalness: 0, transparent: true, opacity: .32 })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .72 })
    batch(name, geometry, rows, material)
  }

  // 一张图集 + 一个网格承载全部 24 块屏（大屏 1 + 背景面 1 + 终端 22），缺快照时三块区域各自显示「–」。
  let screenMesh = null
  if (canvasTex && screens.length) {
    const texture = canvasTex(ATLAS.width, ATLAS.height, (ctx, width, height) => {
      ctx.fillStyle = '#071a26'; ctx.fillRect(0, 0, width, height)
      const draw = (region, render) => {
        ctx.save(); ctx.translate(region.x, region.y)
        ctx.beginPath(); ctx.rect(0, 0, region.w, region.h); ctx.clip()
        render(ctx, region.w, region.h, snapshot); ctx.restore()
      }
      draw(REGIONS.wall, drawDispatchWall)
      draw(REGIONS.showcase, (c, w, h) => drawShowcaseAtlas(c, w, h))
      draw(REGIONS.desk, drawDeskAtlas)
    })
    const positions = [], uvs = [], indices = []
    for (const { row, face, region } of screens) {
      const [u0, v0, u1, v1] = uvRect(region), base = positions.length / 3
      // 画面贴在正面外侧 1 mm（登记体积是控制体，1 mm 远小于 5 mm 对账口径）；
      // 正面朝 −z 时左右反向取点，避免贴图镜像。
      const hl = row.lengthM / 2 - .015, flip = face.sign > 0 ? 1 : -1
      const z = face.sign * (face.half + .001), lo = .015, hi = row.heightM - .015
      for (const [x, y] of [[-hl * flip, lo], [hl * flip, lo], [hl * flip, hi], [-hl * flip, hi]]) {
        const p = place(row, [x, y, z]); positions.push(p.x, p.y, p.z)
      }
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    screenMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
    screenMesh.name = 'wh-r1-front-screens'; screenMesh.userData.noMerge = true; group.add(screenMesh)
  }

  group.userData.registerIds = WH_R1_FRONT.map(r => r.id)
  group.userData.orientations = WH_R1_FRONT_SEATS
  let disposed = false
  return {
    root: group, records: WH_R1_FRONT, orientations: WH_R1_FRONT_SEATS, seats: WH_R1_FRONT_SEATS,
    conflicts: WH_R1_FRONT_SEAT_CONFLICTS, planting: WH_R1_FRONT_PLANTING, screens: screens.length,
    summary: () => Object.freeze({ records: WH_R1_FRONT.length, seats: WH_R1_FRONT_SEATS.length, screens: screens.length, snapshot: snapshot?.generatedAt ?? null }),
    dispose() {
      if (disposed) return
      disposed = true
      proxies.forEach(p => { collision?.remove(p); p.geometry.dispose(); p.material.dispose() })
      meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); m.dispose() })
      if (screenMesh) { screenMesh.geometry.dispose(); screenMesh.material.map?.dispose(); screenMesh.material.dispose() }
      group.removeFromParent()
    },
  }
}
