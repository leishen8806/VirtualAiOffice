import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { r1ToWorld, R1_RESERVED_SEATS, R1_RESERVED_TUCK_M, isReservedSeat } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'
import { r1DoorPlan } from '../office-vis2/r1-doors.js'
import { buildR1Plaza, r1PlazaBrand } from '../office-vis2/r1-plaza.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { officeV3ModulesFor } from '../office-v3-modules.js'
import {
  buildR1Brand, r1AmbienceSpec, R1_ROOM_PLATES, r1PlateStandoff, ATLAS_WIDTH, R1_AMBIENCE_ATLAS,
  drawR1Nameplate, drawR1Welcome, drawR1WallScreen, r1WallScreenModel, drawR1DeskPlate,
} from '../office-vis2/r1-brand.js'

// AM-7 要拿真实家具的包围盒来对桌牌，所以按 R5 的办法加载 GLB：只加载办公桌 / 办公椅 / 显示器
// 这三类及其桌面物件用到的 8 个模型，别的类别由过滤后的布局挡掉。
const hooks = registerHooks({ resolve(s, c, next) { return s === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(s, c) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()
const loadModel = async name => {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const FURNITURE_MODELS = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1']
const A = { furn: Object.fromEntries(await Promise.all(FURNITURE_MODELS.map(async name => [name, await loadModel(name)]))) }
const deskFurniture = () => {
  const base = createOfficeR1Layout()
  const layout = { ...base, r1: { ...base.r1, elements: base.r1.elements.filter(item => ['办公桌', '办公椅', '显示器'].includes(item.category)) } }
  return buildR1Furniture({ THREE, root: new THREE.Group(), layout, A, placeFurniture, makeScreenTexture: () => ({ ctx: {}, tex: new THREE.Texture() }) })
}

const MM = .001, CM = .01
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)

// 记录画布调用的假上下文：既喂给 canvasTex，也单独用来读回绘制的文本。
const recordingContext = () => ({
  texts: [], rects: 0, fills: [],
  set fillStyle(v) { this.fills.push(String(v)) }, set strokeStyle(v) {}, set font(v) {}, set letterSpacing(v) {},
  set textAlign(v) {}, set textBaseline(v) {}, set lineWidth(v) {}, set globalAlpha(v) {},
  fillRect() { this.rects++ }, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {}, roundRect() {}, arc() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {},
  measureText: () => ({ width: 100 }),
  fillText(text) { this.texts.push(String(text)) },
  createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
})
const fakeCanvasTex = (w, h, draw) => { const ctx = recordingContext(); draw(ctx, w, h); const t = new THREE.Texture(); t.userData = { size: [w, h], ctx }; return t }
const failingLoader = { load(url, onLoad, onProgress, onError) { onError(new Error('404')); return new THREE.Texture() } }
const fakeSurface = () => { const ctx = recordingContext(); return { ctx, texture: new THREE.Texture() } }

const brand = (extra = {}) => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const module = buildR1Brand({ THREE, root, layout, collision, canvasTex: fakeCanvasTex, textureLoader: failingLoader, canvasSurface: fakeSurface, ...extra })
  return { module, root, layout, collision, ambience: module.ambience }
}
const plaza = (extra = {}) => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const module = buildR1Plaza({ THREE, root, layout, collision, textureLoader: failingLoader, ...extra })
  return { module, root, layout, collision }
}
const meshCount = root => { let n = 0; root.traverse(node => { if (node.isMesh) n++ }); return n }

// ── 门扇 101 相位：按登记门扇在每个相位的实际位姿还原包围盒 ──
const leafBoxes = (layout, doorIds, phases = 101) => {
  const plan = r1DoorPlan(layout), boxes = []
  for (const row of plan.filter(entry => doorIds.includes(entry.doorId))) {
    for (let i = 0; i < phases; i++) {
      const p = i / (phases - 1)
      const normalShift = row.offset * Math.min(1, p * 5)
      const slide = (row.open[row.axis] - row.closed[row.axis]) * Math.max(0, (p - .2) / .8)
      const centre = { x: row.closed.x, z: row.closed.z }
      centre[row.normal] += normalShift
      centre[row.axis] += slide
      const half = { x: row.vertical ? row.thickness / 2 : row.width / 2, z: row.vertical ? row.width / 2 : row.thickness / 2 }
      boxes.push(new THREE.Box3(
        new THREE.Vector3(centre.x - half.x, 0, centre.z - half.z),
        new THREE.Vector3(centre.x + half.x, row.height, centre.z + half.z)))
    }
  }
  return boxes
}
const boxGap = (box, point) => Math.hypot(
  Math.max(box.min.x - point.x, 0, point.x - box.max.x),
  Math.max(box.min.z - point.z, 0, point.z - box.max.z))
// 半圆花池的实际占地：圆弧 + 贴墙的弦，按 1 cm 采样。
const planterOutline = planter => {
  const points = []
  for (let i = 0; i <= 180; i++) {
    const a = Math.PI * i / 180
    points.push({ x: planter.center.x + Math.cos(a) * planter.radius, z: planter.center.z - Math.sin(a) * planter.radius })
  }
  for (let i = 0; i <= 180; i++) points.push({ x: planter.center.x - planter.radius + 2 * planter.radius * i / 180, z: planter.center.z })
  return points
}
const segmentDistance = (point, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq)) : 0
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t))
}

test('AMB-1 the round emblem sits on the courtyard face of 00-W-036 at the registered centre', () => {
  const { module, ambience, layout } = brand()
  const wall = layout.r1.elements.find(row => row.id === '00-W-036')
  const centre = r1ToWorld(wall.xM, wall.yM), atrium = centre.z - wall.widthM / 2
  near(atrium, 8.9, MM)
  near(ambience.atriumFace, atrium, 1e-9)
  // 圆心：登记 X 28（世界 x 2），离地 1.65 m。
  near(ambience.emblem.center.x, 2, CM)
  near(ambience.emblem.center.y, 1.65, CM)
  // 直径约 2.6 m 的黑盘，外面一圈铜环加一圈暖光。
  near(r1AmbienceSpec.emblem.discRadius * 2, 2.6, MM)
  assert.ok(r1AmbienceSpec.emblem.ringRadius > r1AmbienceSpec.emblem.discRadius)
  assert.ok(r1AmbienceSpec.emblem.haloRadius > r1AmbienceSpec.emblem.ringRadius)
  // 所有件都贴在朝中庭一面：不穿墙，也不离开墙面超过 0.15 m。
  for (const [name, box] of Object.entries(ambience.emblem.parts)) {
    assert.ok(box.max.z <= atrium + 1e-6, `${name} 不得穿过屏风（${box.max.z} > ${atrium}）`)
    assert.ok(box.min.z >= atrium - .15, `${name} 离墙面不应超过 0.15 m`)
  }
  // 朝入口一面的原品牌板一件不动。
  const panel = new THREE.Box3().setFromObject(module.root.getObjectByName('r1-brand-panel'))
  assert.ok(panel.max.z > centre.z + wall.widthM / 2, '入口面的黑底品牌板仍在原处')
  module.dispose()
})

test('AMB-2 the half-ring planter has collision and keeps 0.3 m clear of the routes and the 11-D-002/003 sweeps', () => {
  const { module, ambience, layout, collision } = brand()
  const planter = ambience.planter
  near(planter.radius, 1.75, MM)
  near(planter.height, .3, MM)
  near(planter.center.z, ambience.atriumFace, CM)
  // 只占朝中庭的半圈：贴墙一侧不越过墙面。
  assert.ok(planter.box.max.z <= ambience.atriumFace + 1e-6, '花池不得越过墙面')
  near(planter.box.min.z, ambience.atriumFace - 1.75, CM)
  // 碰撞：站在花池上会被挡住，花池之外 0.5 m 仍然通行。
  assert.ok(collision.hit(planter.center.x, planter.center.z - 1.2), '花池应有碰撞')
  assert.equal(collision.hit(planter.center.x, planter.center.z - 2.6), null, '花池之外应通行')
  // 离两樘登记门的门扇 101 相位 ≥ 0.3 m，且一个相位都不相交。
  const outline = planterOutline(planter)
  let worst = Infinity
  for (const box of leafBoxes(layout, ['11-D-002', '11-D-003'])) {
    for (const point of outline) worst = Math.min(worst, boxGap(box, point))
  }
  assert.ok(worst >= .3, `花池离门扇扫掠 ${worst.toFixed(3)} m，应 ≥ 0.3 m`)
  // 离登记路线 ≥ 0.3 m。
  let route = Infinity
  for (const row of layout.r1.data.routes) {
    const points = row.points_m.map(([x, y]) => r1ToWorld(x, y))
    for (let i = 1; i < points.length; i++) for (const point of outline) route = Math.min(route, segmentDistance(point, points[i - 1], points[i]))
  }
  assert.ok(route >= .3, `花池离登记路线 ${route.toFixed(3)} m，应 ≥ 0.3 m`)
  module.dispose()
  assert.equal(collision.hit(planter.center.x, planter.center.z - 1.2), null, '卸载后碰撞一并移除')
})

test('AMB-3 seven nameplates hang over the registered doors, face the corridor and clear the leaf sweep in all 101 phases', () => {
  const { module, ambience, layout, collision } = brand()
  const plates = ambience.plates
  assert.deepEqual(plates.map(plate => plate.text), ['市场部', '会议与决策', '客服部', '售后部', '营销部', '洽谈室 A', '洽谈室 B'])
  assert.deepEqual(plates.map(plate => plate.doorId), ['01-D-001', '02-D-001', '05-D-001', '09-D-001', '13-D-001', '03-D-001', '03-D-002'])
  // BACKWALL 新开的两樘门不挂名牌。
  assert.ok(!plates.some(plate => ['11-D-002', '11-D-003'].includes(plate.doorId)))
  const plan = r1DoorPlan(layout)
  for (const plate of plates) {
    const door = layout.r1.elements.find(row => row.id === plate.doorId), p = r1ToWorld(door.xM, door.yM)
    const leaf = plan.find(row => row.doorId === plate.doorId)
    // 挂在门正上方：沿门所在墙线的中心与门心重合，中心高 2.55 m。
    near(plate.center[leaf.axis], p[leaf.axis], CM)
    near(plate.center.y, 2.55, CM)
    near(plate.box.max.x - plate.box.min.x, leaf.vertical ? r1AmbienceSpec.plate.depth : r1AmbienceSpec.plate.width, MM)
    near(plate.box.max.y - plate.box.min.y, r1AmbienceSpec.plate.height, MM)
    // 朝走廊一侧：门扇退让的方向就是走廊方向。
    assert.equal(Math.sign(plate.center[leaf.normal] - p[leaf.normal]), Math.sign(leaf.offset), `${plate.doorId} 名牌应朝走廊一侧`)
  }
  // 101 相位逐件检查：名牌与任何门扇位姿都不相交。
  const boxes = leafBoxes(layout, plates.map(plate => plate.doorId))
  for (const plate of plates) for (const box of boxes) {
    assert.ok(!box.intersectsBox(plate.box), `${plate.doorId} 名牌进入了门扇扫掠`)
  }
  // 悬挑距离由门扇实际行程推出来，不是写死的数字。
  near(r1PlateStandoff(layout), .185 + r1AmbienceSpec.plate.clearance + r1AmbienceSpec.plate.depth / 2, 1e-9)
  // 名牌不进碰撞。
  for (const plate of plates) assert.equal(collision.hit(plate.center.x, plate.center.z), null, `${plate.doorId} 名牌不应进碰撞`)
  module.dispose()
})

test('AMB-4 the brass welcome inlay lies flat outside the gate, at most 3 mm above the paving and out of collision', () => {
  const { module, ambience, collision } = brand()
  const welcome = ambience.welcome, p = r1ToWorld(...r1AmbienceSpec.welcome.at)
  near(welcome.center.x, p.x, CM); near(welcome.center.z, p.z, CM)
  near(p.x, 2, MM); near(p.z, 19.6, MM)
  near(welcome.box.max.x - welcome.box.min.x, 7, MM)
  // 平铺在地面上：厚度为 0，高出铺装不超过 3 mm。
  near(welcome.box.max.y - welcome.box.min.y, 0, 1e-6)
  assert.ok(welcome.box.max.y > 0 && welcome.box.max.y <= .003 + 1e-9, `嵌字高度 ${welcome.box.max.y} 应在 0–3 mm`)
  assert.equal(welcome.material.polygonOffset, true, '必须开 polygonOffset 防闪烁')
  // 喷泉水池外沿在世界 z 23.85，嵌字不得压上去。
  assert.ok(welcome.box.max.z < 23.85)
  assert.equal(collision.hit(welcome.center.x, welcome.center.z), null, '地面嵌字不进碰撞')
  const context = recordingContext()
  drawR1Welcome(context, ...r1AmbienceSpec.welcome.canvas)
  assert.deepEqual(context.texts, ['欢 迎 光 临', 'WELCOME'])
  module.dispose()
})

test('AMB-5 the meeting-room screen is a 16:9 panel on the north wall inner face with an opaque back', () => {
  const { module, ambience, layout, collision } = brand()
  const wall = layout.r1.elements.find(row => row.id === r1AmbienceSpec.screen.wallId)
  const inner = r1ToWorld(wall.xM, wall.yM).z + wall.widthM / 2
  near(inner, -24.9, MM)
  const screen = ambience.screen
  near(screen.center.x, r1ToWorld(r1AmbienceSpec.screen.centerXM, 0).x, CM)
  near(screen.center.x, -13.5, CM)
  near(screen.center.y, 2.18, CM)
  near(screen.face.max.x - screen.face.min.x, 4.2, MM)
  const ratio = (screen.face.max.x - screen.face.min.x) / (screen.face.max.y - screen.face.min.y)
  assert.ok(Math.abs(ratio - 16 / 9) <= .01, `画面比例 ${ratio} 应为 16:9`)
  // 整组都在墙内侧、朝会议桌：不穿玻璃，也不伸到室外。
  assert.ok(screen.box.min.z >= inner - 1e-6, '大屏不得穿过北墙玻璃')
  assert.ok(screen.face.min.z > screen.bezel.min.z, '画面在背板之前')
  assert.equal(screen.backing.transparent, false, '背板不透光')
  // 不碰北侧两盆植物。
  for (const id of ['02-PL-001', '02-PL-002']) {
    const plant = layout.r1.elements.find(row => row.id === id), q = r1ToWorld(plant.xM, plant.yM)
    const gap = boxGap(screen.box, q) - plant.lengthM / 2
    assert.ok(gap > 0, `${id} 与大屏相碰`)
  }
  assert.equal(collision.hit(screen.center.x, screen.center.z), null, '大屏不进碰撞')
  module.dispose()
})

test('AMB-6 the wall screen redraws only on changed data and never more often than every 5 s', () => {
  let clock = 0
  const { module } = brand({ clock: () => clock })
  const state = {
    today: { date: '2026-10-29', weekday: '周四', onDuty: true, done: 3, total: 10, percent: .3, backlog: 2,
      open: { inProgress: 2, inReview: 1, blocked: 1, todo: 3 }, runs: { total: 9, succeeded: 8, failed: 1 }, comments: 7,
      byProject: [{ projectId: 'p1', name: '智序工场', done: 3, total: 10 }] },
    agents: [{ id: 'a1', name: 'Frontend1', status: 'running', liveRun: { id: 'r1' }, task: { id: 'CMP-624', title: '氛围五项' } }],
    names: { a1: '前端一号' },
  }
  const daily = { date: '2026-10-29', done: [{ ident: 'CMP-1', title: '示例任务' }] }
  assert.equal(module.ambience.redraws(), 0)
  module.updateWallScreen(state, daily)
  assert.equal(module.ambience.redraws(), 1, '第一次有数据必须画一帧')
  // 数据不变：一次都不重画。
  for (let i = 0; i < 5; i++) { clock += 10_000; module.updateWallScreen(state, daily) }
  assert.equal(module.ambience.redraws(), 1, '数据不变时不重绘')
  // 完成数变了，离上一帧已超过 5 s：画。
  const moved = { ...state, today: { ...state.today, done: 4, percent: .4 } }
  module.updateWallScreen(moved, daily)
  assert.equal(module.ambience.redraws(), 2)
  // 又变了，但离上一帧只有 2 s：先不画。
  clock += 2_000
  const again = { ...state, today: { ...state.today, done: 5, percent: .5 } }
  module.updateWallScreen(again, daily)
  assert.equal(module.ambience.redraws(), 2, '重绘间隔必须 ≥ 5 s')
  // 过了 5 s 再来一次就画。
  clock += 3_000
  module.updateWallScreen(again, daily)
  assert.equal(module.ambience.redraws(), 3)
  // 同事状态变了也要更新。
  clock += 6_000
  module.updateWallScreen({ ...again, agents: [{ ...state.agents[0], status: 'error', liveRun: null }] }, daily)
  assert.equal(module.ambience.redraws(), 4)
  // 显示名变了也要更新。
  clock += 6_000
  module.updateWallScreen({ ...again, names: { a1: '小前' } }, daily)
  assert.equal(module.ambience.redraws(), 5)
  // 今日完成列表变了也要更新。
  clock += 6_000
  module.updateWallScreen({ ...again, names: { a1: '小前' } }, { ...daily, done: [{ ident: 'CMP-2', title: '另一件' }] })
  assert.equal(module.ambience.redraws(), 6)
  module.dispose()
})

test('AMB-7 the wall screen only reads today / agents / names / daily.done and degrades without throwing', () => {
  const state = {
    token: 'SECRET-TOKEN', telegram: { bot: '@someBot', token: 'TG-SECRET' }, costs: { monthSpendCents: 123456 },
    today: { date: '2026-10-29', weekday: '周四', onDuty: true, done: 1, total: 4, percent: .25, backlog: 0,
      open: { inProgress: 1, inReview: 1, blocked: 0, todo: 1 }, runs: { total: 2, succeeded: 2, failed: 0 }, comments: 1,
      byProject: [{ projectId: 'p1', name: '智序工场', done: 1, total: 4 }] },
    agents: [{ id: 'a1', name: 'Frontend1', status: 'idle', task: null, costCents: 999 }],
    names: { a1: '前端一号' },
  }
  const model = r1WallScreenModel(state, { done: [{ ident: 'CMP-1', title: '示例任务', agentId: 'a1' }] })
  const serialised = JSON.stringify(model)
  for (const banned of ['SECRET-TOKEN', 'TG-SECRET', 'someBot', '123456', '999', 'costs', 'telegram', 'token']) {
    assert.ok(!serialised.includes(banned), `大屏数据不得包含「${banned}」`)
  }
  const context = recordingContext()
  drawR1WallScreen(context, ...r1AmbienceSpec.screen.canvas, model)
  const drawn = context.texts.join(' ')
  for (const banned of ['SECRET-TOKEN', 'TG-SECRET', 'someBot', '1234.56', '$']) assert.ok(!drawn.includes(banned), `大屏画面不得出现「${banned}」`)
  assert.ok(drawn.includes('示例任务'), '今日完成要滚动显示')
  // /daily 读不到：保留上一帧的完成列表，不抛错。
  const degraded = r1WallScreenModel(state, null)
  assert.deepEqual(degraded.done, [])
  assert.doesNotThrow(() => drawR1WallScreen(recordingContext(), ...r1AmbienceSpec.screen.canvas, degraded))
  // 字段缺失 / 上游不可用（{value:null}）也不能抛错。
  const gapped = r1WallScreenModel({ today: { date: null, done: { value: null }, runs: {}, byProject: [] }, agents: null, names: null }, undefined)
  assert.doesNotThrow(() => drawR1WallScreen(recordingContext(), ...r1AmbienceSpec.screen.canvas, gapped))
  assert.doesNotThrow(() => r1WallScreenModel(null, null))
  const plate = recordingContext()
  drawR1Nameplate(plate, ...r1AmbienceSpec.plate.canvas, '市场部')
  assert.deepEqual(plate.texts, ['市场部'])
})

test('AMB-8 the parasols wear eight alternating gold and espresso panels over an espresso valance, registered size unchanged', () => {
  const { module, layout } = plaza()
  assert.equal(r1PlazaBrand.canopy.panels, 8)
  assert.deepEqual([...r1PlazaBrand.canopy.tints], ['#C9A15E', '#3B2A20'])
  assert.equal(r1PlazaBrand.canopy.valance, '#3B2A20')
  for (const umbrella of layout.r1.elements.filter(row => row.category === '遮阳伞')) {
    const canopy = layout.r1.elements.find(row => row.id === `${umbrella.id}-CANOPY`)
    const record = module.byId.get(canopy.id), p = r1ToWorld(canopy.xM, canopy.yM)
    // 几何尺寸不变：伞面包围盒仍然是登记的 length × width × height。
    near(record.bounds.max.x - record.bounds.min.x, canopy.lengthM, CM)
    near(record.bounds.max.z - record.bounds.min.z, canopy.widthM, CM)
    near(record.bounds.min.y, canopy.zM, CM)
    near(record.bounds.max.y, canopy.zM + canopy.heightM, CM)
    near((record.bounds.max.x + record.bounds.min.x) / 2, p.x, CM)
    // 垂边挂在伞面下沿，仍高于 2.1 m 的头部净高；它不是登记件，不得混进 60 条登记记录。
    assert.equal(module.byId.get(`${canopy.id}-VALANCE`), undefined, '垂边不得登记成第 61 件')
    const valance = module.extras.get(`${canopy.id}-VALANCE`)
    assert.ok(valance, `${canopy.id} 应有垂边`)
    assert.ok(valance.min.y >= 2.1, `垂边下沿 ${valance.min.y} 应 ≥ 2.1 m`)
    assert.ok(valance.max.y <= canopy.zM + 1e-6, '垂边应挂在伞面下沿')
    near((valance.max.x + valance.min.x) / 2, p.x, CM)
  }
  module.dispose()
})

test('AMB-9 the food truck keeps its registered box while the roof cap turns espresso with a bronze trim and a DR.LIFE+ decal', () => {
  const { module, layout } = plaza()
  assert.equal(r1PlazaBrand.truck.cap, '#3B2A20')
  assert.equal(r1PlazaBrand.truck.trim, '#C9A15E')
  const truck = layout.r1.elements.find(row => row.category === '餐车')
  const record = module.byId.get(truck.id), p = r1ToWorld(truck.xM, truck.yM)
  near((record.bounds.max.x + record.bounds.min.x) / 2, p.x, CM)
  near((record.bounds.max.z + record.bounds.min.z) / 2, p.z, CM)
  near(record.bounds.max.y, truck.heightM, CM)
  // 顶盖的标志贴图加载失败时隐藏，不抛错也不留白板。
  assert.equal(module.decals.visible, false, '贴图加载失败时标志应隐藏')
  const loaded = plaza({ textureLoader: { load(url, onLoad) { const t = new THREE.Texture(); onLoad(t); return t } } })
  assert.equal(loaded.module.decals.visible, true)
  assert.ok(loaded.module.decals.name.includes('logo'))
  // 只多一个带贴图的网格。
  assert.equal(meshCount(loaded.module.root) - meshCount(module.root), 0)
  loaded.module.dispose(); module.dispose()
})

test('AMB-10 the R1 module list is unchanged and both tiers stay inside the draw-call budget', () => {
  const layout = createOfficeR1Layout()
  assert.deepEqual(officeV3ModulesFor(layout).map(([name]) => name),
    // r1Books 是 OFFICE-R1-FOOD 补充 R2 的书架书籍模块，排在 r1Decor 之后、r1Plaza 之前。
    ['shell3', 'furniture3', 'r1Island', 'r1Plants', 'r1Doors', 'r1Lounge', 'r1Decor', 'r1Books', 'r1Plaza', 'r1Lights', 'r1Brand'])
  assert.ok(!officeV3ModulesFor({}).some(([name]) => name === 'r1Brand'))
  // 高档走 env.js 的 GTAO composer，整个场景每帧渲染两遍，一个网格就是两次 draw call；
  // AM-5 的 +8 call 上限换算过来就是「两个模块合计最多 4 个新网格」。
  const high = brand(), low = brand({ quality: { tier: 'low' } })
  assert.equal(meshCount(high.module.root), 3 + 3, '入口面 3 个 + 氛围 3 个')
  assert.equal(meshCount(low.module.root), 4 + 3)
  const names = []
  high.module.root.traverse(node => { if (node.isMesh && node.name.startsWith('r1-ambience-')) names.push(node.name) })
  assert.deepEqual(names.sort(), ['r1-ambience-art', 'r1-ambience-screen', 'r1-ambience-surfaces'])
  const triangles = root => { let n = 0; root.traverse(node => { if (node.isMesh) n += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3 }); return n }
  for (const built of [high, low]) assert.ok(triangles(built.module.root) <= 30_000, `三角数 ${triangles(built.module.root)} 应 ≤ 30000`)
  const plazaHigh = plaza(), plazaLow = plaza({ quality: { tier: 'low' } })
  // 喷泉子树归 OFFICE-R1-FOUNTAIN、价目牌网格归 OFFICE-R1-FOOD，不算进本卡的广场预算。
  const plazaMeshes = built => { const names = []; built.module.root.traverse(node => { if (node.isMesh && node !== built.module.fountain.proxy && !built.module.fountain.root.getObjectById(node.id)) names.push(node.name) }); return names.sort() }
  for (const built of [plazaHigh, plazaLow]) assert.deepEqual(plazaMeshes(built), ['r1-plaza-logo-decals', 'r1-plaza-stall-boards', 'r1-plaza-surfaces'], '广场只多一个贴图网格')
  for (const built of [high, low]) built.module.dispose()
  for (const built of [plazaHigh, plazaLow]) built.module.dispose()
  // 非 R1 布局一件都不建。
  const root = new THREE.Group()
  buildR1Brand({ THREE, root, layout: { plan1Phase: 'L2B' }, canvasTex: fakeCanvasTex }).dispose()
  assert.equal(root.children.length, 0)
})

// ───────────────── AM-7 预留座位：Dr、苏晨、大旺（补充 R2）─────────────────
// 25 位同事的工位映射（I3B 冻结的 chair_id 顺序）；预留座位不得挤进这张表。
const WORKSTATION_CHAIRS = Object.freeze([
  '04-CH-003', '04-CH-009', '04-CH-010', '04-CH-008', '08-CH-004', '04-CH-006', '04-CH-007', '04-CH-005',
  '08-CH-002', '08-CH-003', '08-CH-001', '04-CH-011', '04-CH-001', '08-CH-005', '08-CH-008', '06-CH-002',
  '06-CH-001', '04-CH-002', '06-CH-003', '08-CH-007', '08-CH-006', '06-CH-004', '06-CH-005', '06-CH-006', '04-CH-004',
])

test('AM-7a the reserved-seat table is frozen, matches the board list and leaves the 25 workstations alone', () => {
  assert.ok(Object.isFrozen(R1_RESERVED_SEATS))
  assert.deepEqual(R1_RESERVED_SEATS.map(row => [row.name, row.chair, row.desk]),
    [['苏晨', '08-CH-011', '08-T-011'], ['Dr', '08-CH-012', '08-T-012'], ['大旺', '08-CH-013', '08-T-013']])
  for (const row of R1_RESERVED_SEATS) {
    assert.ok(Object.isFrozen(row), row.chair)
    assert.equal(row.date, '2026-10-29', row.chair)
    assert.ok(typeof row.reason === 'string' && row.reason.length > 0, row.chair)
  }
  // 导出判定：父件与三个子件都算同一个座位，别的椅子一律 false。
  for (const row of R1_RESERVED_SEATS) for (const suffix of ['', '-BACK', '-BASE', '-SEAT']) {
    assert.equal(isReservedSeat(`${row.chair}${suffix}`), true, `${row.chair}${suffix}`)
  }
  for (const id of ['08-CH-010', '08-CH-014', '08-CH-0110', '04-CH-001', '08-T-011', '', null, undefined]) {
    assert.equal(isReservedSeat(id), false, String(id))
  }
  // 三个预留座位不坐人：25 位同事的工位映射一条都不动。
  const layout = createOfficeR1Layout()
  assert.equal(layout.r1.workstations.length, WORKSTATION_CHAIRS.length + 5)
  assert.deepEqual(layout.r1.workstations.slice(0, 25).map(station => station.chair_id), WORKSTATION_CHAIRS)
  for (const station of layout.r1.workstations) assert.equal(isReservedSeat(station.chair_id), false, station.chair_id)
})

test('AM-7b three reserved desk plates read the name plus 预留, sit on their own desk top and clear the monitor, keyboard and mouse', () => {
  const { module, ambience, collision } = brand()
  const plates = ambience.deskPlates, DP = r1AmbienceSpec.deskPlate
  assert.deepEqual(plates.map(plate => plate.text), [['苏晨', '预留'], ['Dr', '预留'], ['大旺', '预留']])
  assert.deepEqual(plates.map(plate => plate.desk), ['08-T-011', '08-T-012', '08-T-013'])
  assert.deepEqual(plates.map(plate => plate.id), ['08-CH-011-PLATE', '08-CH-012-PLATE', '08-CH-013-PLATE'])
  const furniture = deskFurniture()
  for (const plate of plates) {
    const deskBox = furniture.itemBounds.get(plate.desk)
    assert.ok(deskBox, plate.desk)
    // 贴在本桌桌面上：底边与桌面高差 ≤ 3 mm。
    assert.ok(Math.abs(plate.box.min.y - deskBox.max.y) <= 3 * MM, `${plate.desk} 桌牌高差 ${plate.box.min.y - deskBox.max.y} m`)
    // 整块留在本桌占地之内。
    for (const axis of ['x', 'z']) {
      assert.ok(plate.box.min[axis] >= deskBox.min[axis] - MM, `${plate.desk} 桌牌越出桌面 ${axis} 近端`)
      assert.ok(plate.box.max[axis] <= deskBox.max[axis] + MM, `${plate.desk} 桌牌越出桌面 ${axis} 远端`)
    }
    // 不与显示器、键盘、鼠标相交。
    const monitor = furniture.itemBounds.get(plate.desk.replace('-T-', '-M-'))
    assert.ok(monitor, `${plate.desk} 的显示器`)
    assert.equal(plate.box.intersectsBox(monitor), false, `${plate.desk} 桌牌与显示器相交`)
    const desktop = furniture.desktopItems.get(plate.desk)
    const props = desktop.filter(detail => /\/(keyboard|mouse)$/.test(detail.id))
    assert.equal(props.length, 2, plate.desk)
    for (const prop of props) assert.equal(plate.box.intersectsBox(prop.bounds), false, `${plate.desk} 桌牌与 ${prop.id} 相交`)
    // 补充 R2：预留桌上不放个人物品，显示器 / 键盘 / 鼠标 / 鼠标垫照常保留。
    assert.deepEqual(desktop.map(detail => detail.id.split('/')[1]).sort(), ['keyboard', 'mouse', 'pad'], `${plate.desk} 桌面散件`)
    assert.ok(!desktop.some(detail => /\/small$/.test(detail.id)), `${plate.desk} 预留桌不应有个人物品`)
    // 约 0.24 × 0.08 m 的三角立牌：宽度照规格，立起来不超过 0.09 m，占地进深不超过 0.08 m。
    near(plate.box.max.x - plate.box.min.x, DP.width, 2 * MM)
    assert.ok(plate.box.max.y - plate.box.min.y <= .09, `${plate.desk} 桌牌高 ${plate.box.max.y - plate.box.min.y} m`)
    assert.ok(plate.box.max.z - plate.box.min.z <= .08, `${plate.desk} 桌牌进深 ${plate.box.max.z - plate.box.min.z} m`)
    // 桌牌不另加碰撞代理：桌子自己已经有碰撞，牌心处读不到新增碰撞体。
    assert.equal(collision.hit(plate.centre.x, plate.centre.z), null, `${plate.desk} 桌牌不应新增碰撞`)
  }
  // 深底、铜框、金字，上行名字下行「预留」。
  const context = recordingContext()
  drawR1DeskPlate(context, ATLAS_WIDTH, R1_AMBIENCE_ATLAS.cells.desk0.height, '苏晨')
  assert.deepEqual(context.texts, ['苏晨', '预留'])
  for (const colour of [DP.frame, DP.face, DP.text]) assert.ok(context.fills.includes(colour), colour)
  // 图集里三块桌牌各占一格，格子按牌面长宽比开（3 : 1），字不会被拉长。
  for (let index = 0; index < 3; index++) {
    near(ATLAS_WIDTH / R1_AMBIENCE_ATLAS.cells[`desk${index}`].height, DP.width / DP.height, .01)
  }
  furniture.dispose(); module.dispose()
})

test('AM-7c the three reserved chairs are tucked under their desks and every desk still owns exactly one chair', () => {
  const layout = createOfficeR1Layout()
  const desks = layout.r1.elements.filter(item => item.category === '办公桌'), chairs = layout.r1.elements.filter(item => item.category === '办公椅')
  assert.equal(desks.length, 78); assert.equal(chairs.length, 78)
  // I3B 的「1.2 m 内恰有一把办公椅」对全部 78 张桌子仍然成立：推椅子不得让邻桌多出一把。
  for (const desk of desks) {
    assert.equal(chairs.filter(chair => Math.hypot(chair.xM - desk.xM, chair.yM - desk.yM) <= 1.2).length, 1, desk.id)
  }
  const rawOf = id => R1_DATA.elements.find(item => item.id === id)
  for (const seat of R1_RESERVED_SEATS) {
    const chair = chairs.find(item => item.id === seat.chair), desk = desks.find(item => item.id === seat.desk)
    near(chair.xM, rawOf(seat.chair).xM, 1e-9)
    near(chair.yM - rawOf(seat.chair).yM, R1_RESERVED_TUCK_M, 1e-9)
    // 椅子前沿压进桌面占地 ≥ 9.5 cm，椅背仍留在桌子之外（不许整把埋进桌子）。
    const front = chair.yM + chair.widthM / 2, edge = desk.yM - desk.widthM / 2
    assert.ok(front - edge >= .095, `${seat.chair} 只推进 ${front - edge} m`)
    assert.ok(chair.yM - chair.widthM / 2 < edge, `${seat.chair} 椅背埋进了桌子`)
    // 子件（椅背 / 底座 / 座面）跟着父件同样平移，相对偏移不变。
    for (const suffix of ['-BACK', '-BASE', '-SEAT']) {
      const part = layout.r1.elements.find(item => item.id === `${seat.chair}${suffix}`)
      near(part.yM - rawOf(`${seat.chair}${suffix}`).yM, R1_RESERVED_TUCK_M, 1e-9)
      near(part.xM, rawOf(`${seat.chair}${suffix}`).xM, 1e-9)
    }
  }
  // 预留之外的办公椅一律停在原处（接待椅 11-CH-001 由 OFFICE-R1-RECEP 另行平移）。
  for (const chair of chairs) {
    if (isReservedSeat(chair.id) || chair.id === '11-CH-001') continue
    near(chair.yM, rawOf(chair.id).yM, 1e-9)
  }
})
