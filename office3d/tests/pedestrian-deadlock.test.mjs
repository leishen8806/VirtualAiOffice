import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createDirector } from '../director.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'

function actor(id, x, z, homeX = x) {
  const group = new THREE.Group(); group.position.set(x, 0, z)
  return { id, name: id, home: { x: homeX, z, yaw: 0 }, chair: null, char: { group, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } }, act: null }
}
function runPair() {
  const a = actor('a', -1, 0, -4), b = actor('b', 1, 0, 4), views = new Map([[a.id, a], [b.id, b]])
  const doorFurniture = { move(next, dx, dz) { if (Math.abs(dz) > 1e-6 && Math.abs(next.x) < 1.5) return; next.x += dx; next.z += dz }, route() { return null }, seatBody() { return null }, overlaps() { return false } }
  const d2 = createDirector({ views, board: {}, layer: null, project: null, furnitureCollision: doorFurniture })
  d2.travel(a, [{ x: -0.2, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }], { x: 2, z: 1, yaw: 0 }, false)
  d2.travel(b, [{ x: 0.2, z: 0 }, { x: -2, z: 0 }, { x: -2, z: -1 }], { x: -2, z: -1, yaw: 0 }, false)
  for (let i = 0; i < 1200 && d2.stats().active; i++) d2.update(0.1)
  return { a, b, stats: d2.stats() }
}

// 改前备份实跑 1200 步后 active=2，双方停在 x=-0.3/0.3，未到达目标。
test('面对面窄通道：6秒内发生确定性让路，双方最终回到目标座位', () => {
  const r = runPair()
  assert.ok(r.stats.yields >= 1)
  assert.equal(r.stats.timeouts, 0)
  assert.equal(r.stats.active, 0)
  assert.ok(Math.hypot(r.a.char.group.position.x - 2, r.a.char.group.position.z - 1) < .01)
  assert.ok(Math.hypot(r.b.char.group.position.x + 2, r.b.char.group.position.z + 1) < .01)
})

test('让路决策确定性：相同输入重复20次结果和让路次数一致', () => {
  const results = Array.from({ length: 20 }, () => runPair())
  assert.ok(results.every(r => r.stats.active === 0 && r.stats.timeouts === 0))
  assert.deepEqual(results.map(r => r.stats.yields), Array(20).fill(results[0].stats.yields))
})

test('看门狗：永远不可通行时45秒内复位到home', () => {
  const a = actor('stuck', 0, 0), views = new Map([[a.id, a]])
  const blocked = { move() {}, route() { return null }, seatBody() { return null }, overlaps() { return false } }
  const d = createDirector({ views, board: {}, layer: null, project: null, furnitureCollision: blocked })
  d.travel(a, [{ x: 10, z: 0 }], { x: 10, z: 0, yaw: 0 }, false)
  for (let i = 0; i < 500 && d.stats().active; i++) d.update(0.1)
  assert.equal(d.stats().active, 0)
  assert.equal(d.stats().timeouts, 1)
  assert.ok(Math.hypot(a.char.group.position.x - a.home.x, a.char.group.position.z - a.home.z) < .01)
})

test('三人门口保持人员净距并在有限时间内完成', () => {
  const views = new Map(), d = createDirector({ views, board: {}, layer: null, project: null })
  for (const [id, x, target] of [['a', -2, -0.5], ['b', 0, 0], ['c', 2, 0.5]]) {
    const v = actor(id, x, -2), seat = { x: target, z: 0, yaw: 0 }; views.set(id, v)
    d.travel(v, [seat], seat, false)
  }
  let min = Infinity
  for (let i = 0; i < 1200 && d.stats().active; i++) {
    d.update(0.1)
    const all = [...views.values()]
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) min = Math.min(min, all[a].char.group.position.distanceTo(all[b].char.group.position))
  }
  assert.equal(d.stats().active, 0)
  assert.ok(min >= PERSON_GAP * .9, String(min))
})
