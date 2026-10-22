import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LOUNGE_SEATS, loungeTrip } from '../office-layout.js'
import { LOUNGE_SIT, barArcs, barColliders, barGaps, barLounges, barSeats, barSpec, validateBarGeometry } from '../office-bar-geometry.mjs'
import * as browser from '../office-bar-geometry.js'
import { buildOfficeBar } from '../office-bar.js'
const hit = (p, boxes, margin = 0) => boxes.some(b => p.x > b.x0 - margin && p.x < b.x1 + margin && p.z > b.z0 - margin && p.z < b.z1 + margin)
const visibleMeshes = bar => bar.root.children.filter(item => item.visible && item.isMesh)
const renderSnapshot = bar => ({
  summary: bar.summary(),
  meshes: visibleMeshes(bar).map(mesh => ({
    name: mesh.name,
    position: Array.from(mesh.geometry.attributes.position.array),
    color: Array.from(mesh.geometry.attributes.color.array),
    material: {
      type: mesh.material.type,
      color: mesh.material.color?.getHex(),
      roughness: mesh.material.roughness,
      opacity: mesh.material.opacity,
      transparent: mesh.material.transparent,
      depthWrite: mesh.material.depthWrite,
    },
  })),
})
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
test('measured lounge sitting source keeps the cushion below both hips and front edge behind both knees', () => {
  const measured = {
    male: { hipY: .5769054930893905, kneeZ: .32253221109286373, footZ: .591175603385127 },
    female: { hipY: .5862558664415041, kneeZ: .3392892646780472, footZ: .40282793472102274 },
  }
  for (const value of Object.values(measured)) {
    assert.ok(value.hipY - LOUNGE_SIT.seatTop >= .05)
    assert.ok(value.hipY - LOUNGE_SIT.seatTop <= .12)
    assert.ok(LOUNGE_SIT.seatDepth / 2 < value.kneeZ)
    assert.ok(value.footZ > value.kneeZ)
  }
  assert.deepEqual(LOUNGE_SIT, {
    seatTop: .5,
    seatDepth: .48,
    legRoom: .34,
    hipForward: .03,
    hipLift: 0,
  })
  assert.ok(LOUNGE_SIT.legRoom > LOUNGE_SIT.seatDepth / 2)
})
test('lounge sit offsets are additive and preserve every legacy placement field', () => {
  const lounges = barLounges(LAYOUT_V2)
  for (const seat of lounges) {
    const sideAngle = Number(seat.id.split('-').at(-1)) - 2
    const degree = sideAngle * 20 + (seat.side === 'west' ? 180 : 0)
    const angle = degree * Math.PI / 180
    assert.equal(seat.x, 2 + Math.cos(angle) * 5.25)
    assert.equal(seat.z, -1 + Math.sin(angle) * 5.25)
    assert.equal(seat.yaw, Math.PI / 2 - angle)
    assert.equal(seat.appX, 2 + Math.cos(angle) * 4.7)
    assert.equal(seat.appZ, -1 + Math.sin(angle) * 4.7)
    assert.equal(seat.angle, angle)
    assert.deepEqual(seat.sitOffset, { forward: LOUNGE_SIT.hipForward, lift: LOUNGE_SIT.hipLift })
  }
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
test('default and empty material hooks preserve exact names, geometry, colors, materials and budgets', () => {
  for (const low of [false, true]) {
    const plainRoot = new THREE.Group(), hookedRoot = new THREE.Group()
    const plain = buildOfficeBar({ THREE, root: plainRoot, layout: LAYOUT_V2, low })
    const hooked = buildOfficeBar({ THREE, root: hookedRoot, layout: LAYOUT_V2, low, materialOverrides: {}, uvScale: {} })
    assert.deepEqual(renderSnapshot(hooked), renderSnapshot(plain))
    assert.deepEqual(hooked.summary(), {
      calls: low ? 1 : 3,
      triangles: low ? 1712 : 4880,
      seats: low ? 6 : 10,
      sofas: 6,
      colliders: 12,
      low,
    })
    assert.deepEqual(visibleMeshes(hooked).map(mesh => mesh.name), low
      ? ['office2-bar-solid']
      : ['office2-bar-solid', 'office2-bar-glass', 'office2-bar-light-strip'])
    assert.ok(visibleMeshes(hooked).every(mesh => mesh.geometry.attributes.uv?.itemSize === 2))
    plain.dispose(); hooked.dispose()
  }
})
test('lounge meshes use measured seat top, measured depth and a recessed leg-clear base', () => {
  const sofa = new THREE.MeshBasicMaterial()
  const bar = buildOfficeBar({
    THREE,
    root: new THREE.Group(),
    layout: LAYOUT_V2,
    materialOverrides: { sofa },
  })
  const mesh = visibleMeshes(bar).find(item => item.name === 'office2-bar-sofa')
  const positions = mesh.geometry.attributes.position
  const ys = Array.from({ length: positions.count }, (_, index) => positions.getY(index))
  assert.ok(ys.some(value => Math.abs(value - LOUNGE_SIT.seatTop) < 1e-6))
  assert.ok(Math.abs(Math.max(...ys) - (LOUNGE_SIT.seatTop + .48)) < 1e-6)
  assert.equal(bar.root.userData.bar.loungeSit, LOUNGE_SIT)
  assert.deepEqual(bar.summary(), {
    calls: 4,
    triangles: 4880,
    seats: 10,
    sofas: 6,
    colliders: 12,
    low: false,
  })
  bar.dispose()
  sofa.dispose()
})
test('material overrides are grouped by caller material and caller keeps disposal ownership', () => {
  const root = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a32 })
  const fabric = new THREE.MeshStandardMaterial({ color: 0xe8dfd0 })
  let woodDisposals = 0, fabricDisposals = 0
  wood.addEventListener('dispose', () => woodDisposals++)
  fabric.addEventListener('dispose', () => fabricDisposals++)
  const bar = buildOfficeBar({ THREE, root, layout: LAYOUT_V2,
    materialOverrides: { top: wood, face: wood, seat: fabric, sofa: fabric } })
  assert.deepEqual(visibleMeshes(bar).map(mesh => mesh.name), [
    'office2-bar-solid', 'office2-bar-glass', 'office2-bar-light-strip', 'office2-bar-face', 'office2-bar-seat',
  ])
  assert.equal(visibleMeshes(bar).find(mesh => mesh.name === 'office2-bar-face').material === wood, true)
  assert.equal(visibleMeshes(bar).find(mesh => mesh.name === 'office2-bar-seat').material === fabric, true)
  assert.equal(bar.summary().calls, 5)
  assert.equal(bar.summary().triangles, 4880)
  bar.dispose(); bar.dispose()
  assert.equal(root.children.length, 0)
  assert.equal(woodDisposals, 0)
  assert.equal(fabricDisposals, 0)
  assert.equal(wood.map, null)
  wood.dispose(); fabric.dispose()
  assert.equal(woodDisposals, 1)
  assert.equal(fabricDisposals, 1)
})
test('top face and sofa UVs use world projection and obey independent metre periods', () => {
  const materials = {
    top: new THREE.MeshBasicMaterial(),
    face: new THREE.MeshBasicMaterial(),
    sofa: new THREE.MeshBasicMaterial(),
  }
  const make = uvScale => {
    const bar = buildOfficeBar({ THREE, root: new THREE.Group(), layout: LAYOUT_V2,
      materialOverrides: materials, uvScale })
    return { bar, values: Object.fromEntries(['top', 'face', 'sofa'].map(name => {
      const mesh = visibleMeshes(bar).find(item => item.name === `office2-bar-${name}`)
      assert.ok(mesh)
      return [name, Array.from(mesh.geometry.attributes.uv.array)]
    })) }
  }
  const normal = make({ top: 1.2, face: 1.2, sofa: .6 })
  const half = make({ top: .6, face: .6, sofa: .3 })
  for (const name of ['top', 'face', 'sofa']) {
    assert.equal(normal.values[name].length, half.values[name].length)
    assert.ok(normal.values[name].some(value => Math.abs(value) > .01))
    for (let i = 0; i < normal.values[name].length; i++) {
      assert.ok(Number.isFinite(normal.values[name][i]))
      assert.ok(Math.abs(half.values[name][i] - normal.values[name][i] * 2) < 1e-5)
    }
  }
  const face = visibleMeshes(normal.bar).find(item => item.name === 'office2-bar-face')
  const positions = face.geometry.attributes.position, uv = face.geometry.attributes.uv
  for (let i = 0; i < positions.count; i++) assert.ok(Math.abs(uv.getY(i) - positions.getY(i) / 1.2) < 1e-5)
  normal.bar.dispose(); half.bar.dispose()
  Object.values(materials).forEach(material => material.dispose())
})
test('office theme tokens, isolated previews, no warehouse coupling or new module lights', () => {
  for (const file of ['office-bar.js', 'office-bar-geometry.js', 'office-bar-geometry.mjs', 'office-bar-preview.html', 'office-bar-seat-calibration.html']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /dr-campus|dr-console|Math\.random|Date\.now|\bfetch\s*\(|innerHTML|\/state|\/act/)
  }
  const source = fs.readFileSync(new URL('../office-bar.js', import.meta.url), 'utf8')
  assert.match(source, /office-theme-v2\.js/)
  assert.doesNotMatch(source, /new THREE\.\w*Light/)
  assert.doesNotMatch(fs.readFileSync(new URL('../office-bar-geometry.js', import.meta.url), 'utf8'), /THREE|document|window|performance/)
})
