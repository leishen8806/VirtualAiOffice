import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { campusModules } from '../dr-campus-modules.js'
import { initialShuttleState, shuttleFrame, shuttlePlan } from '../dr-campus-shuttle-logic.js'
import { VIS2_COLORS, VIS2_DIMENSIONS, VIS2_REPLACES, buildVis2RackCell } from '../dr-vis2-rack-cell.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const highRack = CAMPUS_ZONES.find((zone) => zone.id === 'highRack')
const D = VIS2_DIMENSIONS
const build = (options = {}) => { const root = new THREE.Group(), cell = buildVis2RackCell({ THREE, root, layout, quality: { tier: 'high' }, ...options }); return { root, cell } }
const named = (cell, name) => cell.group.getObjectByName(name)
const hash = (mesh) => crypto.createHash('sha256').update(Buffer.from(mesh.instanceMatrix.array.buffer, 0, mesh.count * 16 * 4)).digest('hex')
const near = (a, b, tolerance = 1e-4) => Math.abs(a - b) < tolerance // 实例矩阵是 float32，不能用严格相等
const instances = (mesh) => {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), color = new THREE.Color(), out = []
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale); mesh.getColorAt(i, color); out.push({ x: position.x, y: position.y, z: position.z, sx: scale.x, sy: scale.y, sz: scale.z, hex: color.getHex(), rotated: Math.abs(quaternion.z) > 1e-6 }) }
  return out
}
const box = (item) => ({ x0: item.x - item.sx / 2, x1: item.x + item.sx / 2, y0: item.y - item.sy / 2, y1: item.y + item.sy / 2, z0: item.z - item.sz / 2, z1: item.z + item.sz / 2 })
const overlaps = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && a.x1 > b.x0 + eps && a.y0 < b.y1 - eps && a.y1 > b.y0 + eps && a.z0 < b.z1 - eps && a.z1 > b.z0 + eps
const worldBox = (object) => { object.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(object) } // 先刷新父级矩阵，否则 lift 后读到的是旧位置
const rackData = (cell) => {
  const frame = instances(named(cell, 'vis2-rack-frames')), pallets = instances(named(cell, 'vis2-rack-pallets')), cartons = instances(named(cell, 'vis2-rack-cartons'))
  return { uprights: frame.filter((item) => item.hex === VIS2_COLORS.upright && near(item.sx, D.uprightSize) && near(item.sy, D.uprightHeight)), beams: frame.filter((item) => item.hex === VIS2_COLORS.beam),
    decks: pallets.filter((item) => near(item.sy, 0.03)), cartons, film: instances(named(cell, 'vis2-rack-film')) }
}

test('structure uses exactly the approved blue and orange, from the shared layout rows', () => {
  const { cell } = build(), frame = instances(named(cell, 'vis2-rack-frames'))
  assert.deepEqual([...new Set(frame.map((item) => item.hex))].sort(), [VIS2_COLORS.upright, VIS2_COLORS.beam].sort())
  assert.equal(VIS2_COLORS.upright, 0x2f6fa8); assert.equal(VIS2_COLORS.beam, 0xe8832a)
  const summary = cell.summary()
  assert.deepEqual(summary.rows, ['A1', 'R2', 'C2', 'B2']); assert.equal(summary.uprights, 4 * 7 * 2)
  assert.ok(summary.beams >= 4 * 6 * 4 * 2 && summary.braces > 0 && summary.loads > 0 && summary.empty > 0)
})

test('every rack element stays inside the high-rack zone; vertical extent is measured from the finished floor', () => {
  const { cell } = build()
  for (const name of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons', 'vis2-rack-film']) for (const item of instances(named(cell, name))) {
    if (item.rotated) continue
    const b = box(item)
    assert.ok(b.x0 >= highRack.x0 - 1e-6 && b.x1 <= highRack.x1 + 1e-6 && b.z0 >= highRack.z0 - 1e-6 && b.z1 <= highRack.z1 + 1e-6, `${name} inside zone`)
    assert.ok(b.y0 >= -1e-6 && b.y1 <= D.uprightHeight + 1e-6, `${name} between floor and rack top`)
  }
})

test('every pallet rests on both beams of its bay: beam x lies under the pallet and the pallet lies inside the beam length', () => {
  const { cell } = build(), { beams, decks } = rackData(cell)
  assert.ok(decks.length > 50)
  for (const deck of decks) {
    const base = deck.y + 0.015 - D.palletHeight, support = beams.filter((beam) => near(beam.y + beam.sy / 2, base) && Math.abs(beam.x - deck.x) < deck.sx / 2 && beam.z - beam.sz / 2 <= deck.z - deck.sz / 2 + 1e-4 && beam.z + beam.sz / 2 >= deck.z + deck.sz / 2 - 1e-4)
    assert.equal(support.length, 2, `pallet at z=${deck.z.toFixed(2)} y=${deck.y.toFixed(2)} needs exactly two supporting beams`)
    assert.ok(support[0].x < deck.x && support[1].x > deck.x || support[0].x > deck.x && support[1].x < deck.x, 'one beam on each side of the pallet centre')
  }
})

test('every carton lies inside its pallet footprint, sits on the deck, and clears the beam above', () => {
  const { cell } = build(), { decks, cartons, beams } = rackData(cell)
  assert.ok(cartons.length > 200)
  for (const carton of cartons) {
    const deck = decks.filter((d) => near(d.x, carton.x, 0.5) && Math.abs(d.z - carton.z) < d.sz / 2 + 0.05 && carton.y > d.y).sort((a, b) => Math.abs(a.y - carton.y) - Math.abs(b.y - carton.y))[0]
    assert.ok(deck, 'carton has a pallet underneath')
    const c = box(carton), d = box(deck)
    assert.ok(c.x0 >= d.x0 - 1e-4 && c.x1 <= d.x1 + 1e-4 && c.z0 >= d.z0 - 1e-4 && c.z1 <= d.z1 + 1e-4, 'carton inside pallet footprint')
    const above = beams.filter((beam) => beam.y - beam.sy / 2 > deck.y).map((beam) => beam.y - beam.sy / 2).sort((a, b) => a - b)[0]
    assert.ok(c.y1 <= above - 0.05, 'carton top clears the beam above')
  }
})

test('no pallet, carton or film overlaps an upright, another pallet, or a neighbouring carton', () => {
  const { cell } = build(), { uprights, decks, cartons, film } = rackData(cell), upBoxes = uprights.map(box)
  for (const item of [...decks, ...cartons, ...film]) { const b = box(item); for (const up of upBoxes) assert.equal(overlaps(b, up), false, 'cargo never intersects an upright') }
  const deckBoxes = decks.map(box)
  for (let i = 0; i < deckBoxes.length; i++) for (let j = i + 1; j < deckBoxes.length; j++) assert.equal(overlaps(deckBoxes[i], deckBoxes[j]), false, 'pallets do not overlap')
  const byDeck = new Map(); for (const carton of cartons) { const key = `${carton.x.toFixed(2)}|${carton.z.toFixed(1)}|${Math.round(carton.y * 4)}`; if (!byDeck.has(key)) byDeck.set(key, []); byDeck.get(key).push(box(carton)) }
  for (const group of byDeck.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) assert.equal(overlaps(group[i], group[j], 1e-4), false, 'neighbouring cartons do not interpenetrate')
})

test('beams are attached to the uprights: each beam end reaches into the upright (no gap)', () => {
  const { cell } = build(), { beams, uprights } = rackData(cell)
  for (const beam of beams) {
    const ends = [beam.z - beam.sz / 2, beam.z + beam.sz / 2]
    for (const end of ends) assert.ok(uprights.some((up) => Math.abs(up.z - end) <= up.sz / 2 + 1e-6 && Math.abs(up.x - beam.x) <= D.uprightSize), `beam end z=${end.toFixed(3)} is inside an upright footprint`)
  }
})

test('shuttle chassis: wheels sit exactly on the two rails and stay there for every lift value', () => {
  const { cell } = build(), plan = shuttlePlan(layout), chassis = named(cell, 'vis2-shuttle-chassis'), railTop = D.railBase + D.railHeight
  const wheels = chassis.geometry.userData.parts.filter((part) => part.kind === 'wheel'), position = chassis.geometry.attributes.position
  assert.equal(wheels.length, 4)
  for (const wheel of wheels) {
    let minY = Infinity; for (let i = wheel.vertexStart; i < wheel.vertexStart + wheel.vertexCount; i++) minY = Math.min(minY, position.getY(i))
    assert.ok(near(minY, railTop, 1e-6), 'wheel bottom equals rail top')
    assert.ok(plan.rails.some((rail) => near(rail - plan.centerX, wheel.center[0], 1e-6)), 'wheel x is on a rail')
  }
  const base = worldBox(chassis).min.y
  for (const lift of [0, 0.05, D.shuttle.maxLift, 99]) { cell.setShuttle({ lift }); assert.ok(near(worldBox(chassis).min.y, base, 1e-9), `chassis does not move with lift=${lift}`) }
})

test('lift moves only the platform and its cargo; cargo never floats or intersects the chassis', () => {
  const { cell } = build(), chassis = named(cell, 'vis2-shuttle-chassis'), platform = named(cell, 'vis2-shuttle-platform'), load = named(cell, 'vis2-shuttle-load')
  cell.setShuttle({ lift: 0 }); const p0 = worldBox(platform), l0 = worldBox(load), c0 = worldBox(chassis)
  assert.ok(near(p0.min.y, c0.max.y, 1e-6), 'platform rests on the chassis top at lift 0'); assert.ok(near(l0.min.y, p0.max.y, 1e-6) || l0.min.y >= p0.max.y - 1e-6, 'load rests on the platform')
  cell.setShuttle({ lift: 0.12 }); const p1 = worldBox(platform), l1 = worldBox(load), c1 = worldBox(chassis)
  assert.ok(near(p1.min.y - p0.min.y, 0.12, 1e-6) && near(l1.min.y - l0.min.y, 0.12, 1e-6), 'platform and cargo rise together by lift')
  assert.ok(near(c1.min.y, c0.min.y, 1e-9) && near(c1.max.y, c0.max.y, 1e-9), 'chassis does not move')
  assert.ok(l1.min.y >= p1.max.y - 1e-6, 'cargo does not sink into the platform when lifted')
  cell.setShuttle({ carrying: false }); assert.equal(load.visible, false); cell.setShuttle({ carrying: true }); assert.equal(load.visible, true)
  const liftGroup = named(cell, 'vis2-shuttle-lift')
  cell.setShuttle({ lift: 99 }); assert.ok(near(liftGroup.position.y, D.shuttle.maxLift, 1e-9), 'lift is clamped to the maximum'); cell.setShuttle({ lift: -5 }); assert.ok(near(liftGroup.position.y, 0, 1e-9), 'negative lift is clamped to 0')
})

test('host state: carrying, occupied and status are accepted from the host only, invalid values are ignored', () => {
  const { cell } = build(), summary0 = cell.summary()
  assert.equal(summary0.state.source, 'fixture')
  assert.equal(cell.setShuttle({ z: 'x', lift: NaN, carrying: 1, occupied: [true], status: 5 }), false, 'nothing valid -> nothing changes'); assert.equal(cell.summary().state.source, 'fixture')
  assert.equal(cell.setShuttle({ occupied: [false, true, false], status: 'moving' }), true)
  const s = cell.summary().state; assert.deepEqual(s.occupied, [false, true, false]); assert.equal(s.status, 'moving'); assert.equal(s.source, 'host')
  assert.equal(named(cell, 'vis2-slot-pallets').count, 1 + 3 + 4, 'one parked pallet = deck + 3 bearers + 4 cartons')
  cell.setShuttle({ occupied: [false, false, false] }); assert.equal(named(cell, 'vis2-slot-pallets').visible, false)
})

test('intermediate world positions are reachable: driving setShuttle with the real shuttleFrame reaches slot-b and is not clamped', () => {
  const { cell } = build(), plan = shuttlePlan(layout), shuttle = named(cell, 'vis2-shuttle')
  const slots = plan.slots.map((slot) => +slot.z.toFixed(2))
  assert.deepEqual(slots, [plan.path.z0, (plan.path.z0 + plan.path.z1) / 2, plan.path.z1].map((z) => +z.toFixed(2)))
  const state = { ...initialShuttleState(plan), target: plan.slots[1].z, movingFrom: plan.slots[0].z, movingAt: 0, lastAt: 0, status: 'moving' }
  for (const time of [0, 600, 1100, 1600, 2200]) {
    const frame = shuttleFrame(state, time)
    cell.setShuttle({ z: frame.position, lift: frame.lift, carrying: frame.carrying, occupied: frame.occupied, status: frame.status })
    assert.ok(near(shuttle.position.z, frame.position, 1e-9), `t=${time}: z = frame.position (world z), not remapped`)
  }
  assert.ok(near(shuttle.position.z, plan.slots[1].z, 1e-9), 'arrives at the intermediate slot, not an endpoint')
  for (const z of slots) { cell.setShuttle({ z }); assert.ok(near(shuttle.position.z, z, 1e-9), `reaches z=${z}`) }
  cell.setShuttle({ z: -1000 }); assert.ok(near(shuttle.position.z, plan.path.z0, 1e-9)); cell.setShuttle({ z: 1000 }); assert.ok(near(shuttle.position.z, plan.path.z1, 1e-9))
  const stripBox = worldBox(shuttle); assert.ok(stripBox.min.z >= CAMPUS_SHUTTLE_STRIP.z0 && stripBox.max.z <= CAMPUS_SHUTTLE_STRIP.z1)
})

test('shuttle geometry: every triangle winds counter-clockwise outward and matches its stored normal', () => {
  const { cell } = build()
  for (const name of ['vis2-shuttle-chassis', 'vis2-shuttle-platform', 'vis2-shuttle-load']) {
    const g = named(cell, name).geometry, p = g.attributes.position, n = g.attributes.normal, index = g.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), stored = new THREE.Vector3(), centroid = new THREE.Vector3()
    for (const part of g.userData.parts) for (let t = part.triStart; t < part.triStart + part.triCount; t++) {
      const [i, j, k] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]]
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, j); c.fromBufferAttribute(p, k)
      face.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); stored.fromBufferAttribute(n, i).add(new THREE.Vector3().fromBufferAttribute(n, j)).add(new THREE.Vector3().fromBufferAttribute(n, k)).normalize()
      assert.ok(face.dot(stored) > 0.7, `${name}/${part.name}: winding agrees with the stored normal`)
      centroid.copy(a).add(b).add(c).divideScalar(3).sub(new THREE.Vector3(...part.center))
      assert.ok(face.dot(centroid) > -1e-9, `${name}/${part.name}: face points away from the part centre`)
    }
    for (let v = 0; v < n.count; v++) assert.ok(near(new THREE.Vector3().fromBufferAttribute(n, v).length(), 1, 1e-5), 'unit normals')
  }
})

test('one vertical reference: baseY moves every part by exactly the same amount and nothing else', () => {
  const a = build({ baseY: 0 }), b = build({ baseY: 3.7 }), boxA = worldBox(a.cell.group), boxB = worldBox(b.cell.group)
  assert.ok(near(boxB.min.y - boxA.min.y, 3.7, 1e-6) && near(boxB.max.y - boxA.max.y, 3.7, 1e-6)); assert.ok(near(boxB.min.x, boxA.min.x, 1e-9) && near(boxB.max.z, boxA.max.z, 1e-9))
  for (const name of ['vis2-rack-frames', 'vis2-rails', 'vis2-shuttle-chassis']) assert.ok(near(worldBox(named(b.cell, name)).min.y - worldBox(named(a.cell, name)).min.y, 3.7, 1e-6), `${name} follows baseY`)
  const sa = a.cell.summary(), sb = b.cell.summary(); assert.deepEqual(sa.vertical, sb.vertical, 'heights are relative to the floor')
  assert.ok(sa.baseYSource.includes('预览') && sb.baseYSource === '宿主传入')
  assert.throws(() => build({ baseY: Number.NaN })); assert.throws(() => build({ baseY: Infinity }))
  assert.ok(near(sa.vertical.wheelBottom, sa.vertical.railTop, 1e-3), 'wheel bottom = rail top')
})

test('legacy conflict fixture: at baseY = 0 the old shuttle base slab (y 0.06…0.18) would bury the new rails, so the old slab must be removed', () => {
  const racks = fs.readFileSync(new URL('../dr-campus-racks.js', import.meta.url), 'utf8'), match = racks.match(/y:\s*\.12,[^}]*sy:\s*\.12/)
  assert.ok(match, 'legacy slab (y .12, sy .12) still exists in dr-campus-racks.js; if it changes this fixture must be reviewed')
  const slabTop = 0.12 + 0.12 / 2, railTop = D.railBase + D.railHeight, wheelBottom = railTop
  assert.ok(slabTop > railTop && slabTop > wheelBottom, 'fixture: the legacy slab hides the rails and wheel bottoms')
  assert.ok(VIS2_REPLACES.some((item) => item.legacy === 'campus-racks-static' && item.part.includes('底座板')), 'replacement list names the slab')
})

test('deterministic for a seed and different for another; low quality is lighter and creates no empty film mesh', () => {
  const a = build(), b = build(), c = build({ seed: 999 }), low = build({ quality: { tier: 'low' } })
  for (const name of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons']) assert.equal(hash(named(a.cell, name)), hash(named(b.cell, name)))
  assert.notEqual(hash(named(a.cell, 'vis2-rack-cartons')), hash(named(c.cell, 'vis2-rack-cartons')))
  const high = a.cell.summary(), light = low.cell.summary()
  assert.ok(high.triangles <= 40000, `high triangles ${high.triangles}`); assert.ok(light.triangles < high.triangles / 2); assert.deepEqual(light.rows, ['A1', 'R2'])
  assert.equal(named(low.cell, 'vis2-rack-film'), undefined, 'no empty film mesh in the scene at low quality')
  assert.equal(high.componentPreviewDrawCalls, (() => { let n = 0; a.cell.group.traverse((node) => { if (node.isMesh && node.visible && (!node.isInstancedMesh || node.count > 0)) n++ }); return n })(), 'draw calls are counted from the real scene graph, not a constant')
})

test('quality contract: every mesh opts out of the global quality capture (qualityProxy) and the module handles its own low tier', () => {
  const { cell } = build(); const meshes = []; cell.group.traverse((node) => { if (node.isMesh) meshes.push(node) })
  assert.ok(meshes.length >= 9); for (const mesh of meshes) assert.equal(mesh.userData.qualityProxy, true, `${mesh.name} has qualityProxy`)
  const quality = fs.readFileSync(new URL('../quality.js', import.meta.url), 'utf8')
  assert.ok(/if\(!o\.isMesh\|\|o\.userData\.qualityProxy\)return/.test(quality), 'quality.js capture() still skips qualityProxy meshes (the contract this module relies on)')
})

test('inside the real campus registry with the old modules: static parts merge, film and shuttle stay, and merged object names are NOT available for picking', () => {
  const canvasTex = (w, h, draw) => { draw({ fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}, measureText: () => ({ width: 10 }) }, w, h); const t = new THREE.Texture(); t.image = { width: w, height: h }; return t }
  const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout })
  for (const [name, factory] of campusModules) registry.register(name, factory)
  registry.register('vis2Rack', (context) => buildVis2RackCell(context))
  registry.buildAll({ canvasTex, quality: { tier: 'high' } })
  const summary = registry.summary(), root = registry.root
  assert.ok(summary.modules.includes('vis2Rack') && !summary.skipped.some((item) => item.name === 'vis2Rack'))
  for (const merged of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons', 'vis2-rails', 'campus-racks-static']) assert.equal(root.getObjectByName(merged), undefined, `${merged} is merged away: render-object names are not stable pick targets`)
  for (const kept of ['vis2-rack-film', 'vis2-shuttle', 'campus-rack-labels']) assert.ok(root.getObjectByName(kept), `${kept} stays as its own object`)
  assert.ok(root.getObjectByName('campus-opaque-batch-1'))
  registry.dispose()
})

test('dispose releases every owned resource exactly once, also when called twice and after registry merging', () => {
  const { root, cell } = build(), geometries = new Map(), materials = new Map()
  cell.group.traverse((node) => { if (node.geometry) geometries.set(node.geometry, 0); if (node.material) materials.set(node.material, 0) })
  for (const geometry of geometries.keys()) geometry.addEventListener('dispose', () => geometries.set(geometry, geometries.get(geometry) + 1))
  for (const material of materials.keys()) material.addEventListener('dispose', () => materials.set(material, materials.get(material) + 1))
  cell.dispose(); cell.dispose()
  assert.equal(cell.group.parent, null); assert.equal(root.children.length, 0)
  for (const [, count] of geometries) assert.equal(count, 1, 'geometry disposed exactly once'); for (const [, count] of materials) assert.equal(count, 1, 'material disposed exactly once')
  assert.equal(cell.setShuttle({ z: 0 }), false, 'setShuttle is inert after dispose')
  const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout }); registry.register('vis2Rack', (context) => buildVis2RackCell(context)); registry.buildAll({})
  assert.doesNotThrow(() => { registry.dispose(); registry.dispose() })
})

test('the replacement list names real legacy objects and the module stays free of unsafe APIs', () => {
  const racks = fs.readFileSync(new URL('../dr-campus-racks.js', import.meta.url), 'utf8'), shuttle = fs.readFileSync(new URL('../dr-campus-shuttle.js', import.meta.url), 'utf8')
  const names = (text) => new Set([...text.matchAll(/name = [`'"]([^`'"$]+)/g)].map((m) => m[1]).concat([...text.matchAll(/mesh\.name = `([a-z-]+)-/g)].map((m) => m[1])))
  const known = new Set([...names(racks), ...names(shuttle)])
  for (const item of VIS2_REPLACES) assert.ok(known.has(item.legacy) || [...known].some((name) => name.startsWith(item.legacy)), `legacy object exists: ${item.legacy}`)
  const source = fs.readFileSync(new URL('../dr-vis2-rack-cell.js', import.meta.url), 'utf8')
  for (const forbidden of ['requestAnimationFrame', 'Math.random', 'Date.now', 'performance.now', 'fetch(', 'innerHTML', 'WebGLRenderer', 'setInterval', 'setTimeout', 'localStorage', 'computeVertexNormals']) assert.equal(source.includes(forbidden), false, forbidden)
})
