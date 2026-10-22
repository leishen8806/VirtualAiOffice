import test from 'node:test'
import assert from 'node:assert/strict'
import { CAT_DESTINATIONS, aimCat, catDeskAnchor, catDeskTopPoint, catJumpSegmentSafe, catRoamPoints, catRoute, catSegmentSafe, classifyJump, createCatDiagBuffer, createCatPlayState, isCatGroundPoint, planHop, toggleCatPlay, updateCatPlay } from '../cat-play.js'
import { SEATS, workHome } from '../office-layout.js'

const homes = Object.entries(SEATS).map(([name, seat]) => ({ name, home: workHome(seat) }))
const starts = [...catRoamPoints(), ...Object.values(CAT_DESTINATIONS)]

test('睡桌调用形态对全部工位可达，省略桌位语义也绝不返回空数组', () => {
  for (const start of starts) for (const { name, home } of homes) {
    const target = catDeskAnchor(home)
    const route = catRoute(start, target, { toDeskHome: home })
    assert.ok(route?.length, `${name}: ${JSON.stringify(start)}`)
    assert.ok(Math.hypot(route.at(-1).x - target.x, route.at(-1).z - target.z) <= 0.3, name)
    const withoutHome = catRoute(start, target)
    assert.ok(withoutHome === null || withoutHome.length > 0, `${name} 返回了空数组`)
  }
  for (const name of ['UIUX', 'SecurityReviewer', 'DBEngineer', 'Localizer']) {
    const home = workHome(SEATS[name])
    assert.ok(catRoute(CAT_DESTINATIONS.foyer, catDeskAnchor(home), { toDeskHome: home })?.length, name)
  }
})

test('固定出生点被前台覆盖时只在 0.85 米内恢复到最近可走地面', () => {
  const spawn = { x: 2, z: 4 }, route = catRoute(spawn, CAT_DESTINATIONS.foyer)
  assert.equal(isCatGroundPoint(spawn), false)
  assert.ok(route?.length)
  assert.equal(isCatGroundPoint(route[0]), true)
  assert.ok(Math.hypot(route[0].x - spawn.x, route[0].z - spawn.z) <= 0.85)
})

test('下桌被新计划打断后会从最近桌位恢复房间出口语义', () => {
  const interrupted = { x: 19.966, z: 2.683 }
  const route = catRoute(interrupted, CAT_DESTINATIONS.lounge)
  assert.ok(route?.length)
  assert.ok(Math.hypot(route.at(-1).x - CAT_DESTINATIONS.lounge.x, route.at(-1).z - CAT_DESTINATIONS.lounge.z) <= 0.3)
})

test('跳跃计划限制距离、速度并在不安全时先走路', () => {
  const direct = planHop({ x: 0, z: 0 }, { x: 0.8, z: 0 }, { segmentSafe: () => true })
  assert.equal(direct.mode, 'hop')
  assert.ok(direct.dur >= Math.max(0.45, 0.8 / 2.5))

  const unsafe = planHop({ x: 0, z: 0 }, { x: 0.5, z: 0 }, { segmentSafe: () => false })
  assert.equal(unsafe.mode, 'walk')
  assert.notEqual(unsafe.walkTo, unsafe.to)

  for (const { home } of homes) {
    const from = catDeskAnchor(home), to = catDeskTopPoint(home)
    for (const [a, b] of [[from, to], [to, from]]) {
      const plan = planHop(a, b, { segmentSafe: catJumpSegmentSafe })
      assert.equal(plan.mode, 'walk')
      assert.ok(Math.hypot(plan.jumpFrom.x - b.x, plan.jumpFrom.z - b.z) <= 1.000001)
      assert.equal(isCatGroundPoint(plan.walkTo), true)
      assert.equal(isCatGroundPoint(plan.landAt), true)
      if (isCatGroundPoint(a)) assert.ok(catRoute(a, plan.walkTo)?.length)
      assert.equal(catJumpSegmentSafe(plan.jumpFrom, b), true)
      assert.ok(plan.dur >= Math.max(0.45, Math.hypot(plan.jumpFrom.x - b.x, plan.jumpFrom.z - b.z) / 2.5))
    }
  }
  for (const to of [CAT_DESTINATIONS.lounge, CAT_DESTINATIONS.rearWindow]) {
    const plan = planHop(CAT_DESTINATIONS.foyer, to, { segmentSafe: catSegmentSafe })
    assert.equal(plan.mode, 'walk')
  }
})

test('单帧位移分类覆盖首帧、走路、跳跃、异常和 dt=0', () => {
  assert.equal(classifyJump(null, { x: 0, y: 0, z: 0 }, { dt: 0.1 }).kind, 'first')
  assert.equal(classifyJump({ x: 0, y: 0, z: 0 }, { x: 0.075, y: 0, z: 0 }, { dt: 0.1 }).kind, 'normal')
  assert.equal(classifyJump({ x: 0, y: 0, z: 0 }, { x: 0.4, y: 0, z: 0 }, { dt: 0.1 }).kind, 'hop')
  assert.equal(classifyJump({ x: 0, y: 0, z: 0 }, { x: 0.61, y: 0, z: 0 }, { dt: 0.1 }).kind, 'anomaly')
  assert.equal(classifyJump({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { dt: 0 }).kind, 'still')
})

test('诊断缓冲限长、返回拷贝、可清空、告警限流且去除同事名字', () => {
  let now = 1000
  const warnings = []
  const diag = createCatDiagBuffer(2, { now: () => now, warn: (line) => warnings.push(line) })
  diag.record({ reason: 'route_empty', why: '去找 Alice', from: { x: 0, y: 0, z: 0 } })
  now += 100
  diag.record({ reason: 'route_empty', why: '在 Bob 的桌上睡觉' })
  assert.equal(warnings.length, 1)
  now += 10001
  diag.record({ reason: 'route_empty', why: '蹭 Carol' })
  assert.equal(warnings.length, 2)
  const copy = diag.list()
  assert.equal(copy.length, 2)
  assert.ok(copy.every((x) => !JSON.stringify(x).match(/Alice|Bob|Carol/)))
  copy[0].reason = 'changed'
  assert.notEqual(diag.list()[0].reason, 'changed')
  diag.clear()
  assert.deepEqual(diag.list(), [])
})

test('跨房间路线只走小步，跳桌段水平位移也不超过每步 0.35 米', () => {
  const fromHome = workHome(SEATS.SecurityReviewer), toHome = workHome(SEATS.DBEngineer)
  const from = catDeskAnchor(fromHome), to = catDeskAnchor(toHome)
  const route = catRoute(from, to, { fromDeskHome: fromHome, toDeskHome: toHome })
  assert.ok(route?.length)
  let p = { ...from }, max = 0
  for (const waypoint of route) while (Math.hypot(waypoint.x - p.x, waypoint.z - p.z) > 1e-9) {
    const dx = waypoint.x - p.x, dz = waypoint.z - p.z, d = Math.hypot(dx, dz), step = Math.min(0.075, d)
    const next = { x: p.x + dx / d * step, z: p.z + dz / d * step }
    max = Math.max(max, Math.hypot(next.x - p.x, next.z - p.z)); p = next
  }
  const hop = planHop(to, catDeskTopPoint(toHome), { segmentSafe: catSegmentSafe })
  const jumpDist = Math.hypot(hop.to.x - hop.jumpFrom.x, hop.to.z - hop.jumpFrom.z)
  const frames = Math.ceil(hop.dur / 0.1)
  max = Math.max(max, jumpDist / frames)
  assert.ok(max <= 0.35, max)
})

test('逗猫遇到不可达路线时停在原地而不是抛错', () => {
  const state = createCatPlayState()
  toggleCatPlay(state, true, 0); aimCat(state, CAT_DESTINATIONS.foyer, 0)
  const position = { x: 999, y: 0, z: 999 }
  const result = updateCatPlay(state, { now: 1, dt: 0.1, position })
  assert.equal(result.unreachable, true)
  assert.deepEqual(result.position, position)
})
