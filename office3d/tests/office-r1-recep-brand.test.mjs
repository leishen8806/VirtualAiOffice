import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Lounge, r1ReceptionCenter } from '../office-vis2/r1-lounge.js'
import { createR1Layout, R1_BOARD_FACING_OVERRIDES, R1_BOARD_OVERRIDES, R1_BOARD_TRUNK_OVERRIDES, R1_GATE, r1ToWorld } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { buildR1Brand, drawR1BrandSlogan, r1BrandSpec, R1_BRAND_SLOGAN, R1_BRAND_LOGO_URL, R1_BRAND_LOGO_ASPECT } from '../office-vis2/r1-brand.js'
import { officeV3ModulesFor } from '../office-v3-modules.js'

const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)
const CM = .01, MM = .001
// 翻转后的接待台：圆心 (28, 6.3)，角度 [210, 330]，凸面（外半径）朝入口。
const DESK = { center: [28, 6.3], angles: [210, 330], inner: 1.8, outer: 2.7 }
const RECEP_OVERRIDES = {
  '11-CH-001': { xM: 28, yM: 4.9 },
  '11-CH-001-BASE': { xM: 28, yM: 4.9 },
  '11-CH-001-SEAT': { xM: 28, yM: 4.9 },
  '11-CH-001-BACK': { xM: 28, yM: 5.122 },
}
const rawOf = id => R1_DATA.elements.find(row => row.id === id)
const distinct = hits => hits.filter((hit, i) => i === 0 || Math.abs(hit.distance - hits[i - 1].distance) > 1e-6)
const deskMesh = () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const module = buildR1Lounge({ THREE, root, layout, collision })
  return { module, collision, layout, mesh: module.root.children[0] }
}
// 只取 11-CT-001 的顶点，避开同一合批里的 12-SF-00x 沙发。
const deskBox = ({ module, mesh }) => {
  const item = module.items.find(entry => entry.id === '11-CT-001'), pos = mesh.geometry.attributes.position
  const box = new THREE.Box3(), p = new THREE.Vector3()
  mesh.updateWorldMatrix(true, false)
  for (let i = item.startVertex; i < item.startVertex + item.count; i++) box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
  return { box, item }
}
// 只把 11-CT-001 的三角形单独拿出来做射线测试，沙发不参与。
const deskOnlyMesh = ({ module, mesh }) => {
  const item = module.items.find(entry => entry.id === '11-CT-001'), pos = mesh.geometry.attributes.position
  const geometry = new THREE.BufferGeometry(), slice = new Float32Array(item.count * 3)
  for (let i = 0; i < item.count; i++) for (let a = 0; a < 3; a++) slice[i * 3 + a] = pos.array[(item.startVertex + i) * 3 + a]
  geometry.setAttribute('position', new THREE.BufferAttribute(slice, 3))
  const only = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  only.applyMatrix4(mesh.matrixWorld); only.updateMatrixWorld(true)
  return only
}

test('RC-1 flipped reception desk keeps the registered footprint and turns its convex face to the entrance', () => {
  const built = deskMesh()
  assert.deepEqual([...r1ReceptionCenter], DESK.center)
  const { box, item } = deskBox(built), row = built.layout.r1.elements.find(r => r.id === '11-CT-001')
  assert.deepEqual([...item.angles], DESK.angles)
  near(box.min.x, row.xM - 26 - row.lengthM / 2, CM); near(box.max.x, row.xM - 26 + row.lengthM / 2, CM)
  near(box.min.z, 18 - row.yM - row.widthM / 2, CM); near(box.max.z, 18 - row.yM + row.widthM / 2, CM)
  near(box.min.y, 0, CM); near(box.max.y, row.heightM, CM)

  // 登记 +Y 对应世界 −z，所以「从入口沿 +Y 打」= 世界 −z 方向。
  const only = deskOnlyMesh(built), world = r1ToWorld(...DESK.center)
  for (const xM of [26.5, 28, 29.5]) {
    const x = xM - 26, ray = new THREE.Raycaster(new THREE.Vector3(x, .5, world.z + 4), new THREE.Vector3(0, 0, -1))
    // 正中线上射线正好穿过相邻三角形的公共边，会返回重合的重复命中，按距离去重后再看先后顺序。
    const hits = distinct(ray.intersectObject(only))
    assert.ok(hits.length >= 2, `X ${xM} 应先后打到外半径面和内半径面，实得 ${hits.length}`)
    near(Math.hypot(hits[0].point.x - world.x, hits[0].point.z - world.z), DESK.outer, CM)
    near(Math.hypot(hits[1].point.x - world.x, hits[1].point.z - world.z), DESK.inner, CM)
  }
  // 从接待椅沿登记 −Y（世界 +z）打，先打到内半径面。
  const chair = built.layout.r1.elements.find(r => r.id === '11-CH-001'), seat = r1ToWorld(chair.xM, chair.yM)
  const back = distinct(new THREE.Raycaster(new THREE.Vector3(seat.x, .5, seat.z), new THREE.Vector3(0, 0, 1)).intersectObject(only))
  assert.ok(back.length >= 1, '接待椅朝向入口的方向上应先遇到台子内半径面')
  near(Math.hypot(back[0].point.x - world.x, back[0].point.z - world.z), DESK.inner, CM)
  built.module.dispose()
})

test('RC-1 the receptionist sits in the concave bay 0.4 m clear of the inner arc and the queue stays in front of the convex face', () => {
  const layout = createOfficeR1Layout(), chair = layout.r1.elements.find(r => r.id === '11-CH-001')
  near(r1ReceptionCenter[1] - chair.yM, 1.4, .02)
  near(DESK.inner - (r1ReceptionCenter[1] - chair.yM), .4, .02)
  // 椅子整框都必须留在内半径里面，否则与台子相交（停止条件）。
  for (const id of Object.keys(RECEP_OVERRIDES)) {
    const row = layout.r1.elements.find(r => r.id === id)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const r = Math.hypot(row.xM + sx * row.lengthM / 2 - DESK.center[0], row.yM + sy * row.widthM / 2 - DESK.center[1])
      assert.ok(r < DESK.inner, `${id} 角点半径 ${r.toFixed(4)} 应小于内半径 ${DESK.inner}`)
    }
  }
  const queue = layout.r1.controls.queue
  assert.ok(queue.cy + queue.width / 2 < r1ReceptionCenter[1] - DESK.outer, '排队区后沿必须在台子凸面最前点之前')
  near(r1ReceptionCenter[1] - DESK.outer - (queue.cy + queue.width / 2), .7, .001)
})

test('RC-2 the board table adds exactly the four approved reception-chair rows and leaves I6C and data.js alone', () => {
  const ids = R1_BOARD_OVERRIDES.map(entry => entry.id)
  assert.equal(new Set(ids).size, ids.length)
  // 24 条 I6C + 4 条接待椅 + 12 条 OFFICE-R1-AMBIENCE 补充 R2 的预留座位推椅（数值由 AM-7c 锁）。
  assert.equal(ids.length, 40)
  const byId = new Map(R1_BOARD_OVERRIDES.map(entry => [entry.id, entry]))
  for (const [id, want] of Object.entries(RECEP_OVERRIDES)) {
    const entry = byId.get(id)
    assert.ok(entry, id)
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.from) && Object.isFrozen(entry.to), id)
    // 原值必须与登记数据逐值相符，否则登记漂移了而偏离表没跟上。
    const raw = rawOf(id)
    for (const key of Object.keys(entry.from)) assert.deepEqual(entry.from[key], raw[key], `${id}.${key}`)
    near(entry.to.xM, want.xM, MM); near(entry.to.yM, want.yM, MM)
    // 只平移：朝向与角度不进偏离表。
    assert.deepEqual(Object.keys(entry.to).sort(), ['xM', 'yM'], id)
    near(entry.to.yM, raw.yM - .9, MM)
    assert.equal(entry.date, '2026-10-28', id)
    assert.ok(/前台|翻转/.test(entry.reason), id)
  }
  // I6C 的 24 条一条不改（补充 R2 的 12 条预留座位推椅由 AM-7c 锁，不归 RC-2 管）。
  const RESERVED_SET = ['08-CH-011', '08-CH-012', '08-CH-013'].flatMap(id => [id, `${id}-BACK`, `${id}-BASE`, `${id}-SEAT`])
  assert.equal(ids.filter(id => !(id in RECEP_OVERRIDES) && !RESERVED_SET.includes(id)).length, 24)
  // 关掉 C-01 候选后，登记段里与裸登记值有差异的行只能是偏离表这 40 条、长椅转向表、BACKWALL 补充 R2
  // 抬高的大门 2 片门扇，加上 OFFICE-R1-TRUNK 的 35 条室内绿植树干；别的一行都不许动。
  const applied = createR1Layout({ candidateC01: false }).elements
  const registered = applied.slice(0, R1_DATA.elements.length)
  const trunkIds = R1_BOARD_TRUNK_OVERRIDES.map(entry => entry.id)
  assert.equal(trunkIds.length, 35)
  assert.equal(ids.filter(id => trunkIds.includes(id)).length, 0)
  assert.deepEqual(registered.filter((row, i) => row !== R1_DATA.elements[i]).map(row => row.id).sort(), [...ids, ...R1_BOARD_FACING_OVERRIDES.map(entry => entry.id), ...R1_GATE.leafIds, ...trunkIds].sort())
  for (const id of Object.keys(RECEP_OVERRIDES)) {
    assert.equal(applied.find(row => row.id === id).yawDeg, rawOf(id).yawDeg, `${id} 朝向不变`)
    assert.deepEqual(applied.find(row => row.id === id).facingLocal, rawOf(id).facingLocal, `${id} facing 不变`)
  }
})

test('RC-3 the collision proxy flips with the desk so the entrance walk is clear and the bay needs a side approach', () => {
  const built = deskMesh(), { collision } = built
  const at = (xM, yM) => collision.hit(xM - 26, 18 - yM)
  // 代理随台子翻转：凸面与内凹之间的台体实处被占用。
  assert.equal(at(28, 4.0)?.kind, '11-CT-001')
  assert.equal(at(28, 5.0), null, '凹面里（接待员位置）不应被台体占用')
  assert.equal(at(28, 3.0), null, '台子凸面之前（排队区一侧）应通行')
  // 从入口直走到排队区中心不被台子挡住。
  for (let yM = 0; yM <= 2.9; yM += .1) assert.equal(at(28, Number(yM.toFixed(2))), null, `入口动线 Y ${yM.toFixed(2)} 不应被台子挡住`)
  // 从排队区直冲凹面会被台体挡住，必须绕两侧通道。
  const blocked = []
  for (let yM = 2.9; yM <= 5.4; yM += .05) if (at(28, Number(yM.toFixed(2)))) blocked.push(Number(yM.toFixed(2)))
  assert.ok(blocked.length > 0, '直冲凹面必须被台体挡住')
  for (const xM of [25.4, 30.6]) for (let yM = 2.9; yM <= 6.3; yM += .1) assert.equal(at(xM, Number(yM.toFixed(2))), null, `两侧通道 X ${xM} Y ${yM.toFixed(2)} 应通行`)
  built.module.dispose()
})

const brand = (extra = {}) => {
  const layout = createOfficeR1Layout(), root = new THREE.Group()
  const module = buildR1Brand({ THREE, root, layout, canvasTex: fakeCanvasTex, ...extra })
  return { module, root, layout }
}
const fakeCanvasTex = (w, h, draw) => { draw(recordingContext(), w, h); const t = new THREE.Texture(); t.userData.size = [w, h]; return t }
const recordingContext = () => ({
  texts: [], set fillStyle(v) {}, set font(v) {}, set letterSpacing(v) {}, set textAlign(v) {}, set textBaseline(v) {},
  fillRect() {}, clearRect() {}, measureText: () => ({ width: 100 }), fillText(text) { this.texts.push(text) },
  createRadialGradient: () => ({ stops: [], addColorStop() {} }),
})

test('RC-7 the brand backdrop covers the whole 00-W-036 entrance face and the three spotlights sit where the card says', () => {
  const { module, root, layout } = brand()
  const wall = layout.r1.elements.find(row => row.id === '00-W-036')
  const p = r1ToWorld(wall.xM, wall.yM), face = p.z + wall.widthM / 2
  near(face, 9.1, MM)
  const panel = module.root.getObjectByName('r1-brand-panel')
  panel.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(panel)
  // 四条边与墙朝入口一面对齐（误差 ≤ 1 cm）；黑底 5.0 × 3.0 铺满。
  near(box.min.x, p.x - wall.lengthM / 2, CM); near(box.max.x, p.x + wall.lengthM / 2, CM)
  near(box.min.y, 0, CM); near(box.max.y, wall.heightM, CM)
  near(r1BrandSpec.panel.width, 5, MM); near(r1BrandSpec.panel.height, 3, MM)
  assert.equal(r1BrandSpec.panel.color, '#1E1B19')
  near(r1BrandSpec.panel.roughness, .5, MM); near(r1BrandSpec.panel.metalness, .15, MM)
  assert.equal(r1BrandSpec.trim.color, '#B8955A')
  near(r1BrandSpec.trim.height, .05, MM); near(r1BrandSpec.trim.depth, .05, MM)
  // 品牌件都在墙面前 0.005–0.06 m。
  const parts = ['r1-brand-panel', 'r1-brand-logo', 'r1-brand-slogan'].map(name => module.root.getObjectByName(name))
  for (const part of parts) {
    const front = new THREE.Box3().setFromObject(part).max.z
    assert.ok(front > face + .005 - 1e-9 && front < face + .06 + 1e-9, `${part.name} 前沿 ${front} 应在墙面前 0.005–0.06 m`)
  }
  const lights = module.lights
  assert.equal(lights.length, 3)
  lights.forEach((light, i) => {
    assert.ok(light.isSpotLight)
    assert.equal(light.castShadow, false)
    near(light.position.x, p.x + r1BrandSpec.lights.offsets[i], CM)
    near(light.position.y, 3.3, CM)
    near(light.position.z, face + 1.3, CM)
    near(light.target.position.x, p.x + r1BrandSpec.lights.offsets[i], CM)
    near(light.target.position.y, 1.9, CM)
    near(light.target.position.z, face, CM)
    near(light.distance, 6, MM); near(light.angle, .45, MM); near(light.penumbra, .75, MM); near(light.decay, 1.5, MM)
    near(light.intensity, 10, MM)
  })
  // 不做可见灯具、光锥、墙面光斑：高档下除这 3 个网格外没有别的几何（标志贴图未加载时自身隐藏）。
  // CMP-624 的氛围五项挂在同一模块里，统一用 r1-ambience- 前缀，和入口面的品牌件分开计数。
  const meshes = []
  module.root.traverse(node => { if (node.isMesh && !node.name.startsWith('r1-ambience-')) meshes.push(node.name) })
  assert.deepEqual(meshes.sort(), ['r1-brand-logo', 'r1-brand-panel', 'r1-brand-slogan'])
  module.dispose(); assert.equal(root.children.length, 0)
})

test('RC-8 the slogan is one English line and no Chinese tagline survives anywhere in the module', async () => {
  const context = recordingContext()
  drawR1BrandSlogan(context, ...r1BrandSpec.slogan.canvas)
  assert.deepEqual(context.texts, ['INFINITE POSSIBILITIES'])
  assert.equal(R1_BRAND_SLOGAN, 'INFINITE POSSIBILITIES')
  const source = await (await import('node:fs/promises')).readFile(new URL('../office-vis2/r1-brand.js', import.meta.url), 'utf8')
  for (const banned of ['生活', '无限可能']) assert.ok(!source.includes(banned), `模块源码不得出现「${banned}」`)
  // 标志贴图来自 assets/logo.png，几何比例 979 : 544（± 1%）。
  assert.ok(R1_BRAND_LOGO_URL.endsWith('/assets/logo.png'), R1_BRAND_LOGO_URL)
  assert.deepEqual([...R1_BRAND_LOGO_ASPECT], [979, 544])
  const { module } = brand(), logo = module.root.getObjectByName('r1-brand-logo')
  const box = new THREE.Box3().setFromObject(logo), ratio = (box.max.x - box.min.x) / (box.max.y - box.min.y)
  assert.ok(Math.abs(ratio / (979 / 544) - 1) <= .01, `标志比例 ${ratio} 应为 979:544`)
  near(box.max.x - box.min.x, 2.4, MM)
  near((box.max.y + box.min.y) / 2, 2.2, CM)
  const slogan = module.root.getObjectByName('r1-brand-slogan'), sbox = new THREE.Box3().setFromObject(slogan)
  near(sbox.max.x - sbox.min.x, 3.4, MM)
  near((sbox.max.y + sbox.min.y) / 2, 1.2, CM)
  module.dispose()
})

test('RC-10 the low tier drops the real spotlights for a glow texture and a missing logo degrades without throwing', () => {
  const low = brand({ quality: { tier: 'low' } })
  assert.equal(low.module.lights.length, 0, '低档不开实时聚光灯')
  // quality.js 只在高档保留 SpotLight，所以中档也必须走光晕贴图，不能留下没有灯的黑屏风。
  const medium = brand({ quality: { tier: 'medium' } })
  assert.equal(medium.module.lights.length, 0, '中档同样不开实时聚光灯')
  assert.ok(medium.module.root.getObjectByName('r1-brand-glow')?.isMesh, '中档应叠光晕贴图')
  medium.module.dispose()
  const glow = low.module.root.getObjectByName('r1-brand-glow')
  assert.ok(glow?.isMesh, '低档应叠一张光晕贴图')
  assert.equal(glow.material.blending, THREE.AdditiveBlending)
  // 两档合批：入口面高档 3 个网格，低档 4 个（CMP-624 的氛围件另算，前缀 r1-ambience-）。
  const count = root => { let n = 0; root.traverse(node => { if (node.isMesh && !node.name.startsWith('r1-ambience-')) n++ }); return n }
  assert.equal(count(low.module.root), 4)
  const high = brand()
  assert.equal(count(high.module.root), 3)
  // 两档三角数都要很小（≤ 200）。
  for (const built of [low, high]) {
    let triangles = 0
    built.module.root.traverse(node => { if (node.isMesh && !node.name.startsWith('r1-ambience-')) triangles += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3 })
    assert.ok(triangles <= 200, `三角数 ${triangles} 应 ≤ 200`)
  }
  // 标志贴图加载失败时不抛错，黑底、标语都还在，标志网格隐藏。
  const failing = brand({ textureLoader: { load(url, onLoad, onProgress, onError) { onError(new Error('404')); return new THREE.Texture() } } })
  assert.ok(failing.module.root.getObjectByName('r1-brand-panel'))
  assert.ok(failing.module.root.getObjectByName('r1-brand-slogan'))
  assert.equal(failing.module.root.getObjectByName('r1-brand-logo').visible, false)
  for (const built of [low, high, failing]) built.module.dispose()
})

test('RC-6 r1Brand is registered only for the R1 layout and marks its node dynamic', () => {
  const r1 = officeV3ModulesFor({ r1Phase: 'R1' }).map(([name]) => name)
  assert.ok(r1.includes('r1Brand'))
  assert.equal(r1[r1.length - 1], 'r1Brand', '新模块加在 R1 列表末尾')
  assert.ok(!officeV3ModulesFor({}).some(([name]) => name === 'r1Brand'))
  const { module } = brand()
  assert.equal(module.root.userData.dynamic, true)
  module.dispose()
  // 非 R1 布局什么都不建。
  const root = new THREE.Group()
  buildR1Brand({ THREE, root, layout: { plan1Phase: 'L2B' }, canvasTex: fakeCanvasTex }).dispose()
  assert.equal(root.children.length, 0)
})

// MOVE R5 changes one coordinate in the existing four-entry bench table; no new data rows.
test('MOVE R5 bench override count and exact positional exception remain frozen', () => {
  assert.equal(R1_BOARD_FACING_OVERRIDES.length, 4)
  assert.deepEqual(R1_BOARD_FACING_OVERRIDES.filter(e => 'xM' in e.to).map(e => [e.id, e.from.xM, e.to.xM]), [['14-BN-003', 49, 48.5]])
})
