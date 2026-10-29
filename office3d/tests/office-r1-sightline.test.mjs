// OFFICE-R1-SIGHTLINE 规则 D：展示面正面前方不遮挡。
//
// 展示面清单与几何全部从登记行（R1_elements）和品牌规格推出来，不在本文件里写死坐标，所以登记数据
// 一改，净空区自动跟着走。「同宽」取的是**展示内容**的宽度，不是整块墙板的宽度：
//   · 前台屏风 00-W-036 朝入口一面 → 标志 2.4 m 与标语 3.4 m 取较宽的 3.4 m（都以 x = 2 居中）；
//   · 中庭形象墙（同一面墙朝中庭一侧）→ 铜环外沿 haloRadius 1.46 m，即宽 2.92 m；
//   · 书架 → 正面长度（08-BK-002 六米、08-BK-001 十点二米）；
//   · 会议室 02 大屏 → 外框 bezelWidth 4.42 m。
// 理由：董事会的两处截图挡住的都是展示内容本身；屏风两端（DENSE-11-10 / 11-6）在内容之外，本来就不挡。
//
// 规则 D 分两条断言：
//   SL-A 落地绿植：净空区 = 展示内容在地面的投影 × 法向 1.2 m 深，区内不得有补植 / 登记绿植 / 花槽 / 花境的包络。
//        形象墙自带的花池（r1-brand.js 的 r1AmbienceSpec.planter）不在 R1_LANDSCAPE 里，按卡面规则本来就除外。
//   SL-B 节日装饰：在「常用机位」下，装饰几何到展示面的投影不得与展示内容矩形相交。做法是真投影而不是近似：
//        对机位 C 与装饰包围盒的 8 个角点 P，若 P 落在 C 与面之间，就把射线 C→P 延长到面所在平面，
//        取落点的横向与竖向范围，与展示内容矩形做矩形相交判断。P 在机位之后（不可能遮挡）则跳过。
//        常用机位是人眼高 1.65 m 的站位（大门轴线与左右两条进门路线上）加一个略俯视的近景机位 3.6 m，
//        都写在 FACE_CAMERAS 里；选 3.6 m 而不是 3.2 m，是因为 3.2 m 恰好落在灯笼投影掠过标语下沿的临界高度上。
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { R1_LANDSCAPE } from '../office-vis2/r1-landscape-plan.js'
import { r1LookPlantElements } from '../office-vis2/r1-look.js'
import { r1BrandSpec, R1_BRAND_WALL_ID, R1_BRAND_LOGO_ASPECT, r1AmbienceSpec } from '../office-vis2/r1-brand.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
// fun.js 用裸 'three'，必须在注销 hooks 之前导入
const { createFun, R1_FESTIVE } = await import('../fun.js')
hooks.deregister()

const layout = createOfficeR1Layout()
const CLEAR_DEPTH = 1.2
const row = id => layout.r1.elements.find(item => item.id === id)
const world = item => ({ x: item.xM - 26, z: 18 - item.yM })

// 登记行的朝向：r1-furniture.js 用 yawFor = -yawDeg，模型正面是局部 +z，所以世界法向 = (-sin yaw, cos yaw)。
// 04-BK-001（yaw 0，贴 z = -25 外墙）与 08-BK-002（yaw 90，贴 x = 30 外墙）两例都对得上。
const frontNormal = item => {
  const yaw = Number(item.yawDeg || 0) * Math.PI / 180
  const nx = -Math.sin(yaw), nz = Math.cos(yaw)
  return Math.abs(nx) > Math.abs(nz) ? { axis: 'x', sign: Math.sign(nx), depth: item.widthM } : { axis: 'z', sign: Math.sign(nz), depth: item.widthM }
}

// 一个展示面：face = 正面所在的平面坐标，axis / sign = 法向，span = 展示内容的横向范围，y = 竖向范围
function shelfFace(id) {
  const item = row(id), at = world(item), normal = frontNormal(item)
  const center = normal.axis === 'x' ? at.x : at.z, lateral = normal.axis === 'x' ? 'z' : 'x'
  const mid = lateral === 'x' ? at.x : at.z
  return { id, axis: normal.axis, sign: normal.sign, face: center + normal.sign * normal.depth / 2, lateral, span: [mid - item.lengthM / 2, mid + item.lengthM / 2], y: [0, item.heightM] }
}

function brandFaces() {
  const wall = row(R1_BRAND_WALL_ID), at = world(wall)
  const logoHeight = r1BrandSpec.logo.width * R1_BRAND_LOGO_ASPECT[1] / R1_BRAND_LOGO_ASPECT[0]
  const sloganHeight = r1BrandSpec.slogan.width * r1BrandSpec.slogan.canvas[1] / r1BrandSpec.slogan.canvas[0]
  const artWidth = Math.max(r1BrandSpec.logo.width, r1BrandSpec.slogan.width)
  const entry = {
    id: `${R1_BRAND_WALL_ID}-entry`, axis: 'z', sign: 1, face: at.z + wall.widthM / 2, lateral: 'x',
    span: [at.x - artWidth / 2, at.x + artWidth / 2],
    y: [Math.min(r1BrandSpec.slogan.centerY - sloganHeight / 2, r1BrandSpec.logo.centerY - logoHeight / 2), r1BrandSpec.logo.centerY + logoHeight / 2],
  }
  const emblem = r1AmbienceSpec.emblem, emblemX = emblem.centerXM - 26
  const atrium = {
    id: `${R1_BRAND_WALL_ID}-atrium`, axis: 'z', sign: -1, face: at.z - wall.widthM / 2, lateral: 'x',
    span: [emblemX - emblem.haloRadius, emblemX + emblem.haloRadius],
    y: [Math.max(0, emblem.centerY - emblem.haloRadius), Math.min(wall.heightM, emblem.centerY + emblem.haloRadius)],
  }
  return [entry, atrium]
}

function meetingScreenFace() {
  const spec = r1AmbienceSpec.screen, wall = row(spec.wallId), at = world(wall), x = spec.centerXM - 26
  // 00-W-003 是南外墙，会议室 02 在它的 +z 一侧，所以大屏朝 +z
  return {
    id: '02-screen', axis: 'z', sign: 1, face: at.z + wall.widthM / 2, lateral: 'x',
    span: [x - spec.bezelWidth / 2, x + spec.bezelWidth / 2],
    y: [spec.centerY - spec.bezelHeight / 2, spec.centerY + spec.bezelHeight / 2],
  }
}

const FACES = [...brandFaces(), shelfFace('08-BK-002'), shelfFace('08-BK-001'), meetingScreenFace()]

// 落地绿植的包络：补植用圆盘，花槽 / 花境用矩形，登记绿植连同它的冠幅子件一起取最大半宽
function groundGreenery() {
  const rows = []
  for (const plant of R1_LANDSCAPE.plants) rows.push({ id: plant.id, x0: plant.x - plant.r, x1: plant.x + plant.r, z0: plant.z - plant.r, z1: plant.z + plant.r })
  for (const bed of [...R1_LANDSCAPE.troughs, ...R1_LANDSCAPE.gardens]) rows.push({ id: bed.id, x0: bed.x - bed.w / 2, x1: bed.x + bed.w / 2, z0: bed.z - bed.d / 2, z1: bed.z + bed.d / 2 })
  const registered = [...layout.r1.elements, ...r1LookPlantElements()]
  for (const item of registered.filter(e => e.category === '植物总成')) {
    const kin = registered.filter(e => e.id === item.id || e.parentId === item.id)
    const half = Math.max(...kin.map(e => Math.max(e.lengthM, e.widthM) / 2)), at = world(item)
    rows.push({ id: item.id, x0: at.x - half, x1: at.x + half, z0: at.z - half, z1: at.z + half })
  }
  return rows
}

const clearZone = face => {
  const near = face.face, far = face.face + face.sign * CLEAR_DEPTH
  const along = [Math.min(near, far), Math.max(near, far)]
  return face.axis === 'z' ? { x0: face.span[0], x1: face.span[1], z0: along[0], z1: along[1] } : { x0: along[0], x1: along[1], z0: face.span[0], z1: face.span[1] }
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1

test('SL-A 规则 D：每个展示面正面前方 1.2 m、同宽的净空区内没有落地绿植', () => {
  assert.equal(FACES.length, 5)
  const greenery = groundGreenery()
  assert.ok(greenery.length > 150, `应覆盖全部落地绿植，实际 ${greenery.length}`)
  for (const face of FACES) {
    const zone = clearZone(face)
    for (const item of greenery) assert.ok(!overlaps(zone, item), `${face.id} 净空区 x ${zone.x0.toFixed(2)}..${zone.x1.toFixed(2)} z ${zone.z0.toFixed(2)}..${zone.z1.toFixed(2)} 被 ${item.id} 占住（x ${item.x0.toFixed(2)}..${item.x1.toFixed(2)} z ${item.z0.toFixed(2)}..${item.z1.toFixed(2)}）`)
  }
})

// 常用机位：人眼高 1.65 m 的站位 + 一个略俯视的近景机位。前台三个站位分别在大门轴线 x = 2 与
// 两条进门路线 entry_left（x = -2.1）、entry_right（x = 6.1）上，z = 17 是刚进 7 m 大门（z = 18）之内。
const FACE_CAMERAS = {
  '00-W-036-entry': [['大门轴线', 2, 1.65, 17], ['大门左', -2.1, 1.65, 17], ['大门右', 6.1, 1.65, 17], ['形象墙近景', 2, 3.6, 16]],
  '00-W-036-atrium': [['中庭人眼', 2, 1.65, 2.5], ['中庭近景', 2, 3.6, 3.5]],
  '08-BK-002': [['书架人眼', 26.5, 1.65, 2.4], ['书架近景', 25.5, 3.6, 2.4]],
  '08-BK-001': [['书架人眼', 20, 1.65, -7.5], ['书架近景', 20, 3.6, -6.5]],
  '02-screen': [['会议人眼', -13.5, 1.65, -19], ['会议近景', -13.5, 3.6, -18]],
}

// 把装饰包围盒的角点沿机位射线投到展示面所在平面上，返回落点的横向 / 竖向范围。
// 只有落在「机位与展示面之间」这层板里的角点才可能遮挡：角点在面之后（dCorner <= 0）或在机位之后
// （dCorner >= dCamera）都跳过；全部角点都被跳过就返回 null。
// 盒子横跨机位平面时，剩下那部分的投影并不等于「在板内的角点」的凸包，这个算法会算少，所以单独记一个
// straddle 标志让调用方直接判失败，而不是悄悄放过——本场景的装饰没有一件横跨机位平面（见 SL-B 的断言）。
function projectToFace(face, camera, box) {
  const lateralOf = point => face.lateral === 'x' ? point.x : point.z
  const alongOf = point => face.axis === 'x' ? point.x : point.z
  const depth = point => (alongOf(point) - face.face) * face.sign
  const dCamera = depth(camera)
  if (dCamera <= 0) return null
  let lateral0 = Infinity, lateral1 = -Infinity, y0 = Infinity, y1 = -Infinity, hits = 0, behind = 0
  for (const sx of [box.min.x, box.max.x]) for (const sy of [box.min.y, box.max.y]) for (const sz of [box.min.z, box.max.z]) {
    const corner = new THREE.Vector3(sx, sy, sz), dCorner = depth(corner)
    if (dCorner >= dCamera) { behind++; continue }
    if (dCorner <= 0) continue
    const t = dCamera / (dCamera - dCorner)
    const hit = new THREE.Vector3().copy(camera).lerp(corner, t)
    lateral0 = Math.min(lateral0, lateralOf(hit)); lateral1 = Math.max(lateral1, lateralOf(hit))
    y0 = Math.min(y0, hit.y); y1 = Math.max(y1, hit.y); hits++
  }
  return hits ? { lateral0, lateral1, y0, y1, straddle: behind > 0 } : null
}

const r1Fun = () => {
  const scene = new THREE.Scene(), collision = createFurnitureCollision()
  const fun = createFun({ scene, views: new Map(), boardViews: {}, LOUNGE: [], furnitureCollision: collision, layout })
  return { scene, fun }
}
const stubContext = () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {} })
const withDom = callback => {
  const old = globalThis.document
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ width: 0, height: 0, className: '', textContent: '', style: {}, getContext: () => stubContext() }) }
  try { return callback() } finally { globalThis.document = old }
}
const decoMeshes = scene => {
  scene.updateMatrixWorld(true)
  const found = []
  const group = scene.getObjectByName('fun').children.find(child => child.type === 'Group' && !child.userData.isCat && !child.children.some(mesh => mesh.geometry?.type === 'TorusGeometry'))
  group?.traverse(mesh => { if (mesh.isMesh) found.push({ mesh, box: new THREE.Box3().setFromObject(mesh) }) })
  return found
}

test('SL-B 规则 D：节日装饰在常用机位下的投影不压标志、标语与书架正面', () => withDom(() => {
  const { scene, fun } = r1Fun()
  for (const style of ['festive', 'water', 'solemn', 'banner']) {
    fun.preview(style, '测试节日')
    const meshes = decoMeshes(scene)
    assert.ok(meshes.length > 0, `${style} 应生成装饰`)
    for (const face of FACES) for (const [name, cx, cy, cz] of FACE_CAMERAS[face.id]) {
      const camera = new THREE.Vector3(cx, cy, cz)
      for (const { mesh, box } of meshes) {
        const shadow = projectToFace(face, camera, box)
        if (!shadow) continue
        assert.equal(shadow.straddle, false, `${style} / ${face.id} / ${name} 机位：装饰 ${mesh.name || mesh.geometry.type} 横跨机位平面，本投影算法会算少，需要先把它挪开或换算法`)
        const hit = shadow.lateral0 < face.span[1] && face.span[0] < shadow.lateral1 && shadow.y0 < face.y[1] && face.y[0] < shadow.y1
        assert.ok(!hit, `${style} / ${face.id} / ${name} 机位：装饰 ${mesh.name || mesh.geometry.type} 的投影 横向 ${shadow.lateral0.toFixed(2)}..${shadow.lateral1.toFixed(2)} 竖向 ${shadow.y0.toFixed(2)}..${shadow.y1.toFixed(2)} 压住展示内容 横向 ${face.span[0].toFixed(2)}..${face.span[1].toFixed(2)} 竖向 ${face.y[0].toFixed(2)}..${face.y[1].toFixed(2)}`)
      }
    }
  }
  fun.preview(null)
  assert.equal(decoMeshes(scene).length, 0)
}))

test('SL-B 附带：三角旗与横幅都不跨过前台屏风的横向范围', () => {
  const wall = row(R1_BRAND_WALL_ID), at = world(wall)
  const x0 = at.x - wall.lengthM / 2, x1 = at.x + wall.lengthM / 2
  for (const anchor of R1_FESTIVE.buntings.filter(item => item.regionId === '11')) {
    assert.ok(anchor.x1 <= x0 || anchor.x0 >= x1, `区 11 三角旗 ${anchor.x0}..${anchor.x1} 横穿屏风 ${x0}..${x1}`)
  }
  // 横幅挂在大门内侧：必须留在 11-D-001（z = 18）的门扇扫掠之外，并且在机位之后，不可能压住标志
  assert.ok(R1_FESTIVE.banner.z <= 18 - .3, `横幅 z ${R1_FESTIVE.banner.z} 距大门不足 0.3 m`)
  assert.ok(R1_FESTIVE.banner.z >= Math.max(...FACE_CAMERAS['00-W-036-entry'].map(item => item[3])), '横幅应挂在全部前台机位之后')
  // 拆段不许偷偷加几何：三角片总数不超过拆之前的 3 × 34，每段旗距仍在原来 0.36 m 的一成以内
  const flags = R1_FESTIVE.buntings.reduce((sum, item) => sum + item.flags, 0)
  assert.ok(flags <= 34 * 3, `三角片总数 ${flags} 超过拆段前的 102`)
  for (const anchor of R1_FESTIVE.buntings) {
    const pitch = (anchor.x1 - anchor.x0) / (anchor.flags - 1)
    assert.ok(Math.abs(pitch - 13 / 33) <= 13 / 33 * .1, `${anchor.regionId} 段旗距 ${pitch.toFixed(3)} 偏离原样式`)
  }
})
