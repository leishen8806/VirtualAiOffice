import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createR1Navigation, R1_PUBLIC_TRANSITIONS } from '../office-r1-navigation.js'
import { createR1Director, R1_HISTORY_LIMIT, pushCapped } from '../office-r1-director.js'
import { createR1RuntimeLayout, r1SeatView } from '../office-r1-seating.js'
import { r1ToWorld, R1_BOARD_TRANSITION_OVERRIDES } from '../office-r1-layout.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_DATA } from '../office-r1/data.js'

// OFFICE-R1-MOVEFIX（CMP-835）：A–J 十项走动与入座缺陷的回归测试。
const layout = () => ({ site: { x0: -8, x1: 8, z0: -8, z1: 8 }, regions: [], seats: {}, r1: { workstations: [], elements: [] } })
function box(c, id, x, z, width, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth)); mesh.position.set(x, .5, z); mesh.userData.r1Id = id; c.add(mesh, 'test'); return mesh
}
const view = (name, home) => ({ name, data: { name }, home, char: { group: new THREE.Group(), pose: { sit: 1, phase: 0 } } })
// 家具足迹：矩形按 length×width，圆桌按圆盘，环形吧台按圆环带（包围盒会把中间的空洞也算成实体）。
const footprintGap = (row, p) => {
  const c = r1ToWorld(row.xM, row.yM)
  if (row.geometry?.type === 'annulus_open') {
    const d = Math.hypot(p.x - c.x, p.z - c.z)
    return Math.max(0, Math.max(row.geometry.r0 - d, d - row.geometry.r1))
  }
  if (row.category === '圆桌') return Math.max(0, Math.hypot(p.x - c.x, p.z - c.z) - row.lengthM / 2)
  if (Number(row.yawDeg || 0) !== 0) return Infinity
  return Math.hypot(Math.max(0, Math.abs(p.x - c.x) - row.lengthM / 2), Math.max(0, Math.abs(p.z - c.z) - row.widthM / 2))
}

// 一个工位 A + 一把公共椅；sealed 时把公共椅封进没有门的小屋，approach() 必然失败。
function stage({ sealed = false, publicAt = { x: 4, z: 4 }, extras = [] } = {}) {
  const l = layout(), home = { x: 0, z: 0, yaw: 0 }
  l.seats.A = ['a', 0, -.81, 0, home]
  l.r1.workstations = [{ business_id: 'A', desk_id: 'desk', chair_id: 'chair' }]
  const c = createFurnitureCollision()
  box(c, 'desk', 0, -.81, 1.4, .7)
  const chair = box(c, 'chair', 0, 0, .62, .6)
  // 额外的真实工位（同一排，间距 2.5 m），让"应该被跳过"的判断不会因为没有工位参数而空过。
  const extraHomes = new Map()
  extras.forEach((name, i) => {
    const x = [2.5, -2.5, 5, -5][i]
    const seat = { x, z: 0, yaw: 0 }
    extraHomes.set(name, seat)
    l.seats[name] = ['a', x, -.81, 0, seat]
    l.r1.workstations.push({ business_id: name, desk_id: `desk-${name}`, chair_id: `chair-${name}` })
    box(c, `desk-${name}`, x, -.81, 1.4, .7); box(c, `chair-${name}`, x, 0, .62, .6)
  })
  box(c, 'public-chair', publicAt.x, publicAt.z, .48, .48)
  if (sealed) {
    box(c, 'w-s', publicAt.x, publicAt.z - 1.1, 2.4, .2); box(c, 'w-n', publicAt.x, publicAt.z + 1.1, 2.4, .2)
    box(c, 'w-w', publicAt.x - 1.1, publicAt.z, .2, 2.4); box(c, 'w-e', publicAt.x + 1.1, publicAt.z, .2, 2.4)
  }
  let dx = 0, dz = 0, yaw = 0
  const furniture = {
    chairFacings: new Map([['public-chair', { table: 'public-table', yaw: 0 }]]),
    moveChair(id, x, z, angle) { const changed = x !== dx || z !== dz || angle !== yaw; dx = x; dz = z; yaw = angle; c.poseNavigationBody(chair, home, x, z, angle); return changed },
    chairMotion: () => ({ dx, dz, yaw }),
  }
  const v = view('A', home), views = new Map([['A', v]])
  const director = createR1Director({ views, layout: l, furnitureCollision: c, r1Furniture: furniture, r1Doors: { records: [] } })
  return { l, c, v, views, director, home, furniture, extraHomes }
}
// 起坐翻转计数：sit 从 <0.01 升到 >0.99 记一次。
function flipCounter(v) {
  let low = v.char.pose.sit < .01, flips = 0
  return { tick() { const s = v.char.pose.sit; if (low && s > .99) { flips++; low = false } else if (s < .01) low = true }, get flips() { return flips } }
}

test('A 让行有次数上限：approach 永久失败时放弃这趟、坐回工位并回调 onAbort，不再反复起坐', async () => {
  const { v, director } = stage({ sealed: true })
  await director.ready
  let arrived = 0, aborted = 0
  assert.equal(director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0 }, true, () => { arrived++ }, () => { aborted++ }), true)
  const flips = flipCounter(v)
  for (let i = 0; i < 9000 && v.act; i++) { director.update(1 / 30); flips.tick() }
  assert.equal(v.act, null, '让行若没有上限，这趟出行永远不会结束')
  assert.equal(aborted, 1); assert.equal(arrived, 0)
  assert.ok(flips.flips <= 3, `起坐次数应有上限，实际 ${flips.flips}`)
  assert.equal(v.char.pose.sit, 1); assert.equal(v.char.pose.walk, 0)
  assert.equal(v.r1AwayFromDesk, false); assert.equal(v.r1Position, null); assert.equal(v.r1PublicSeat, null)
  assert.equal(v.char.group.position.x, 0); assert.equal(v.char.group.position.z, 0)
})

test('A 放弃后同一个人仍能接新出行，且日志记下放弃原因与座位 id', async () => {
  const { v, director } = stage({ sealed: true })
  await director.ready
  director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0 }, true, null, null)
  for (let i = 0; i < 9000 && v.act; i++) director.update(1 / 30)
  const abandoned = director.history.filter(row => row.kind === 'abandoned')
  assert.equal(abandoned.length, 1)
  assert.equal(abandoned[0].seat, 'public-chair')
  assert.match(abandoned[0].reason, /approach|plan/)
  assert.equal(director.travel(v, [], v.home, false, null, null), true, '放弃之后这个人必须还能被调度')
})

test('B 各阶段有停滞超时：exit 被同事堵死时不再无限期等待', async () => {
  const { v, views, director } = stage()
  await director.ready
  let aborted = 0
  assert.equal(director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0 }, true, null, () => { aborted++ }), true)
  for (let i = 0; i < 300 && v.act?.phase !== 'exit'; i++) director.update(1 / 30)
  assert.equal(v.act.phase, 'exit', '应先进入 exit 阶段')
  const exit = director.navigation.parameters.get('A').exit
  views.set('blocker', view('blocker', { x: exit.x, z: exit.z })) // 同事站死在 exit 上
  let stalled = 0
  for (let i = 0; i < 1200 && v.act; i++) { director.update(1 / 30); if (v.act) stalled++ }
  assert.ok(stalled < 1200, 'exit 阶段没有超时，人永远卡在 act.t -= dt')
  assert.equal(v.act, null); assert.equal(aborted, 1)
  assert.equal(v.char.pose.walk, 0, '提前返回的分支必须把 pose.walk 清零')
  assert.equal(v.char.pose.sit, 1); assert.equal(v.r1AwayFromDesk, false)
})

test('B destination-sit 被堵死时超时回工位坐好', async () => {
  const { v, views, director } = stage()
  await director.ready
  assert.equal(director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0 }, true, null, null), true)
  let reached = false
  for (let i = 0; i < 3000 && !reached; i++) { director.update(1 / 30); reached = v.act?.phase === 'destination-sit' }
  assert.equal(reached, true, '应先走到 destination-sit 阶段')
  views.set('blocker', view('blocker', { x: 4, z: 4 })) // 坐在目标座位上不走
  for (let i = 0; i < 1200 && v.act; i++) director.update(1 / 30)
  assert.equal(v.act, null, 'destination-sit 阶段没有超时（Q-V1 实测卡 45 秒）')
  assert.equal(v.char.pose.walk, 0)
})

test('B 等聊天对方走过来不算停滞：对方还在路上就不能把这趟聊天掐掉', async () => {
  // 实机 60 分钟跑出来的回归：聊天发起方先到，站在原地等对方穿过办公室，
  // 这个等待被当成停滞，10 秒就放弃了（一小时掐掉 4 场聊天）。对方只要还在正常赶路就不该算停滞。
  const l = { site: { x0: -30, x1: 30, z0: -30, z1: 30 }, regions: [], seats: {}, r1: { workstations: [], elements: [] } }
  const c = createFurnitureCollision()
  const homes = { A: { x: 0, z: 0, yaw: 0 }, B: { x: 24, z: 0, yaw: 0 } } // 24 m 开外，走过来远超 10 秒
  for (const [name, home] of Object.entries(homes)) {
    l.seats[name] = ['a', home.x, -.81, 0, home]
    l.r1.workstations.push({ business_id: name, desk_id: `desk-${name}`, chair_id: `chair-${name}` })
    box(c, `desk-${name}`, home.x, -.81, 1.4, .7); box(c, `chair-${name}`, home.x, 0, .62, .6)
  }
  const motions = new Map([['chair-A', { dx: 0, dz: 0, yaw: 0 }], ['chair-B', { dx: 0, dz: 0, yaw: 0 }]])
  const furniture = {
    chairFacings: new Map(),
    moveChair(id, dx, dz, yaw) {
      const old = motions.get(id), home = id === 'chair-A' ? homes.A : homes.B
      motions.set(id, { dx, dz, yaw }); c.poseNavigationBody(c.navigationBodies().find(b => b.group.userData.r1Id === id)?.group ?? null, home, dx, dz, yaw)
      return old.dx !== dx || old.dz !== dz || old.yaw !== yaw
    },
    chairMotion: id => motions.get(id),
  }
  const a = view('A', homes.A), b = view('B', homes.B)
  const views = new Map([['A', a], ['B', b]])
  const director = createR1Director({ views, layout: l, furnitureCollision: c, r1Furniture: furniture, r1Doors: { records: [] } })
  await director.ready
  director.enqueue({ from: 'A', to: 'B', text: '你好' })
  assert.ok(a.act && b.act, '双方都应被派出去聊天')
  let talked = false
  for (let i = 0; i < 9000 && !talked; i++) {
    director.update(1 / 30)
    if (['chat', 'chat-wait'].includes(a.act?.phase) && ['chat', 'chat-wait'].includes(b.act?.phase)) talked = true
    if (!a.act && !b.act) break
  }
  const abandoned = director.history.filter(h => h.kind === 'abandoned')
  assert.deepEqual(abandoned.map(h => `${h.name}:${h.reason}`), [], '对方还在路上，不得把聊天当成停滞放弃')
  assert.equal(talked, true, '双方应真的聊上')
})

test('B 共用进出点：start() 的通道检查把进出点也算上，不让两人互相卡死', async () => {
  const { v, views, director } = stage()
  await director.ready
  const pair = [['12-SF-001', '12-SF-002'], ['12-SF-003', '12-SF-004']]
  for (const [held, wanted] of pair) {
    const approachHeld = R1_PUBLIC_TRANSITIONS[held].at(-1), approachWanted = R1_PUBLIC_TRANSITIONS[wanted].at(-1)
    assert.ok(Math.hypot(approachHeld.x - approachWanted.x, approachHeld.z - approachWanted.z) < .5, `${held} 与 ${wanted} 共用进出点`)
    const other = view('other', { x: 0, z: 6 })
    other.r1PublicSeat = { path: R1_PUBLIC_TRANSITIONS[held], seat: { id: held }, approach: approachHeld }
    views.set('other', other)
    const seat = { id: wanted, x: R1_PUBLIC_TRANSITIONS[wanted][0].x, z: R1_PUBLIC_TRANSITIONS[wanted][0].z, yaw: 0 }
    assert.equal(director.travel(v, [], seat, true, null, null), false, `${held} 被占用时不得再派人去 ${wanted}`)
    views.delete('other')
  }
})

test('C 欢呼鼓掌跳过坐在公共座位、离座与正在走动的人，并且每人有冷却', async () => {
  const { v, views, director, extraHomes } = stage({ extras: ['P', 'L', 'N'] })
  await director.ready
  const onPublic = view('P', extraHomes.get('P')); onPublic.mode = 'idle'; onPublic.r1PublicSeat = { seat: { id: 'public-chair' }, path: [] }
  const lounging = view('L', extraHomes.get('L')); lounging.mode = 'idle'; lounging.lounging = { id: 'x' }
  const neighbour = view('N', extraHomes.get('N')); neighbour.mode = 'idle'
  for (const other of [onPublic, lounging, neighbour]) views.set(other.name, other)
  const random = Math.random; Math.random = () => 0
  try {
    director.celebrate(v)
    assert.equal(onPublic.act ?? null, null, '坐在公共座位的人不得被拉回工位鼓掌')
    assert.equal(lounging.act ?? null, null, '休闲区的人不得被拉回工位鼓掌')
    assert.notEqual(neighbour.act ?? null, null, '同区真正坐在工位上的空闲同事应会鼓掌')
    // 同一位同事换成离座状态后也要跳过。
    director.clear(); neighbour.r1AwayFromDesk = true
    director.celebrate(v)
    assert.equal(neighbour.act ?? null, null, '离座的人不得被拉回工位鼓掌')
    neighbour.r1AwayFromDesk = false
    director.clear(); director.celebrate(v)
    assert.equal(neighbour.act ?? null, null, '鼓掌必须有冷却，完成事件密集时不得反复起立')
  } finally { Math.random = random }
})

test('D 区 10 五张吧凳从吧凳背后进出，不穿咖啡台，并登记在冻结偏离表里', () => {
  const stools = ['10-CH-001', '10-CH-002', '10-CH-003', '10-CH-004', '10-CH-005']
  const rowOf = id => R1_DATA.elements.find(row => row.id === id)
  const counter = rowOf('10-CT-001')
  assert.equal(counter.yawDeg, 0)
  const counterCentre = r1ToWorld(counter.xM, counter.yM)
  const halfX = counter.lengthM / 2, halfZ = counter.widthM / 2
  const clearance = p => Math.hypot(Math.max(0, Math.abs(p.x - counterCentre.x) - halfX), Math.max(0, Math.abs(p.z - counterCentre.z) - halfZ))
  assert.ok(Object.isFrozen(R1_BOARD_TRANSITION_OVERRIDES))
  for (const id of stools) {
    const path = R1_PUBLIC_TRANSITIONS[id], seat = path[0], approach = path.at(-1)
    const stool = rowOf(id), world = r1ToWorld(stool.xM, stool.yM)
    assert.equal(seat.x, world.x); assert.equal(seat.z, world.z)
    // 咖啡台在吧凳的 −Z 一侧：进出点必须落在吧凳的另一侧（+Z），也就是台面背后。
    assert.ok(approach.z > seat.z, `${id} 仍从咖啡台一侧进出（approach.z=${approach.z}）`)
    for (let i = 0; i <= 200; i++) {
      const p = { x: seat.x + (approach.x - seat.x) * i / 200, z: seat.z + (approach.z - seat.z) * i / 200 }
      assert.ok(clearance(p) >= .25 - 1e-9, `${id} 进出路径距咖啡台只有 ${clearance(p).toFixed(3)} m，小于人体半径 0.25 m`)
    }
    const entry = R1_BOARD_TRANSITION_OVERRIDES.find(row => row.id === id)
    assert.ok(entry, `${id} 的进出点变化必须写入冻结偏离表`)
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(entry.reason.length > 10)
    assert.deepEqual(entry.to, [approach.x, approach.z])
    assert.deepEqual(entry.from, [seat.x, 10.9])
  }
})

test('D 所有公共座位的进出路径对台面类家具保持 0.25 m 人体净空', () => {
  const TABLES = new Set(['咖啡台', '会议桌', '圆桌', '协作桌', '办公桌', '环形吧台'])
  const tables = R1_DATA.elements.filter(row => TABLES.has(row.category))
  const violations = new Set()
  for (const [id, path] of Object.entries(R1_PUBLIC_TRANSITIONS)) {
    for (let s = 1; s < path.length; s++) for (let i = 0; i <= 160; i++) {
      const a = path[s - 1], b = path[s], p = { x: a.x + (b.x - a.x) * i / 160, z: a.z + (b.z - a.z) * i / 160 }
      for (const row of tables) {
        const gap = footprintGap(row, p)
        if (gap < .25 - 1e-9) violations.add(`${id} 距 ${row.id}（${row.category}）只有 ${gap.toFixed(3)} m`)
      }
    }
  }
  assert.deepEqual([...violations], [])
})

test('E 公共座位把实测座面高度交给坐高贴合，起身后清掉', async () => {
  const { v, director } = stage()
  await director.ready
  assert.equal(v.char.pose.r1PublicSeatY ?? null, null)
  let arrived = false
  // 真实调用方传的是 LOUNGE_SEATS 条目，带登记的座面高度（吧凳 0.75 m）。
  director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0, seatY: .75 }, true, () => { arrived = true }, null)
  for (let i = 0; i < 3000 && !arrived; i++) director.update(1 / 30)
  assert.equal(arrived, true)
  assert.equal(v.char.pose.r1PublicSeatY, .75, '坐高贴合必须拿到这张座位的座面高度')
  let returned = false
  director.travel(v, [], v.home, false, () => { returned = true }, null)
  for (let i = 0; i < 3000 && !returned; i++) director.update(1 / 30)
  assert.equal(returned, true)
  assert.equal(v.char.pose.r1PublicSeatY ?? null, null, '回工位后必须清掉公共座面高度')
  // 没有登记座面高度的座位（弧形沙发段 / 室外长椅）一律不抬：它们的登记 0.85 m 是整体高，
  // 不是座面，照着抬会把人架到靠背顶上。保持原样，另开后续任务补登记座面。
  let again = false
  director.travel(v, [], { id: 'public-chair', x: 4, z: 4, yaw: 0 }, true, () => { again = true }, null)
  for (let i = 0; i < 3000 && !again; i++) director.update(1 / 30)
  assert.equal(again, true)
  assert.equal(v.char.pose.r1PublicSeatY ?? null, null, '没有登记座面高度就不得抬人')
})

test('E 沙发与长椅没有登记座面，不得按整体高度抬人', () => {
  const nav = createR1Navigation(createOfficeR1Layout())
  const lounge = nav.LOUNGE_SEATS.filter(s => ['弧形沙发段', '室外长椅'].includes(s.category))
  assert.ok(lounge.length >= 4)
  for (const seat of lounge) assert.equal(seat.seatY, null, `${seat.id} 的 0.85 m 是整体高，不是座面`)
})

test('E 每张椅子 / 吧凳都有登记的座面高度：吧凳 0.75 m、椅子 0.45 m', () => {
  const nav = createR1Navigation(createOfficeR1Layout())
  const missing = [], wrong = []
  for (const seat of nav.LOUNGE_SEATS) {
    if (!['椅子', '吧凳'].includes(seat.category)) continue
    if (!Number.isFinite(seat.seatY)) { missing.push(seat.id); continue }
    const wanted = seat.category === '吧凳' ? .75 : .45
    if (Math.abs(seat.seatY - wanted) > 1e-6) wrong.push(`${seat.id} ${seat.category} ${seat.seatY}`)
  }
  assert.deepEqual(missing, [], '椅子 / 吧凳都应能从椅座子件得出座面高度')
  assert.deepEqual(wrong, [])
  // 区 10 的五张吧凳正是董事会截图里"坐进高桌"的那几张。
  for (const id of ['10-CH-001', '10-CH-002', '10-CH-003', '10-CH-004', '10-CH-005']) {
    assert.equal(nav.LOUNGE_SEATS.find(s => s.id === id).seatY, .75, id)
  }
})

test('E 坐高贴合在公共座位上按座面高抬骨盆，不再沿用工位椅高度', () => {
  const source = fs.readFileSync(new URL('../people.js', import.meta.url), 'utf8')
  assert.match(source, /r1PublicSeatY/, 'people.js 的坐高贴合必须消费公共座面高度')
  const fit = source.slice(source.indexOf('export function fitR1SeatedPerson'))
  const guard = fit.slice(0, fit.indexOf('report.active = true'))
  assert.match(guard, /r1PublicSeatY/, 'r1AtDesk === false 的分支必须先处理公共座位，再整体跳过')
})

test('F 登记朝向：椅子与吧凳坐下后膝盖指向最近的桌台，而不是朝外', () => {
  const real = createOfficeR1Layout()
  const nav = createR1Navigation(real)
  const TABLES = new Set(['咖啡台', '会议桌', '圆桌', '协作桌', '办公桌', '环形吧台', '弧形接待台'])
  const tables = real.r1.elements.filter(row => TABLES.has(row.category))
  assert.ok(nav.LOUNGE_SEATS.length >= 50)
  const wrong = []
  for (const seat of nav.LOUNGE_SEATS) {
    if (seat.category === '弧形沙发段' || seat.category === '室外长椅') continue
    // 最近的桌台按"离台面最近"算（7.2 m 长的咖啡台，坐的是离你最近的那一段台面，不是它的中心）。
    const nearest = tables.filter(t => t.id !== seat.id).map(row => ({ row, gap: footprintGap(row, seat) })).sort((a, b) => a.gap - b.gap)[0]
    const centre = r1ToWorld(nearest.row.xM, nearest.row.yM)
    const toTable = { x: centre.x - seat.x, z: centre.z - seat.z }, length = Math.hypot(toTable.x, toTable.z)
    // 坐姿朝向 yaw 的正面方向：forward = (−sin yaw, −cos yaw)。
    const forward = { x: -Math.sin(seat.yaw), z: -Math.cos(seat.yaw) }
    const dot = (forward.x * toTable.x + forward.z * toTable.z) / (length || 1)
    if (dot <= 0) wrong.push(`${seat.id} 背对 ${nearest.row.id}`)
  }
  assert.deepEqual(wrong, [])
})

test('G 自动分座一律用 r1ToWorld 取整，全部空登记桌都能出现人物', () => {
  const real = createOfficeR1Layout()
  const runtime = createR1RuntimeLayout(real)
  const used = new Set(real.r1.workstations.map(w => w.desk_id))
  const reserved = new Set((real.r1.reservedSeats || []).map(seat => seat.desk))
  const vacant = real.r1.elements.filter(e => e.category === '办公桌' && ['04', '06', '08'].includes(e.regionId)
    && !used.has(e.id) && !reserved.has(e.id) && real.r1.elements.some(c => c.id === e.id.replace('-T-', '-CH-')))
  assert.ok(vacant.length >= 10, `应有多张空登记桌，实际 ${vacant.length}`)
  // 分组规则按名字匹配分区：08 → drlife，04 → product，06 → ops；每区按空桌数各要一批人。
  const prefix = { '08': 'GoAuto', '04': 'LeadAuto', '06': 'QAAuto' }
  const agents = []
  for (const zone of ['04', '06', '08']) {
    const count = vacant.filter(e => e.regionId === zone).length
    for (let i = 0; i < count; i++) agents.push({ name: `${prefix[zone]}${i}`, title: 'auto' })
  }
  const added = runtime.assignAgents(agents)
  assert.equal(added.length, vacant.length, '每张空登记桌都应能分出一位')
  for (const station of added) {
    const desk = real.r1.elements.find(e => e.id === station.desk_id), chair = real.r1.elements.find(e => e.id === station.chair_id)
    const deskWorld = r1ToWorld(desk.xM, desk.yM), chairWorld = r1ToWorld(chair.xM, chair.yM)
    const seat = runtime.seats[station.business_id]
    assert.equal(seat[1], deskWorld.x, `${station.business_id} 的桌 x 必须与 r1ToWorld 完全一致`)
    assert.equal(seat[2], deskWorld.z, `${station.business_id} 的桌 z 必须与 r1ToWorld 完全一致`)
    assert.equal(seat[4].x, chairWorld.x, `${station.business_id} 的 home x 必须与 r1ToWorld 完全一致`)
    assert.equal(seat[4].z, chairWorld.z, `${station.business_id} 的 home z 必须与 r1ToWorld 完全一致`)
  }
})

test('H 不在前台上班也要复位离座状态，不把人算成永久离座', () => {
  const v = { char: { pose: { sit: 0, walk: 1, lounge: 1, r1AtDesk: false } }, home: { x: 1, z: 2, yaw: .5 }, r1AwayFromDesk: true, r1Position: { x: 9, z: 9 }, r1PublicSeat: { seat: {} }, r1Standing: true, lounging: { id: 'x' } }
  r1SeatView(v)
  assert.equal(v.r1AwayFromDesk, false); assert.equal(v.r1Position, null)
  assert.equal(v.r1PublicSeat, null); assert.equal(v.r1Standing, false)
  assert.equal(v.char.pose.r1AtDesk, true); assert.equal(v.char.pose.walk, 0); assert.equal(v.char.pose.lounge, 0)
  assert.equal(v.char.pose.r1PublicSeatY ?? null, null)
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(source, /r1SeatView/, 'app.js 的 placeSeated / hideAway 必须统一复位离座状态')
  const placeSeated = source.slice(source.indexOf('function placeSeated'), source.indexOf('function placeSeated') + 400)
  assert.match(placeSeated, /r1SeatView/)
  const hideAway = source.slice(source.indexOf('function hideAway'), source.indexOf('function hideAway') + 400)
  assert.match(hideAway, /r1SeatView/)
})

test('I enqueue 在导航就绪前只冒气泡，不抛错也不丢事件', () => {
  const fresh = stage() // 故意不 await director.ready
  fresh.views.set('B', view('B', { x: 2, z: 0 }))
  assert.equal(fresh.director.navigation.prepared(), false, '导航尚未 prepare')
  assert.doesNotThrow(() => fresh.director.enqueue({ from: 'A', to: 'B', text: '你好' }))
})

test('I 某个自动座位没有出口时只跳过那一位，全场走动不停摆', async () => {
  const l = layout(), c = createFurnitureCollision()
  const good = { x: 0, z: 0, yaw: 0 }
  l.seats.A = ['a', 0, -.81, 0, good]
  l.r1.workstations = [{ business_id: 'A', desk_id: 'desk', chair_id: 'chair' }]
  box(c, 'desk', 0, -.81, 1.4, .7); const chair = box(c, 'chair', 0, 0, .62, .6)
  // B 的椅子四面封死，没有 1.2 m / 60° 内的出口。
  const bad = { x: 5, z: 5, yaw: 0 }
  l.seats.B = ['a', 5, 4.19, 0, bad]
  l.r1.workstations.push({ business_id: 'B', desk_id: 'desk-b', chair_id: 'chair-b' })
  box(c, 'desk-b', 5, 4.19, 1.4, .7); box(c, 'chair-b', 5, 5, .62, .6)
  box(c, 'cage-s', 5, 5.6, 1.6, .2); box(c, 'cage-w', 4.4, 5, .2, 1.4); box(c, 'cage-e', 5.6, 5, .2, 1.4)
  let dx = 0, dz = 0, yaw = 0
  const furniture = { chairFacings: new Map(), moveChair(id, x, z, angle) { const changed = x !== dx || z !== dz || angle !== yaw; dx = x; dz = z; yaw = angle; c.poseNavigationBody(chair, good, x, z, angle); return changed }, chairMotion: () => ({ dx, dz, yaw }) }
  const a = view('A', good), b = view('B', bad)
  const views = new Map([['A', a], ['B', b]])
  const director = createR1Director({ views, layout: l, furnitureCollision: c, r1Furniture: furniture, r1Doors: { records: [] } })
  await director.ready
  assert.equal(director.stats().prepared, true, '一个座位没有出口不得让整场导航失败')
  assert.equal(director.stats().preparationError, null)
  assert.deepEqual(director.navigation.preparationInfo().skippedStations.map(row => row.name), ['B'])
  assert.match(director.navigation.preparationInfo().skippedStations[0].reason, /exit/)
  assert.equal(director.travel(b, [], { x: 1, z: 1 }, true, null, null), false, '没有出口的那一位只是不动')
  assert.equal(director.travel(a, [], { x: -2, z: 2 }, true, null, null), true, '其余人照常走动')
})

test('I history 有上限，不随运行时间无限增长', () => {
  assert.ok(R1_HISTORY_LIMIT > 0 && R1_HISTORY_LIMIT <= 1000)
  const list = []
  for (let i = 0; i < R1_HISTORY_LIMIT + 25; i++) pushCapped(list, { i }, R1_HISTORY_LIMIT)
  assert.equal(list.length, R1_HISTORY_LIMIT)
  assert.equal(list[0].i, 25); assert.equal(list.at(-1).i, R1_HISTORY_LIMIT + 24)
})

test('I 形象替换循环跳过正在走动或坐公共座位的人；极速模式也给新同事分座', () => {
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(source, /const busy = v => v\.act \|\| v\.r1PublicSeat \|\| v\.r1AwayFromDesk/, '替换循环要能判断谁正在走动')
  const loop = source.slice(source.indexOf('if (v.char.avatar) continue'), source.indexOf('if (v.char.avatar) continue') + 200)
  assert.match(loop, /if \(busy\(v\)\) \{ deferred\.add\(v\)/, '替换循环不得把正在走动的人瞬移回工位')
  assert.match(source, /deferred\.size[\s\S]{0,200}if \(!busy\(v\)\)/, '等他们回到工位后还要补上替换，不能永远留着占位人物')
  // 极速模式没有走动导演：不等导航就绪，直接按数据分座。
  assert.match(source, /const walking = director\.r1 === true/, '极速模式也要给新同事分座')
  assert.match(source, /if \(walking && \(!director\.stats\(\)\.prepared/)
})

test('J 改名接口拒绝与现有显示名重复，并且全体 agent 显示名唯一', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const extracted = source.match(/function nameConflict\(names, key, name\) \{[\s\S]*?\n\}/)
  assert.ok(extracted, 'server.mjs 缺少 nameConflict 查重函数')
  const nameConflict = new Function(`${extracted[0]}; return nameConflict`)()
  const names = { 'aaaaaaaa-0000-4000-8000-000000000001': 'R1', 'aaaaaaaa-0000-4000-8000-000000000002': 'Lead' }
  assert.equal(nameConflict(names, 'aaaaaaaa-0000-4000-8000-000000000003', 'R1'), 'aaaaaaaa-0000-4000-8000-000000000001')
  assert.equal(nameConflict(names, 'aaaaaaaa-0000-4000-8000-000000000003', ' r1 '), 'aaaaaaaa-0000-4000-8000-000000000001', '查重不分大小写、忽略首尾空格')
  assert.equal(nameConflict(names, 'aaaaaaaa-0000-4000-8000-000000000001', 'R1'), null, '改成自己原来的名字不算重复')
  assert.equal(nameConflict(names, 'aaaaaaaa-0000-4000-8000-000000000003', 'R2'), null)
  assert.match(source, /nameConflict\(names, key, name\)/, 'rename 分支必须调用查重')
  assert.match(source, /need\(!nameConflict/, '重复时必须拒绝')
})
