// VIS2-Q-R3：独立 QA 对 integration/vis2-dr-rc1 的适配/替换/生命周期检查（只读产品代码）。
import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_BUILDING, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { buildCampusRacks } from '../dr-campus-racks.js'
import { buildCampusShuttle } from '../dr-campus-shuttle.js'
import { buildVis2RackCell } from '../dr-vis2-rack-cell.js'
import { loadVisualFlags, VISUAL_FLAGS_OFF } from '../visual-flags.js'

const layout = { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const canvasTex = (w, h, draw) => {
  draw({ fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}, measureText: () => ({ width: 10 }) }, w, h)
  const texture = new THREE.Texture(); texture.image = { width: w, height: h }; return texture
}
const scene = () => new THREE.Scene()
const collect = (root) => { const names = [], groups = []; root.traverse((node) => { if (node.name) names.push(node.name); if (node.userData?.batchGroup) groups.push(node) }); return { names, groups } }
const allSourceIds = (root) => { const ids = new Set(); root.traverse((node) => { for (const id of node.userData?.sourceIds || []) ids.add(id) }); return ids }
const batchVertexColorCount = (root, hex) => {
  const target = new THREE.Color(hex); let count = 0
  root.traverse((node) => {
    const colors = node.geometry?.getAttribute?.('color'); if (!colors) return
    for (let i = 0; i < colors.count; i++) if (Math.abs(colors.getX(i) - target.r) < .01 && Math.abs(colors.getY(i) - target.g) < .01 && Math.abs(colors.getZ(i) - target.b) < .01) count++
  })
  return count
}
const buildRegistry = ({ failVis2 = false } = {}) => {
  const registry = createCampusRegistry({ THREE, scene: scene(), quality: { tier: 'high' }, layout })
  const modules = [
    ['vis2Rack', (ctx) => { if (failVis2) throw new Error('fixture vis2 failure'); const cell = buildVis2RackCell(ctx); ctx.root.userData.vis2RackCell = cell; return cell }],
    ['racks', (ctx) => buildCampusRacks({ ...ctx, replaceRackCell: Boolean(ctx.root.userData.vis2RackCell) })],
    ['motion', () => ({})],
    ['shuttle', (ctx) => buildCampusShuttle({ ...ctx, visualCell: ctx.root.userData.vis2RackCell || null })],
  ]
  for (const [name, factory] of modules) registry.register(name, factory)
  registry.buildAll({ canvasTex, quality: { tier: 'high' } })
  return registry
}

test('integrated path replaces old rack/rail/shuttle objects but keeps support, labels and cell visuals', () => {
  const registry = buildRegistry()
  const { names } = collect(registry.root)
  assert.equal(names.includes('campus-racks-static'), false, '旧 racks-static 必须不存在')
  assert.equal(names.includes('campus-shuttle-static'), false, '旧轨道必须不存在')
  assert.equal(names.includes('campus-shuttle-vehicle'), false, '旧车体必须不存在')
  assert.equal(names.includes('campus-rack-labels'), true, '标签必须保留')
  assert.equal(names.includes('vis2-shuttle'), true, '新穿梭机必须存在')
  assert.equal(names.includes('vis2-rack-film'), true, '动态缠绕膜必须保持独立')
  const ids = allSourceIds(registry.root)
  assert.equal(ids.has('campus-racks-support'), true, '旧模块的工位/月台门/标签支撑几何必须保留')
  assert.equal(ids.has('campus-racks-static'), false)
  const oldBlue = batchVertexColorCount(registry.root, 0x2d608b)
  const newBlue = batchVertexColorCount(registry.root, 0x2f6fa8)
  assert.equal(oldBlue, 0, '合并后不允许旧货架蓝立柱')
  assert.ok(newBlue > 0, '合并后应有新货架蓝立柱')
  assert.equal(registry.summary().skipped.length, 0)
  registry.dispose()
})

test('fallback path keeps the legacy visuals and adds no VIS2 objects when the private cell fails', () => {
  const registry = buildRegistry({ failVis2: true })
  const { names } = collect(registry.root)
  const ids = allSourceIds(registry.root)
  assert.equal(registry.summary().skipped.length, 1)
  assert.equal(ids.has('campus-racks-static'), true, '失败回退必须保留旧货架（合并后以其 sourceIds 证明）')
  assert.equal(ids.has('campus-racks-support'), false, '失败时不应出现替换适配器的支撑几何标记')
  assert.equal(names.includes('campus-shuttle-vehicle'), true, '失败回退必须保留旧车体')
  assert.equal(names.includes('campus-shuttle'), true, '失败回退必须保留旧穿梭机动态组')
  assert.equal(names.includes('vis2-shuttle'), false, '失败时不得出现半成品新构件')
  assert.ok(batchVertexColorCount(registry.root, 0x2d608b) > 0)
  assert.equal(batchVertexColorCount(registry.root, 0x2f6fa8), 0, '失败时不得出现新货架立柱')
  registry.dispose()
})

test('static batch merging preserves dynamic objects and ownership; dispose is idempotent', () => {
  const registry = buildRegistry()
  const film = registry.root.getObjectByName('vis2-rack-film')
  const shuttle = registry.root.getObjectByName('vis2-shuttle')
  assert.ok(film && film.material.opacity === 0.28 && film.userData.dynamic === true)
  assert.ok(shuttle && shuttle.userData.dynamic === true)
  assert.equal(registry.root.getObjectByName('vis2-rack-frames'), undefined, '静态实例被合并')
  const sceneRoot = registry.root.parent
  assert.ok(sceneRoot, 'registry root 已挂到场景')
  registry.dispose(); registry.dispose()
  assert.equal(registry.root.parent, null)
  assert.equal(sceneRoot.children.length, 0)
})

test('shuttle world coordinate, rail contact, lift and dynamic state semantics', () => {
  const root = new THREE.Group()
  const cell = buildVis2RackCell({ THREE, root, layout, quality: { tier: 'high' }, baseY: 1.25 })
  assert.equal(cell.group.position.y, 1.25, 'baseY 只平移 group')
  const summary = cell.summary()
  assert.equal(summary.baseY, 1.25)
  assert.equal(summary.vertical.wheelBottom, 0.105, '轮底相对地坪 = 轨顶')
  const chassis = cell.group.getObjectByName('vis2-shuttle-chassis')
  const platform = cell.group.getObjectByName('vis2-shuttle-platform')
  const load = cell.group.getObjectByName('vis2-shuttle-load')
  const chassisBox = new THREE.Box3().setFromObject(chassis)
  assert.ok(Math.abs(chassisBox.min.y - (1.25 + 0.105)) < 1e-3, '车轮压轨（含 baseY）')
  assert.equal(cell.setShuttle({ z: -1, lift: 0.1, carrying: false, occupied: [false, true, false], status: 'pickup' }), true)
  assert.equal(cell.group.getObjectByName('vis2-shuttle').position.z, -1, '世界 z 不再换算序号')
  assert.equal(cell.group.getObjectByName('vis2-shuttle-chassis').position.y, 0, 'lift 不动车体')
  assert.ok(Math.abs(platform.parent.position.y - 0.1) < 1e-6, 'lift 只动承托板组')
  assert.equal(load.visible, false, 'carrying=false 隐藏货物')
  const state = cell.summary().state
  assert.equal(state.z, -1); assert.equal(state.lift, 0.1); assert.equal(state.status, 'pickup')
  assert.deepEqual(state.occupied, [false, true, false])
  assert.equal(cell.setShuttle({ z: 1e9 }), true)
  assert.equal(cell.summary().state.z, summary.vertical ? cell.summary().state.z : 0) // 夹在路径内，不抛错
  assert.ok(cell.summary().state.z <= 4.86)
  assert.equal(cell.setShuttle({ z: Number.NaN, lift: Number.POSITIVE_INFINITY }), false, '非法值整项忽略')
  cell.dispose(); cell.dispose()
  assert.equal(root.children.length, 0)
})

test('visual flags loader is fail-closed for missing/malformed/failed fetches and ignores unknown fields', async () => {
  const hadWindow = Object.hasOwn(globalThis, 'window'), previous = globalThis.window
  globalThis.window = {}
  try {
    const cases = [
      [async () => ({ ok: true, json: async () => ({ officeV2: true, campus: true, attacker: true }) }), { officeV2: true, campus: true }],
      [async () => ({ ok: true, json: async () => ({ officeV2: 'true', campus: 1 }) }), { officeV2: false, campus: false }],
      [async () => ({ ok: false, json: async () => ({ officeV2: true, campus: true }) }), { officeV2: false, campus: false }],
      [async () => { throw new Error('fixture offline') }, { officeV2: false, campus: false }],
      [async () => ({ ok: true, json: async () => ({}) }), { officeV2: false, campus: false }],
    ]
    for (const [fetcher, expected] of cases) assert.deepEqual({ ...(await loadVisualFlags(fetcher)) }, expected)
    assert.deepEqual({ ...VISUAL_FLAGS_OFF }, { officeV2: false, campus: false })
    delete globalThis.window
    assert.deepEqual({ ...(await loadVisualFlags(async () => ({ ok: true }))) }, { officeV2: false, campus: false }, '非浏览器环境关闭')
  } finally {
    if (hadWindow) globalThis.window = previous
    delete globalThis.window
  }
})
