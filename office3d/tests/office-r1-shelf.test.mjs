import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { createR1Layout, R1_BOARD_ADDED_ELEMENTS, r1ToWorld } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { buildR1Books, drawR1BookCovers, r1BookcaseMetrics, r1BookCoverLines, R1_BOOK_COVERS, R1_BOOK_COVER_LIST, R1_BOOK_SHELF_IDS, R1_BOOK_SPEC } from '../office-vis2/r1-books.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { officeV3ModulesFor } from '../office-v3-modules.js'
import { LAYOUT_V3 } from '../office-layout.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

// 书架壳体与区 08 邻件都要用真实素材量包围盒，所以这里把 r1-furniture 需要的件一起装进来。
const MODELS = ['desk', 'chairDesk', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded',
  'computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1']
const loader = new GLTFLoader(), furn = {}
for (const name of MODELS) {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  furn[name] = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const A = { furn }
const makeScreenTexture = () => ({ ctx: { canvas: { width: 256, height: 144 }, drawImage() {} }, tex: { needsUpdate: false, dispose() {} } })
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (±${tolerance})`)
const shelfRow = id => createR1Layout().elements.find(row => row.id === id)
const books = (options = {}) => buildR1Books({ THREE, root: new THREE.Group(), layout: createOfficeR1Layout(), A, ...options })
// 书件的真实世界角点：直接从 InstancedMesh 的实例矩阵解出来，不信模块自报的数。
const cornersOf = (mesh, index) => {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix)
  const out = []
  for (const sx of [-.5, .5]) for (const sy of [-.5, .5]) for (const sz of [-.5, .5]) out.push(new THREE.Vector3(sx, sy, sz).applyMatrix4(matrix))
  return out
}

test('FD-6a 新书架 08-BK-002 作为董事会新增件冻结在表里，尺寸位置朝向逐值与补充卡一致并贴着东墙内侧', () => {
  assert.ok(Object.isFrozen(R1_BOARD_ADDED_ELEMENTS))
  assert.equal(R1_BOARD_ADDED_ELEMENTS.filter(row => row.category === '书架').length, 1)
  const row = R1_BOARD_ADDED_ELEMENTS.find(row => row.id === '08-BK-002')
  assert.ok(Object.isFrozen(row))
  assert.equal(row.id, '08-BK-002'); assert.equal(row.category, '书架'); assert.equal(row.regionId, '08')
  assert.equal(row.status, 'BOARD_ADDED'); assert.equal(row.date, '2026-10-29')
  assert.ok(/书架/.test(row.reason), row.reason)
  // 长 6.0 / 深 0.4 / 高 2.2 m，误差 ≤ 1 cm；正面朝西（R1 −X）。
  near(row.lengthM, 6, .01); near(row.widthM, .4, .01); near(row.heightM, 2.2, .01)
  assert.deepEqual([...row.facingLocal], [-1, 0]); assert.equal(row.yawDeg, 90)
  near(row.yM, 15.6, .01)
  // 背面贴东墙 00-W-002 内侧面：墙中线 X = 56、厚 0.2 ⇒ 内侧面 55.9，缝隙 ≤ 2 cm。
  const wall = R1_DATA.walls.find(item => item.id === '00-W-002')
  const inner = Math.min(...wall.geometry.points.map(([x]) => x)) - wall.geometry.thickness / 2
  near(inner, 55.9, 1e-9)
  const gap = inner - (row.xM + row.widthM / 2)
  assert.ok(gap >= -1e-9 && gap <= .02, `背面离墙内侧面 ${gap} m`)
  // 登记数据没有这一行，元素表末尾才有（data.js 一个字节都没改，由 I6C-1 的哈希断言锁住）。
  assert.equal(R1_DATA.elements.filter(item => item.id === '08-BK-002').length, 0)
  assert.deepEqual(createR1Layout().elements.filter(item => item.id === '08-BK-002'), [row])
})

test('FD-6a 新书架与圆桌椅、协作桌椅、端柜和南墙的净距逐件 ≥ 0.6 m', () => {
  const layout = createOfficeR1Layout(), root = new THREE.Group(), collision = createFurnitureCollision()
  const furniture = buildR1Furniture({ THREE, root, layout, collision, makeScreenTexture, A, placeFurniture })
  const shelf = furniture.itemBounds.get('08-BK-002')
  assert.ok(shelf, '08-BK-002 没有被 r1-furniture 建出来')
  const size = shelf.getSize(new THREE.Vector3())
  // 世界里长边沿 Z（R1 的 Y），深度沿 X：验收要求误差 ≤ 1 cm。
  near(size.z, 6, .01); near(size.x, .4, .01); near(size.y, 2.2, .01)
  const expected = r1ToWorld(55.7, 15.6), centre = shelf.getCenter(new THREE.Vector3())
  near(centre.x, expected.x, .01); near(centre.z, expected.z, .01)
  // 补充卡点名的邻件：圆桌椅（08-CH-025/026/027 与圆桌 08-T-018）、协作桌椅（08-T-017 / 08-CH-024）、
  // 端柜（离书架最近的一只是区 13 的 13-CB-002）。每一件都必须真的在布局里，缺件算失败。
  const neighbours = ['08-CH-027', '08-CH-025', '08-T-018', '08-CH-026', '08-CH-024', '08-T-017', '13-CB-002']
  const list = []
  for (const id of neighbours) {
    const other = furniture.itemBounds.get(id)
    assert.ok(other, `${id} 不在布局里，净距清单对不上`)
    const dx = Math.max(shelf.min.x - other.max.x, other.min.x - shelf.max.x, 0)
    const dz = Math.max(shelf.min.z - other.max.z, other.min.z - shelf.max.z, 0)
    const distance = Math.hypot(dx, dz)
    list.push([id, Number(distance.toFixed(3))])
    assert.ok(distance >= .6, `${id} 净距 ${distance} m < 0.6 m`)
  }
  assert.equal(list.length, neighbours.length)
  // 最近的一件是圆桌椅 08-CH-027：2.10 m，远在 0.6 m（含 0.1 m 余量）之上。
  assert.equal(list[0][0], '08-CH-027')
  assert.ok(list[0][1] >= 2 && list[0][1] <= 2.2, `最近邻件净距 ${list[0][1]} m`)
  // 南墙 00-W-033 在 R1 的 Y = 9.5：书架南端 Y = 12.6，净距 3.1 m。
  const south = 18 - 9.5
  near(south - shelf.max.z, 3.1, .01)
  furniture.dispose()
})

test('FD-6b 新书架有碰撞，登记件 08-BK-001 的通行判定不变', () => {
  const collision = createFurnitureCollision(), built = books({ collision, root: new THREE.Group() })
  assert.deepEqual(built.proxies.map(proxy => proxy.userData.r1Id), ['08-BK-002'])
  const inside = r1ToWorld(55.7, 15.6), clear = r1ToWorld(55.7, 15.6 - 4)
  assert.ok(collision.hit(inside.x, inside.z), '新书架位置应当挡住行人')
  assert.ok(!collision.hit(clear.x, clear.z), '书架南侧 4 m 外不应被挡')
  const one = r1ToWorld(46, 28.8)
  assert.ok(!collision.hit(one.x, one.z), '08-BK-001 不在本卡范围内加碰撞')
  built.dispose()
  assert.ok(!collision.hit(inside.x, inside.z), 'dispose 之后碰撞代理要移除')
})

test('FD-6c 两个书架每层都约九成满，每本书都落在真实层板上并留在书架腔体里', () => {
  const built = books()
  assert.deepEqual(built.shelves.map(shelf => shelf.id), [...R1_BOOK_SHELF_IDS])
  // 层板位置是量 bookcaseOpen 量出来的：素材 0.4 × 0.88 × 0.25 m，四块板顶在 .13 / .37 / .61 / .85，
  // 最上面那块是书架顶面（上方没有净高），所以每个书架有 3 个封闭层。
  const metrics = r1BookcaseMetrics(THREE, A.furn.bookcaseOpen)
  assert.deepEqual(metrics.levels.map(level => Number(level.y.toFixed(3))), [.13, .37, .61, .85])
  assert.equal(metrics.levels.filter(level => Number.isFinite(level.clearHeight)).length, 3)
  // 可用范围是**以模型包围盒中心为原点**的局部坐标（placeFurniture 按中心对齐）：x / z 必须跨过 0，
  // 否则就是把中心算错了，书会整体挪到书架前面或背后（素材 z 从 −0.25 到 0，用 size/2 当中心就会这样）。
  for (const level of metrics.levels) {
    assert.ok(level.minX < 0 && level.maxX > 0, `层 ${level.y} 的可用 x [${level.minX}, ${level.maxX}] 没跨过中心`)
    assert.ok(level.minZ < 0 && level.maxZ > 0, `层 ${level.y} 的可用 z [${level.minZ}, ${level.maxZ}] 没跨过中心`)
    assert.ok(Math.abs(level.minZ) <= metrics.size.z / 2 && Math.abs(level.maxZ) <= metrics.size.z / 2, `层 ${level.y} 的可用 z 超出素材进深`)
  }
  const report = []
  for (const shelf of built.shelves) {
    assert.equal(shelf.levels.length, 3, shelf.id)
    for (const level of shelf.levels) {
      report.push(`${shelf.id} L${level.index}: ${level.books} 本, 填充 ${(level.fill * 100).toFixed(1)}%`)
      assert.ok(level.fill >= .85 && level.fill <= .95, `${shelf.id} L${level.index} 填充率 ${level.fill}`)
      assert.ok(level.books >= 40, `${shelf.id} L${level.index} 只有 ${level.books} 本`)
      // 层净高 0.525 m，书高上限 0.28 m：书不会穿上面那块板。
      assert.ok(level.clearHeight > R1_BOOK_SPEC.height[1] + .05, `${shelf.id} L${level.index} 净高 ${level.clearHeight}`)
    }
  }
  assert.equal(report.length, 6)
  assert.ok(built.books >= 600, `两个书架一共只有 ${built.books} 本`)
  // 逐件核对：实例矩阵解出的八个角点都在本层的可用范围里，底面不低于层板顶面。
  const levelsOf = new Map(built.shelves.map(shelf => [shelf.id, shelf.levels]))
  built.instances.forEach((item, index) => {
    const level = levelsOf.get(item.shelfId)[item.level], row = shelfRow(item.shelfId)
    const origin = r1ToWorld(row.xM, row.yM), yaw = item.yaw, cos = Math.cos(yaw), sin = Math.sin(yaw)
    for (const corner of cornersOf(built.mesh, index)) {
      const dx = corner.x - origin.x, dz = corner.z - origin.z
      const u = cos * dx - sin * dz, v = sin * dx + cos * dz
      assert.ok(u >= level.minU - .02 && u <= level.maxU + .02, `${item.shelfId} 第 ${index} 件 u = ${u}`)
      assert.ok(v >= level.minV - .01 && v <= level.maxV + .01, `${item.shelfId} 第 ${index} 件 v = ${v}`)
      assert.ok(corner.y >= level.y - .0015, `${item.shelfId} 第 ${index} 件底面 ${corner.y} 低于层板 ${level.y}`)
      assert.ok(corner.y <= level.y + level.clearHeight + 1e-6, `${item.shelfId} 第 ${index} 件顶面 ${corner.y} 穿过上层板`)
      // 与 level 的可用范围无关的独立判据：直接按登记件的外轮廓（长 lengthM × 深 widthM）核，
      // 这样即使层板范围算错，书跑到书架前面或背后也会被抓住。
      assert.ok(Math.abs(u) <= row.lengthM / 2 + 1e-6, `${item.shelfId} 第 ${index} 件 u = ${u} 超出登记长度`)
      assert.ok(Math.abs(v) <= row.widthM / 2 + 1e-6, `${item.shelfId} 第 ${index} 件 v = ${v} 超出登记进深 ${row.widthM}`)
      assert.ok(corner.y <= row.heightM + 1e-6, `${item.shelfId} 第 ${index} 件高过书架 ${row.heightM} m`)
    }
  })
  built.dispose()
})

test('FD-6d 每个书架 6–8 本封面朝外，书名逐字是通用题材，没有真实出版物', () => {
  const built = books()
  for (const shelf of built.shelves) {
    assert.ok(shelf.covers.length >= 6 && shelf.covers.length <= 8, `${shelf.id} 封面朝外 ${shelf.covers.length} 本`)
    assert.deepEqual([...shelf.covers].sort(), [...R1_BOOK_COVERS[shelf.id]].sort())
  }
  assert.deepEqual(R1_BOOK_COVERS['08-BK-001'], ['人工智能导论', '机器学习实战', '深度学习原理', '大模型与智能体', '提示词工程', '数据结构与算法', '分布式系统设计'])
  assert.deepEqual(R1_BOOK_COVERS['08-BK-002'], ['互联网产品方法论', '云原生架构', '网络安全基础', 'AI Agents', 'Machine Learning', 'Neural Networks', 'The Internet Age'])
  assert.equal(R1_BOOK_COVER_LIST.length, 14)
  assert.equal(built.covers, 14)
  assert.equal(built.coverMesh.geometry.attributes.position.count / 3, 28)
  // 书名全部出自补充卡的通用词表；书脊不写字（只有封面那 14 本有文字）。
  const allowed = new Set(['人工智能导论', '机器学习实战', '深度学习原理', '大模型与智能体', '提示词工程', '数据结构与算法',
    '分布式系统设计', '互联网产品方法论', '云原生架构', '网络安全基础', 'AI Agents', 'Machine Learning', 'Neural Networks', 'The Internet Age'])
  for (const cover of R1_BOOK_COVER_LIST) assert.ok(allowed.has(cover.title), cover.title)
  // 封面图集：14 本各自占一个格子，uv 不重叠。
  const uv = built.coverMesh.geometry.attributes.uv, cells = new Set()
  // 每本封面是一个四边形（6 个顶点）：按格子左下角定位，14 本应当落在 14 个互不相同的格子里。
  for (let i = 0; i < uv.count; i += 6) {
    let minX = Infinity, minY = Infinity
    for (let k = 0; k < 6; k++) { minX = Math.min(minX, uv.getX(i + k)); minY = Math.min(minY, uv.getY(i + k)) }
    const col = Math.round(minX * 4), row = Math.round(minY * 4)
    assert.ok(col >= 0 && col < 4 && row >= 0 && row < 4, `封面 uv 格子 ${col},${row} 越界`)
    cells.add(`${col},${row}`)
  }
  assert.equal(cells.size, 14)
  const drawn = []
  drawR1BookCovers({
    clearRect() {}, fillRect() {}, fillText(text) { drawn.push(text) },
    set fillStyle(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
  }, 1024, 1024)
  for (const cover of R1_BOOK_COVER_LIST) {
    const parts = r1BookCoverLines(cover.title)
    assert.ok(parts.join('') === cover.title.replace(/ /g, ''), `${cover.title} 折行后丢字：${parts.join('|')}`)
    for (const part of parts) assert.ok(drawn.includes(part), `${cover.title} 的「${part}」没画上去`)
  }
  assert.deepEqual(r1BookCoverLines('人工智能导论'), ['人工智', '能导论'])
  assert.deepEqual(r1BookCoverLines('互联网产品方法论'), ['互联网产', '品方法论'])
  assert.deepEqual(r1BookCoverLines('Machine Learning'), ['Machine', 'Learning'])
  built.dispose()
})

test('FD-6e 书只多两个绘制批次，两档三角数都在 25,000 以内，低档更省', () => {
  const high = books(), low = books({ quality: { tier: 'low' } })
  for (const built of [high, low]) {
    const meshes = []
    built.root.traverse(node => { if (node.isMesh) meshes.push(node.name) })
    assert.deepEqual(meshes.sort(), ['r1-books-batch', 'r1-books-covers'])
    assert.equal(built.summary().calls, 2)
    const triangles = built.mesh.count * 12 + built.coverMesh.geometry.attributes.position.count / 3
    assert.equal(built.summary().triangles, triangles)
    assert.ok(triangles <= 25000, `三角 ${triangles} 超过 25,000`)
  }
  assert.ok(low.books < high.books, `低档 ${low.books} 本应少于高档 ${high.books} 本`)
  assert.equal(low.covers, 14)
  high.dispose(); low.dispose()
})

test('FD-6f r1Books 只注册给 R1 布局，拿不到素材或非 R1 时安静退出', () => {
  const names = officeV3ModulesFor(createOfficeR1Layout()).map(([name]) => name)
  assert.ok(names.includes('r1Books'), names.join(','))
  assert.ok(!officeV3ModulesFor(LAYOUT_V3).map(([name]) => name).includes('r1Books'))
  const root = new THREE.Group()
  assert.equal(buildR1Books({ THREE, root, layout: LAYOUT_V3, A }).books, 0)
  assert.equal(buildR1Books({ THREE, root, layout: createOfficeR1Layout(), A: { furn: {} } }).books, 0)
  assert.equal(root.children.length, 0)
  const built = books({ root })
  assert.equal(built.root.userData.dynamic, true)
  built.dispose()
  assert.equal(root.children.length, 0, 'dispose 之后要把自己从场景里摘掉')
})
