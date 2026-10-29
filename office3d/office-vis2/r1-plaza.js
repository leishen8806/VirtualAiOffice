import { r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'
import { officeBackdropCanopy, appendOfficeGardenBed } from './plants.js'
import { createSampleBatch } from './batch.js'
import { buildR1Fountain } from './r1-fountain.js'

const REGION = '14'
// R1 场地地面在 y = 0；铺装抬 4 mm 既避开闪烁，又守住验收的 5 mm 上限。
const PAVING_LIFT = .004
const RIM_WIDTH = .35
const COLOR = Object.freeze({
  paving: '#E2D2B4', rim: '#B99A6E', planter: '#BEB7A7', soil: '#4D4736', trunk: '#756857',
  body: '#B9523E', panel: '#EFE7D8', sign: '#F2EADA', interior: '#28313A', counter: '#E6DECD',
  frame: '#A8794F', roof: '#4C6B5A', metal: '#5A5F62', seat: '#9A7650', leg: '#52534E', pole: '#6E7276',
})
const CANOPY_TINTS = Object.freeze(['#46633F', '#56734A', '#3A593B', '#67804D'])
// R1 的 yawDeg 是罗盘约定：世界朝向向量 (dx, −dy)，运行时 yaw 由 runtimeYawFromFacing 推出。
const yawOf = item => runtimeYawFromFacing(Number(item.facingLocal?.[0]) || 0, -(Number(item.facingLocal?.[1]) || 0))
// 正多边形内接会把登记直径画小；偏转半个分段后 x / z 两轴同时差 cos(π/n)，补回去包围盒就逐值相等。
const fitRadius = (diameter, segments) => diameter / 2 / Math.cos(Math.PI / segments)

export function buildR1Plaza({ THREE, root, layout, collision, quality, low = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const lowTier = quality ? quality.tier === 'low' : low
  const group = new THREE.Group(); group.name = 'r1-plaza'; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), records = [], proxies = [], ownGeometries = [], stack = []
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const elementOf = id => layout.r1.elements.find(item => item.id === id)
  const pick = category => layout.r1.elements.filter(item => item.regionId === REGION && item.category === category)
  const radial = lowTier ? 8 : 12

  const open = (item, keepVertices = false) => {
    const record = {
      id: item.id, category: item.category, yaw: yawOf(item), position: { ...r1ToWorld(item.xM, item.yM), y: Number(item.zM) || 0 },
      bounds: new THREE.Box3(), vertices: keepVertices ? [] : null, startVertex: batch.triangles() * 3, count: 0,
    }
    records.push(record); stack.push(record); return record
  }
  const close = () => { const record = stack.pop(); record.count = batch.triangles() * 3 - record.startVertex; return record }
  // 先在一份副本上量包围盒，再交给合批器；合批器会销毁传入的几何体。
  const emit = (geometry, tint, position, yaw = 0, roughness = .82, metalness = 0, grain = '') => {
    const probe = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    probe.rotateY(yaw); probe.translate(...position); probe.computeBoundingBox()
    for (const record of stack) {
      record.bounds.union(probe.boundingBox)
      if (record.vertices) record.vertices.push(...probe.attributes.position.array)
    }
    probe.dispose()
    batch.add(geometry, tint, position, yaw, roughness, metalness, grain)
  }
  const proxy = (id, geometry, position, yaw = 0) => {
    const mesh = new THREE.Mesh(geometry, proxyMaterial)
    mesh.position.set(...position); mesh.rotation.y = yaw
    mesh.name = id; mesh.userData = { r1Id: id, collisionProxy: true }
    ownGeometries.push(geometry); collision?.add(mesh, id); proxies.push(mesh)
    return mesh
  }
  // 碰撞引擎按三角面壳判定，直立胶囊只到 1.48 m：比胶囊高的实体再加一层腰部挡板，
  // 否则站在餐车 / 摊亭正中的探点会从侧壁之间漏过去（侧壁本身仍然挡住行人）。
  const CAPSULE_TOP = 1.48, DECK_Y = .9
  const boxProxy = (item, yaw) => {
    const base = Number(item.zM) || 0, p = r1ToWorld(item.xM, item.yM)
    proxy(item.id, new THREE.BoxGeometry(item.lengthM, item.heightM, item.widthM), [p.x, base + item.heightM / 2, p.z], yaw)
    if (base + item.heightM > CAPSULE_TOP) proxy(item.id, new THREE.BoxGeometry(item.lengthM, .02, item.widthM), [p.x, base + DECK_Y, p.z], yaw)
  }
  const ring = (inner, outer) => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
    const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const geometry = new THREE.ShapeGeometry(shape, lowTier ? 48 : 96)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }

  // ── 广场环形铺装（登记圆心与内外半径逐值；高差 UNKNOWN，不画台阶或坡道）──
  const plaza = layout.r1.data.plaza, center = r1ToWorld(...plaza.center_m)
  const paving = { center, innerRadius: plaza.inner_radius_m, outerRadius: plaza.outer_radius_m, y: PAVING_LIFT, levelDifferenceMm: plaza.level_difference_to_interior_mm, bounds: new THREE.Box3() }
  const pavingRecord = { bounds: paving.bounds, vertices: null, startVertex: 0, count: 0 }
  stack.push(pavingRecord)
  emit(ring(paving.innerRadius, paving.outerRadius - RIM_WIDTH), COLOR.paving, [center.x, PAVING_LIFT, center.z], 0, .9, 0, 'stone')
  emit(ring(paving.outerRadius - RIM_WIDTH, paving.outerRadius), COLOR.rim, [center.x, PAVING_LIFT, center.z], 0, .88, 0, 'stone')
  stack.pop(); pavingRecord.count = batch.triangles() * 3

  // ── 景观树 10 株：树池 / 树干 / 树冠按登记件逐件落地，树冠复用既有背景树冠几何 ──
  // 外层用本档的叶球定外形；内层固定用低模叶球（叶片更大更少），填实树冠又守住三角形预算。
  const canopySource = officeBackdropCanopy(THREE, lowTier), canopyFill = officeBackdropCanopy(THREE, true)
  canopySource.computeBoundingBox()
  const canopyBox = canopySource.boundingBox, canopySize = canopyBox.getSize(new THREE.Vector3()), canopyMid = canopyBox.getCenter(new THREE.Vector3())
  pick('植物总成').forEach((plant, index) => {
    const p = r1ToWorld(plant.xM, plant.yM)
    const pot = elementOf(`${plant.id}-POT`), trunk = elementOf(`${plant.id}-TR`), crown = elementOf(`${plant.id}-CR`)
    open(plant)
    open(pot)
    const wall = .1, inner = pot.lengthM / 2 - wall, innerZ = pot.widthM / 2 - wall
    for (const side of [-1, 1]) {
      emit(new THREE.BoxGeometry(pot.lengthM, pot.heightM, wall), COLOR.planter, [p.x, pot.zM + pot.heightM / 2, p.z + side * (pot.widthM / 2 - wall / 2)], 0, .88, 0, 'stone')
      emit(new THREE.BoxGeometry(wall, pot.heightM, pot.widthM - 2 * wall), COLOR.planter, [p.x + side * (pot.lengthM / 2 - wall / 2), pot.zM + pot.heightM / 2, p.z], 0, .88, 0, 'stone')
    }
    emit(new THREE.BoxGeometry(inner * 2, .06, innerZ * 2), COLOR.soil, [p.x, pot.zM + pot.heightM - .08, p.z], 0, 1)
    close()
    open(trunk)
    emit(new THREE.CylinderGeometry(fitRadius(trunk.lengthM, radial), fitRadius(trunk.widthM, radial), trunk.heightM, radial, 1, false, Math.PI / radial),
      COLOR.trunk, [p.x, trunk.zM + trunk.heightM / 2, p.z], 0, .9, 0, 'wood')
    close()
    open(crown, true)
    const scale = [crown.lengthM / canopySize.x, crown.heightM / canopySize.y, crown.widthM / canopySize.z]
    const tint = new THREE.Color(CANOPY_TINTS[index % CANOPY_TINTS.length])
    // 两层同心叶球：外层正好顶到登记冠幅包围盒，内层缩到 72 % 居中并转过一个角度，
    // 把单层背景树冠的稀疏叶片填实；内层整体在外层包围盒之内，不改登记尺寸。
    for (const shrink of [1, .72]) {
      const leaves = (shrink < 1 ? canopyFill : canopySource).clone()
      leaves.scale(scale[0] * shrink, scale[1] * shrink, scale[2] * shrink)
      if (shrink < 1) leaves.rotateY(.7 + index * .37)
      leaves.translate(-canopyMid.x * scale[0] * shrink, -canopyBox.min.y * scale[1] * shrink + crown.heightM * (1 - shrink) / 2, -canopyMid.z * scale[2] * shrink)
      const shade = leaves.attributes.color
      for (let i = 0; i < shade.count; i++) shade.setXYZ(i, shade.getX(i) * tint.r, shade.getY(i) * tint.g, shade.getZ(i) * tint.b)
      emit(leaves, null, [p.x, crown.zM, p.z], 0, .85)
    }
    close()
    close()
    boxProxy(pot, 0)
  })
  canopySource.dispose(); canopyFill.dispose()

  // ── 连续花境 6 处：复用既有花境植栽，竖向线性拟合到登记高度，占地仍是登记的 length × width ──
  pick('连续花境').forEach((bed, index) => {
    const p = r1ToWorld(bed.xM, bed.yM), pending = []
    const collector = { add: (geometry, tint, position = [0, 0, 0], yaw = 0, roughness = .8, metalness = 0, grain = '') => pending.push({ geometry, tint, position, yaw, roughness, metalness, grain }) }
    appendOfficeGardenBed({ THREE, batch: collector, bed: { x: p.x, z: p.z, w: bed.lengthM, d: bed.widthM }, low: lowTier, seed: index + 1 })
    let minY = Infinity, maxY = -Infinity
    for (const piece of pending) {
      piece.geometry.computeBoundingBox()
      minY = Math.min(minY, piece.geometry.boundingBox.min.y + piece.position[1])
      maxY = Math.max(maxY, piece.geometry.boundingBox.max.y + piece.position[1])
    }
    const fit = bed.heightM / (maxY - minY), base = Number(bed.zM) || 0
    open(bed)
    for (const piece of pending) {
      piece.geometry.scale(1, fit, 1)
      emit(piece.geometry, piece.tint, [piece.position[0], (piece.position[1] - minY) * fit + base, piece.position[2]], piece.yaw, piece.roughness, piece.metalness, piece.grain)
    }
    close()
    boxProxy(bed, 0)
  })

  // 登记件的局部坐标 (dx 沿 length，dz 沿 width) 旋到世界：绕 Y 轴 yaw 的标准映射。
  const placer = (p, yaw) => (dx, dz) => [p.x + dx * Math.cos(yaw) + dz * Math.sin(yaw), p.z - dx * Math.sin(yaw) + dz * Math.cos(yaw)]

  // ── 餐车 1 台：车轮、车厢、真实取餐窗洞与车顶招牌，整车留在登记包围盒内 ──
  for (const truck of pick('餐车')) {
    const p = r1ToWorld(truck.xM, truck.yM), yaw = yawOf(truck), at = placer(p, yaw)
    const halfX = truck.lengthM / 2, halfZ = truck.widthM / 2
    const tyre = .38, sill = .66, bandLow = 1.22, bandHigh = 1.76, roof = 2.12, cap = 2.24
    open(truck)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(fitRadius(tyre * 2, radial), fitRadius(tyre * 2, radial), .22, radial, 1, false, Math.PI / radial)
      wheel.rotateX(Math.PI / 2)
      const [x, z] = at(sx * 1.5, sz * .95)
      emit(wheel, COLOR.leg, [x, tyre, z], yaw, .85)
    }
    emit(new THREE.BoxGeometry(truck.lengthM - .2, .36, truck.widthM - .2), COLOR.metal, [p.x, .48, p.z], yaw, .7, .25)
    emit(new THREE.BoxGeometry(truck.lengthM, bandLow - sill, truck.widthM), COLOR.body, [p.x, (sill + bandLow) / 2, p.z], yaw, .6, .1)
    emit(new THREE.BoxGeometry(truck.lengthM, roof - bandHigh, truck.widthM), COLOR.body, [p.x, (bandHigh + roof) / 2, p.z], yaw, .6, .1)
    for (const sx of [-1, 1]) {
      const [x, z] = at(sx * (halfX + 1.4) / 2, 0)
      emit(new THREE.BoxGeometry(halfX - 1.4, bandHigh - bandLow, truck.widthM), COLOR.body, [x, (bandLow + bandHigh) / 2, z], yaw, .6, .1)
    }
    const [backX, backZ] = at(0, halfZ - .25)
    emit(new THREE.BoxGeometry(2.8, bandHigh - bandLow, .5), COLOR.interior, [backX, (bandLow + bandHigh) / 2, backZ], yaw, .5)
    const [shelfX, shelfZ] = at(0, -(halfZ - .2))
    emit(new THREE.BoxGeometry(2.9, .07, .34), COLOR.counter, [shelfX, bandLow + .035, shelfZ], yaw, .55, 0, 'stone')
    emit(new THREE.BoxGeometry(truck.lengthM - .1, cap - roof, truck.widthM - .1), COLOR.panel, [p.x, (roof + cap) / 2, p.z], yaw, .7)
    emit(new THREE.BoxGeometry(2.4, truck.heightM - cap, .1), COLOR.sign, [p.x, (cap + truck.heightM) / 2, p.z], yaw, .65)
    close()
    boxProxy(truck, yaw)
  }

  // ── 摊亭 3 座：角柱、取货台、后柜与四坡顶，顶面对角正好落在登记的 2.4 × 2.4 上 ──
  for (const kiosk of pick('摊亭')) {
    const p = r1ToWorld(kiosk.xM, kiosk.yM), yaw = yawOf(kiosk), at = placer(p, yaw)
    const halfX = kiosk.lengthM / 2, halfZ = kiosk.widthM / 2, post = .1, eave = 2.2
    open(kiosk)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [x, z] = at(sx * (halfX - post / 2), sz * (halfZ - post / 2))
      emit(new THREE.BoxGeometry(post, eave, post), COLOR.frame, [x, eave / 2, z], yaw, .75, 0, 'wood')
    }
    const [bodyX, bodyZ] = at(0, -(halfZ - .425))
    emit(new THREE.BoxGeometry(kiosk.lengthM - .2, .95, .75), COLOR.frame, [bodyX, .475, bodyZ], yaw, .75, 0, 'wood')
    const [topX, topZ] = at(0, -(halfZ - .45))
    emit(new THREE.BoxGeometry(kiosk.lengthM, .07, .9), COLOR.counter, [topX, .985, topZ], yaw, .55, 0, 'stone')
    const [cabX, cabZ] = at(0, halfZ - .3)
    emit(new THREE.BoxGeometry(kiosk.lengthM - .2, 1.6, .5), COLOR.interior, [cabX, .8, cabZ], yaw, .7)
    emit(new THREE.ConeGeometry(fitRadius(kiosk.lengthM, 4), kiosk.heightM - eave, 4, 1, false, Math.PI / 4), COLOR.roof, [p.x, (eave + kiosk.heightM) / 2, p.z], yaw, .8)
    close()
    boxProxy(kiosk, yaw)
  }

  // ── 遮阳伞 2 把：伞柱与八角伞面都是登记子件，伞面底 2.3 m 高于 2.1 m 头部净高 ──
  for (const umbrella of pick('遮阳伞')) {
    const p = r1ToWorld(umbrella.xM, umbrella.yM), yaw = yawOf(umbrella)
    const pole = elementOf(`${umbrella.id}-POLE`), canopy = elementOf(`${umbrella.id}-CANOPY`)
    open(umbrella)
    open(pole)
    emit(new THREE.CylinderGeometry(fitRadius(pole.lengthM, 8), fitRadius(pole.widthM, 8), pole.heightM, 8, 1, false, Math.PI / 8),
      COLOR.pole, [p.x, pole.zM + pole.heightM / 2, p.z], 0, .5, .35)
    close()
    open(canopy, true)
    emit(new THREE.ConeGeometry(fitRadius(canopy.lengthM, 8), canopy.heightM, 8, 1, false, Math.PI / 8),
      COLOR.sign, [p.x, canopy.zM + canopy.heightM / 2, p.z], 0, .9)
    close()
    close()
    proxy(pole.id, new THREE.CylinderGeometry(pole.lengthM / 2, pole.widthM / 2, pole.heightM, 10), [p.x, pole.zM + pole.heightM / 2, p.z], 0)
  }

  // ── 室外长椅 4 条：替换 I3 的素色方块；椅背落在登记朝向的背面，座面前缘顶到 width 边 ──
  for (const bench of pick('室外长椅')) {
    const p = r1ToWorld(bench.xM, bench.yM), yaw = yawOf(bench), at = placer(p, yaw)
    const halfZ = bench.widthM / 2, back = .05, seatTop = .48, seatDepth = bench.widthM - back
    open(bench)
    for (const sx of [-1, 1]) {
      const [x, z] = at(sx * .85, -(halfZ - seatDepth / 2))
      emit(new THREE.BoxGeometry(.08, seatTop - .06, seatDepth - .08), COLOR.leg, [x, (seatTop - .06) / 2, z], yaw, .6, .2)
    }
    const [seatX, seatZ] = at(0, -(halfZ - seatDepth / 2))
    emit(new THREE.BoxGeometry(bench.lengthM, .06, seatDepth), COLOR.seat, [seatX, seatTop - .03, seatZ], yaw, .72, 0, 'wood')
    const [backX, backZ] = at(0, halfZ - back / 2)
    emit(new THREE.BoxGeometry(bench.lengthM, bench.heightM - seatTop + .06, back), COLOR.seat, [backX, (seatTop - .06 + bench.heightM) / 2, backZ], yaw, .72, 0, 'wood')
    close()
    boxProxy(bench, yaw)
  }

  const built = batch.build(group, 'r1-plaza-surfaces')
  built.mesh.material.side = THREE.DoubleSide
  built.mesh.userData.itemIds = records.map(record => record.id)
  root.add(group)
  const fountain = buildR1Fountain({ THREE, root: group, layout, collision, quality, low })
  let disposed = false
  return {
    root: group, paving, records, proxies, mesh: built.mesh, triangles: built.triangles, fountain, onFrame: fountain.onFrame,
    byId: new Map(records.map(record => [record.id, record])),
    dispose() {
      if (disposed) return
      disposed = true
      fountain.dispose()
      proxies.forEach(mesh => collision?.remove?.(mesh))
      ownGeometries.forEach(geometry => geometry.dispose())
      proxyMaterial.dispose(); built.dispose(); group.removeFromParent()
    },
  }
}
