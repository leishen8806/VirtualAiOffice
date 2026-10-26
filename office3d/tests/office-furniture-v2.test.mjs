import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LAYOUT_V3, SEATS } from '../office-layout.js'
import { MONITOR_GLASS_SOURCE, monitorScreenFit, workstationDesktop, officeFurnitureV2Spec, placeOfficeFurnitureV2 } from '../office-furniture-v2.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'

const spec = officeFurnitureV2Spec(LAYOUT_V2)
const overlaps = (a, b) => a.x0 < b.x1 - 1e-9 && a.x1 > b.x0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9
const inside = (a, b) => a.x0 > b.x0 + .14 && a.x1 < b.x1 - .14 && a.z0 > b.z0 + .14 && a.z1 < b.z1 - .14
const box = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

test('O4c measured monitor glass drives parallel, centred 1.5mm screen fits for both yaws', () => {
  const raw = fs.readFileSync(new URL('../assets/models/furniture/computerScreen.glb', import.meta.url))
  const jsonLength = raw.readUInt32LE(12), gltf = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf8'))
  const bin = 28 + jsonLength, primitive = gltf.meshes[0].primitives.find(item => gltf.materials[item.material].name === 'metal')
  const accessor = gltf.accessors[primitive.indices], view = gltf.bufferViews[accessor.bufferView]
  const indices = Array.from({ length: accessor.count }, (_, i) => raw.readUInt32LE(bin + view.byteOffset + i * 4))
  const positions = [...new Set(indices)].map(i => [0, 1, 2].map(axis => raw.readFloatLE(bin + gltf.bufferViews[0].byteOffset + i * 12 + axis * 4)))
  const low = positions.reduce((a, p) => a[1] < p[1] ? a : p), high = positions.reduce((a, p) => a[1] > p[1] ? a : p)
  assert.deepEqual(indices, [112, 111, 110, 111, 112, 113]); assert.equal(positions.length, 4)
  const measuredCenter = [0, 1, 2].map(axis => (Math.min(...positions.map(p => p[axis])) + Math.max(...positions.map(p => p[axis]))) / 2)
  const measuredNormal = [0, 1, 2].map(axis => raw.readFloatLE(bin + gltf.bufferViews[1].byteOffset + indices[0] * 12 + axis * 4))
  measuredCenter.forEach((value, axis) => assert.ok(Math.abs(MONITOR_GLASS_SOURCE.center[axis] - value) < 1e-9)); assert.deepEqual(MONITOR_GLASS_SOURCE.normal, measuredNormal)
  assert.ok(Math.abs(MONITOR_GLASS_SOURCE.width - (Math.max(...positions.map(p => p[0])) - Math.min(...positions.map(p => p[0])))) < 1e-9)
  assert.ok(Math.abs(MONITOR_GLASS_SOURCE.height - Math.hypot(high[1] - low[1], high[2] - low[2])) < 1e-9)
  for (const yaw of [0, Math.PI]) {
    const fit = monitorScreenFit({ x: 3, y: .76, z: 4, yaw }), front = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(fit.pitch, fit.yaw, 0, 'YXZ'))
    assert.ok(front.dot(new THREE.Vector3(...fit.normal)) > Math.cos(Math.PI / 180))
    const delta = new THREE.Vector3(fit.center.x - fit.glassCenter.x, fit.center.y - fit.glassCenter.y, fit.center.z - fit.glassCenter.z)
    assert.ok(Math.abs(delta.dot(new THREE.Vector3(...fit.normal)) - .0015) < 1e-9)
    assert.ok(delta.clone().addScaledVector(new THREE.Vector3(...fit.normal), -.0015).length() < .005)
    assert.ok(fit.width < fit.glassWidth && fit.height < fit.glassHeight)
    const desktop = workstationDesktop({ x: 3, z: 4, yaw }), forward = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw))
    const keyFromMonitor = new THREE.Vector2(desktop.keyboard.x - desktop.monitor.x, desktop.keyboard.z - desktop.monitor.z)
    const mouseFromKey = new THREE.Vector2(desktop.mouse.x - desktop.keyboard.x, desktop.mouse.z - desktop.keyboard.z)
    assert.ok(Math.abs(keyFromMonitor.dot(forward) - .32) < 1e-9); assert.ok(Math.abs(mouseFromKey.dot(right) - .54) < 1e-9)
  }
})

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

const doorApproach = (region) => {
  const door = region.doors[0], half = door.width / 2
  if (door.side === 'north') return { x0: door.at - half, x1: door.at + half, z0: region.z0, z1: region.z0 + 1.2 }
  if (door.side === 'south') return { x0: door.at - half, x1: door.at + half, z0: region.z1 - 1.2, z1: region.z1 }
  if (door.side === 'west') return { x0: region.x0, x1: region.x0 + 1.2, z0: door.at - half, z1: door.at + half }
  return { x0: region.x1 - 1.2, x1: region.x1, z0: door.at - half, z1: door.at + half }
}

test('O-06 derives meeting tables, seats and screens from V3 room boundaries without changing V2 fallback coordinates', () => {
  const v2 = officeFurnitureV2Spec(LAYOUT_V2), v3 = officeFurnitureV2Spec(LAYOUT_V3)
  assert.deepEqual(v2.board.screen, { x: -20, z: -17.72, yaw: 0, side: 'north', y: 2.4, w: 2, h: 1.125 })
  assert.deepEqual(v2.meetings.map(({ id, x, z, screen }) => ({ id, x, z, screen: { x: screen.x, z: screen.z, yaw: screen.yaw } })), [
    { id: 'A', x: -12.5, z: -14, screen: { x: -12.5, z: -17.72, yaw: 0 } },
    { id: 'B', x: -5.5, z: -14, screen: { x: -5.5, z: -17.72, yaw: 0 } },
  ])
  assert.deepEqual(v3.meetings.map(({ id, x, z, screen }) => ({ id, x, z, screen: { x: screen.x, z: screen.z, yaw: screen.yaw } })), [
    { id: 'A', x: -23, z: -7.5, screen: { x: -27.72, z: -7.5, yaw: Math.PI / 2 } },
    { id: 'B', x: -12.5, z: -7.5, screen: { x: -8.78, z: -7.5, yaw: -Math.PI / 2 } },
  ])
  assert.deepEqual(new Set(v3.workstations.map(item => item.name)), new Set(Object.keys(SEATS)))
  assert.deepEqual(new Set(v3.workstations.map(item => item.name)), new Set(Object.keys(LAYOUT_V3.seats)))
  assert.deepEqual(v3.workstations.map(item => [item.name, item.region, item.x, item.z]), Object.entries(LAYOUT_V3.seats).map(([name, [region, x, z]]) => [name, region, x, z]))
  assert.equal(new Set(v3.meetings.flatMap(room => room.seats.map(seat => `${room.id}:${seat.x},${seat.z}`))).size, 14)

  for (const room of v3.meetings) {
    const region = LAYOUT_V3.regions.find(item => item.id === room.region)
    const table = box(room.x, room.z, room.w, room.d)
    const screen = room.screen.yaw % Math.PI === 0
      ? box(room.screen.x, room.screen.z, room.screen.w, .05)
      : box(room.screen.x, room.screen.z, .05, room.screen.w)
    assert.ok(inside(table, region), `${room.id}/table`)
    assert.ok(inside(screen, region), `${room.id}/screen`)
    assert.equal(overlaps(table, doorApproach(region)), false, `${room.id}/table door approach`)
    assert.equal(overlaps(screen, doorApproach(region)), false, `${room.id}/screen door approach`)
    for (const seat of room.seats) {
      const chair = box(seat.x, seat.z, .62, .62)
      assert.ok(inside(chair, region), `${room.id}/chair`)
      assert.equal(overlaps(chair, table), false, `${room.id}/chair table`)
      assert.equal(overlaps(chair, doorApproach(region)), false, `${room.id}/chair door approach`)
    }
  }
  const boardRegion = LAYOUT_V3.regions.find(item => item.id === 'board')
  const boardScreen = box(v3.board.screen.x, v3.board.screen.z, .05, v3.board.screen.w)
  assert.deepEqual(v3.board.screen, { x: -8.78, z: -15, yaw: -Math.PI / 2, y: 2.4, w: 2, h: 1.125, side: 'east' })
  assert.ok(inside(boardScreen, boardRegion), 'V3 board screen stays in boardroom')
  assert.equal(overlaps(boardScreen, doorApproach(boardRegion)), false, 'V3 board screen clears boardroom door')
  assert.ok(v3.board.screen.x > v3.board.x && v3.board.screen.yaw === -Math.PI / 2, 'V3 board screen faces the board table from the east wall')
})

function fixture(withLegacy = false, layout = LAYOUT_V2) {
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
  const value = placeOfficeFurnitureV2({ THREE, scene, layout, A, placeFurniture, collision: { add(g, kind) { bodies.push({ g, kind, bounds: new THREE.Box3().setFromObject(g) }) } }, canvasTex, makeScreenTexture })
  const merged = mergeOfficeStatic(THREE, value.root), dispose = value.dispose
  assert.ok(merged.removed > 100); assert.equal(merged.added, 1)
  value.dispose = () => { merged.dispose(); dispose() }
  return { value, scene, bodies, scrs, legacy }
}

test('O-06 V3 furniture keeps its own meeting proxies and does not duplicate V2 wall colliders', () => {
  const { value, bodies } = fixture(false, LAYOUT_V3)
  assert.deepEqual(value.spec.meetings.map(room => [room.id, room.x, room.z]), [['A', -23, -7.5], ['B', -12.5, -7.5]])
  assert.equal(bodies.filter(body => body.kind === 'officeWall').length, 0)
  assert.equal(bodies.filter(body => body.kind === 'table').length, 3)
  assert.equal(bodies.filter(body => body.kind === 'meetingTable').length, 1)
  assert.equal(value.wing.seats.length, 14)
  value.dispose()
})

test('O4 renderer uses one shadow-free batch, collision proxies and private warm materials', () => {
  const { value, scene, bodies, scrs } = fixture()
  const visible = []; value.root.traverse(o => { if (o.isMesh && o.visible) visible.push(o) })
  assert.equal(visible.length, 1); assert.ok(visible[0].isMesh)
  assert.equal(visible[0].castShadow, false); assert.equal(visible[0].receiveShadow, false)
  assert.equal(visible[0].material.polygonOffset, true)
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
  const before = fs.readFileSync(new URL('./fixtures/historical/office3d-backup-o4/resume-20261021/app.js', import.meta.url), 'utf8')
  const after = fs.readFileSync(new URL('./fixtures/historical/office3d-backup-nav-1d/app.js', import.meta.url), 'utf8')
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
  const previous = await import('./fixtures/historical/office3d-backup-o4/resume-20261021/office-layout.js')
  const current = await import('../office-layout.js')
  const comparable = value => typeof value === 'function' ? String(value) : Array.isArray(value) ? value.map(comparable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, comparable(item)])) : value
  assert.deepEqual(comparable(current.LAYOUT_V1), comparable(previous.LAYOUT_V1))
  const warehouseB1Exports = new Set(['CAMPUS', 'CAMPUS_ZONES', 'CAMPUS_SHUTTLE_STRIP', 'CAMPUS_WALKABLE', 'CAMPUS_FLOWS', 'CAMPUS_MINI_BOUNDS'])
  for (const name of Object.keys(previous)) {
    if (name === 'LAYOUT_V2' || warehouseB1Exports.has(name)) continue
    if (name === 'resolveOfficeLayout') {
      assert.equal(current.resolveOfficeLayout('?layout=2'), current.LAYOUT_V2)
      assert.equal(current.resolveOfficeLayout(''), current.LAYOUT_V1)
      assert.equal(current.resolveOfficeLayout('?layout=2&layout=1'), current.LAYOUT_V1)
      assert.equal(current.resolveOfficeLayout('?layout=3'), current.LAYOUT_V3)
      continue
    }
    if (typeof previous[name] === 'function') assert.equal(String(current[name]), String(previous[name]), name)
    else assert.deepEqual(comparable(current[name]), comparable(previous[name]), name)
  }
})
