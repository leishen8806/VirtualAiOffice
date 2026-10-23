// VIS2-W · A：高位货架 + 轨道式托盘穿梭机 + 托盘货物（仓配私有构件；组件级，尚未正式接入）。
// 契约沿用 campus registry：factory({ THREE, root, layout, quality, baseY, seed, rows }) → { group, summary, setShuttle, dispose }。
// 只使用实例化（货架 / 托盘 / 纸箱 / 缠绕膜 / 轨道各 1 个 draw call）+ 少量合并网格（穿梭机车体、承托板、货物、指示灯）；
// 不创建 renderer、不使用 RAF / 定时器、不生成业务状态（位置、抬升、载货、货位占用、状态都由宿主经 setShuttle 传入）。
// 坐标来自 CAMPUS 布局（货架行与穿梭机展示带），不改任何共享布局；颜色固定：立柱 #2F6FA8、横梁 #E8832A。
//
// 竖向基准：构件内部全部以「完成面地坪」为 y = 0，整个 group 放在 baseY 上（group.position.y = baseY）。
// baseY 必须由集成方按真实地坪标高传入；默认 0 只是组件预览 / 测试夹具，不是生产标高（summary().baseYSource 会标明）。
import { createCampusRackPlan } from './dr-campus-racks.js'
import { initialShuttleState, shuttlePlan } from './dr-campus-shuttle-logic.js'

export const VIS2_COLORS = Object.freeze({
  upright: 0x2f6fa8, brace: 0x2f6fa8, beam: 0xe8832a,
  pallet: 0xb98a58, carton: 0xc9a06a, film: 0xeaf2f6,
  rail: 0x6b7780, sleeper: 0x3b434a, body: 0x56636d, stripe: 0xe8832a, bumper: 0x1e2428, wheel: 0x20262a, carrier: 0x9aa5ad,
  lampIdle: 0x61df72, lampPickup: 0xf0c63c, lampDelivery: 0xe8832a, lampUnknown: 0x8e979c, // 与旧 dr-campus-shuttle.js 的指示灯一致：pickup 黄、delivery 橙、idle 绿
})

// 单位：米，y 从完成面地坪算起。立柱高 4.4，4 道横梁（第 4 道只作顶梁不放货），层间净空 1.3 − 横梁 0.12 − 托盘 0.12 ≈ 1.06，货高 ≤ 0.95。
export const VIS2_DIMENSIONS = Object.freeze({
  uprightSize: 0.1, uprightHeight: 4.4, beamLevels: Object.freeze([0.2, 1.5, 2.8, 4.1]), beamHeight: 0.12, beamThickness: 0.05, frameHalfDepth: 0.55,
  tieLevels: Object.freeze([0.3, 1.5, 2.7, 3.9]), braceSize: 0.045,
  palletX: 1.2, palletZ: 1.0, palletHeight: 0.12, loadMaxHeight: 0.95, cartonX: 0.575, cartonZ: 0.465,
  railWidth: 0.08, railHeight: 0.06, railBase: 0.045, sleeperPitch: 0.8, railGauge: 1.4, sleeperOverhang: 0.15, stagingOffset: 1.45,
  shuttle: Object.freeze({ length: 1.1, width: 1.7, height: 0.28, wheelRadius: 0.1, rideHeight: 0.26, maxLift: 0.12 }),
})

// 本构件登记的「旧对象替换清单」：接线时这些旧对象必须停用，否则会和新模型叠在一起形成重复物体。
export const VIS2_REPLACES = Object.freeze([
  Object.freeze({ legacy: 'campus-racks-static', part: '其中的货架立柱 / 横梁 / 货物箱体，以及穿梭机展示带的旧底座板（y 0.06…0.18）', note: '该实例化网格还混入了工位与月台门（dr-campus-racks.js 的 inside()）；Trae 应让旧模块跳过货架、货物与穿梭机底座，保留其余。' }),
  Object.freeze({ legacy: 'campus-shuttle', part: '整个穿梭机车体与动态组', note: '由本构件的 vis2-shuttle 替换；运动状态由宿主经 setShuttle 传入（位置 = frame.position，见交付文档）。' }),
  Object.freeze({ legacy: 'campus-shuttle-static', part: '轨道与枕木', note: '由本构件的 vis2-rails 替换。' }),
  Object.freeze({ legacy: 'campus-rack-labels', part: '货架行标签 A1 / R2 / C2 / B2', note: '保留；但标签上「穿梭机展示位（预留）」的文字在接入真实穿梭机后已过时，需 Trae 改标签文案。' }),
])

const seeded = (value) => () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000)

// ——— 实例化辅助（盒体实例，颜色走 instanceColor）———
function createBoxBatch(THREE, name, material, capacity) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, capacity))
  mesh.name = name; mesh.count = 0; mesh.userData.qualityProxy = true
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(), color = new THREE.Color()
  return {
    mesh,
    clear() { mesh.count = 0 },
    add(x, y, z, sx, sy, sz, hex, rotZ = 0) {
      if (mesh.count >= mesh.instanceMatrix.count) throw new Error(`${name} 实例容量不足`)
      quaternion.setFromEuler(euler.set(0, 0, rotZ))
      matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz))
      mesh.setMatrixAt(mesh.count, matrix); mesh.setColorAt(mesh.count, color.setHex(hex)); mesh.count++
    },
    finish() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingBox?.(); mesh.computeBoundingSphere?.() },
  }
}

// ——— 带正确法线与缠绕方向的小型几何构建器（盒体每个面独立顶点；圆柱侧面法线径向、端盖法线沿轴）———
const BOX_FACES = Object.freeze([
  Object.freeze({ n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] }),
  Object.freeze({ n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] }),
  Object.freeze({ n: [0, 1, 0], c: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] }),
  Object.freeze({ n: [0, -1, 0], c: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] }),
  Object.freeze({ n: [0, 0, 1], c: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]] }),
  Object.freeze({ n: [0, 0, -1], c: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] }),
])
function createMeshBuilder(THREE) {
  const positions = [], normals = [], colors = [], indices = [], parts = [], color = new THREE.Color()
  const push = (x, y, z, nx, ny, nz, hex) => { positions.push(x, y, z); normals.push(nx, ny, nz); color.setHex(hex); colors.push(color.r, color.g, color.b) }
  return {
    parts,
    addBox(name, cx, cy, cz, sx, sy, sz, hex) {
      const start = positions.length / 3, tri = indices.length / 3
      for (const face of BOX_FACES) {
        const base = positions.length / 3
        for (const [px, py, pz] of face.c) push(cx + px * sx / 2, cy + py * sy / 2, cz + pz * sz / 2, face.n[0], face.n[1], face.n[2], hex)
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      }
      parts.push({ name, kind: 'box', center: [cx, cy, cz], vertexStart: start, vertexCount: 24, triStart: tri, triCount: 12 })
    },
    // 圆柱（轴沿 x）：底点落在 cy − r（保证车轮底面正好压在轨顶面）
    addWheel(name, cx, cy, cz, r, w, segments, hex) {
      const start = positions.length / 3, tri = indices.length / 3
      const ring = (i) => { const a = -Math.PI / 2 + (i / segments) * Math.PI * 2; return [Math.sin(a), Math.cos(a)] }
      for (let i = 0; i < segments; i++) {
        const [s1, c1] = ring(i), [s2, c2] = ring(i + 1), base = positions.length / 3
        push(cx - w / 2, cy + r * s1, cz + r * c1, 0, s1, c1, hex); push(cx + w / 2, cy + r * s1, cz + r * c1, 0, s1, c1, hex)
        push(cx + w / 2, cy + r * s2, cz + r * c2, 0, s2, c2, hex); push(cx - w / 2, cy + r * s2, cz + r * c2, 0, s2, c2, hex)
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      }
      for (const side of [1, -1]) {
        const centre = positions.length / 3; push(cx + side * w / 2, cy, cz, side, 0, 0, hex)
        for (let i = 0; i < segments; i++) { const [s1, c1] = ring(i), [s2, c2] = ring(i + 1), a = positions.length / 3; push(cx + side * w / 2, cy + r * s1, cz + r * c1, side, 0, 0, hex); push(cx + side * w / 2, cy + r * s2, cz + r * c2, side, 0, 0, hex); if (side > 0) indices.push(centre, a + 1, a); else indices.push(centre, a, a + 1) }
      }
      parts.push({ name, kind: 'wheel', center: [cx, cy, cz], vertexStart: start, vertexCount: positions.length / 3 - start, triStart: tri, triCount: indices.length / 3 - tri })
    },
    build() {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData.parts = parts
      return geometry
    },
  }
}

// ——— 托盘 + 货物 + 缠绕膜：托盘底面高度 = baseY(局部) 的 baseY；纸箱 2×2 每层，间隙 5 mm，不再随机抖动位置（颜色深浅仍用同一随机序列）———
const TONES = Object.freeze([0xc9a06a, 0xbf9660, 0xd3ab74])
function placeLoad(batches, rng, x, base, z, { film = true, layersMax = 3 } = {}) {
  const D = VIS2_DIMENSIONS, palletTop = base + D.palletHeight
  batches.pallet.add(x, palletTop - 0.015, z, D.palletX, 0.03, D.palletZ, VIS2_COLORS.pallet)
  for (const dz of [-0.4, 0, 0.4]) batches.pallet.add(x, base + 0.045, z + dz, D.palletX, 0.09, 0.1, VIS2_COLORS.pallet)
  const layers = 2 + Math.floor(rng() * (layersMax - 1)), layerHeight = Math.min(0.38, D.loadMaxHeight / layers)
  for (let layer = 0; layer < layers; layer++) for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
    rng() // 保持与旧版相同的随机序列消耗（旧版这里用于位置抖动），使货位占用与层数的分布不变
    batches.carton.add(x + ix * 0.2925, palletTop + layerHeight * (layer + 0.5), z + iz * 0.2425, D.cartonX, layerHeight - 0.012, D.cartonZ, TONES[(layer + (ix > 0 ? 1 : 0) + (iz > 0 ? 2 : 0)) % 3])
  }
  const loadHeight = layers * layerHeight
  if (film && rng() < 0.72) batches.film.add(x, palletTop + loadHeight / 2 + 0.01, z, D.palletX + 0.04, loadHeight + 0.03, D.palletZ + 0.04, VIS2_COLORS.film)
}

function buildRackStructure(batches, rack, low, rng, stats) {
  // 单深货架：框架进深 1.1 m 居中于 2 m 占地内（横梁间距 0.95 m，托盘 1.2 m 两端各悬出 0.125 m 搭在两条横梁上），两侧各留 0.45 m 余量。
  const D = VIS2_DIMENSIONS, cx = (rack.x0 + rack.x1) / 2, half = D.frameHalfDepth, frontX = cx - half, backX = cx + half, beamOffset = half - D.uprightSize / 2 - D.beamThickness / 2
  const boundaries = [rack.sections[0].z0, ...rack.sections.map((section) => section.z1)]
  for (const z of boundaries) {
    for (const x of [frontX, backX]) { batches.frame.add(x, D.uprightHeight / 2, z, D.uprightSize, D.uprightHeight, D.uprightSize, VIS2_COLORS.upright); stats.uprights++ }
    if (low) continue
    const span = backX - frontX
    for (const y of D.tieLevels) batches.frame.add((frontX + backX) / 2, y, z, span, D.braceSize, D.braceSize, VIS2_COLORS.brace)
    for (let i = 0; i < D.tieLevels.length - 1; i++) {
      const y0 = D.tieLevels[i], y1 = D.tieLevels[i + 1], flip = i % 2 ? -1 : 1, dy = y1 - y0
      batches.frame.add((frontX + backX) / 2, (y0 + y1) / 2, z, Math.hypot(span, dy), D.braceSize, D.braceSize, VIS2_COLORS.brace, flip * Math.atan2(dy, span)); stats.braces++
    }
  }
  const levels = low ? D.beamLevels.slice(0, 3) : D.beamLevels, loadLevels = D.beamLevels.slice(0, 3) // 第 4 道横梁（4.1 m）只作顶梁，不放货，货顶 ≤ 3.93 m
  for (const section of rack.sections) {
    const mid = (section.z0 + section.z1) / 2, length = section.z1 - section.z0 - D.uprightSize + 0.02, slot = (section.z1 - section.z0 - D.uprightSize) / 4 // 横梁两端各插入立柱 1 cm，不留缝
    for (const y of levels) {
      for (const x of [cx - beamOffset, cx + beamOffset]) { batches.frame.add(x, y, mid, D.beamThickness, D.beamHeight, length, VIS2_COLORS.beam); stats.beams++ }
      if (!loadLevels.includes(y)) continue
      for (const dz of [-1, 1]) {
        if (rng() < 0.22) { stats.empty++; continue }
        placeLoad(batches, rng, cx, y + D.beamHeight / 2, mid + dz * slot, { film: !low, layersMax: low ? 2 : 3 })
        stats.loads++
      }
    }
  }
}

function buildRails(batches, plan, stats) {
  const D = VIS2_DIMENSIONS, z0 = plan.path.z0 - 1.1, z1 = plan.path.z1 + 1.1, length = z1 - z0, midZ = (z0 + z1) / 2
  for (const x of plan.rails) { batches.rail.add(x, D.railBase + D.railHeight / 2, midZ, D.railWidth, D.railHeight, length, VIS2_COLORS.rail); stats.rails++ }
  for (let z = z0 + 0.2; z <= z1 - 0.2; z += D.sleeperPitch) { batches.rail.add(plan.centerX, D.railBase / 2, z, plan.rails[1] - plan.rails[0] + D.sleeperOverhang * 2, D.railBase, 0.14, VIS2_COLORS.sleeper); stats.sleepers++ }
  for (const x of plan.rails) for (const z of [z0 + 0.1, z1 - 0.1]) batches.rail.add(x, D.railBase + 0.1, z, 0.16, 0.2, 0.12, VIS2_COLORS.bumper)
}

const standard = (THREE, extra = {}) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.2, ...extra })
// 词表取自真实 shuttleFrame().status：idle / pickup / delivery（dr-campus-shuttle-logic.js）；其它字符串 → 灰色「未知」
export const VIS2_STATUS_LAMP = Object.freeze({ idle: VIS2_COLORS.lampIdle, pickup: VIS2_COLORS.lampPickup, delivery: VIS2_COLORS.lampDelivery })
const lampFor = (status) => Object.hasOwn(VIS2_STATUS_LAMP, status) ? VIS2_STATUS_LAMP[status] : VIS2_COLORS.lampUnknown

export function buildVis2RackCell(options = {}) {
  const { THREE, root, layout, quality, seed = 4207, rows = null } = options
  const baseYGiven = options.baseY !== undefined, baseY = baseYGiven ? options.baseY : 0 // 按「是否传入」判断，不按真假值：显式 baseY: 0 也是宿主给的标高
  if (!Number.isFinite(baseY)) throw new Error('baseY 必须是有限数值（完成面地坪标高）')
  const low = quality?.tier === 'low'
  const racksPlan = createCampusRackPlan({ zones: layout?.zones, shuttle: layout?.shuttle }), plan = shuttlePlan(layout), D = VIS2_DIMENSIONS, S = D.shuttle
  const rng = seeded(seed), stats = { uprights: 0, braces: 0, beams: 0, loads: 0, empty: 0, rails: 0, sleepers: 0 }
  const group = new THREE.Group(); group.name = 'vis2-rack-cell'; group.userData.vis2 = 'rack-cell'; group.position.y = baseY
  const materials = { frame: standard(THREE, { roughness: 0.5, metalness: 0.45 }), pallet: standard(THREE, { roughness: 0.86, metalness: 0 }), carton: standard(THREE, { roughness: 0.9, metalness: 0 }), rail: standard(THREE, { roughness: 0.45, metalness: 0.55 }),
    film: standard(THREE, { roughness: 0.15, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }), shuttle: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    slot: standard(THREE, { roughness: 0.86, metalness: 0 }), lamp: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) }
  const rowList = (rows ? racksPlan.racks.filter((rack) => rows.includes(rack.label)) : racksPlan.racks).slice(0, low ? 2 : 4)
  const sections = rowList.reduce((total, rack) => total + rack.sections.length, 0)
  const batches = {
    frame: createBoxBatch(THREE, 'vis2-rack-frames', materials.frame, rowList.length * 7 * 2 * 8 + sections * 4 * 2 + 8),
    pallet: createBoxBatch(THREE, 'vis2-rack-pallets', materials.pallet, sections * 4 * 2 * 4),
    carton: createBoxBatch(THREE, 'vis2-rack-cartons', materials.carton, sections * 4 * 2 * 12),
    film: createBoxBatch(THREE, 'vis2-rack-film', materials.film, sections * 4 * 2),
    rail: createBoxBatch(THREE, 'vis2-rails', materials.rail, 200),
  }
  batches.film.mesh.userData.dynamic = true // 保留自己的透明度：campus registry 会把可合并的半透明件统一压成 .46
  for (const rack of rowList) buildRackStructure(batches, rack, low, rng, stats)
  buildRails(batches, plan, stats)
  for (const batch of Object.values(batches)) { batch.finish(); if (batch.mesh.count > 0) group.add(batch.mesh) } // 低画质没有缠绕膜：不加入空网格，也不算 draw call

  // ——— 穿梭机：车体（车轮压轨，永不离轨）+ 升降承托板 + 承托板上的货物 + 状态指示灯。lift 只移动承托板与货物。———
  const wheelY = D.railBase + D.railHeight + S.wheelRadius, bodyY = S.rideHeight + S.height / 2
  const chassisBuilder = createMeshBuilder(THREE)
  chassisBuilder.addBox('body', 0, bodyY, 0, S.width, S.height, S.length, VIS2_COLORS.body)
  for (const side of [-1, 1]) chassisBuilder.addBox(`stripe${side}`, side * (S.width / 2 + 0.006), bodyY, 0, 0.012, 0.06, S.length * 0.86, VIS2_COLORS.stripe)
  for (const end of [-1, 1]) chassisBuilder.addBox(`bumper${end}`, 0, bodyY - 0.02, end * (S.length / 2 + 0.04), S.width * 0.9, 0.16, 0.08, VIS2_COLORS.bumper)
  for (const x of [-D.railGauge / 2, D.railGauge / 2]) for (const z of [-0.38, 0.38]) chassisBuilder.addWheel(`wheel(${x},${z})`, x, wheelY, z, S.wheelRadius, 0.07, low ? 8 : 12, VIS2_COLORS.wheel)
  const platformY = bodyY + S.height / 2 + 0.02 // 承托板中心高度（lift = 0 时）；板厚 0.04
  const platformBuilder = createMeshBuilder(THREE)
  platformBuilder.addBox('carrier', 0, platformY, 0, S.width * 0.62, 0.04, S.length * 0.74, VIS2_COLORS.carrier)
  const loadBuilder = createMeshBuilder(THREE), platformTop = platformY + 0.02, loadTop = platformTop + D.palletHeight
  loadBuilder.addBox('pallet-deck', 0, loadTop - 0.015, 0, D.palletZ, 0.03, D.palletX, VIS2_COLORS.pallet)
  for (const dx of [-0.4, 0, 0.4]) loadBuilder.addBox(`pallet-bearer${dx}`, dx, platformTop + 0.045, 0, 0.1, 0.09, D.palletX, VIS2_COLORS.pallet)
  for (let layer = 0; layer < 2; layer++) for (const ix of [-1, 1]) for (const iz of [-1, 1]) loadBuilder.addBox(`carton${layer}${ix}${iz}`, ix * 0.2425, loadTop + 0.18 * (2 * layer + 1), iz * 0.2925, D.cartonZ, 0.348, D.cartonX, TONES[(layer + (ix > 0 ? 1 : 0) + (iz > 0 ? 2 : 0)) % 3])
  const chassisGeometry = chassisBuilder.build(), platformGeometry = platformBuilder.build(), loadGeometry = loadBuilder.build()
  const shuttle = new THREE.Group(); shuttle.name = 'vis2-shuttle'; shuttle.userData.dynamic = true
  const chassis = new THREE.Mesh(chassisGeometry, materials.shuttle); chassis.name = 'vis2-shuttle-chassis'
  const lift = new THREE.Group(); lift.name = 'vis2-shuttle-lift'
  const platform = new THREE.Mesh(platformGeometry, materials.shuttle); platform.name = 'vis2-shuttle-platform'
  const load = new THREE.Mesh(loadGeometry, materials.shuttle); load.name = 'vis2-shuttle-load'
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), materials.lamp); lamp.name = 'vis2-shuttle-lamp'; lamp.position.set(S.width / 2 - 0.12, bodyY + S.height / 2 + 0.025, S.length / 2 - 0.12)
  for (const mesh of [chassis, platform, load, lamp]) { mesh.userData.qualityProxy = true; mesh.frustumCulled = false }
  lift.add(platform, load); shuttle.add(chassis, lift, lamp)
  shuttle.position.set(plan.centerX, 0, plan.slots[0].z)
  group.add(shuttle)

  // 货位托盘（只显示 occupied 的静态停放状态）：停在轨道东侧的停放位（x = 中线 + stagingOffset），与车体（半宽 0.85）、枕木（半宽 0.85）和钢轨都留出间隙。
  // 宿主契约里取货 / 放货是瞬时的（pick 事件同时把 occupied[i] 置 false、carrying 置 true），没有「托盘横移」的中间状态，本构件不凭空造一个：见交付文档第四节。
  const slotBatch = createBoxBatch(THREE, 'vis2-slot-pallets', materials.slot, 3 * 8); slotBatch.mesh.userData.dynamic = true
  const slotX = plan.centerX + D.stagingOffset
  const drawSlots = (occupied) => {
    slotBatch.clear()
    plan.slots.forEach((slot, i) => { if (!occupied[i]) return
      slotBatch.add(slotX, D.palletHeight - 0.015, slot.z, D.palletZ, 0.03, D.palletX, VIS2_COLORS.pallet); for (const dz of [-0.4, 0, 0.4]) slotBatch.add(slotX, 0.045, slot.z + dz, D.palletZ, 0.09, 0.1, VIS2_COLORS.pallet)
      for (const [ix, iz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) slotBatch.add(slotX + ix * 0.2425, D.palletHeight + 0.18, slot.z + iz * 0.2925, D.cartonZ, 0.348, D.cartonX, TONES[(i + (ix > 0 ? 1 : 0) + (iz > 0 ? 2 : 0)) % 3]) })
    slotBatch.finish(); slotBatch.mesh.visible = slotBatch.mesh.count > 0
  }
  group.add(slotBatch.mesh)
  const initial = initialShuttleState(plan) // 夹具初始状态直接取旧模块的初始状态（slot-a、不载货、[true,false,true]、idle），不另造一套
  const state = { z: initial.position, lift: initial.lift, carrying: initial.carrying, occupied: [...initial.occupied], status: initial.status, source: 'fixture' }
  const applyState = () => {
    shuttle.position.z = state.z; lift.position.y = state.lift; load.visible = state.carrying === true
    drawSlots(state.occupied); materials.lamp.color.setHex(lampFor(state.status))
  }
  applyState()
  root.add(group)
  let disposed = false
  // 宿主经此传入状态；只接受合法字段，非法值整项忽略。z 是世界坐标（= shuttleFrame.position），夹在轨道行程内；lift 只移动承托板与货物。
  const setShuttle = (next = {}) => {
    if (disposed || !next || typeof next !== 'object') return false
    let touched = false
    if (Number.isFinite(next.z)) { state.z = Math.min(plan.path.z1, Math.max(plan.path.z0, next.z)); touched = true }
    if (Number.isFinite(next.lift)) { state.lift = Math.min(S.maxLift, Math.max(0, next.lift)); touched = true }
    if (typeof next.carrying === 'boolean') { state.carrying = next.carrying; touched = true }
    if (Array.isArray(next.occupied) && next.occupied.length === 3 && next.occupied.every((value) => typeof value === 'boolean')) { state.occupied = [...next.occupied]; touched = true }
    if (typeof next.status === 'string') { state.status = next.status; touched = true }
    if (touched) { state.source = 'host'; applyState() }
    return touched
  }
  const drawCalls = () => { let n = 0; group.traverse((node) => { if (node.isMesh && node.visible && (!node.isInstancedMesh || node.count > 0)) n++ }); return n }
  const bounds = new THREE.Box3()
  const triangles = () => { let t = 0; group.traverse((node) => { if (!node.isMesh || !node.visible) return; const g = node.geometry, per = (g.index ? g.index.count : g.attributes.position.count) / 3; t += per * (node.isInstancedMesh ? node.count : 1) }); return t }
  const summary = () => {
    group.updateMatrixWorld(true); bounds.setFromObject(chassis); const wheelBottom = bounds.min.y - baseY
    return { module: 'vis2-rack-cell', preview: '组件预览，尚未正式接入', quality: low ? 'low' : 'high', seed, rows: rowList.map((rack) => rack.label), ...stats,
      baseY, baseYSource: baseYGiven ? '宿主传入' : '默认 0：仅为组件预览 / 测试夹具，不是生产标高',
      vertical: { railTop: D.railBase + D.railHeight, wheelBottom: +wheelBottom.toFixed(4), chassisTop: S.rideHeight + S.height, maxLift: S.maxLift, rackTop: D.uprightHeight, topBeam: D.beamLevels[3] + D.beamHeight / 2 },
      state: { ...state, occupied: [...state.occupied] },
      instances: Object.fromEntries(Object.entries(batches).map(([name, batch]) => [name, batch.mesh.count])),
      componentPreviewDrawCalls: drawCalls(), triangles: Math.round(triangles()), replaces: VIS2_REPLACES.map((item) => item.legacy),
      note: '绘制调用与三角形只代表组件预览；接入 campus registry 后静态实例会被合并并统一材质，真实开销须在候选版本上实测。' }
  }
  // 资源所有权：campus registry 的 mergeCampusStatic 会在合并时释放被合并网格的几何（并把网格移出场景）；
  // 这里监听每个自有几何的 dispose 事件，自己的 dispose() 只释放「还没被别人释放」的几何，所以每个几何恰好释放一次。材质始终由本构件释放（registry 不碰）。
  const ownedGeometries = [...Object.values(batches).map((batch) => batch.mesh.geometry), slotBatch.mesh.geometry, chassisGeometry, platformGeometry, loadGeometry, lamp.geometry], released = new Set()
  for (const geometry of ownedGeometries) geometry.addEventListener('dispose', () => released.add(geometry))
  const dispose = () => {
    if (disposed) return; disposed = true
    group.removeFromParent()
    for (const geometry of ownedGeometries) if (!released.has(geometry)) geometry.dispose()
    for (const material of Object.values(materials)) material.dispose()
  }
  return { group, summary, setShuttle, dispose }
}
