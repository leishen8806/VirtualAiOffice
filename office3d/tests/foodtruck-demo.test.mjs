import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createFoodtruckDemo } from '../foodtruck-demo.js'

function subject() {
  const member = {
    station: { id: 'npc-kiosk-4', post: 'plaza-kiosk', gender: 'male' },
    walker: { leg: 1, path: [{ x: 1, z: 2 }], speed: .5, arrivals: 2, blocked: 0, dwell: 4, x: 3, z: 4, yaw: .5, walking: 1 },
    char: {
      pose: { talk: .2, walk: .4, phase: 3, yaw: .1 },
      group: { position: { x: 3, y: 0, z: 4, set(x, y, z) { this.x = x; this.y = y; this.z = z } }, rotation: { y: .5 } },
      hasR1Motion: () => true,
      solve() {},
    },
  }
  const bubbles = []
  return { member, bubbles, demo: createFoodtruckDemo(member, value => bubbles.push(value)) }
}

test('food-truck demo owns the vendor only while active, restores its patrol state, and ignores re-entry', () => {
  const { member, bubbles, demo } = subject()
  assert.equal(demo.start(1000), true)
  assert.equal(member.demoControlled, true)
  assert.equal(demo.start(1100), false)
  // 模拟 director 或其它系统在演示中写姿态；下一拍必须恢复演示拥有的字段。
  member.char.pose.r1Motion = 'other-system'; member.char.pose.r1Prop = 'other-prop'; member.char.pose.talk = 0
  member.char.group.position.set(99, 0, 99)
  demo.update(1.3)
  assert.equal(member.char.pose.r1Motion, 'gestic_talk_relaxed_01')
  assert.equal(member.char.group.position.x, 3)
  assert.match(bubbles.at(-1), /^演示 · 未扣款｜/)
  demo.update(1)
  assert.equal(member.char.pose.r1Prop, 'cup')
  assert.match(bubbles.at(-1), /递出咖啡/)
  demo.update(1)
  assert.equal(member.char.pose.r1Motion, 'cell_phone_textmessage')
  assert.match(bubbles.at(-1), /演示支付/)
  demo.update(5)
  assert.equal(demo.active, false)
  assert.equal(member.demoControlled, false)
  assert.equal(member.char.pose.r1Motion, undefined)
  assert.equal(member.char.pose.r1Prop, undefined)
  assert.equal(member.char.pose.talk, .2)
  assert.equal(member.char.group.position.x, 3)
  assert.deepEqual(member.walker.path, [{ x: 1, z: 2 }])
  assert.equal(bubbles.at(-1), '')
})

test('food-truck demo can replay after completion and falls back to clear unpaid text if its clip is unavailable', () => {
  const { demo } = subject()
  assert.equal(demo.start(1000), true)
  demo.update(8)
  assert.equal(demo.start(1200), false)
  assert.equal(demo.start(2000), true)
  const member = { station: { id: 'npc-kiosk-4' }, walker: { path: [] }, char: { pose: {}, group: { position: { set() {} }, rotation: {} }, hasR1Motion: () => false, solve() {} } }
  const bubbles = []
  const fallback = createFoodtruckDemo(member, text => bubbles.push(text))
  fallback.start(1000); fallback.update(.1)
  assert.equal(member.char.pose.r1Motion, undefined)
  assert.match(bubbles.at(-1), /^演示 · 未扣款｜.*动作素材未就绪/)
})

test('missing vendor safely disables the scene action', () => {
  assert.equal(createFoodtruckDemo(null).start(1000), false)
})

test('F-2/F-3: food-truck clips exist but no longer change the global standing pool or initial movement preload', () => {
  const people = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
  assert.match(people, /standFlavor: \['idle_look_around_01', 'idle_stretch_arms_01', 'drink_idle', 'cell_phone_textmessage'\]/)
  const movement = people.slice(people.indexOf('export async function loadR1MovementExtras'), people.indexOf('export async function loadFoodtruckDemoExtras'))
  assert.doesNotMatch(movement, /drink_idle|cell_phone_textmessage/)
  assert.match(people, /export async function loadFoodtruckDemoExtras\(P, gender\)/)
  for (const file of ['m_drink_idle.anim.gz', 'm_cell_phone_textmessage.anim.gz']) {
    assert.ok(existsSync(new URL('../assets/compact/anim/' + file, import.meta.url)), 'missing compact demo clip ' + file)
  }
})

test('F-2/F-4: the button is R1-only, lite stays textual, and idle frames do not call the demo update', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const npcs = readFileSync(new URL('../office-r1-npc.js', import.meta.url), 'utf8')
  const lite = app.slice(app.indexOf("OFFICE_LAYOUT.r1Phase === 'R1' && LITE.lite"), app.indexOf("OFFICE_LAYOUT.r1Phase === 'R1' && !LITE.lite"))
  assert.match(lite, /演示 · 未扣款/)
  assert.doesNotMatch(lite, /loadFoodtruckDemoExtras/)
  assert.match(app, /if \(foodtruckDemo\?\.active\) \{ foodtruckDemo\.update\(dt\)/)
  assert.match(app, /if \(!DR_MODE && OFFICE_LAYOUT\.r1Phase === 'R1' && !LITE\.lite\)/)
  assert.match(html, /#foodtruckDemo \{ position:fixed; left:50%; bottom:96px;/)
  assert.match(html, /@media \(max-width:760px\) \{ #foodtruckDemo \{ bottom:204px; \}/)
  assert.match(npcs, /if \(m\.demoControlled\) \{[\s\S]*?continue/)
})
