import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFICE_ROOMS, CORRIDOR_X, CROSS_Z, LOUNGE_AREA, PLAZA } from '../office-layout.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { CAT_BALL_MS, CAT_COOLDOWN_MS, CAT_IDLE_EXIT_MS, aimCat, catTarget, chooseCatReaction, createCatPlayState, isPublicPoint, reactCat, toggleCatPlay, updateCatPlay } from '../cat-play.js'

test('真实布局中的走廊、前厅、休息区、广场为空间；所有房间内部都不是公共区', () => {
  for (const p of [{ x: CORRIDOR_X, z: CROSS_Z }, { x: CORRIDOR_X, z: 10 }, { x: LOUNGE_AREA.x, z: LOUNGE_AREA.z }, { x: (PLAZA.x0 + PLAZA.x1) / 2, z: (PLAZA.z0 + PLAZA.z1) / 2 }]) assert.equal(isPublicPoint(p), true)
  for (const r of OFFICE_ROOMS) assert.equal(isPublicPoint({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }), false, r.id)
})

test('房间内目标停在门外且不堵门，公共目标保持原点', () => {
  for (const r of OFFICE_ROOMS) {
    const t = catTarget({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }), d = r.doors[0]
    assert.equal(t.room, r.id); assert.equal(isPublicPoint(t.point), true); assert.ok(Math.abs(t.point.x - d.at) > (d.width || 2) / 2)
  }
  assert.deepEqual(catTarget({ x: CORRIDOR_X, z: CROSS_Z }).point, { x: CORRIDOR_X, z: CROSS_Z })
})

test('冷却1.5秒且连续反应不重复', () => {
  const s = createCatPlayState(); assert.equal(reactCat(s, 0, () => 0), 'meow'); assert.equal(reactCat(s, CAT_COOLDOWN_MS - 1), null)
  assert.notEqual(reactCat(s, CAT_COOLDOWN_MS, () => 0), 'meow'); assert.notEqual(chooseCatReaction('stretch', () => 0), 'stretch')
})

test('公共目标会收敛；房间目标只收敛到门外', () => {
  const s = createCatPlayState(), target = { x: CORRIDOR_X + 3, z: CROSS_Z }; toggleCatPlay(s, true, 0); aimCat(s, target, 0)
  let p = { x: CORRIDOR_X, z: CROSS_Z }
  for (let i = 0; i < 1000 && Math.hypot(p.x - target.x, p.z - target.z) > 0.25; i++) p = updateCatPlay(s, { now: i * 16, dt: 1 / 60, position: p }).position
  assert.ok(Math.hypot(p.x - target.x, p.z - target.z) < 0.25)
  const r = OFFICE_ROOMS.find(x => x.id === 'eng'), inside = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }, stop = catTarget(inside)
  aimCat(s, inside, 2000); p = { x: CORRIDOR_X, z: CROSS_Z }
  for (let i = 0; i < 3000 && Math.hypot(p.x - stop.point.x, p.z - stop.point.z) > 0.25; i++) { const now = 2000 + i * 16; aimCat(s, inside, now); p = updateCatPlay(s, { now, dt: 1 / 60, position: p }).position }
  assert.equal(isPublicPoint(p), true); assert.ok(Math.hypot(p.x - stop.point.x, p.z - stop.point.z) < 0.3)
})

test('小球只有一个，10秒消失；15秒无移动退出', () => {
  const s = createCatPlayState(); toggleCatPlay(s, true, 0); aimCat(s, { x: CORRIDOR_X, z: CROSS_Z }, 1, true); const first = s.ball
  aimCat(s, { x: CORRIDOR_X + 1, z: CROSS_Z }, 2, true); assert.notEqual(s.ball, first)
  updateCatPlay(s, { now: 2 + CAT_BALL_MS, dt: 0, position: { x: CORRIDOR_X, z: CROSS_Z } }); assert.equal(s.ball, null)
  assert.equal(updateCatPlay(s, { now: 2 + CAT_IDLE_EXIT_MS, dt: 0, position: { x: CORRIDOR_X, z: CROSS_Z } }).expired, true); assert.equal(s.enabled, false)
})

test('人物进入净距时小橘让路；关闭时零更新', () => {
  const s = createCatPlayState(), pos = { x: CORRIDOR_X, z: CROSS_Z }; toggleCatPlay(s, true, 0); aimCat(s, { x: pos.x + 3, z: pos.z }, 0)
  const r = updateCatPlay(s, { now: 100, dt: 1, position: pos, people: [{ x: pos.x + PERSON_GAP / 2, z: pos.z }] }); assert.equal(r.yield, true); assert.deepEqual(r.position, pos)
  toggleCatPlay(s, false, 200); const before = structuredClone(s); assert.equal(updateCatPlay(s, { now: 300, dt: 1, position: pos }), false); assert.deepEqual(s, before)
})
