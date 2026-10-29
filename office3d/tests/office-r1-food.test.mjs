import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Island, r1FoodPieces, R1_FOOD_KINDS, R1_BAR_EQUIPMENT, R1_BAR_CASES, R1_BAR_CASE_SIZE, R1_BAR_CUP_RACK, R1_BAR_COUNTER } from '../office-vis2/r1-island.js'
import { buildR1Plaza, R1_STALL_THEMES, R1_STALL_BOARD, drawR1StallBoards } from '../office-vis2/r1-plaza.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

// 本卡新复制的三件 Kenney 设备素材（CC0），与隔离区原件逐字节相同；哈希见 assets/ASSET_LEDGER.md。
const EQUIPMENT_ASSETS = Object.freeze({
  kitchenCoffeeMachine: Object.freeze({ bytes: 13332, sha256: '063f582c6fa0f00a9f24e3393dac2295491c4becdaf5513c893ab1a2826b6ec3' }),
  toaster: Object.freeze({ bytes: 14924, sha256: '38c1fb7b122be9997758c8ee855d87f28014cf282f24d66d39f4e8d8b236d2af' }),
  kitchenBlender: Object.freeze({ bytes: 18728, sha256: 'f471defb5b2b1cf3b949a1a8aaef0a8b727afe662b0815068cf4e963325a3c1f' }),
})
const loader = new GLTFLoader(), furn = {}
for (const name of Object.keys(EQUIPMENT_ASSETS)) {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  furn[name] = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const A = { furn }

const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (±${tolerance})`)
// FD-1 的判据：件底面与所放台面的高差 ≤ 3 mm。
const MM3 = .003
const CENTER = Object.freeze({ x: 2, z: -4.1 })
// 摊位柜台面的局部可用范围（dx 沿 length、dz 沿 width，顾客在 −dz 一侧）：
// 摊亭取货台 r1-plaza.js 画在 dz = −(1.2 − .45) ± .45、面高 .985 + .035；餐车出餐台 dz = −(1.1 − .2) ± .17、面高 1.22 + .07。
const KIOSK_COUNTER = Object.freeze({ dx: 1.2, dzMin: -1.2, dzMax: -.3, y: 1.02 })
const TRUCK_COUNTER = Object.freeze({ dx: 1.45, dzMin: -1.07, dzMax: -.73, y: 1.29 })
const counterFor = id => (id === '14-KS-001' ? TRUCK_COUNTER : KIOSK_COUNTER)
const stubContext = () => ({ clearRect() {}, fillRect() {}, fillText() {}, set fillStyle(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {} })
const island = (options = {}) => buildR1Island({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout(), A, placeFurniture, ...options })
const size = box => box.getSize(new THREE.Vector3())

test('FD-1 吧台台面七件新物件逐件贴着台面，全部落在 2.9–3.65 m 环带内并让开 1.2 m 员工入口', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const bar = buildR1Island({ THREE, root, layout, collision, A, placeFurniture })
  const radii = layout.r1.data.central.radii_m
  near(bar.counterY, 1.05)
  near(radii.bar_inner, 2.9); near(radii.bar_outer, 3.65)
  // 逐件清单：咖啡机 2 台、面包机 1 台、搅拌机 1 台、杯架 1 组、玻璃陈列柜 2 座
  assert.deepEqual(bar.props.map(record => record.id),
    ['07-BAR-CM-001', '07-BAR-CM-002', '07-BAR-TS-001', '07-BAR-BL-001', '07-BAR-CR-001', '07-BAR-DC-001', '07-BAR-DC-002'])
  for (const record of bar.props) {
    assert.ok(Math.abs(record.bounds.min.y - bar.counterY) <= MM3, `${record.id} 底面高差 ${record.bounds.min.y - bar.counterY} m`)
    assert.ok(record.triangles > 0, record.id)
  }
  // 环带与入口：直接扫两个合批里「台面以上、半径 2.5–4.0 m」的顶点，正好是本卡新增的件。
  let scanned = 0
  for (const name of ['r1-island-surfaces', 'r1-island-glass']) {
    const position = bar.root.getObjectByName(name).geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
      const radius = Math.hypot(x - CENTER.x, z - CENTER.z)
      if (y <= bar.counterY + 1e-6 || radius < 2.5 || radius > 4) continue
      scanned++
      assert.ok(radius >= radii.bar_inner - 1e-6 && radius <= radii.bar_outer + 1e-6, `${name} 顶点半径 ${radius} 超出台面环带`)
      // 员工入口是沿 x 的 1.2 m 直通口（吧台北侧）：台面件一个顶点都不许伸进去。
      assert.ok(!(Math.abs(x - CENTER.x) < .6 && z < CENTER.z - 2.8), `件伸进员工入口 ${x},${z}`)
    }
  }
  assert.ok(scanned > 1000, `台面以上扫到的顶点数 ${scanned}`)
  // 「设备摆内半圈、不挡吧凳一侧」按常量核：设备与杯架的最外沿 ≤ 3.30 m，外面给吧凳留 ≥ .35 m。
  // 陈列柜是给顾客看的，摆到 caseRadius，外沿仍留 .2 m（四角 .148 m），不进吧凳本体（半径 3.87 m 起）。
  const outermost = Math.max(...R1_BAR_EQUIPMENT.map(device => device.size.z / 2), R1_BAR_CUP_RACK.depth / 2)
  assert.ok(R1_BAR_COUNTER.equipmentRadius + outermost <= radii.bar_outer - .35,
    `设备最外沿 ${R1_BAR_COUNTER.equipmentRadius + outermost}`)
  assert.ok(R1_BAR_COUNTER.equipmentRadius - outermost >= radii.bar_inner)
  assert.ok(Math.hypot(R1_BAR_COUNTER.caseRadius + R1_BAR_CASE_SIZE.depth / 2, R1_BAR_CASE_SIZE.length / 2) <= radii.bar_outer)
  assert.ok(R1_BAR_COUNTER.caseRadius - R1_BAR_CASE_SIZE.depth / 2 >= radii.bar_inner)
  // 本卡不加地面碰撞，登记件的清单与代理数保持 I4 验收时的逐值不变。
  assert.equal(bar.items.length, 21); assert.equal(bar.proxies.length, 22)
  for (const z of [-8, -7.4, -7.05, -6.9]) assert.equal(collision.hit(CENTER.x, z), null, `员工入口 ${z}`)
  bar.dispose(); assert.equal(collision.stats().bodies, 0); assert.equal(root.children.length, 0)
})

test('FD-2 四台设备用登记的 Kenney GLB 件，缩到卡面尺寸并朝向吧台内侧', () => {
  for (const [name, expected] of Object.entries(EQUIPMENT_ASSETS)) {
    const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
    assert.equal(bytes.length, expected.bytes, name)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, name)
  }
  const ledger = readFileSync(new URL('../assets/ASSET_LEDGER.md', import.meta.url), 'utf8')
  const license = readFileSync(new URL('../assets/models/furniture/License.txt', import.meta.url), 'utf8')
  for (const [name, expected] of Object.entries(EQUIPMENT_ASSETS)) {
    assert.ok(ledger.includes(`assets/models/furniture/${name}.glb | ${expected.bytes} | ${expected.sha256} |`), `${name} 未登记`)
  }
  // 三件与现有 28 件同出一个 Kenney Furniture Kit：授权沿用本目录未改动的 License.txt。
  assert.ok(/Furniture Kit \(2\.0\)/.test(license) && /Creative Commons Zero, CC0/.test(license))
  assert.equal(createHash('sha256').update(readFileSync(new URL('../assets/models/furniture/License.txt', import.meta.url))).digest('hex'),
    'bc0de1a0742cb490f9ed4bae0bd284286ebb27e23149b9917c7d8c0d590b8b29')

  assert.deepEqual(R1_BAR_EQUIPMENT.map(device => device.model), ['kitchenCoffeeMachine', 'kitchenCoffeeMachine', 'toaster', 'kitchenBlender'])
  const bar = island()
  for (const device of R1_BAR_EQUIPMENT) {
    const record = bar.byPropId.get(device.id)
    near(size(record.bounds).y, device.size.y, .002)
    // 朝向：绕 Y 转 yaw 后件的局部 +Z 轴指向吧台圆心，也就是工作人员一侧。
    const centre = record.bounds.getCenter(new THREE.Vector3())
    assert.ok(Math.sin(record.yaw) * (CENTER.x - centre.x) + Math.cos(record.yaw) * (CENTER.z - centre.z) > 0, `${device.id} 没朝向吧台内侧`)
    // 设备摆在内半圈：件心半径不超过中线。
    assert.ok(Math.hypot(centre.x - CENTER.x, centre.z - CENTER.z) <= (2.9 + 3.65) / 2, device.id)
  }
  // 模型没进 assets3d 的加载清单时整件跳过、不抛错，台面其余陈列照常建。
  const bare = buildR1Island({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout() })
  assert.deepEqual(bare.props.map(record => record.id), ['07-BAR-CR-001', '07-BAR-DC-001', '07-BAR-DC-002'])
  bare.dispose(); bar.dispose()
})

test('FD-1 两座陈列柜是 1.2 × .5 × .45 m、柜内两层四种食物，玻璃半透明且单独一个批次', () => {
  assert.equal(R1_BAR_CASES.length, 2)
  near(R1_BAR_CASE_SIZE.length, 1.2); near(R1_BAR_CASE_SIZE.depth, .5); near(R1_BAR_CASE_SIZE.height, .45)
  const bar = island()
  for (const unit of R1_BAR_CASES) {
    assert.equal(unit.shelves.length, 2, `${unit.id} 柜内应分两层`)
    for (const shelf of unit.shelves) assert.equal(shelf.length, 3)
    near(size(bar.byPropId.get(unit.id).bounds).y, R1_BAR_CASE_SIZE.height, .002)
  }
  assert.deepEqual([...new Set(R1_BAR_CASES.flatMap(unit => unit.shelves.flat()))].sort(), ['bread', 'cake', 'croissant', 'donut'])
  const glass = bar.root.getObjectByName('r1-island-glass')
  assert.equal(glass.material.transparent, true)
  assert.ok(glass.material.opacity > 0 && glass.material.opacity < 1, `${glass.material.opacity}`)
  assert.equal(glass.material.depthWrite, false)
  assert.deepEqual(glass.userData.itemIds, ['07-BAR-DC-001', '07-BAR-DC-002'])
  // 杯架两层、每层三只杯子
  assert.ok(bar.byPropId.get(R1_BAR_CUP_RACK.id).triangles > 0)
  near(size(bar.byPropId.get(R1_BAR_CUP_RACK.id).bounds).y, R1_BAR_CUP_RACK.height, .002)
  bar.dispose()
})

test('FD-1 四个摊位主题各不相同，陈列与价目牌逐件落在本摊柜台面上', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group()
  const plaza = buildR1Plaza({ THREE, root, layout })
  // 登记件的清单与包围盒保持 I6 验收时的逐值不变。
  assert.equal(plaza.records.length, 60); assert.equal(plaza.proxies.length, 30)
  assert.deepEqual(R1_STALL_THEMES.map(stall => stall.theme), ['面包与咖啡', '水果与果汁', '甜品', '简餐'])
  assert.deepEqual(R1_STALL_THEMES.map(stall => stall.id).sort(), ['14-KS-001', '14-KS-002', '14-KS-003', '14-KS-004'])
  for (const stall of R1_STALL_THEMES) {
    const counter = counterFor(stall.id)
    near(stall.surfaceY, counter.y)
    const own = plaza.props.filter(record => record.stallId === stall.id)
    assert.equal(own.length, stall.display.length + 1, `${stall.id} 件数`)
    const containers = stall.display.filter(slot => ['tray', 'basket'].includes(slot.kind))
    assert.ok(containers.length >= 1, `${stall.id} 应有托盘或篮子`)
    for (const [index, slot] of stall.display.entries()) {
      const record = plaza.byPropId.get(`${stall.id}/FD-${String(index + 1).padStart(2, '0')}`)
      // 放进托盘 / 篮子的食物，底面贴容器底板（dy）；直接摆台面的件 dy 为 0。
      const support = stall.surfaceY + (slot.dy || 0)
      assert.ok(Math.abs(record.bounds.min.y - support) <= MM3, `${record.id} 底面高差 ${record.bounds.min.y - support} m`)
      if (slot.dy) {
        const holder = containers.find(container => {
          const box = plaza.byPropId.get(`${stall.id}/FD-${String(stall.display.indexOf(container) + 1).padStart(2, '0')}`).local
          return record.local.min.x >= box.min.x && record.local.max.x <= box.max.x && record.local.min.z >= box.min.z && record.local.max.z <= box.max.z
        })
        assert.ok(holder, `${record.id} 抬高了却不在任何容器里`)
      }
    }
    for (const record of own) {
      assert.ok(record.local.min.x >= -counter.dx && record.local.max.x <= counter.dx, `${record.id} dx ${record.local.min.x}…${record.local.max.x} 出柜台`)
      assert.ok(record.local.min.z >= counter.dzMin && record.local.max.z <= counter.dzMax, `${record.id} dz ${record.local.min.z}…${record.local.max.z} 出柜台`)
      assert.ok(record.triangles > 0, record.id)
    }
    // 价目牌：牌面朝 −dz 的顾客一侧，牌脚贴柜台面
    const board = plaza.byPropId.get(`${stall.id}/BOARD`)
    near(board.bounds.min.y, stall.surfaceY, .0005)
    near(size(board.local).x, R1_STALL_BOARD.width, .0005)
    near(board.local.max.y, R1_STALL_BOARD.foot + R1_STALL_BOARD.height, .0005)
  }
  plaza.dispose(); assert.equal(root.children.length, 0)
})

test('FD-3 价目牌用一张 Canvas 图集：四格中文菜名加美元价格，牌面 uv 各自落在自己那一格', () => {
  const drawn = []
  const canvasTex = (width, height, draw) => {
    assert.equal(draw.length, 3)
    assert.deepEqual([width, height], [1536, 1152])
    let text = []
    draw({ ...stubContext(), fillText: (value, x, y) => text.push([value, x, y]) }, width, height)
    drawn.push(text)
    return new THREE.Texture()
  }
  const plaza = buildR1Plaza({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout(), canvasTex })
  assert.equal(drawn.length, 1)
  // 四个主题标题 + 每摊三行菜名与价格
  const lines = drawn[0].map(([value]) => value)
  for (const stall of R1_STALL_THEMES) {
    assert.ok(lines.includes(stall.theme), stall.theme)
    assert.equal(stall.menu.length, 3)
    for (const [name, price] of stall.menu) {
      assert.ok(lines.includes(name), name)
      assert.ok(lines.includes(price), price)
      assert.ok(/^\$\d+\.\d{2}$/.test(price), `${name} 价格 ${price} 应是美元`)
    }
  }
  assert.equal(new Set(R1_STALL_THEMES.flatMap(stall => stall.menu.map(([name]) => name))).size, 12)
  const boards = plaza.boards
  assert.equal(boards.name, 'r1-plaza-stall-boards')
  assert.equal(boards.material.map, plaza.boardMap)
  assert.equal(boards.geometry.attributes.position.count, R1_STALL_THEMES.length * 6)
  // 餐车比摊亭先建，所以合批次序不是 R1_STALL_THEMES 的次序；按 itemIds 回对格子。
  assert.deepEqual(boards.userData.itemIds, ['14-KS-001/BOARD', '14-KS-002/BOARD', '14-KS-003/BOARD', '14-KS-004/BOARD'])
  // 每块牌面 6 个顶点，uv 必须整块落在自己那一格（2 × 2 图集）里。
  const uv = boards.geometry.attributes.uv
  boards.userData.itemIds.forEach((boardId, position) => {
    const stall = R1_STALL_THEMES.find(row => `${row.id}/BOARD` === boardId)
    const cell = R1_STALL_THEMES.indexOf(stall), column = cell % 2, row = Math.floor(cell / 2)
    for (let i = position * 6; i < position * 6 + 6; i++) {
      assert.ok(uv.getX(i) >= column / 2 - 1e-6 && uv.getX(i) <= (column + 1) / 2 + 1e-6, `${stall.id} u ${uv.getX(i)}`)
      assert.ok(uv.getY(i) >= (1 - row) / 2 - 1e-6 && uv.getY(i) <= (2 - row) / 2 + 1e-6, `${stall.id} v ${uv.getY(i)}`)
    }
  })
  plaza.dispose()
  // 既没有 canvasTex 也没有 document 时只剩空白牌面，不抛错
  const bare = buildR1Plaza({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout() })
  assert.equal(bare.boardMap, null)
  assert.equal(bare.boards.material.map, null)
  bare.dispose()
})

test('FD-4 吧台与广场各只多一个绘制批次，两档新增三角都在 40,000 以内，低档每摊仍有陈列', () => {
  const layout = createOfficeR1Layout(), counts = {}
  for (const low of [false, true]) {
    const root = new THREE.Group()
    const bar = buildR1Island({ THREE, root, layout, low, A, placeFurniture })
    const plaza = buildR1Plaza({ THREE, root, layout, low, canvasTex: () => new THREE.Texture() })
    const barMeshes = [], plazaMeshes = []
    bar.root.traverse(object => { if (object.isMesh && !bar.tree.root.getObjectById(object.id)) barMeshes.push(object.name) })
    plaza.root.traverse(object => { if (object.isMesh && object !== plaza.fountain.proxy && !plaza.fountain.root.getObjectById(object.id)) plazaMeshes.push(object.name) })
    // 食物与设备并进既有合批（+0 calls）；唯一的新批次是吧台玻璃和广场价目牌面（+2 calls 合计）。
    assert.deepEqual(barMeshes.sort(), ['r1-island-glass', 'r1-island-surfaces'], `low=${low}`)
    assert.deepEqual(plazaMeshes.sort(), ['r1-plaza-stall-boards', 'r1-plaza-surfaces'], `low=${low}`)
    const triangles = bar.props.reduce((sum, record) => sum + record.triangles, 0) + plaza.props.reduce((sum, record) => sum + record.triangles, 0)
    counts[low ? 'low' : 'high'] = triangles
    assert.ok(triangles <= 40000, `low=${low} 新增三角 ${triangles}`)
    // 低档减量但每个摊位至少保留一种陈列，每座陈列柜每层至少一件食物。
    for (const stall of R1_STALL_THEMES) {
      const own = plaza.props.filter(record => record.stallId === stall.id && record.kind !== 'board')
      assert.ok(own.length >= 1, `low=${low} ${stall.id} 没有陈列`)
      assert.ok(own.some(record => record.triangles > 0))
    }
    for (const unit of R1_BAR_CASES) assert.ok(bar.byPropId.get(unit.id).triangles > 0, unit.id)
    plaza.dispose(); bar.dispose()
    assert.equal(root.children.length, 0)
  }
  assert.ok(counts.low < counts.high, `低档应减量：low=${counts.low} high=${counts.high}`)
})

test('FD-5 食物几何逐种可用：底面贴 y = 0、水平居中、顶点有限且法线齐全', () => {
  assert.equal(R1_FOOD_KINDS.length, 13)
  for (const kind of R1_FOOD_KINDS) {
    for (const low of [false, true]) {
      const pieces = r1FoodPieces(THREE, kind, low)
      assert.ok(pieces.length > 0, kind)
      const box = new THREE.Box3()
      for (const piece of pieces) {
        const geometry = piece.geometry
        assert.ok(geometry.attributes.position.count > 0, kind)
        assert.ok(geometry.attributes.normal, `${kind} 缺法线`)
        for (const value of geometry.attributes.position.array) assert.ok(Number.isFinite(value), `${kind} 顶点非有限值`)
        geometry.computeBoundingBox()
        box.union(geometry.boundingBox.clone().translate(new THREE.Vector3(piece.dx, piece.dy, piece.dz)))
        assert.ok(typeof piece.tint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(piece.tint), `${kind} 颜色 ${piece.tint}`)
        geometry.dispose()
      }
      near(box.min.y, 0, .0005)
      const extent = size(box)
      assert.ok(extent.y > .005 && extent.y <= .36, `${kind} 高度 ${extent.y}`)
      assert.ok(extent.x <= .36 && extent.z <= .36, `${kind} 占地 ${extent.x} × ${extent.z}`)
      near(box.min.x + box.max.x, 0, .035)
      near(box.min.z + box.max.z, 0, .035)
    }
  }
  assert.throws(() => r1FoodPieces(THREE, 'noodles'), /未知的 R1 食物件/)
})

test('FD-5 本卡只改吧台与广场两个模块：非 R1 布局拿不到任何新件，台面常量冻结', () => {
  for (const layout of [undefined, { r1Phase: 'R0' }]) {
    const root = new THREE.Group()
    const bar = buildR1Island({ THREE, root, layout, A, placeFurniture })
    const plaza = buildR1Plaza({ THREE, root, layout, canvasTex: () => new THREE.Texture() })
    assert.equal(root.children.length, 0)
    assert.equal(bar.props, undefined); assert.equal(plaza.props, undefined)
    bar.dispose(); plaza.dispose()
  }
  assert.deepEqual({ ...R1_BAR_COUNTER }, { equipmentRadius: 3.12, caseRadius: 3.2, entryThetaDeg: 90, entryKeepOutDeg: 45 })
  assert.equal(Object.isFrozen(R1_BAR_EQUIPMENT) && Object.isFrozen(R1_BAR_CASES) && Object.isFrozen(R1_STALL_THEMES), true)
  // 价目牌的绘制函数本身是纯函数：同一个 ctx 契约下只写文字和色块，不碰 DOM。
  const calls = []
  drawR1StallBoards({ ...stubContext(), fillText: (...args) => calls.push(args) }, 1536, 1152)
  assert.equal(calls.length, R1_STALL_THEMES.length * 7)
})
