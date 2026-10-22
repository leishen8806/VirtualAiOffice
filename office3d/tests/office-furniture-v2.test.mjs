import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, SEATS } from '../office-layout.js'
import { officeFurnitureV2Spec, placeOfficeFurnitureV2 } from '../office-furniture-v2.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'

const spec = officeFurnitureV2Spec(LAYOUT_V2)
const overlaps = (a, b) => a.x0 < b.x1 - 1e-9 && a.x1 > b.x0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9
const inside = (a, b) => a.x0 > b.x0 + .14 && a.x1 < b.x1 - .14 && a.z0 > b.z0 + .14 && a.z1 < b.z1 - .14
const box = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

test('O4 keeps all 25 frozen desk coordinates and real region mappings', () => {
  assert.equal(spec.workstations.length, 25)
  assert.deepEqual(new Set(spec.workstations.map(s => s.name)), new Set(Object.keys(SEATS)))
  for (const s of spec.workstations) {
    assert.deepEqual([s.region, s.x, s.z], LAYOUT_V2.seats[s.name])
    assert.equal(s.region, SEATS[s.name][0])
    assert.ok(Math.abs(s.desk.x1 - s.desk.x0 - 1.4) < 1e-9)
    assert.ok(Math.abs(s.desk.z1 - s.desk.z0 - .7) < 1e-9)
    assert.equal(s.chair.yaw, 0)
    assert.equal(s.chair.z, s.z + 1)
  }
})

test('O4 desks, chairs and 0.9m front clearance avoid walls, corridors and other furniture', () => {
  const obstacles = spec.workstations.flatMap(s => [{ name: s.name, ...s.desk }, { name: s.name, ...s.chair }])
  for (const s of spec.workstations) {
    const region = LAYOUT_V2.regions.find(r => r.id === s.region)
    for (const part of [s.desk, s.chair, s.front]) {
      assert.ok(inside(part, region), s.name)
      for (const corridor of [LAYOUT_V2.corridors.north, LAYOUT_V2.corridors.south]) assert.equal(overlaps(part, corridor), false, s.name)
    }
    for (const other of obstacles.filter(o => o.name !== s.name)) assert.equal(overlaps(s.front, other), false, `${s.name}/${other.name}`)
  }
  for (let i = 0; i < obstacles.length; i++) for (const b of obstacles.slice(i + 1)) assert.equal(overlaps(obstacles[i], b), false, `${obstacles[i].name}/${b.name}`)
})

test('O4 revised door has 1.2m clear approach, nontraffic wall setback remains at least 1m', () => {
  assert.equal(LAYOUT_V2.regions.find(r => r.id === 'drlife').doors[0].at, 24)
  for (const region of LAYOUT_V2.regions) {
    const d = region.doors[0], north = d.side === 'north'
    const approach = { x0: d.at - d.width / 2, x1: d.at + d.width / 2, z0: north ? region.z0 : region.z1 - 1.2, z1: north ? region.z0 + 1.2 : region.z1 }
    for (const s of spec.workstations.filter(s => s.region === region.id)) {
      assert.equal(overlaps(s.desk, approach), false, s.name)
      assert.equal(overlaps(s.chair, approach), false, s.name)
    }
  }
  for (const s of spec.workstations.filter(s => s.region === 'drlife' && s.z === 8.5)) assert.ok(s.desk.z0 - 7 >= 1)
})

test('O4 same-row separation and rear-to-next-row passage keep their original thresholds', () => {
  for (let i = 0; i < spec.workstations.length; i++) for (const b of spec.workstations.slice(i + 1)) {
    const a = spec.workstations[i]
    if (a.region !== b.region) continue
    if (a.z === b.z) assert.ok(Math.abs(a.x - b.x) >= 2.5)
    if (a.x === b.x) {
      const [north, south] = [a, b].sort((x, y) => x.z - y.z)
      assert.ok(south.z - north.z >= 3)
      assert.ok(south.desk.z0 - north.chair.z1 >= 1.25)
    }
  }
})

test('O4 meeting seats are A=8 B=6; boss, board and bookshelves do not overlap', () => {
  assert.deepEqual(spec.meetings.map(r => r.seats.length), [8, 6])
  assert.equal(spec.meetings[1].round, true)
  assert.deepEqual(spec.boss.desk, { x: -24.5, z: -14.5 })
  assert.deepEqual(spec.boss.stand, { x: -24.5, z: -12.5 })
  for (const room of spec.meetings) {
    const region = LAYOUT_V2.regions.find(r => r.id === room.region), table = box(room.x, room.z, room.w, room.d)
    assert.ok(inside(table, region))
    for (const seat of room.seats) {
      const chair = box(seat.x, seat.z, .62, .62)
      assert.ok(inside(chair, region)); assert.equal(overlaps(chair, table), false)
      const direction = Math.atan2(seat.x - room.x, seat.z - room.z)
      assert.ok(Math.cos(direction - seat.yaw) > .5, 'chair faces the table, not away from it')
    }
  }
  const items = [box(spec.boss.desk.x, spec.boss.desk.z, 1.4, .7), box(spec.boss.chair.x, spec.boss.chair.z, .62, .6), box(spec.board.x, spec.board.z, spec.board.w, spec.board.d), ...spec.boardSeats.map(s => box(s.x, s.z, .62, .62))]
  const boardRegion = LAYOUT_V2.regions.find(r => r.id === 'board')
  for (const item of items) assert.ok(inside(item, boardRegion))
  for (let i = 0; i < items.length; i++) for (const other of items.slice(i + 1)) assert.equal(overlaps(items[i], other), false)
  const kb = LAYOUT_V2.regions.find(r => r.id === 'kb')
  for (const shelf of spec.shelves) {
    const b = box(shelf.x, shelf.z, shelf.yaw ? shelf.d : shelf.w, shelf.yaw ? shelf.w : shelf.d)
    assert.ok(inside(b, kb)); assert.equal(overlaps(b, spec.workstations.find(s => s.region === 'kb').desk), false)
  }
  assert.ok(spec.opsScreen.y > 2.2, 'ops screen stays above the door')
})

function fixture(withLegacy = false) {
  const scene = new THREE.Scene(), bodies = [], scrs = []
  const legacy = []
  if (withLegacy) for (const [w, h, d, x, z] of [[20, 2, .3, -20, -13], [.2, 2, 26, 22, 0], [20, 2, .3, -90, -13]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial())
    mesh.position.set(x, 1, z); scene.add(mesh); legacy.push(mesh)
  }
  const ctx = () => ({ canvas: {}, fillRect() {}, fillText() {}, drawImage() {} })
  const A = { furn: Object.fromEntries(['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'table', 'chairModernCushion', 'bookcaseOpen', 'books', 'pottedPlant'].map(n => [n, true])) }
  const placeFurniture = (assets, name, x, z, { y = 0, rotY = 0 }) => { const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: 'wood' }))); group.position.set(x, y, z); group.rotation.y = rotY; return { group, size: new THREE.Vector3(1, 1, 1) } }
  const canvasTex = () => ({ image: { getContext: ctx }, dispose() {} })
  const makeScreenTexture = () => { const scr = { ctx: ctx(), tex: { dispose() {} }, scroll: 0, last: '' }; scrs.push(scr); return scr }
  const value = placeOfficeFurnitureV2({ THREE, scene, layout: LAYOUT_V2, A, placeFurniture, collision: { add(g, kind) { bodies.push({ g, kind, bounds: new THREE.Box3().setFromObject(g) }) } }, canvasTex, makeScreenTexture })
  const merged = mergeOfficeStatic(THREE, value.root), dispose = value.dispose
  assert.ok(merged.removed > 100); assert.equal(merged.added, 1)
  value.dispose = () => { merged.dispose(); dispose() }
  return { value, scene, bodies, scrs, legacy }
}

test('O4 renderer uses one shadow-free batch, collision proxies and private warm materials', () => {
  const { value, scene, bodies, scrs } = fixture()
  const visible = []; value.root.traverse(o => { if (o.isMesh && o.visible) visible.push(o) })
  assert.equal(visible.length, 1); assert.ok(visible[0].isMesh)
  assert.equal(visible[0].castShadow, false); assert.equal(visible[0].receiveShadow, false)
  assert.equal(value.wing.seats.length, 14)
  assert.equal(scrs.length, 29)
  assert.equal(bodies.filter(b => b.kind === 'desk').length, 26)
  assert.ok(bodies.some(b => b.kind === 'officeWall'))
  assert.equal(bodies.filter(b => b.kind === 'chairDesk').length, 26)
  const desk = value.deskAt(18.5, 8.5); assert.ok(desk?.chair); desk.scr.tex.needsUpdate = true
  for (const seat of spec.workstations) assert.equal(value.deskAt(seat.x, seat.z).group.parent, value.root)
  assert.equal(scene.children.length, 1); value.dispose(); assert.equal(scene.children.length, 0)
})

test('O4 hides only intersecting legacy office walls and restores them on disposal', () => {
  const { value, legacy } = fixture(true)
  assert.equal(value.legacyHidden.length, 2)
  assert.deepEqual(legacy.map(mesh => mesh.visible), [false, false, true])
  value.dispose(); assert.ok(legacy.every(mesh => mesh.visible))
})

test('O4 only wires guarded furniture and never imports warehouse code, assets or lights', () => {
  const source = fs.readFileSync(new URL('../office-furniture-v2.js', import.meta.url), 'utf8')
  assert.match(source, /office-theme-v2/)
  assert.doesNotMatch(source, /dr-campus|dr-console|fetch\s*\(|new THREE\.(?:Point|Directional|Hemisphere)Light/)
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const entry = fs.readFileSync(new URL('../office-v2-modules.js', import.meta.url), 'utf8')
  assert.match(app, /startOfficeV2\(\{ THREE, scene/)
  assert.match(entry, /if \(layout.version !== 2\) return null/)
  assert.match(entry, /context.scene.userData.officeV2\?\.get\('furniture'\)\?\.wing/)
  assert.match(entry, /context.scene.userData.officeV2\?\.get\('furniture'\)\?\.partitions/)
})

test('O4 app wiring stays within its own 20-line budget and layout1 data is identical', async () => {
  const before = fs.readFileSync(new URL('../../office3d-backup-o4/resume-20261021/app.js', import.meta.url), 'utf8')
  const after = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const oldLines = new Set(before.split(/\r?\n/))
  const added = after.split(/\r?\n/).filter(line => !oldLines.has(line))
  const oldSequence = before.split(/\r?\n/), newSequence = after.split(/\r?\n/)
  let previousRow = new Uint16Array(newSequence.length + 1)
  for (const oldLine of oldSequence) {
    const row = new Uint16Array(newSequence.length + 1)
    for (let i = 1; i <= newSequence.length; i++) row[i] = oldLine === newSequence[i - 1] ? previousRow[i - 1] + 1 : Math.max(previousRow[i], row[i - 1])
    previousRow = row
  }
  const changedLines = newSequence.length - previousRow[newSequence.length]
  assert.ok(changedLines <= 20, `O4 changed/added ${changedLines} lines`)
  assert.doesNotMatch(added.join('\n'), /fetch\s*\(|innerHTML|\beval\s*\(/)
  const previous = await import('../../office3d-backup-o4/resume-20261021/office-layout.js')
  const current = await import('../office-layout.js')
  const comparable = value => typeof value === 'function' ? String(value) : Array.isArray(value) ? value.map(comparable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, comparable(item)])) : value
  assert.deepEqual(comparable(current.LAYOUT_V1), comparable(previous.LAYOUT_V1))
  for (const name of Object.keys(previous)) {
    if (name === 'LAYOUT_V2') continue
    if (typeof previous[name] === 'function') assert.equal(String(current[name]), String(previous[name]), name)
    else assert.deepEqual(comparable(current[name]), comparable(previous[name]), name)
  }
})
