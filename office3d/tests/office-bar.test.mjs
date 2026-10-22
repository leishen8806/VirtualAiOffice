import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LOUNGE_SEATS, loungeTrip } from '../office-layout.js'
import { barArcs, barColliders, barGaps, barLounges, barSeats, barSpec, validateBarGeometry } from '../office-bar-geometry.mjs'
import * as browser from '../office-bar-geometry.js'
import { buildOfficeBar } from '../office-bar.js'
const hit = (p, boxes, margin = 0) => boxes.some(b => p.x > b.x0 - margin && p.x < b.x1 + margin && p.z > b.z0 - margin && p.z < b.z1 + margin)
test('reviewed center, diameter, seats and dual 1.5m service gaps', () => {
  assert.deepEqual(barSpec(LAYOUT_V2).center, { x: 2, z: -1 })
  assert.equal(barSpec(LAYOUT_V2).radius * 2, 7)
  assert.equal(barSeats(LAYOUT_V2).length, 10)
  assert.equal(barSeats(LAYOUT_V2, true).length, 6)
  assert.deepEqual(barGaps(LAYOUT_V2).map(g => [g.side, g.width]), [['east', 1.5], ['west', 1.5]])
  for (const seat of barSeats(LAYOUT_V2)) {
    assert.ok(Math.abs(Math.hypot(seat.x - 2, seat.z + 1) - 4.4) < 1e-9)
    assert.ok(Math.abs(seat.z + 1) > .75 + .22)
  }
})
test('twelve AABBs cover arc samples and preserve gaps with pedestrian clearance', () => {
  const boxes = barColliders(LAYOUT_V2)
  assert.equal(boxes.length, 12)
  for (const box of boxes) assert.ok(box.x0 < box.x1 && box.z0 < box.z1)
  for (const arc of barArcs(LAYOUT_V2)) for (let i = 1; i < 200; i++) {
    const a = arc.start + (arc.end - arc.start) * i / 200
    assert.ok(hit({ x: 2 + Math.cos(a) * 3.49, z: -1 + Math.sin(a) * 3.49 }, boxes, 1e-6))
  }
  for (const side of [-1, 1]) for (let r = 0; r < 4.6; r += .05) {
    assert.equal(hit({ x: 2 + r * side, z: -1 }, boxes, .22), false)
  }
  for (let a = 0; a < Math.PI * 2; a += .01) assert.equal(hit({ x: 2 + Math.cos(a) * 6, z: -1 + Math.sin(a) * 6 }, boxes, .22), false)
})
test('seat departure along outer circle reaches either gap without hitting bar', () => {
  const boxes = barColliders(LAYOUT_V2)
  for (const seat of barSeats(LAYOUT_V2)) {
    const target = Math.cos(seat.angle) > 0 ? (seat.angle < Math.PI ? 0 : Math.PI * 2) : Math.PI
    for (let i = 0; i <= 100; i++) {
      const a = seat.angle + (target - seat.angle) * i / 100
      assert.equal(hit({ x: 2 + Math.cos(a) * 4.4, z: -1 + Math.sin(a) * 4.4 }, boxes, .22), false)
    }
  }
})
test('six lounge seats lie in east/west sofa arcs, preserve legacy mapping shape and clear portals', () => {
  const lounges = barLounges(LAYOUT_V2)
  assert.equal(lounges.length, LOUNGE_SEATS.length)
  assert.equal(lounges.filter(s => s.side === 'east').length, 3)
  assert.equal(lounges.filter(s => s.side === 'west').length, 3)
  for (const seat of lounges) {
    assert.ok(Math.hypot(seat.x - 2, seat.z + 1) >= 4.7)
    assert.ok(Math.hypot(seat.x - 2, seat.z + 1) <= 6)
    assert.ok(Math.abs(seat.x - 2) > 2)
    for (const key of ['x', 'z', 'yaw', 'appX']) assert.ok(Number.isFinite(seat[key]))
  }
  assert.equal(typeof loungeTrip, 'function')
})
test('gap shrinking mutation is rejected and shared browser geometry is same function', () => {
  assert.deepEqual(validateBarGeometry(LAYOUT_V2), { ok: true, errors: [] })
  assert.equal(validateBarGeometry({ ...LAYOUT_V2.bar, gaps: [{ width: 1 }] }).ok, false)
  assert.equal(browser.barColliders, barColliders)
})
test('real Three.js module budgets, collision-only proxies, material privacy and dispose', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), bodies = [], materials = { unchanged: true }
    const bar = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, materials, low,
      collision: { add(mesh, kind) { bodies.push({ mesh, kind }) } } })
    const summary = bar.summary()
    assert.equal(summary.calls, low ? 1 : 3)
    assert.ok(summary.triangles <= (low ? 4000 : 15000), JSON.stringify(summary))
    assert.equal(bodies.length, 12)
    assert.ok(bodies.every(b => b.kind === 'officeBar' && !b.mesh.visible))
    assert.equal(bar.root.userData.bar.plantCollision, false)
    assert.deepEqual(materials, { unchanged: true })
    assert.ok(bar.root.children.filter(c => c.visible).every(m => m.castShadow === false))
    bar.dispose(); bar.dispose()
    assert.equal(root.children.length, 0)
  }
})
test('office theme tokens, static-only preview, no warehouse coupling or new module lights', () => {
  for (const file of ['office-bar.js', 'office-bar-geometry.js', 'office-bar-geometry.mjs', 'office-bar-preview.html']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /dr-campus|dr-console|Math\.random|Date\.now|\bfetch\s*\(|innerHTML|\/state|\/act/)
  }
  const source = fs.readFileSync(new URL('../office-bar.js', import.meta.url), 'utf8')
  assert.match(source, /office-theme-v2\.js/)
  assert.doesNotMatch(source, /new THREE\.\w*Light/)
  assert.doesNotMatch(fs.readFileSync(new URL('../office-bar-geometry.js', import.meta.url), 'utf8'), /THREE|document|window|performance/)
})
