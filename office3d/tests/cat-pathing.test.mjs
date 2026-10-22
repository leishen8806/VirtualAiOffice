import test from 'node:test'
import assert from 'node:assert/strict'
import { ENTRANCE, OFFICE_ROOMS, SEATS, workHome } from '../office-layout.js'
import { CAT_DESTINATIONS, catDeskAnchor, catDeskTopPoint, catRoamPoints, catRoute, catSegmentSafe, isCatGroundPoint } from '../cat-play.js'

const homes = Object.values(SEATS).map(workHome)
const destinations = [...Object.values(CAT_DESTINATIONS), ...catRoamPoints()]
const segments = (start, route) => route.map((end, i) => [i ? route[i - 1] : start, end])
const violations = (start, route) => segments(start, route).filter(([a, b]) => !catSegmentSafe(a, b))

test('公共目的地和随机溜达点均合法', () => {
  assert.ok(catRoamPoints().length >= OFFICE_ROOMS.length + 4)
  for (const p of destinations) assert.equal(isCatGroundPoint(p), true, JSON.stringify(p))
})

test('当前路线从前厅、走廊和每个桌边到所有目的地均不穿墙或保守家具盒', () => {
  const starts = [ENTRANCE.inner, { x: 2, z: -2 }, ...homes.map(catDeskAnchor)]
  for (const start of starts) {
    const home = homes.find(h => catDeskAnchor(h).x === start.x && catDeskAnchor(h).z === start.z)
    for (const target of destinations) {
      const route = catRoute(start, target, { fromDeskHome: home || null })
      assert.ok(route.length || Math.hypot(start.x - target.x, start.z - target.z) < 0.03); assert.equal(violations(start, route).length, 0, `${JSON.stringify(start)} -> ${JSON.stringify(target)} ${JSON.stringify(route)}`)
    }
    for (const targetHome of homes) {
      const target = catDeskAnchor(targetHome), route = catRoute(start, target, { fromDeskHome: home || null, toDeskHome: targetHome })
      assert.ok(route.length); assert.equal(violations(start, route).length, 0, `${JSON.stringify(start)} -> desk ${JSON.stringify(targetHome)}`)
    }
  }
})

test('旧走廊坐标对同一目的地确实产生穿墙或穿家具线段', () => {
  const left = [-4.4, 2.4, 8.3], right = [-2, 5.2, 10.6]
  const lane = p => (p.x > 6 ? right : left).reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a)
  const oldRoute = (from, to) => [{ x: from.x, z: lane(from) }, { x: 4.5, z: lane(from) }, { x: 4.5, z: lane(to) }, { x: to.x, z: lane(to) }, { ...to }]
  const count = destinations.reduce((n, target) => n + violations(ENTRANCE.inner, oldRoute(ENTRANCE.inner, target)).length, 0)
  assert.ok(count > 0, `旧实现违规段数应 > 0，实际 ${count}`)
})

test('固定种子抽取 50 次睡桌往返，地面路线全部合法', () => {
  let seed = 0x21cafe
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000)
  for (let i = 0; i < 50; i++) {
    const home = homes[Math.floor(random() * homes.length)], anchor = catDeskAnchor(home)
    const inbound = catRoute(ENTRANCE.inner, anchor, { toDeskHome: home })
    const outbound = catRoute(anchor, CAT_DESTINATIONS.plaza, { fromDeskHome: home })
    assert.equal(violations(ENTRANCE.inner, inbound).length, 0, `in ${i}`)
    assert.equal(violations(anchor, outbound).length, 0, `out ${i}`)
  }
})

test('桌面落点位于桌面左前空位，避开显示器、键盘和鼠标区域', () => {
  for (const home of homes) {
    const p = catDeskTopPoint(home), local = { x: p.x - home.x, z: p.z - (home.z - 1) }
    assert.ok(Math.abs(local.x) <= 0.7 && Math.abs(local.z) <= 0.34)
    assert.ok(Math.hypot(local.x, local.z + 0.2) > 0.35, '避开显示器')
    assert.ok(Math.hypot(local.x + 0.12, local.z - 0.16) > 0.32, '避开键盘')
    assert.ok(Math.hypot(local.x - 0.43, local.z - 0.16) > 0.28, '避开鼠标')
  }
})
