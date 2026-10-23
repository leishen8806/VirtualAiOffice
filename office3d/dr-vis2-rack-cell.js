// VIS2-W · A：高位货架 + 轨道式托盘穿梭机 + 托盘货物（仓配私有构件；组件级，尚未正式接入）。
// 契约沿用 campus registry：factory({ THREE, root, layout, quality, now, snapshot }) → { group, summary, setShuttle, dispose }。
// 只使用实例化（货架、托盘、纸箱、缠绕膜、轨道各 1 个 draw call）+ 穿梭机 1 个合并网格；不创建 renderer、不使用 RAF、不生成业务数字。
// 坐标来自 CAMPUS 布局（货架行与穿梭机展示带），不改任何共享布局；颜色固定：立柱 #2F6FA8、横梁 #E8832A。
import { createCampusRackPlan } from './dr-campus-racks.js'
import { shuttlePlan } from './dr-campus-shuttle-logic.js'

export const VIS2_COLORS = Object.freeze({
  upright: 0x2f6fa8, brace: 0x2f6fa8, beam: 0xe8832a,
  pallet: 0xb98a58, carton: 0xc9a06a, film: 0xeaf2f6,
  rail: 0x6b7780, sleeper: 0x3b434a, body: 0x56636d, stripe: 0xe8832a, bumper: 0x1e2428, wheel: 0x20262a, carrier: 0x9aa5ad,
})

// 单位：米。立柱高 4.4（建筑内净高约 4.7，屋面在 4.68），4 层横梁，层间净空 1.3 − 横梁 0.12 − 托盘 0.12 ≈ 1.06，货高 ≤ 0.95。
export const VIS2_DIMENSIONS = Object.freeze({
  uprightSize: 0.1, uprightHeight: 4.4, beamLevels: Object.freeze([0.2, 1.5, 2.8, 4.1]), beamHeight: 0.12, beamThickness: 0.05,
  tieLevels: Object.freeze([0.3, 1.5, 2.7, 3.9]), braceSize: 0.045,
  palletX: 1.2, palletZ: 1.0, palletHeight: 0.12, loadMaxHeight: 0.95,
  railWidth: 0.08, railHeight: 0.06, sleeperPitch: 0.8,
  shuttle: Object.freeze({ length: 1.1, width: 1.7, height: 0.28, wheelRadius: 0.1, rideHeight: 0.26 }),
})

// 本构件登记的「旧对象替换清单」：接线时这些旧对象必须停用，否则会和新模型叠在一起形成重复物体。
export const VIS2_REPLACES = Object.freeze([
  Object.freeze({ legacy: 'campus-racks-static', part: '其中的货架立柱 / 横梁 / 货物箱体', note: '该实例化网格还混入了工位、月台门与穿梭机底座（dr-campus-racks.js 的 inside()）；Trae 应让旧模块跳过货架与货物，保留其余。' }),
  Object.freeze({ legacy: 'campus-shuttle', part: '整个穿梭机车体与动态组', note: '由本构件的 vis2-shuttle 替换；运动仍由既有 shuttleFrame 状态驱动，通过 setShuttle() 传入位置与抬升。' }),
  Object.freeze({ legacy: 'campus-shuttle-static', part: '轨道与枕木', note: '由本构件的 vis2-rails 替换。' }),
  Object.freeze({ legacy: 'campus-rack-labels', part: '货架行标签 A1 / R2 / C2 / B2', note: '保留，不替换（位置在货架端面外，本构件不画标签）。' }),
])

const seeded = (value) => () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000)

function createBoxBatch(THREE, name, material, capacity) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, capacity))
  mesh.name = name; mesh.count = 0; mesh.frustumCulled = true
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(), color = new THREE.Color()
  return {
    mesh,
    add(x, y, z, sx, sy, sz, hex, rotZ = 0) {
      if (mesh.count >= mesh.instanceMatrix.count) throw new Error(`${name} 实例容量不足`)
      quaternion.setFromEuler(euler.set(0, 0, rotZ))
      matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz))
      mesh.setMatrixAt(mesh.count, matrix); mesh.setColorAt(mesh.count, color.setHex(hex)); mesh.count++
    },
    finish() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingBox?.(); mesh.computeBoundingSphere?.() },
  }
}

// 托盘 + 货物 + 缠绕膜：返回放置到 (x, baseY, z) 的各部件（baseY = 托盘底面高度）。随机性由调用方传入的 rng 决定。
function placeLoad(batches, rng, x, baseY, z, { film = true, layersMax = 3 } = {}) {
  const D = VIS2_DIMENSIONS, palletTop = baseY + D.palletHeight
  // 托盘：面板 + 3 根垂直于横梁的承梁（承梁沿 x，横梁沿 z）
  batches.pallet.add(x, palletTop - 0.015, z, D.palletX, 0.03, D.palletZ, VIS2_COLORS.pallet)
  for (const dz of [-0.4, 0, 0.4]) batches.pallet.add(x, baseY + 0.045, z + dz, D.palletX, 0.09, 0.1, VIS2_COLORS.pallet)
  const layers = 2 + Math.floor(rng() * (layersMax - 1)), layerHeight = Math.min(0.38, D.loadMaxHeight / layers)
  const tone = [0xc9a06a, 0xbf9660, 0xd3ab74]
  for (let layer = 0; layer < layers; layer++) for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
    const jitter = (rng() - 0.5) * 0.02
    batches.carton.add(x + ix * 0.295 + jitter, palletTop + layerHeight * (layer + 0.5), z + iz * 0.245, 0.58, layerHeight - 0.012, 0.47, tone[(layer + (ix > 0 ? 1 : 0) + (iz > 0 ? 2 : 0)) % 3])
  }
  const loadHeight = layers * layerHeight
  if (film && rng() < 0.72) batches.film.add(x, palletTop + loadHeight / 2 + 0.01, z, D.palletX + 0.04, loadHeight + 0.03, D.palletZ + 0.04, VIS2_COLORS.film)
  return { height: D.palletHeight + loadHeight }
}

function buildRackStructure(batches, rack, low, rng, stats) {
  // 单深货架：框架进深 1.1 m 居中于 2 m 占地内（横梁间距 0.95 m，托盘 1.2 m 两端各悬出 0.125 m 搭在横梁上），两侧各留 0.45 m 余量。
  const D = VIS2_DIMENSIONS, cx = (rack.x0 + rack.x1) / 2, half = 0.55, frontX = cx - half, backX = cx + half, beamOffset = half - D.uprightSize / 2 - D.beamThickness / 2
  const boundaries = [rack.sections[0].z0, ...rack.sections.map((section) => section.z1)]
  for (const z of boundaries) {
    for (const x of [frontX, backX]) { batches.frame.add(x, D.uprightHeight / 2, z, D.uprightSize, D.uprightHeight, D.uprightSize, VIS2_COLORS.upright); stats.uprights++ }
    const span = backX - frontX
    if (low) continue
    for (const y of D.tieLevels) batches.frame.add((frontX + backX) / 2, y, z, span, D.braceSize, D.braceSize, VIS2_COLORS.brace)
    for (let i = 0; i < D.tieLevels.length - 1; i++) {
      const y0 = D.tieLevels[i], y1 = D.tieLevels[i + 1], flip = i % 2 ? -1 : 1, dy = y1 - y0
      batches.frame.add((frontX + backX) / 2, (y0 + y1) / 2, z, Math.hypot(span, dy), D.braceSize, D.braceSize, VIS2_COLORS.brace, flip * Math.atan2(dy, span)); stats.braces++
    }
  }
  const levels = low ? D.beamLevels.slice(0, 3) : D.beamLevels, loadLevels = D.beamLevels.slice(0, 3) // 第 4 道横梁（4.1 m）只作顶梁，不放货，货顶 ≤ 3.93 m 低于顶梁与屋面
  for (const section of rack.sections) {
    const length = section.z1 - section.z0 - D.uprightSize - 0.02, mid = (section.z0 + section.z1) / 2
    for (const y of levels) {
      for (const x of [cx - beamOffset, cx + beamOffset]) { batches.frame.add(x, y, mid, D.beamThickness, D.beamHeight, length, VIS2_COLORS.beam); stats.beams++ }
      if (!loadLevels.includes(y)) continue
      // 每个货位放两个托盘；约 22% 空位，保证有「取走」的视觉空隙
      for (const dz of [-1, 1]) {
        if (rng() < 0.22) { stats.empty++; continue }
        const baseY = y + D.beamHeight / 2
        placeLoad(batches, rng, cx, baseY, mid + dz * (length / 4), { film: !low, layersMax: low ? 2 : 3 })
        stats.loads++
      }
    }
  }
}

function buildRails(batches, plan, stats) {
  const D = VIS2_DIMENSIONS, z0 = plan.path.z0 - 1.1, z1 = plan.path.z1 + 1.1, length = z1 - z0, midZ = (z0 + z1) / 2
  for (const x of plan.rails) { batches.rail.add(x, 0.045 + D.railHeight / 2, midZ, D.railWidth, D.railHeight, length, VIS2_COLORS.rail); stats.rails++ }
  for (let z = z0 + 0.2; z <= z1 - 0.2; z += D.sleeperPitch) { batches.rail.add(plan.centerX, 0.0225, z, plan.rails[1] - plan.rails[0] + 0.5, 0.045, 0.14, VIS2_COLORS.sleeper); stats.sleepers++ }
  for (const x of plan.rails) for (const z of [z0 + 0.1, z1 - 0.1]) batches.rail.add(x, 0.045 + 0.1, z, 0.16, 0.2, 0.12, VIS2_COLORS.bumper)
}

// 穿梭机：低矮车体 + 四个车轮压在两条轨道上 + 顶部承托板 + 承托板上的托盘货物；合并为一个带顶点色的网格。
function buildShuttleGeometry(THREE, plan, rng, low) {
  const D = VIS2_DIMENSIONS, S = D.shuttle, positions = [], colors = [], indices = [], c = new THREE.Color()
  const box = (x, y, z, sx, sy, sz, hex) => {
    const base = positions.length / 3, hx = sx / 2, hy = sy / 2, hz = sz / 2
    for (const [px, py, pz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) { positions.push(x + px * hx, y + py * hy, z + pz * hz); c.setHex(hex); colors.push(c.r, c.g, c.b) }
    for (const f of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 6, 2], [3, 7, 6], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]) indices.push(base + f[0], base + f[1], base + f[2])
  }
  const bodyY = D.shuttle.rideHeight + S.height / 2
  box(0, bodyY, 0, S.width, S.height, S.length, VIS2_COLORS.body)
  for (const side of [-1, 1]) box(side * (S.width / 2 + 0.006), bodyY, 0, 0.012, 0.06, S.length * 0.86, VIS2_COLORS.stripe)
  for (const end of [-1, 1]) box(0, bodyY - 0.02, end * (S.length / 2 + 0.04), S.width * 0.9, 0.16, 0.08, VIS2_COLORS.bumper)
  box(0, bodyY + S.height / 2 + 0.02, 0, S.width * 0.62, 0.04, S.length * 0.74, VIS2_COLORS.carrier)
  // 车轮：以八棱柱近似圆柱，轴沿 x，落在轨道顶面
  const wheelY = 0.045 + D.railHeight + S.wheelRadius
  for (const x of plan.rails) for (const z of [-0.38, 0.38]) {
    const base = positions.length / 3, r = S.wheelRadius, w = 0.07, segments = low ? 6 : 10
    for (const side of [-1, 1]) for (let i = 0; i < segments; i++) { const a = (i / segments) * Math.PI * 2 + ((Math.PI * 1.5) % ((Math.PI * 2) / segments)); positions.push(x - plan.centerX + side * w / 2, wheelY + Math.sin(a) * r, z + Math.cos(a) * r); c.setHex(VIS2_COLORS.wheel); colors.push(c.r, c.g, c.b) }
    for (let i = 0; i < segments; i++) { const n = (i + 1) % segments; indices.push(base + i, base + n, base + segments + n, base + i, base + segments + n, base + segments + i) }
    positions.push(x - plan.centerX, wheelY, z); colors.push(0.2, 0.2, 0.2); const hub = positions.length / 3 - 1
    for (let i = 0; i < segments; i++) { const n = (i + 1) % segments; indices.push(hub, base + n, base + i, hub, base + segments + i, base + segments + n) }
  }
  // 承托板上的托盘货物（单个、静态，随穿梭机一起移动）
  const platformTop = bodyY + S.height / 2 + 0.04, palletTop = platformTop + D.palletHeight
  box(0, palletTop - 0.015, 0, D.palletZ, 0.03, D.palletX, VIS2_COLORS.pallet)
  for (const dx of [-0.4, 0, 0.4]) box(dx, platformTop + 0.045, 0, 0.1, 0.09, D.palletX, VIS2_COLORS.pallet)
  const layers = 2, layerHeight = 0.36
  for (let layer = 0; layer < layers; layer++) for (const ix of [-1, 1]) for (const iz of [-1, 1]) box(ix * 0.245, palletTop + layerHeight * (layer + 0.5), iz * 0.295, 0.47, layerHeight - 0.012, 0.58, [0xc9a06a, 0xbf9660, 0xd3ab74][(layer + (ix > 0 ? 1 : 0) + (iz > 0 ? 2 : 0)) % 3])
  void rng
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

export function buildVis2RackCell({ THREE, root, layout, quality, seed = 4207, rows = null } = {}) {
  const low = quality?.tier === 'low'
  const racksPlan = createCampusRackPlan({ zones: layout?.zones, shuttle: layout?.shuttle }), plan = shuttlePlan(layout)
  const rng = seeded(seed), stats = { uprights: 0, braces: 0, beams: 0, loads: 0, empty: 0, rails: 0, sleepers: 0 }
  const group = new THREE.Group(); group.name = 'vis2-rack-cell'; group.userData.vis2 = 'rack-cell'
  const standard = (extra = {}) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.2, ...extra })
  const materials = { frame: standard({ roughness: 0.5, metalness: 0.45 }), pallet: standard({ roughness: 0.86, metalness: 0 }), carton: standard({ roughness: 0.9, metalness: 0 }), rail: standard({ roughness: 0.45, metalness: 0.55 }),
    film: standard({ roughness: 0.15, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }) }
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
  for (const batch of Object.values(batches)) { batch.finish(); group.add(batch.mesh) }
  batches.rail.mesh.userData.railGroup = true
  const shuttleMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 })
  const shuttleGeometry = buildShuttleGeometry(THREE, plan, rng, low)
  const shuttle = new THREE.Mesh(shuttleGeometry, shuttleMaterial)
  shuttle.name = 'vis2-shuttle'; shuttle.userData.dynamic = true; shuttle.frustumCulled = false
  const slotB = plan.slots[1]; shuttle.position.set(plan.centerX, 0, slotB.z)
  group.add(shuttle)
  root.add(group)
  let disposed = false
  const setShuttle = ({ z = slotB.z, lift = 0 } = {}) => {
    if (!Number.isFinite(z) || !Number.isFinite(lift)) return
    shuttle.position.z = Math.min(plan.path.z1, Math.max(plan.path.z0, z)); shuttle.position.y = Math.min(0.12, Math.max(0, lift))
  }
  const triangles = () => Object.values(batches).reduce((t, b) => t + b.mesh.count * 12, 0) + shuttleGeometry.index.count / 3
  const summary = () => ({ module: 'vis2-rack-cell', preview: '组件预览，尚未正式接入', quality: low ? 'low' : 'high', seed, rows: rowList.map((rack) => rack.label), ...stats,
    instances: Object.fromEntries(Object.entries(batches).map(([name, batch]) => [name, batch.mesh.count])), drawCalls: Object.keys(batches).length + 1, triangles: Math.round(triangles()), replaces: VIS2_REPLACES.map((item) => item.legacy) })
  const dispose = () => {
    if (disposed) return; disposed = true
    group.removeFromParent()
    for (const batch of Object.values(batches)) { batch.mesh.geometry.dispose(); batch.mesh.dispose?.() }
    for (const material of Object.values(materials)) material.dispose()
    shuttleGeometry.dispose(); shuttleMaterial.dispose()
  }
  return { group, summary, setShuttle, dispose }
}
