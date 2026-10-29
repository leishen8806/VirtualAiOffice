import { r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'
import { buildHeartBanyan } from '../office-heart-banyan.js'
import { createSampleBatch } from './batch.js'

// Exact sector shapes from the R1 element register; its compact runtime rows retain only bounding boxes.
export const r1IslandSectors = Object.freeze([[145, 174], [184, 215], [-35, -4], [6, 35], [115, 135], [45, 65]].map(angles => Object.freeze(angles)))

function sector(THREE, inner, outer, a0, a1, height, opening = 0) {
  const shape = new THREE.Shape(), half = opening / 2
  const outerStart = opening ? Math.PI / 2 + Math.asin(half / outer) : a0
  const outerEnd = opening ? Math.PI * 2.5 - Math.asin(half / outer) : a1
  const innerStart = opening ? Math.PI / 2 + Math.asin(half / inner) : a0
  const innerEnd = opening ? Math.PI * 2.5 - Math.asin(half / inner) : a1
  shape.absarc(0, 0, outer, outerStart, outerEnd, false)
  shape.lineTo(inner * Math.cos(innerEnd), inner * Math.sin(innerEnd))
  shape.absarc(0, 0, inner, innerEnd, innerStart, true); shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 96 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

// ── OFFICE-R1-FOOD：低多边形程序食物 ────────────────────────────────────────────
// 素材包里没有食物，所以食物全是程序几何，并且走调用方自己的合批器（顶点色 + 一套表面
// 参数），因此不新增材质、贴图或绘制批次。吧台与广场共用这一套，避免两份重复的形状代码。
export const R1_FOOD_COLOR = Object.freeze({
  crust: '#C0803C', crumb: '#EFDFBC', croissant: '#D9A253', glaze: '#D9638C', sponge: '#F2DEB0',
  cream: '#FAF2E4', apple: '#C33B2B', orange: '#E08A28', lime: '#8CB23C', berry: '#A62F4A',
  juice: '#EFA12C', coffee: '#4A2E20', cup: '#F4EFE6', bread: '#E0BC84', lettuce: '#7CA855',
  ham: '#D4786C', tray: '#7E5F42', basket: '#AD8349',
})

// 挤出件：先在 XY 平面画闭合轮廓，再 rotateX(-π/2) 把挤出方向转成世界 +Y，底面正好落在 y = 0。
const extruded = (THREE, shape, height, segments) => {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: segments })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}
// 蛋糕片：扇形挤出，比 thetaLength 截断的圆柱多两个封边面，侧面不会露空。
// moveTo 只移动画笔、不产生线段：少了这条 lineTo，closePath 会把圆心短路掉，
// 剩下「弧 + 弦」的薄月牙（实测 x 向只有 13 mm），所以圆心到弧端必须显式连线。
const wedge = (THREE, radius, height, arc, segments) => {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(radius * Math.cos(-arc / 2), radius * Math.sin(-arc / 2))
  shape.absarc(0, 0, radius, -arc / 2, arc / 2, false)
  shape.closePath()
  const geometry = extruded(THREE, shape, height, segments)
  // 扇形在 shape-x 上从圆心 0 伸到半径：整体挪半个半径就水平居中。
  geometry.translate(-radius / 2, 0, 0)
  return geometry
}
// 三明治层：等腰三角形挤出，水平居中。
const slab = (THREE, half, depth, height) => {
  const shape = new THREE.Shape()
  shape.moveTo(-half, -depth / 2); shape.lineTo(half, -depth / 2); shape.lineTo(0, depth / 2); shape.closePath()
  return extruded(THREE, shape, height, 1)
}
// 把件压到 base 高度：径向只有 5 段的圆环截面是五边形，最低点不在 −tube 上，
// 所以不能用名义半径去抬高，必须量过真实包围盒再落。
const ground = (geometry, base = 0) => {
  geometry.computeBoundingBox()
  geometry.translate(0, base - geometry.boundingBox.min.y, 0)
  return geometry
}
// 水平居中并压到台面：用在不对称的件上（比如只有一段圆弧的牛角包）。
const centred = geometry => {
  ground(geometry)
  const box = geometry.boundingBox
  geometry.translate(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2)
  return geometry
}
const flatTorus = (THREE, radius, tube, segments) => {
  const geometry = new THREE.TorusGeometry(radius, tube, 5, segments)
  geometry.rotateX(Math.PI / 2)
  return geometry
}
// 托盘 / 篮子：一块底板加四面矮边，内部空着，食物直接摆在底板上。
const openBox = (THREE, length, width, height, wall, floor) => {
  const pieces = [{ geometry: new THREE.BoxGeometry(length, floor, width), dx: 0, dy: floor / 2, dz: 0 }]
  for (const side of [-1, 1]) {
    pieces.push({ geometry: new THREE.BoxGeometry(length, height, wall), dx: 0, dy: height / 2, dz: side * (width - wall) / 2 })
    pieces.push({ geometry: new THREE.BoxGeometry(wall, height, width - 2 * wall), dx: side * (length - wall) / 2, dy: height / 2, dz: 0 })
  }
  return pieces
}

export const R1_FOOD_KINDS = Object.freeze(['bread', 'croissant', 'donut', 'cake', 'apple', 'orange', 'lime', 'berry', 'coffeeCup', 'juiceCup', 'sandwich', 'tray', 'basket'])

// 每种食物件都「水平居中、底面贴 y = 0」，调用方只负责给台面高度；dx / dy / dz 是件内各块的局部偏移。
export function r1FoodPieces(THREE, kind, low = false) {
  const n = low ? 6 : 10, rings = Math.max(4, n >> 1), out = []
  const put = (geometry, tint, dx = 0, dy = 0, dz = 0) => out.push({ geometry, tint, dx, dy, dz })
  const ball = (radius, tint) => { const g = new THREE.SphereGeometry(radius, n, rings); put(g, tint, 0, radius) }
  switch (kind) {
    case 'bread': {
      const loaf = new THREE.SphereGeometry(.5, n, rings); loaf.scale(.22, .075, .09)
      put(loaf, R1_FOOD_COLOR.crust, 0, .0375)
      for (const dx of [-.06, 0, .06]) { const cut = new THREE.BoxGeometry(.014, .016, .07); cut.rotateY(.45); put(cut, R1_FOOD_COLOR.crumb, dx, .062) }
      break
    }
    case 'croissant': {
      const horn = new THREE.TorusGeometry(.055, .021, 5, n, Math.PI * 1.15); horn.rotateX(Math.PI / 2)
      put(centred(horn), R1_FOOD_COLOR.croissant)
      break
    }
    case 'donut': {
      const base = ground(flatTorus(THREE, .045, .019, n))
      put(base, R1_FOOD_COLOR.crust)
      // 糖霜稍微陷进面圈顶部，侧面看是一层，不是悬空的第二个圈。
      put(ground(flatTorus(THREE, .046, .015, n), base.boundingBox.max.y - .016), R1_FOOD_COLOR.glaze)
      break
    }
    case 'cake':
      put(wedge(THREE, .085, .05, Math.PI / 2.8, n), R1_FOOD_COLOR.sponge)
      put(wedge(THREE, .085, .012, Math.PI / 2.8, n), R1_FOOD_COLOR.cream, 0, .05)
      break
    case 'apple': case 'orange': case 'lime':
      ball(.038, R1_FOOD_COLOR[kind]); break
    case 'berry':
      ball(.022, R1_FOOD_COLOR.berry); break
    case 'coffeeCup': case 'juiceCup': {
      const body = new THREE.CylinderGeometry(.036, .028, .105, n)
      put(body, R1_FOOD_COLOR.cup, 0, .0525)
      const lid = new THREE.CylinderGeometry(.04, .04, .013, n)
      put(lid, kind === 'coffeeCup' ? R1_FOOD_COLOR.coffee : R1_FOOD_COLOR.juice, 0, .1115)
      break
    }
    case 'sandwich': {
      let y = 0
      for (const [thickness, tint] of [[.012, R1_FOOD_COLOR.bread], [.007, R1_FOOD_COLOR.ham], [.006, R1_FOOD_COLOR.lettuce], [.012, R1_FOOD_COLOR.bread]]) {
        put(slab(THREE, .055, .075, thickness), tint, 0, y); y += thickness
      }
      break
    }
    case 'tray':
      for (const piece of openBox(THREE, .34, .22, .026, .012, .014)) put(piece.geometry, R1_FOOD_COLOR.tray, piece.dx, piece.dy, piece.dz)
      break
    case 'basket':
      for (const piece of openBox(THREE, .26, .2, .07, .013, .014)) put(piece.geometry, R1_FOOD_COLOR.basket, piece.dx, piece.dy, piece.dz)
      break
    default:
      throw new Error(`未知的 R1 食物件 ${kind}`)
  }
  return out
}

// ── OFFICE-R1-FOOD：中央环形吧台的台面设备与食物陈列 ────────────────────────────
// 台面是半径 2.9–3.65 m 的环带，净宽 .75 m，台面高取登记的 07-BAR-001 heightM。
// 所有新件都摆在内半圈：外沿留 ≥ .35 m 给吧凳一侧取物，员工入口（θ = 90°）两侧各避开 45°。
export const R1_BAR_COUNTER = Object.freeze({ equipmentRadius: 3.12, caseRadius: 3.2, entryThetaDeg: 90, entryKeepOutDeg: 45 })

// 设备只认仓库 assets/models/furniture 下登记的 Kenney Furniture Kit 件（CC0）；
// size 是摆到台面上的真实尺寸（x 沿台面切向、y 高、z 沿半径方向）。
export const R1_BAR_EQUIPMENT = Object.freeze([
  { id: '07-BAR-CM-001', model: 'kitchenCoffeeMachine', thetaDeg: 205, size: Object.freeze({ x: .30, y: .42, z: .34 }) },
  { id: '07-BAR-CM-002', model: 'kitchenCoffeeMachine', thetaDeg: 235, size: Object.freeze({ x: .30, y: .42, z: .34 }) },
  { id: '07-BAR-TS-001', model: 'toaster', thetaDeg: 265, size: Object.freeze({ x: .32, y: .21, z: .20 }) },
  { id: '07-BAR-BL-001', model: 'kitchenBlender', thetaDeg: 295, size: Object.freeze({ x: .19, y: .38, z: .19 }) },
].map(Object.freeze))

// 杯架：两层搁板加六只杯子，全程序几何。
export const R1_BAR_CUP_RACK = Object.freeze({ id: '07-BAR-CR-001', thetaDeg: 325, length: .44, depth: .22, height: .30 })

// 两座玻璃食物陈列柜：柜体深色木 + 金属角柱走主合批，玻璃单独一个半透明批次。
export const R1_BAR_CASE_SIZE = Object.freeze({ length: 1.2, depth: .5, height: .45 })
export const R1_BAR_CASES = Object.freeze([
  { id: '07-BAR-DC-001', thetaDeg: 25, shelves: Object.freeze([Object.freeze(['bread', 'croissant', 'bread']), Object.freeze(['donut', 'cake', 'donut'])]) },
  { id: '07-BAR-DC-002', thetaDeg: 155, shelves: Object.freeze([Object.freeze(['croissant', 'bread', 'croissant']), Object.freeze(['cake', 'donut', 'cake'])]) },
].map(Object.freeze))

const CASE_COLOR = Object.freeze({ body: '#4A3729', post: '#5A5F62', glass: '#CFE4E8', rack: '#6E7276', cup: '#F4EFE6' })

export function buildR1Island({ THREE, root, layout, collision, quality, low = false, A, placeFurniture }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const lowTier = quality ? quality.tier === 'low' : low
  const group = new THREE.Group(); group.name = 'r1-island'; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), proxies = [], items = [], ownGeometries = []
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const center = r1ToWorld(...layout.r1.data.central.center_m), radii = layout.r1.data.central.radii_m
  const add = (id, geometry, color, x, y, z, yaw = 0, grain = '') => {
    const proxy = new THREE.Mesh(geometry.clone(), proxyMaterial)
    proxy.position.set(x, y, z); proxy.rotation.y = yaw; proxy.name = id; proxy.userData = { r1Id: id, collisionProxy: true }
    ownGeometries.push(proxy.geometry); collision?.add(proxy, id); proxies.push(proxy)
    proxy.updateWorldMatrix(true, false)
    const bounds = new THREE.Box3().setFromObject(proxy)
    const item = { id, position: { x, y, z }, yaw, bounds, startVertex: batch.triangles() * 3 }
    items.push(item)
    batch.add(geometry, color, [x, y, z], yaw, .8, 0, grain)
    item.count = batch.triangles() * 3 - item.startVertex
  }
  const bar = layout.r1.elements.find(row => row.id === '07-BAR-001'), opening = layout.r1.controls.barEntryClearMm / 1000
  add(bar.id, sector(THREE, radii.bar_inner, radii.bar_outer, 0, 0, bar.heightM, opening), '#b18a61', center.x, 0, center.z, 0, 'wood')
  const stools = layout.r1.elements.filter(row => row.regionId === '07' && row.category === '吧凳')
  for (const stool of stools) {
    const p = r1ToWorld(stool.xM, stool.yM), yaw = runtimeYawFromFacing(center.x - p.x, center.z - p.z)
    const geometry = new THREE.CylinderGeometry(stool.lengthM / 2, stool.lengthM / 2, stool.heightM, 20)
    geometry.translate(0, stool.heightM / 2, 0)
    // The solid proxy follows the registered stool envelope; visible furniture has a seat, stem and footrest.
    const proxy = new THREE.Mesh(geometry, proxyMaterial); proxy.position.set(p.x, 0, p.z); proxy.name = stool.id; proxy.userData.collisionProxy = true
    collision?.add(proxy, stool.id); proxies.push(proxy); ownGeometries.push(geometry)
    const bounds = new THREE.Box3().setFromObject(proxy), item = { id: stool.id, position: { x: p.x, y: 0, z: p.z }, yaw, bounds, startVertex: batch.triangles() * 3 }
    items.push(item)
    batch.add(new THREE.CylinderGeometry(.23, .23, .08, 24), '#506a5a', [p.x, .71, p.z], yaw, .93, 0, 'fabric')
    batch.add(new THREE.CylinderGeometry(.045, .065, .63, 12), '#52534e', [p.x, .355, p.z], yaw, .4, .65)
    batch.add(new THREE.CylinderGeometry(.23, .23, .04, 24), '#52534e', [p.x, .02, p.z], yaw, .4, .65)
    const rest = new THREE.TorusGeometry(.17, .018, 6, 24); rest.rotateX(Math.PI / 2)
    batch.add(rest, '#8f8270', [p.x, .28, p.z], yaw, .4, .6)
    item.count = batch.triangles() * 3 - item.startVertex
  }
  r1IslandSectors.forEach(([a0, a1], index) => {
    const id = `07-SF-${String(index + 1).padStart(3, '0')}`, row = layout.r1.elements.find(item => item.id === id)
    add(id, sector(THREE, 6.3, 6.9, a0 * Math.PI / 180, a1 * Math.PI / 180, row.heightM), index < 4 ? '#466a80' : '#a98458', center.x, row.zM, center.z, 0, index < 4 ? 'fabric' : 'wood')
  })
  const plant = layout.r1.elements.find(row => row.id === '07-PL-001')
  const part = suffix => layout.r1.elements.find(row => row.id === `${plant.id}-${suffix}`)
  const pot = part('POT'), crown = part('CR'), trunk = part('TR')
  const tree = buildHeartBanyan({ THREE, root: group, center, low: lowTier,
    fit: { crownDiameter: crown.lengthM, crownBase: crown.zM, totalHeight: plant.heightM, poolDiameter: pot.lengthM, poolHeight: pot.heightM, trunkDiameter: trunk.lengthM, trunkTop: trunk.zM + trunk.heightM } })
  tree.root.userData.r1Id = plant.id
  const potGeometry = new THREE.CylinderGeometry(pot.lengthM / 2, pot.lengthM / 2, pot.heightM, 48)
  const potProxy = new THREE.Mesh(potGeometry, proxyMaterial); potProxy.position.set(center.x, pot.heightM / 2, center.z); potProxy.userData.collisionProxy = true
  collision?.add(potProxy, pot.id); proxies.push(potProxy); ownGeometries.push(potGeometry)

  // ── OFFICE-R1-FOOD：台面设备、杯架与两座玻璃陈列柜 ──
  // 这些件都站在台面上，不落地，所以不注入碰撞（原有吧台壳体已经挡住行人）；
  // 它们也不进 items / proxies，登记件的清单与包围盒保持 I4 验收时的逐值不变。
  const glassBatch = createSampleBatch(THREE), props = [], counterY = bar.heightM
  const propOf = id => {
    let record = props.find(row => row.id === id)
    if (!record) props.push(record = { id, bounds: new THREE.Box3(), yaw: 0, triangles: 0 })
    return record
  }
  // 先在一份副本上量包围盒再交给合批器：合批器会销毁传入的几何体。
  const put = (target, id, geometry, tint, origin, yaw, roughness = .8, metalness = 0, grain = '') => {
    const probe = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    probe.rotateY(yaw); probe.translate(...origin); probe.computeBoundingBox()
    const record = propOf(id); record.bounds.union(probe.boundingBox); record.yaw = yaw
    probe.dispose()
    const before = target.triangles()
    target.add(geometry, tint, origin, yaw, roughness, metalness, grain)
    record.triangles += target.triangles() - before
  }
  // θ 从世界 +X 轴量起、绕向 −Z（与 sector 的轮廓角一致，员工入口在 θ = 90°）。
  const onCounter = (thetaDeg, radius) => {
    const theta = thetaDeg * Math.PI / 180
    const x = center.x + radius * Math.cos(theta), z = center.z - radius * Math.sin(theta)
    // 朝向吧台圆心，也就是工作人员一侧：绕 Y 转 yaw 后件的局部 +Z 轴指向圆心。
    return { x, z, yaw: Math.atan2(center.x - x, center.z - z) }
  }
  // 设备：登记的 Kenney GLB 件缩放到真实尺寸后烤成顶点色，并入主合批（不增加绘制批次）。
  const bakeAsset = (id, group, roughness, metalness) => {
    group.updateWorldMatrix(true, true)
    group.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
      // 源 GLB 的几何体由 assets3d 共享：这里只克隆，不释放原件。
      const baked = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      baked.applyMatrix4(mesh.matrixWorld)
      if (!baked.attributes.normal) baked.computeVertexNormals()
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const color = material?.color || { r: 1, g: 1, b: 1 }, colors = new Float32Array(baked.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
      baked.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      for (const name of Object.keys(baked.attributes)) if (!['position', 'normal', 'color'].includes(name)) baked.deleteAttribute(name)
      put(batch, id, baked, null, [0, 0, 0], 0, roughness, metalness)
    })
  }
  for (const device of R1_BAR_EQUIPMENT) {
    // 模型还没进 assets3d 的加载清单时整件跳过（不抛错），台面其余陈列照常建。
    if (typeof placeFurniture !== 'function' || !A?.furn?.[device.model]) continue
    const at = onCounter(device.thetaDeg, R1_BAR_COUNTER.equipmentRadius)
    const placed = placeFurniture(A, device.model, at.x, at.z, { scale: 1, y: counterY, rotY: at.yaw })
    placed.group.scale.set(device.size.x / placed.size.x, device.size.y / placed.size.y, device.size.z / placed.size.z)
    placed.group.name = `r1-bar-source-${device.id}`
    bakeAsset(device.id, placed.group, .5, .35)
    propOf(device.id).yaw = at.yaw
  }
  {
    const rack = R1_BAR_CUP_RACK, at = onCounter(rack.thetaDeg, R1_BAR_COUNTER.equipmentRadius)
    const origin = [at.x, counterY, at.z], post = .022, shelfTops = [.012, .162]
    const metal = (geometry, dx, dy, dz) => { geometry.translate(dx, dy, dz); put(batch, rack.id, geometry, CASE_COLOR.rack, origin, at.yaw, .45, .55) }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) metal(new THREE.BoxGeometry(post, rack.height, post), sx * (rack.length - post) / 2, rack.height / 2, sz * (rack.depth - post) / 2)
    for (const top of shelfTops) metal(new THREE.BoxGeometry(rack.length, .012, rack.depth), 0, top - .006, 0)
    for (const top of shelfTops) for (const dx of lowTier ? [-.1, .1] : [-.14, 0, .14]) {
      const cup = new THREE.CylinderGeometry(.034, .028, .085, lowTier ? 6 : 10)
      cup.translate(dx, top + .0425, 0)
      put(batch, rack.id, cup, CASE_COLOR.cup, origin, at.yaw, .35)
    }
  }
  for (const unit of R1_BAR_CASES) {
    const at = onCounter(unit.thetaDeg, R1_BAR_COUNTER.caseRadius), origin = [at.x, counterY, at.z]
    const { length: L, depth: D, height: H } = R1_BAR_CASE_SIZE
    const body = (geometry, dx, dy, dz, tint, roughness, metalness, grain = '') => { geometry.translate(dx, dy, dz); put(batch, unit.id, geometry, tint, origin, at.yaw, roughness, metalness, grain) }
    const pane = (geometry, dx, dy, dz) => { geometry.translate(dx, dy, dz); put(glassBatch, unit.id, geometry, CASE_COLOR.glass, origin, at.yaw, .08, .05) }
    body(new THREE.BoxGeometry(L, .035, D), 0, .0175, 0, CASE_COLOR.body, .62, 0, 'wood')
    body(new THREE.BoxGeometry(L, .03, D), 0, H - .015, 0, CASE_COLOR.body, .62, 0, 'wood')
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) body(new THREE.BoxGeometry(.035, H, .035), sx * (L - .035) / 2, H / 2, sz * (D - .035) / 2, CASE_COLOR.post, .42, .6)
    for (const sz of [-1, 1]) pane(new THREE.BoxGeometry(L - .07, H - .065, .01), 0, H / 2, sz * (D - .01) / 2)
    for (const sx of [-1, 1]) pane(new THREE.BoxGeometry(.01, H - .065, D - .07), sx * (L - .01) / 2, H / 2, 0)
    // 柜内分两层：中间那层也是玻璃，下层食物直接摆在柜底板上。
    pane(new THREE.BoxGeometry(L - .07, .01, D - .07), 0, .205, 0)
    unit.shelves.forEach((source, level) => {
      const row = lowTier ? source.slice(0, 2) : source, shelfY = level ? .215 : .035
      const spread = (L - .36) / Math.max(1, row.length - 1)
      row.forEach((kind, index) => {
        for (const piece of r1FoodPieces(THREE, kind, lowTier)) {
          piece.geometry.translate((index - (row.length - 1) / 2) * spread + piece.dx, shelfY + piece.dy, piece.dz)
          put(batch, unit.id, piece.geometry, piece.tint, origin, at.yaw, .62)
        }
      })
    })
  }

  const built = batch.build(group, 'r1-island-surfaces'); built.mesh.userData.itemIds = items.map(item => item.id)
  // 玻璃是唯一的半透明面，单独一个批次（+1 draw call）；不写深度，免得遮住柜内食物。
  const glass = glassBatch.build(group, 'r1-island-glass')
  Object.assign(glass.mesh.material, { transparent: true, opacity: .26, depthWrite: false, side: THREE.DoubleSide })
  glass.mesh.userData.itemIds = R1_BAR_CASES.map(unit => unit.id)
  root.add(group); let disposed = false
  return { root: group, items, tree, proxies, opening, radii, props, counterY, glass,
    byPropId: new Map(props.map(record => [record.id, record])),
    dispose() { if (disposed) return; disposed = true; proxies.forEach(proxy => collision?.remove?.(proxy)); ownGeometries.forEach(g => g.dispose()); proxyMaterial.dispose(); built.dispose(); glass.dispose(); tree.dispose(); group.removeFromParent() } }
}
