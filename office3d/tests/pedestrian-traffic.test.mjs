import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createPedestrianTraffic, PERSON_GAP } from '../pedestrian-traffic.js'
import { createDirector } from '../director.js'
import { LOUNGE_SEATS, SEATS, workHome, loungeTrip, MEETING_SEATS, meetingTrip } from '../office-layout.js'

function actor(id, x, z) {
  const group = new THREE.Group(); group.position.set(x, 0, z)
  return { id, name: id, home: { x, z, yaw: 0 }, char: { group, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } }, act: null }
}
const director = views => createDirector({ views, board: {}, layer: null, project: null })
test('swept person clearance prevents tunnelling into a stationary person', () => {
  const a = actor('a', 0, 0), b = actor('b', 1, 0), views = new Map([[a.id, a], [b.id, b]])
  const t = createPedestrianTraffic({ views, board: {} })
  t.move(a, 2, 0)
  const p = a.char.group.position, t0 = Math.max(0, Math.min(1, p.x / (p.x * p.x + p.z * p.z || 1)))
  assert.ok(Math.hypot(p.x * t0 - 1, p.z * t0) >= PERSON_GAP - 1e-6)
})
test('opposing walkers pass on their right without overlap or deadlock', () => {
  const a = actor('a', -2, 0), b = actor('b', 2, 0), views = new Map([[a.id, a], [b.id, b]])
  const t = createPedestrianTraffic({ views, board: {} })
  a.act = b.act = { phase: 'walk' }
  let min = Infinity
  for (let f = 0; f < 600; f++) {
    for (const [v, target] of [[a, { x: 2, z: 0 }], [b, { x: -2, z: 0 }]]) {
      const p = v.char.group.position, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz)
      if (d > .01) t.move(v, dx / d * Math.min(d, 1.4 / 60), dz / d * Math.min(d, 1.4 / 60))
      min = Math.min(min, a.char.group.position.distanceTo(b.char.group.position))
    }
  }
  assert.ok(min >= PERSON_GAP - 1e-6, String(min))
  assert.ok(a.char.group.position.x > 1.9); assert.ok(b.char.group.position.x < -1.9)
})
test('six lounge departures wait seated, share the lane, and all complete', () => {
  const views = new Map(), d = director(views)
  for (let i = 0; i < 6; i++) {
    const seat = LOUNGE_SEATS[i], v = actor(String(i), seat.x, seat.z); views.set(v.id, v)
    v.home = workHome(Object.values(SEATS)[i])
    d.travel(v, loungeTrip(v.home, seat).reverse().slice(1).concat([{ x: v.home.x, z: v.home.z }]), v.home, false)
  }
  d.update(1 / 60)
  assert.equal([...views.values()].filter(v => v.act.phase === 'rise').length, 1)
  assert.equal([...views.values()].filter(v => v.act.phase === 'queued' && v.char.pose.sit === 1).length, 5)
  for (let f = 0; f < 36000 && d.stats().active; f++) d.update(1 / 60)
  assert.equal(d.stats().active, 0)
})
test('sit begins only after turning is complete, never while lowering the pose', () => {
  const v = actor('a', 0, 0), d = director(new Map([[v.id, v]]))
  d.travel(v, [{ x: 1, z: 0 }], { x: 1, z: 0, yaw: Math.PI / 2 }, false)
  let sawTurn = false, sawSit = false
  for (let f = 0; f < 1200 && v.act; f++) {
    d.update(1 / 60)
    if (v.act?.phase === 'turn') { sawTurn = true; assert.equal(v.char.pose.sit, 0) }
    if (v.act?.phase === 'sit') { sawSit = true; assert.ok(Math.abs(v.char.group.rotation.y - Math.PI / 2) < .01) }
  }
  assert.ok(sawTurn && sawSit); assert.equal(v.act, null)
})
test('direct travel also shares the three-person limit outside the lounge', () => {
  const views = new Map(), d = director(views)
  for (let i = 0; i < 6; i++) {
    const v = actor(String(i), i * 3, 0); views.set(v.id, v)
    d.travel(v, [{ x: i * 3, z: 2 }], { x: i * 3, z: 2, yaw: 0 }, false)
  }
  d.update(1 / 60)
  assert.equal([...views.values()].filter(v => v.act.phase === 'rise').length, 3)
  assert.equal([...views.values()].filter(v => v.act.phase === 'queued').length, 3)
  for (let i = 0; i < 1200 && d.stats().active; i++) d.update(1 / 60)
  assert.equal(d.stats().active, 0)
})

test('north, south and east office arrivals merge without a three-person corridor deadlock', () => {
  const views = new Map(), d = director(views)
  for (const [i, name] of ['ReactSenior', 'SecurityReviewer', 'PM', 'Localizer', 'QAAutomation'].entries()) {
    const home = workHome(SEATS[name]), v = actor(name, home.x, home.z)
    views.set(v.id, v)
    d.travel(v, meetingTrip(home, MEETING_SEATS[i]), MEETING_SEATS[i], false)
  }
  let min = Infinity
  for (let f = 0; f < 18000 && d.stats().active; f++) {
    d.update(1 / 60)
    const all = [...views.values()]
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) min = Math.min(min, all[i].char.group.position.distanceTo(all[j].char.group.position))
  }
  assert.equal(d.stats().active, 0)
  assert.ok(min >= PERSON_GAP - 1e-6, String(min))
  for (const [i, v] of [...views.values()].entries()) {
    assert.ok(Math.hypot(v.char.group.position.x - MEETING_SEATS[i].x, v.char.group.position.z - MEETING_SEATS[i].z) < .01)
    assert.equal(v.char.pose.sit, 1)
  }
})
