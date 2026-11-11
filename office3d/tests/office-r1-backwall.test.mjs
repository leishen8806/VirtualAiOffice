import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { R1_BACKWALL, R1_GATE } from '../office-r1-layout.js'
import { buildR1Shell, r1Glazing, r1WallPlan } from '../office-vis2/r1-shell.js'
import { buildR1Doors } from '../office-vis2/r1-doors.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { insideOwnFrame } from './helpers/r1-sweep.mjs'

// OFFICE-R1-BACKWALL：区 10（咖啡与交流）与区 12（休闲会客）后沿 Y = 9.5 补两段玻璃隔墙，各开一樘 2.0 m 平移门。
const BACK_Y = 9.5
const NEW_WALLS = Object.freeze({ '00-W-043': [6, 21], '00-W-044': [35, 50] })
const NEW_DOORS = Object.freeze({ '10-D-002': { xM: 8.4, wallId: '00-W-043', stack: 1, corner: 6 }, '12-D-002': { xM: 47.6, wallId: '00-W-044', stack: -1, corner: 50 } })
const OPENING = id => [NEW_DOORS[id].xM - 1, NEW_DOORS[id].xM + 1]

const scene = check => {
  const previous = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillText() {}, set fillStyle(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {}, set lineWidth(_) {}, set strokeStyle(_) {}, fillRect() {}, strokeRect() {} }) }) }
  const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  let shell
  try {
    shell = buildR1Shell({ THREE, root, layout, collision }); root.updateMatrixWorld(true)
    return check({ root, layout, collision, shell, get: name => root.getObjectByName(name) })
  } finally { shell?.dispose(); globalThis.document = previous }
}

const instanceBounds = (mesh, index, start = 0, count = mesh.geometry.attributes.position.count) => {
  mesh.updateWorldMatrix(true, false)
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), box = new THREE.Box3()
  if (mesh.isInstancedMesh) { mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld) } else matrix.copy(mesh.matrixWorld)
  const position = mesh.geometry.attributes.position
  for (let at = start; at < start + count; at++) box.expandByPoint(point.fromBufferAttribute(position, at).applyMatrix4(matrix))
  return box
}

const segmentDistance = (point, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = point[0] - a[0], wy = point[1] - a[1]
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(wx - vx * t, wy - vy * t)
}
const walkRoute = (route, step, visit) => {
  for (let i = 1; i < route.points_m.length; i++) {
    const a = route.points_m[i - 1], b = route.points_m[i], count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let s = 0; s <= count; s++) { const t = s / count; visit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
  }
}

test('BW-1 both new partitions join the registered back wall and copy the neighbouring partition spec', () => scene(({ layout, get }) => {
  const walls = layout.r1.data.walls, neighbour = walls.find(wall => wall.id === '00-W-032')
  assert.equal(walls.length, 44)
  const ends = walls.flatMap(wall => [wall.geometry.points[0], wall.geometry.points.at(-1)])
  for (const [id, [x0, x1]] of Object.entries(NEW_WALLS)) {
    const wall = walls.find(row => row.id === id)
    assert.ok(wall, id)
    assert.deepEqual(wall.geometry.points.map(point => [...point]), [[x0, BACK_Y], [x1, BACK_Y]], id)
    for (const key of ['category', 'heightM', 'widthM', 'regionId', 'status', 'unknown', 'yawDeg', 'zM', 'parentId'])
      assert.deepEqual(wall[key], neighbour[key], `${id}.${key}`)
    assert.deepEqual([...wall.facingLocal], [...neighbour.facingLocal], id)
    for (const key of ['exterior', 'height', 'thickness', 'type', 'inside_side'])
      assert.deepEqual(wall.geometry[key], neighbour.geometry[key], `${id}.geometry.${key}`)
    assert.equal(wall.lengthM, x1 - x0, id)
    assert.equal(wall.xM, (x0 + x1) / 2, id); assert.equal(wall.yM, BACK_Y, id)
    // 两端与现有墙接上：端点必须与另一面已登记墙的端点重合（间隙 ≤ 5 mm）。
    for (const end of [[x0, BACK_Y], [x1, BACK_Y]])
      assert.ok(ends.some(other => other !== end && Math.hypot(other[0] - end[0], other[1] - end[1]) <= .005), `${id} 端点 ${end}`)
    const faces = layout.r1.data.wallFaces.filter(face => face.wallId === id)
    assert.deepEqual(faces.map(face => face.side).sort(), ['A', 'B'], id)
    for (const face of faces) {
      assert.equal(face.heightM, 2.7); assert.equal(face.thicknessM, .1); assert.equal(face.lengthM, x1 - x0)
      assert.equal(face.openingAreaM2, 2 * 2.7, face.id)
      assert.deepEqual([[...face.startM], [...face.endM]], [[x0, BACK_Y], [x1, BACK_Y]], face.id)
    }
  }
  assert.equal(layout.r1.data.wallFaces.length, 88)
  // 渲染分层与相邻隔墙一致：玻璃 0 → 2.4，顶部实体带 2.4 → 2.7。
  const glass = get('r1-interior-glass'), bands = get('r1-top-bands')
  for (const id of Object.keys(NEW_WALLS)) {
    const parts = []
    for (let index = 0; index < glass.count; index++) if (glass.userData.wallIds[index] === id) parts.push(instanceBounds(glass, index))
    assert.equal(parts.length, 2, `${id} 应被门洞切成两段玻璃`)
    for (const box of parts) { assert.ok(Math.abs(box.min.y) < .001, id); assert.ok(Math.abs(box.max.y - (2.7 - r1Glazing.interiorBand)) < .001, id) }
    const [door] = Object.entries(NEW_DOORS).find(([, value]) => value.wallId === id)
    const [low, high] = OPENING(door), span = parts.map(box => [box.min.x + 26, box.max.x + 26]).sort((a, b) => a[0] - b[0])
    assert.ok(Math.abs(span[0][0] - NEW_WALLS[id][0]) < .001 && Math.abs(span[0][1] - low) < .001, `${id} 西段`)
    assert.ok(Math.abs(span[1][0] - high) < .001 && Math.abs(span[1][1] - NEW_WALLS[id][1]) < .001, `${id} 东段`)
    const ranges = bands.userData.ranges.filter(range => range.id.startsWith(id))
    assert.equal(ranges.length, 2, `${id} 顶带也要跟着切`)
  }
  assert.equal(new Set(r1WallPlan(layout).straight.map(entry => entry.id)).size, 38)
}))

test('BW-2 both leaves stack away from the corner and 101 opening phases keep zero positive overlap', () => scene(({ root, layout, shell }) => {
  const doors = buildR1Doors({ THREE, root, layout })
  root.updateMatrixWorld(true)
  assert.equal(layout.r1.data.doors.length, 15)
  assert.equal(doors.records.length, 30)
  for (const [id, spec] of Object.entries(NEW_DOORS)) {
    const door = layout.r1.data.doors.find(row => row.id === id)
    assert.ok(door, id); assert.equal(door.lengthM, 2); assert.equal(door.heightM, 2.7)
    assert.equal(door.xM, spec.xM); assert.equal(door.yM, BACK_Y)
    const pair = doors.records.filter(row => row.doorId === id)
    assert.equal(pair.length, 2, id)
    for (const leaf of pair) {
      assert.equal(leaf.width, 1, leaf.id)
      // 两扇都叠放到离墙角远的一侧
      assert.equal(Math.sign(leaf.open.x - leaf.closed.x) || spec.stack, spec.stack, leaf.id)
      assert.ok(Math.abs(leaf.open.x + 26 - spec.corner) > Math.abs(leaf.closed.x + 26 - spec.corner), leaf.id)
      // 停靠范围落在本段新墙内
      const [x0, x1] = NEW_WALLS[spec.wallId]
      assert.ok(leaf.open.x + 26 - .5 >= x0 - .001 && leaf.open.x + 26 + .5 <= x1 + .001, leaf.id)
    }
    assert.equal(pair[0].open.x, pair[1].open.x, `${id} 两扇叠放到同一处`)
  }
  // 全开净宽 ≥ 1.8 m
  const glass = doors.root.getObjectByName('r1-door-glass'), metal = doors.root.getObjectByName('r1-door-metal')
  doors.doors.setAll('open'); doors.onFrame(1.2); root.updateMatrixWorld(true)
  for (const id of Object.keys(NEW_DOORS)) {
    const door = layout.r1.data.doors.find(row => row.id === id)
    let low = door.xM - 26 - (door.lengthM - .1) / 2, high = door.xM - 26 + (door.lengthM - .1) / 2
    for (const leaf of doors.records.filter(row => row.doorId === id)) {
      const index = doors.records.indexOf(leaf), box = instanceBounds(glass, index)
      for (let part = 0; part < 4; part++) box.union(instanceBounds(metal, index * 4 + part))
      if (leaf.direction < 0) low = Math.max(low, box.max.x); else high = Math.min(high, box.min.x)
    }
    assert.ok(high - low >= 1.8 - 1e-6, `${id} 净宽 ${high - low}`)
  }
  // 101 个开启相位：与墙、墙角、门樘、家具、绿植的正体积相交为 0
  const obstacles = [], matrix = new THREE.Matrix4()
  shell.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || !/^r1-(exterior-glass|exterior-frames|interior-walls|interior-glass|interior-frames|top-bands|low-glass|corner-walls|door-frames)$/.test(mesh.name)) return
    // 顶带与墙角是合批后的单个 Mesh：按 ranges / 等分顶点段拆成每墙一个盒，不要整条合批当一个障碍。
    if (mesh.userData.ranges) { for (const range of mesh.userData.ranges) obstacles.push({ name: mesh.name, id: range.id, bounds: instanceBounds(mesh, null, range.start, range.count) }); return }
    if (mesh.name === 'r1-corner-walls') {
      const size = mesh.geometry.attributes.position.count / mesh.userData.wallIds.length
      mesh.userData.wallIds.forEach((id, index) => obstacles.push({ name: mesh.name, id, bounds: instanceBounds(mesh, null, index * size, size) }))
      return
    }
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++)
      obstacles.push({ name: mesh.name, id: mesh.userData.wallIds?.[instance], bounds: instanceBounds(mesh, instance) })
  })
  const solid = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '吧凳', '咖啡台', '书架', '协作桌', '共享显示站', '弧形接待台', '弧形沙发段', '弧形座段', '植物总成', '树池/花盆', '室外长椅'])
  for (const item of layout.r1.elements) {
    if (!solid.has(item.category)) continue
    const yaw = Math.abs(item.yawDeg % 180) === 90, half = { x: (yaw ? item.widthM : item.lengthM) / 2, z: (yaw ? item.lengthM : item.widthM) / 2 }
    obstacles.push({ name: '登记实体', id: item.id, bounds: new THREE.Box3(new THREE.Vector3(item.xM - 26 - half.x, 0, 18 - item.yM - half.z), new THREE.Vector3(item.xM - 26 + half.x, item.heightM, 18 - item.yM + half.z)) })
  }
  let phases = 0
  for (const leaf of doors.records.filter(row => NEW_DOORS[row.doorId])) {
    const ownFrames = obstacles.filter(row => row.name === 'r1-door-frames' && row.id === leaf.doorId).map(row => row.bounds)
    assert.equal(ownFrames.length, 3, leaf.id)
    for (let sample = 0; sample <= 100; sample++) {
      phases++
      const p = doors.positionAt(leaf, sample / 100)
      const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x, leaf.height / 2, p.z), new THREE.Vector3(leaf.width, leaf.height, leaf.thickness)).expandByScalar(-1e-6)
      for (const obstacle of obstacles) {
        if (!box.intersectsBox(obstacle.bounds)) continue
        assert.ok(insideOwnFrame(box.clone().intersect(obstacle.bounds), ownFrames), `${leaf.id} 相位 ${sample}: ${obstacle.name}/${obstacle.id}`)
      }
    }
  }
  assert.equal(phases, 4 * 101)
  doors.dispose()
}))

test('BW-3 the two rerouted paths pass through the door centres and no route loses its clearance', () => scene(({ layout, collision }) => {
  const doorOf = wallId => Object.keys(NEW_DOORS).find(key => NEW_DOORS[key].wallId === wallId)
  // 只取代理名：碰撞体里挂着整个 THREE 对象，直接丢给 assert 会让失败信息吃光内存。
  const blockedBy = (xM, yM) => collision.hit(xM - 26, 18 - yM)?.group?.name ?? null
  const spans = Object.entries(NEW_WALLS).flatMap(([id, [x0, x1]]) => {
    const [low, high] = OPENING(doorOf(id))
    return [[[x0, BACK_Y], [low, BACK_Y]], [[high, BACK_Y], [x1, BACK_Y]]]
  })
  for (const route of layout.r1.routes) {
    const radius = layout.r1.data.bodyProfiles[route.body_profile].radius_m
    let minimum = Infinity
    walkRoute(route, .05, point => {
      assert.equal(blockedBy(point[0], point[1]), null, `${route.id} @ ${point}`)
      for (const span of spans) minimum = Math.min(minimum, segmentDistance(point, span[0], span[1]))
    })
    assert.ok(minimum >= radius, `${route.id} 与新墙最近距离 ${minimum} < ${radius}`)
  }
  // 穿墙点落在门中心：只看落在新墙 X 跨度里的穿越（区 11 背后的 Y = 9.5 本来就是敞开的）
  for (const [routeId, doorId] of [['Z09', '10-D-002'], ['Z13', '12-D-002']]) {
    const [x0, x1] = NEW_WALLS[NEW_DOORS[doorId].wallId], crossings = []
    for (const route of layout.r1.routes) {
      if (route.id !== routeId) continue
      for (let i = 1; i < route.points_m.length; i++) {
        const a = route.points_m[i - 1], b = route.points_m[i]
        if ((a[1] - BACK_Y) * (b[1] - BACK_Y) >= 0) continue
        const x = a[0] + (b[0] - a[0]) * (BACK_Y - a[1]) / (b[1] - a[1])
        if (x >= x0 && x <= x1) crossings.push(x)
      }
    }
    assert.deepEqual(crossings, [NEW_DOORS[doorId].xM], routeId)
  }
  // 其余 15 条路线不得穿过新墙所在的两段 Y = 9.5
  for (const route of layout.r1.routes) {
    if (['Z09', 'Z13'].includes(route.id)) continue
    for (let i = 1; i < route.points_m.length; i++) {
      const a = route.points_m[i - 1], b = route.points_m[i]
      if ((a[1] - BACK_Y) * (b[1] - BACK_Y) >= 0) continue
      const x = a[0] + (b[0] - a[0]) * (BACK_Y - a[1]) / (b[1] - a[1])
      for (const [x0, x1] of Object.values(NEW_WALLS)) assert.ok(x < x0 || x > x1, `${route.id} 在 ${x} 穿过新墙`)
    }
  }
  // 新墙每 0.25 m 一点：实体段 0 可穿过，门洞内可通行。
  // 碰撞引擎的人物是半径 .22 m 的胶囊，所以门樘两侧 .25 m 的过渡带不参与判定（既不算挡住也不算通行）。
  let solid = 0, open = 0
  for (const [id, [x0, x1]] of Object.entries(NEW_WALLS)) {
    const [low, high] = OPENING(doorOf(id))
    for (let x = x0; x <= x1 + 1e-9; x += .25) {
      const blocked = blockedBy(x, BACK_Y)
      if (x <= low + 1e-9 || x >= high - 1e-9) { solid++; assert.ok(blocked, `${id} 实体段 ${x}`) }
      else if (x > low + .25 && x < high - .25) { open++; assert.equal(blocked, null, `${id} 门洞 ${x}`) }
    }
  }
  assert.equal(solid, 106); assert.equal(open, 12)
}))

test('BW-4 the ledger reaches 44 walls / 88 faces / 15 doors without touching the registered data module', () => scene(({ shell, layout }) => {
  assert.equal(new Set(shell.wallLedger.wallIds).size, 44)
  assert.equal(new Set(shell.wallLedger.faceIds).size, 88)
  assert.equal(new Set(shell.wallLedger.doorIds).size, 15)
  assert.equal(layout.r1.elements.filter(item => item.category === '门扇').length, 30)
  assert.equal(layout.r1.data.doorTargetFrames.length, 30)
  for (const id of Object.keys(NEW_DOORS)) assert.equal(layout.r1.data.doorTargetFrames.filter(frame => frame.door_id === id).length, 2, id)
  // data.js 不改：登记模块的内容哈希（换行归一后）必须保持基线值。
  const source = readFileSync(new URL('../office-r1/data.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), 'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf')
  assert.ok(Object.isFrozen(R1_BACKWALL))
  assert.deepEqual(R1_BACKWALL.walls.map(wall => wall.id), Object.keys(NEW_WALLS))
  assert.deepEqual(R1_BACKWALL.doors.map(door => door.id), Object.keys(NEW_DOORS))
  for (const entry of [...R1_BACKWALL.walls, ...R1_BACKWALL.doors, ...R1_BACKWALL.wallFaces, ...R1_BACKWALL.leaves])
    assert.ok(Object.isFrozen(entry), entry.id)
  assert.equal(R1_BACKWALL.date, '2026-10-29')
  assert.ok(R1_BACKWALL.reason.includes('2026-10-29'))
}))

// ── 补充 R2：大门 11-D-001 的推拉门轨道抬到门楣高度 ──
const GATE = '11-D-001'
const LINTEL_BOTTOM = 3.6          // 栅栏门楣底面（PR #72）
const GATE_LEAF_HEIGHT = 3.5       // 门扇由 2.7 抬到 3.5
const TRACK_CENTRE = 3.56, TRACK_SECTION = .08
const TRACK_X = [-4.94, 8.94], TRACK_Z = [17.8, 17.88]   // 长度与 z 位置相对基线不变
const POST_SIZE = .06, POST_BASE = .3  // 栅栏底座顶
// 顶点是从 Float32 缓冲里读回来的，所以按 0.01 mm 比，而不是机器精度。
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`)

// 轨道尾部实例：records.length * 4 个门扇框之后是每条轨道一个，再之后是托杆。
const gateMetal = (doors, root) => {
  const metal = root.getObjectByName('r1-door-metal'), base = doors.records.length * 4
  const track = [], posts = []
  for (let index = base; index < metal.count; index++) {
    const id = metal.userData.itemIds[index]
    if (id === GATE) track.push(instanceBounds(metal, index))
    else if (typeof id === 'string' && id.startsWith(`${GATE}:track-post`)) posts.push(instanceBounds(metal, index))
  }
  return { metal, track, posts }
}

test('BW-7 the raised gate leaves clear the posts, lintel, fence and the two new track supports at 101 phases', () => scene(({ root, layout, shell }) => {
  const door = layout.r1.data.doors.find(row => row.id === GATE)
  assert.equal(door.heightM, GATE_LEAF_HEIGHT, '门洞总成随门扇抬高，门樘上框才不会卡在 2.7 m')
  const doors = buildR1Doors({ THREE, root, layout })
  root.updateMatrixWorld(true)
  const leaves = doors.records.filter(row => row.doorId === GATE)
  assert.equal(leaves.length, 2)
  for (const leaf of leaves) assert.equal(leaf.height, GATE_LEAF_HEIGHT, leaf.id)
  // 门扇顶与门楣底的间隙 ≥ 0.08 m
  assert.ok(LINTEL_BOTTOM - GATE_LEAF_HEIGHT >= .08 - 1e-9, `门楣间隙 ${LINTEL_BOTTOM - GATE_LEAF_HEIGHT}`)

  // 轨道：中心 3.56、占 3.52–3.60、顶面贴齐门楣底面；截面、长度、z 位置不变。
  const { track, posts } = gateMetal(doors, root)
  assert.equal(track.length, 1)
  const [box] = track
  near((box.min.y + box.max.y) / 2, TRACK_CENTRE); near(box.max.y - box.min.y, TRACK_SECTION)
  near(box.min.y, TRACK_CENTRE - TRACK_SECTION / 2); near(box.max.y, LINTEL_BOTTOM)
  near(box.min.x, TRACK_X[0]); near(box.max.x, TRACK_X[1])
  near(box.min.z, TRACK_Z[0]); near(box.max.z, TRACK_Z[1])

  // 两端各一根 0.06 m 见方的托杆，从栅栏底座顶 0.3 m 顶到轨道底，且都在门柱外侧。
  assert.equal(posts.length, 2, '门柱外侧悬空的轨道两端各一根立杆')
  for (const post of posts) {
    near(post.max.x - post.min.x, POST_SIZE); near(post.max.z - post.min.z, POST_SIZE)
    near(post.min.y, POST_BASE); near(post.max.y, TRACK_CENTRE - TRACK_SECTION / 2)
    assert.ok(post.max.x <= -2 + 1e-9 || post.min.x >= 6 - 1e-9, `立杆 ${post.min.x}..${post.max.x} 进了门洞`)
    assert.ok(post.min.x >= TRACK_X[0] - 1e-9 && post.max.x <= TRACK_X[1] + 1e-9, '立杆要托在轨道下方的跨度里')
  }
  assert.ok(posts[0].min.x < 0 && posts[1].min.x > 0, '左右各一根')

  // 101 个开启相位：门扇与门柱、门楣、栅栏、新立杆的正体积相交为 0。
  const obstacles = posts.map((bounds, index) => ({ name: '轨道托杆', id: `post-${index}`, bounds }))
  const stone = shell.root.getObjectByName('r1-fence-stone')
  for (const row of stone.userData.boxes)
    obstacles.push({ name: '栅栏石作', id: row.id, bounds: new THREE.Box3(new THREE.Vector3(...row.min), new THREE.Vector3(...row.max)) })
  const fenceMetal = shell.root.getObjectByName('r1-fence-metal')
  for (let index = 0; index < fenceMetal.count; index++) obstacles.push({ name: '栅栏金属', id: index, bounds: instanceBounds(fenceMetal, index) })

  let phases = 0, lintelGap = Infinity, behindPillar = Infinity
  const pillars = obstacles.filter(row => row.id?.toString().startsWith('fence-pillar'))
  const lintel = obstacles.find(row => row.id === 'fence-lintel').bounds
  for (const leaf of leaves) {
    for (let sample = 0; sample <= 100; sample++) {
      phases++
      const p = doors.positionAt(leaf, sample / 100)
      const solid = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x, leaf.height / 2, p.z), new THREE.Vector3(leaf.width, leaf.height, leaf.thickness))
      const probe = solid.clone().expandByScalar(-1e-6)
      for (const obstacle of obstacles)
        assert.ok(!probe.intersectsBox(obstacle.bounds), `${leaf.id} 相位 ${sample}: ${obstacle.name}/${obstacle.id}`)
      lintelGap = Math.min(lintelGap, lintel.min.y - solid.max.y)
      // 门扇滑到门柱背后时的 Z 向间隙（裁定 R4 口径 ≥ 30 mm）
      for (const pillar of pillars)
        if (Math.min(solid.max.x, pillar.bounds.max.x) - Math.max(solid.min.x, pillar.bounds.min.x) > .001)
          behindPillar = Math.min(behindPillar, pillar.bounds.min.z - solid.max.z)
    }
  }
  assert.equal(phases, 2 * 101)
  assert.ok(lintelGap >= .08 - 1e-9, `门扇顶与门楣底最小间隙 ${lintelGap}`)
  assert.ok(behindPillar >= .03 - 1e-9, `门扇在门柱背后的 Z 间隙 ${behindPillar}`)
  doors.dispose()
}))

test('BW-9 the fully open gate keeps 3.4 m of headroom and 6.8 m of clear width', () => scene(({ root, layout, shell }) => {
  const doors = buildR1Doors({ THREE, root, layout })
  doors.doors.setAll('open'); doors.onFrame(5); root.updateMatrixWorld(true)
  const { metal, posts } = gateMetal(doors, root)
  const glass = root.getObjectByName('r1-door-glass')

  // 门洞里实际挡人的东西：门柱、门楣、门樘、轨道、托杆，以及停靠好的门扇。
  const blockers = [...posts]
  const stone = shell.root.getObjectByName('r1-fence-stone')
  for (const row of stone.userData.boxes) blockers.push(new THREE.Box3(new THREE.Vector3(...row.min), new THREE.Vector3(...row.max)))
  const frames = shell.root.getObjectByName('r1-door-frames')
  for (let index = 0; index < frames.count; index++) if (frames.userData.wallIds[index] === GATE) blockers.push(instanceBounds(frames, index))
  for (const [index, row] of doors.records.entries()) {
    if (row.doorId !== GATE) continue
    const box = instanceBounds(glass, index)
    for (let part = 0; part < 4; part++) box.union(instanceBounds(metal, index * 4 + part))
    blockers.push(box)
  }
  blockers.push(gateMetal(doors, root).track[0])

  // 净宽：沿门洞中线向两侧推，直到碰到通行高度（0–2.1 m）上的东西。
  const corridorZ = [17.6, 18.5], centre = 2
  let low = -Infinity, high = Infinity
  for (const box of blockers) {
    if (box.min.z > corridorZ[1] || box.max.z < corridorZ[0]) continue
    if (box.min.y > 2.1 || box.max.y < 0) continue
    if (box.max.x <= centre) low = Math.max(low, box.max.x)
    else if (box.min.x >= centre) high = Math.min(high, box.min.x)
  }
  assert.ok(high - low >= 6.8 - 1e-9, `净宽 ${high - low}`)

  // 净高：在净宽范围内，找最低的顶部构件。
  let headroom = Infinity
  for (const box of blockers) {
    if (box.min.z > corridorZ[1] || box.max.z < corridorZ[0]) continue
    if (box.max.x <= low + 1e-9 || box.min.x >= high - 1e-9) continue
    if (box.min.y <= .1) continue
    headroom = Math.min(headroom, box.min.y)
  }
  assert.ok(headroom >= 3.4 - 1e-9, `净高 ${headroom}`)
  assert.ok(Object.isFrozen(R1_GATE) && Object.isFrozen(R1_GATE.posts))
  assert.equal(R1_GATE.doorId, GATE); assert.equal(R1_GATE.heightM, GATE_LEAF_HEIGHT); assert.equal(R1_GATE.date, '2026-10-29')
  doors.dispose()
}))
