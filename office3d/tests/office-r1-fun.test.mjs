import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Shell } from '../office-vis2/r1-shell.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { LAYOUT_V2, workHome } from '../office-layout.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { placeFurniture } = await import('../assets3d.js')
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
// fun.js 也用裸 'three'，必须在注销 hooks 之前导入
const { createFun, R1_FESTIVE } = await import('../fun.js')
hooks.deregister()

// 后五项是 I3B（PR #69）之后 R1 工位要摆的程序化键鼠与三选一桌面小物；只补素材表，不放宽断言。
const MODELS = ['desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded',
  'computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1']
const loader = new GLTFLoader(), furn = {}
for (const name of MODELS) {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  furn[name] = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const A = { furn }

const stubContext = () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {} })
const withDom = callback => {
  const old = globalThis.document
  const body = { appendChild() {} }
  globalThis.document = { body, createElement: () => ({ width: 0, height: 0, className: '', textContent: '', style: {}, getContext: () => stubContext() }) }
  try { return callback() } finally { globalThis.document = old }
}
const makeScreenTexture = () => ({ ctx: { canvas: { width: 256, height: 144 }, drawImage() {} }, tex: { needsUpdate: false, dispose() {} } })

const view = (id, name, home) => {
  const group = new THREE.Group()
  group.position.set(home.x, 0, home.z)
  return { id, name, home, mode: 'idle', away: false, act: null, lounging: false, waits: [], char: { group, pose: { sit: 0 } } }
}
const r1Fun = () => {
  const layout = createOfficeR1Layout(), scene = new THREE.Scene(), root = new THREE.Group(), collision = createFurnitureCollision()
  scene.add(root)
  const shell = buildR1Shell({ THREE, root, layout, collision })
  const furniture = buildR1Furniture({ THREE, root, layout, collision, A, placeFurniture, makeScreenTexture })
  scene.updateMatrixWorld(true)
  // 真实页面里 views 的 home 是 workHome(seat) —— 椅位（带 yaw），不是桌子中心；夹具必须一样
  const views = new Map()
  for (const [id, seat] of Object.entries(layout.seats)) views.set(id, view(id, id, workHome(seat)))
  const fun = createFun({ scene, views, boardViews: {}, LOUNGE: [], furnitureCollision: collision, layout })
  return { layout, scene, views, fun, collision, furniture, dispose() { furniture.dispose(); shell.dispose() } }
}
// fun 根下的子组：猫（userData.isCat）、奖杯（带 TorusGeometry 把手）、装饰，取剩下那个就是装饰组
const decoGroup = scene => scene.getObjectByName('fun').children.find(child => child.type === 'Group' && !child.userData.isCat && !child.children.some(mesh => mesh.geometry?.type === 'TorusGeometry'))
const decoBounds = scene => {
  scene.updateMatrixWorld(true)
  const deco = [], box = new THREE.Box3(), group = decoGroup(scene)
  group?.traverse(mesh => { if (mesh.isMesh) { deco.push(mesh); box.union(new THREE.Box3().setFromObject(mesh)) } })
  return { deco, box }
}

test('I6B-3 R1 下猫关闭：接口与 emptyFun 一致，场景里没有猫', () => withDom(() => {
  const { scene, fun, dispose } = r1Fun()
  assert.equal(fun.catInfo(), '关闭')
  assert.deepEqual(fun.catDiag(), [])
  assert.equal(fun.catPlaying(), false)
  assert.equal(fun.catToggle(true), false)
  assert.equal(fun.catPlaying(), false)
  assert.equal(fun.catReact(), null)
  assert.equal(fun.catAim({ x: 0, z: 0 }), false)
  assert.equal(fun.pick(new THREE.Raycaster()), false)
  fun.catDiagClear(); fun.debugCatPlan('lounge')
  let cats = 0
  scene.traverse(object => { if (object.userData?.isCat) cats++ })
  assert.equal(cats, 0, 'R1 场景里不应有猫')
  dispose()
}))

test('I6B-3 R1 节日装饰用 R1 挂点：最低 2.4 m、不高过 2.7 m 隔墙顶、不横穿房间', () => withDom(() => {
  const { layout, scene, fun, dispose } = r1Fun()
  fun.preview('festive', '测试节日')
  const { deco, box } = decoBounds(scene)
  assert.ok(deco.length > 0, '预览 festive 应生成装饰')
  assert.ok(box.min.y >= R1_FESTIVE.minY - 1e-9, `最低点 ${box.min.y} 应 >= ${R1_FESTIVE.minY}`)
  assert.ok(box.max.y <= R1_FESTIVE.maxY + 1e-9, `最高点 ${box.max.y} 应 <= ${R1_FESTIVE.maxY}`)
  // 每段彩旗与横幅都落在一个开敞区框内，单段跨度不超过建筑宽度的四成
  const width = layout.envelope.x1 - layout.envelope.x0
  for (const anchor of R1_FESTIVE.buntings) {
    const region = layout.regions.find(item => item.id === anchor.regionId)
    assert.ok(anchor.x0 >= region.x0 && anchor.x1 <= region.x1, `彩旗 ${anchor.regionId} 超出区框`)
    assert.ok(anchor.z >= region.z0 && anchor.z <= region.z1, `彩旗 ${anchor.regionId} z 超出区框`)
    assert.ok(anchor.x1 - anchor.x0 <= width * .4, `彩旗 ${anchor.regionId} 横穿房间`)
  }
  assert.ok(box.min.x >= layout.envelope.x0 && box.max.x <= layout.envelope.x1, '装饰应在建筑轮廓内')
  assert.ok(box.min.z >= layout.envelope.z0 && box.max.z <= layout.envelope.z1, '装饰应在建筑轮廓内')
  // 恢复真实日期后装饰清空
  fun.preview(null)
  assert.equal(decoBounds(scene).deco.length, 0)
  dispose()
}))

test('I6B-3 R1 本周之星奖杯落在获奖同事的 R1 桌面上，不穿显示器', () => withDom(() => {
  const { layout, scene, fun, furniture, dispose } = r1Fun()
  fun.setAwards([{ agentId: 'FrontendSenior', title: '本周之星' }])
  scene.updateMatrixWorld(true)
  const trophy = scene.getObjectByName('fun').children.find(child => child.type === 'Group' && child.children.some(mesh => mesh.geometry?.type === 'TorusGeometry'))
  assert.ok(trophy, '应生成奖杯')
  const box = new THREE.Box3().setFromObject(trophy)
  // 桌面高度 .75：底面与桌面差 <= 5 mm
  assert.ok(Math.abs(box.min.y - .75) <= .005, `奖杯底面 ${box.min.y} 应贴 R1 桌面 .75`)
  // 落在该同事桌子的平面范围内
  const seat = layout.seats.FrontendSenior, desk = layout.r1.elements.find(row => row.id === layout.r1.workstations.find(s => s.business_id === 'FrontendSenior').desk_id)
  const yaw = seat[4].yaw, cos = Math.abs(Math.cos(yaw)), sin = Math.abs(Math.sin(yaw))
  const halfX = (desk.lengthM * cos + desk.widthM * sin) / 2, halfZ = (desk.lengthM * sin + desk.widthM * cos) / 2
  assert.ok(box.min.x >= seat[1] - halfX && box.max.x <= seat[1] + halfX, `奖杯 x ${box.min.x}..${box.max.x} 超出桌面`)
  assert.ok(box.min.z >= seat[2] - halfZ && box.max.z <= seat[2] + halfZ, `奖杯 z ${box.min.z}..${box.max.z} 超出桌面`)
  // 不穿显示器：与该工位登记显示器的实际放置包围盒不相交
  const station = layout.r1.workstations.find(s => s.business_id === 'FrontendSenior')
  const screenId = layout.r1.elements.find(row => row.category === '显示器' && row.parentId === station.desk_id).id
  const screenBox = furniture.itemBounds.get(screenId)
  assert.ok(screenBox, `应找到显示器 ${screenId} 的放置包围盒`)
  assert.equal(box.intersectsBox(screenBox), false, `奖杯与显示器相交：奖杯 y ${box.min.y}..${box.max.y} x ${box.min.x}..${box.max.x}`)
  fun.setAwards([])
  assert.equal(scene.getObjectByName('fun').children.filter(child => child.type === 'Group' && child.children.some(mesh => mesh.geometry?.type === 'TorusGeometry')).length, 0)
  dispose()
}))

test('I6B-3 R1 下彩纸由真实事件触发，在该同事处喷发', () => withDom(() => {
  const { scene, views, fun, dispose } = r1Fun()
  const confetti = scene.getObjectByName('fun').children.find(child => child.isInstancedMesh)
  assert.ok(confetti, '应有彩纸批次')
  assert.equal(confetti.count, 0)
  const target = views.get('FrontendSenior')
  fun.celebrate(target)
  fun.update(1 / 60, 1, { night: 0, offDuty: false, raining: false }, () => {})
  assert.ok(confetti.count > 0, '彩纸应喷出来')
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3()
  confetti.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix)
  assert.ok(Math.hypot(position.x - target.home.x, position.z - target.home.z) < 1.5, '彩纸应在该同事位置附近')
  dispose()
}))

// 启动时 mergeStatic 会删掉场景里所有空分组（merge.js「删掉合并后变空的分组」），装饰分组平时是空的，
// 所以会被一起摘掉；R1 下必须能自己接回来，否则节日装饰在真实页面上一个都不渲染。
test('I6B-3 R1 装饰分组被 mergeStatic 摘掉后仍能挂上装饰', () => withDom(() => {
  const { scene, fun, dispose } = r1Fun()
  const funRoot = scene.getObjectByName('fun')
  const empties = []
  scene.traverse(object => { if (object.type === 'Group' && object.children.length === 0) empties.push(object) })
  assert.ok(empties.length > 0, '应存在空分组（装饰组），否则本测试没有意义')
  for (const group of empties) group.removeFromParent()
  assert.equal(decoGroup(scene), undefined, '装饰组此时已被摘掉')
  fun.preview('festive', '测试节日')
  const { deco, box } = decoBounds(scene)
  assert.ok(deco.length > 0, '装饰组应被接回来并挂上装饰')
  assert.ok(box.min.y >= R1_FESTIVE.minY - 1e-9, `最低点 ${box.min.y}`)
  assert.ok(box.max.y <= R1_FESTIVE.maxY + 1e-9, `最高点 ${box.max.y}`)
  assert.ok(funRoot.children.includes(decoGroup(scene)), '装饰组必须重新挂在 fun 根下')
  dispose()
}))

test('I6B-4 隔离：旧版（布局 2）节日挂点与猫逐值不变，空装饰组不自愈', () => withDom(() => {
  const scene = new THREE.Scene(), collision = createFurnitureCollision()
  const views = new Map([['A', view('A', 'A', { x: 2, z: 2 })]])
  const fun = createFun({ scene, views, boardViews: {}, LOUNGE: [], furnitureCollision: collision, layout: LAYOUT_V2 })
  // 旧版：猫在场景里，接口不是「关闭」
  let cats = 0
  scene.traverse(object => { if (object.userData?.isCat) cats++ })
  assert.ok(cats > 0, '旧版应有猫')
  assert.notEqual(fun.catInfo(), '关闭')
  // 旧版彩旗仍挂在 3.25 m、z = -6 / 0.5 / 7；灯笼 z = -12.4、y = 3.0；横幅 (0.5, 3.7, -12.6)
  fun.preview('festive', '测试节日')
  scene.updateMatrixWorld(true)
  const cones = [], spheres = [], planes = []
  decoGroup(scene).traverse(mesh => {
    if (!mesh.isMesh) return
    if (mesh.geometry.type === 'ConeGeometry') cones.push(mesh)
    if (mesh.geometry.type === 'SphereGeometry' && mesh.material.emissiveIntensity === .9) spheres.push(mesh)
    if (mesh.geometry.type === 'PlaneGeometry' && mesh.geometry.parameters.width === 6.4) planes.push(mesh)
  })
  assert.equal(cones.length, 34 * 3)
  assert.deepEqual([...new Set(cones.map(mesh => mesh.position.z))].sort((a, b) => a - b), [-6, .5, 7])
  assert.deepEqual([...new Set(cones.map(mesh => +mesh.position.x.toFixed(6)))].at(0), -20)
  assert.ok(cones.every(mesh => mesh.position.y <= 3.25 + 1e-9 && mesh.position.y >= 3.25 - .36))
  assert.equal(spheres.length, 12)
  assert.ok(spheres.every(mesh => mesh.position.y === 3 && mesh.position.z === -12.4))
  assert.equal(planes.length, 1)
  assert.deepEqual(planes[0].position.toArray(), [.5, 3.7, -12.6])
  // 旧版不加自愈：装饰组被摘掉之后仍然不会自己挂回来（与 main 逐值一致，遗留缺陷不在本卡范围内修）
  const group = decoGroup(scene)
  group.removeFromParent()
  fun.preview(null)
  fun.preview('festive', '测试节日')
  assert.equal(decoGroup(scene), undefined, '旧版行为必须与 main 一致：不自愈')
}))
