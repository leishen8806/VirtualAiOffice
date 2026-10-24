import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_BUILDING, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { campusModules } from '../dr-campus-modules.js'
import { createDemoShuttleEventSource, initialShuttleState, shuttleFrame, shuttlePlan } from '../dr-campus-shuttle-logic.js'
import { buildCampusShell, CAMPUS_FINISHED_FLOOR_Y } from '../dr-campus-shell.js'
import { buildCampusRacks } from '../dr-campus-racks.js'
import { buildCampusShuttle } from '../dr-campus-shuttle.js'
import { VIS2_COLORS, VIS2_DIMENSIONS, VIS2_REPLACES, buildVis2RackCell } from '../dr-vis2-rack-cell.js'

const layout = { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
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
const instanceWorldBox = (parent, mesh, index) => {
  const matrix = new THREE.Matrix4()
  parent.updateWorldMatrix(true, true)
  mesh.getMatrixAt(index, matrix)
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld.clone().multiply(matrix))
}
const partBox = (mesh, name) => {
  const part = mesh.geometry.userData.parts.find(item => item.name === name)
  assert.ok(part, `part exists: ${name}`)
  mesh.updateWorldMatrix(true, false)
  const position = mesh.geometry.attributes.position, point = new THREE.Vector3(), result = new THREE.Box3()
  result.makeEmpty()
  for (let index = part.vertexStart; index < part.vertexStart + part.vertexCount; index++) {
    result.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld))
  }
  return result
}
const sourceIds = root => {
  const ids = new Set()
  root.traverse(node => node.userData?.sourceIds?.forEach(id => ids.add(id)))
  return ids
}
const canvasTex = (width, height, draw) => {
  draw({ fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set font(value) {}, set textAlign(value) {}, set textBaseline(value) {}, measureText: () => ({ width: 10 }) }, width, height)
  const texture = new THREE.Texture()
  texture.image = { width, height }
  return texture
}
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

test('slot pallets clear the shuttle body at every occupied slot and all cartons rest on their pallets', () => {
  const { cell } = build(), plan = shuttlePlan(layout), slots = named(cell, 'vis2-slot-pallets')
  for (const slot of plan.slots) {
    cell.setShuttle({ z: slot.z, occupied: [true, true, true] })
    const shuttleBox = worldBox(named(cell, 'vis2-shuttle-chassis'))
    for (const item of instances(slots)) assert.equal(overlaps(box(item), {
      x0: shuttleBox.min.x, x1: shuttleBox.max.x, y0: shuttleBox.min.y, y1: shuttleBox.max.y, z0: shuttleBox.min.z, z1: shuttleBox.max.z,
    }), false, `slot cargo clears shuttle at ${slot.id}`)
  }
  const slotCartons = instances(slots).filter(item => near(item.sy, .348))
  assert.equal(slotCartons.length, 12)
  const slotDecks = instances(slots).filter(item => near(item.sy, .03) && near(item.sx, D.palletZ))
  for (const slot of plan.slots) {
    const deck = slotDecks.find(item => near(item.z, slot.z))
    assert.ok(deck, `slot ${slot.id} has a measured deck`)
    const deckTop = box(deck).y1
    for (const carton of slotCartons.filter(item => Math.abs(item.z - slot.z) < .4)) {
      assert.ok(near(box(carton).y0, deckTop, 1e-4), `slot ${slot.id} carton rests on its measured deck`)
    }
  }
  for (const pallet of rackData(cell).decks) {
    const cartons = rackData(cell).cartons.filter(carton =>
      Math.abs(pallet.x - carton.x) < .5 &&
      Math.abs(pallet.z - carton.z) < pallet.sz / 2 &&
      carton.y > pallet.y &&
      carton.y < pallet.y + 1,
    )
    assert.ok(cartons.length >= 4)
    const deckTop = box(pallet).y1
    const firstLayer = cartons.filter(carton => box(carton).y0 < deckTop + .01)
    assert.equal(firstLayer.length, 4, 'each pallet has four first-layer cartons')
    for (const carton of firstLayer) assert.ok(near(box(carton).y0, deckTop, 1e-4), 'every first-layer carton rests on its pallet deck')
    const columns = new Map()
    for (const carton of cartons) {
      const key = `${carton.x.toFixed(4)}|${carton.z.toFixed(4)}`
      if (!columns.has(key)) columns.set(key, [])
      columns.get(key).push(carton)
    }
    for (const column of columns.values()) {
      column.sort((a, b) => a.y - b.y)
      for (let index = 1; index < column.length; index++) {
        assert.ok(near(box(column[index]).y0, box(column[index - 1]).y1 + .012, 1e-4), 'upper carton clears the lower carton by 12 mm')
      }
    }
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

test('shuttle load cartons rest on the measured pallet deck and preserve the upper-layer gap', () => {
  const { cell } = build()
  const load = named(cell, 'vis2-shuttle-load')
  const deckTop = partBox(load, 'pallet-deck').max.y
  for (const suffix of ['-1-1', '-11', '1-1', '11']) {
    assert.ok(near(partBox(load, `carton0${suffix}`).min.y, deckTop, 1e-4), `first-layer shuttle carton ${suffix} rests on its deck`)
    assert.ok(near(partBox(load, `carton1${suffix}`).min.y, partBox(load, `carton0${suffix}`).max.y + .012, 1e-4), `upper shuttle carton ${suffix} clears lower carton by 12 mm`)
  }
})

test('slot and shuttle pallet decks rest on their measured bearer tops', () => {
  const { cell } = build(), slots = named(cell, 'vis2-slot-pallets'), slotParts = instances(slots)
  const slotDecks = slotParts.filter(item => near(item.sy, .03) && near(item.sx, D.palletZ))
  const slotBearers = slotParts.filter(item => near(item.sy, .09) && near(item.sx, D.palletZ))
  assert.equal(slotDecks.length, 2)
  for (const deck of slotDecks) {
    const bearers = slotBearers.filter(bearer => near(bearer.x, deck.x) && Math.abs(bearer.z - deck.z) <= .4001)
    assert.equal(bearers.length, 3, `slot pallet at z=${deck.z.toFixed(2)} has three bearer legs`)
    for (const bearer of bearers) assert.ok(near(box(deck).y0, box(bearer).y1, 1e-4), 'slot pallet deck rests on every bearer top')
  }
  const load = named(cell, 'vis2-shuttle-load'), deck = partBox(load, 'pallet-deck')
  for (const name of ['pallet-bearer-0.4', 'pallet-bearer0', 'pallet-bearer0.4']) {
    const bearer = partBox(load, name)
    assert.ok(near(deck.min.y, bearer.max.y, 1e-4), `shuttle pallet deck rests on ${bearer.min.x.toFixed(1)} bearer top`)
  }
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
  assert.deepEqual(plan.slots.map((slot) => +slot.z.toFixed(2)), [-6.85, -1, 4.85])
  const state = { ...initialShuttleState(plan), target: plan.slots[1].z, movingFrom: plan.slots[0].z, movingAt: 0, lastAt: 0, status: 'moving' }
  for (const time of [0, 600, 1100, 1600, 2200]) {
    const frame = shuttleFrame(state, time)
    cell.setShuttle({ z: frame.position, lift: frame.lift, carrying: frame.carrying, occupied: frame.occupied, status: frame.status })
    assert.ok(near(shuttle.position.z, frame.position, 1e-9), `t=${time}: z = frame.position (world z), not remapped`)
  }
  assert.ok(near(shuttle.position.z, -1, 1e-9), 'arrives at the intermediate slot -1, not an endpoint')
  for (const z of [-6.85, -1, 4.85]) { cell.setShuttle({ z }); assert.ok(near(shuttle.position.z, z, 1e-9), `reaches z=${z}`) }
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

test('real campus module wiring keeps one finished-floor rack cell, removes legacy rack and shuttle parts, and forwards shuttle frames', () => {
  // Build the production factories without merge first so the support instances
  // themselves, rather than their parameter echo, prove finished-floor alignment.
  const directRoot = new THREE.Group()
  const directContext = { THREE, root: directRoot, layout, canvasTex, quality: { tier: 'high' } }
  const factories = new Map(campusModules)
  const directCell = factories.get('vis2Rack')(directContext)
  const directRacks = factories.get('racks')(directContext)
  const support = directRoot.getObjectByName('campus-racks-support')
  assert.equal(support.count, 10)
  for (let index = 0; index < support.count; index++) {
    assert.ok(near(instanceWorldBox(directRoot, support, index).min.y, CAMPUS_FINISHED_FLOOR_Y, 1e-6), `support instance ${index} rests on the finished floor`)
  }
  directRacks.dispose()
  directCell.dispose()

  const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout })
  for (const [name, factory] of campusModules) registry.register(name, factory)
  let time = 0
  const source = createDemoShuttleEventSource({ now: () => time, seed: 1212, plan: shuttlePlan(layout) })
  registry.buildAll({ canvasTex, quality: { tier: 'high' }, eventSource: source })
  const summary = registry.summary(), root = registry.root
  assert.ok(summary.modules.includes('vis2Rack') && !summary.skipped.some((item) => item.name === 'vis2Rack'))
  const cell = root.userData.vis2RackCell
  assert.ok(cell)
  assert.equal(cell.group.position.y, CAMPUS_FINISHED_FLOOR_Y)
  assert.deepEqual(root.userData.campusRackSupport, {
    instances: 10,
    baseY: CAMPUS_FINISHED_FLOOR_Y,
    ids: ['station-inspection', 'station-picking', 'station-packing', 'receiving-door-1', 'receiving-door-2', 'receiving-door-3', 'receiving-door-4', 'shipping-door-1', 'shipping-door-2', 'shipping-door-3'],
  })
  const ids = sourceIds(root)
  for (const removed of ['campus-racks-static', 'campus-shuttle-rail-1-lower', 'campus-shuttle-sleeper-1', 'campus-shuttle-vehicle']) assert.equal(ids.has(removed), false, `${removed} is absent from the production result`)
  assert.equal(ids.has('campus-racks-support'), true)
  assert.equal(root.getObjectByName('campus-shuttle-vehicle'), undefined)
  for (const merged of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons', 'vis2-rails', 'campus-racks-static']) assert.equal(root.getObjectByName(merged), undefined, `${merged} is merged away: render-object names are not stable pick targets`)
  for (const kept of ['vis2-rack-film', 'vis2-shuttle', 'campus-rack-labels']) assert.ok(root.getObjectByName(kept), `${kept} stays as its own object`)
  const statuses = new Set()
  for (time = 0; time <= 600000 && !statuses.has('delivery'); time += 100) {
    registry.onFrame(.1)
    const shuttle = root.getObjectByName('campus-shuttle')
    const expected = {
      z: shuttle.userData.shuttle.position,
      lift: shuttle.userData.shuttle.lift,
      carrying: shuttle.userData.pallets.carrying,
      occupied: shuttle.userData.pallets.occupied,
      status: shuttle.userData.shuttle.status,
    }
    const actual = cell.summary().state
    assert.deepEqual(
      { z: actual.z, lift: actual.lift, carrying: actual.carrying, occupied: actual.occupied, status: actual.status },
      expected,
      `t=${time}: rack cell receives the full production shuttle frame`,
    )
    statuses.add(actual.status)
  }
  assert.ok(statuses.has('delivery'), 'production shuttle frames reach delivery')
  assert.ok(statuses.size > 1, 'production shuttle frames advance beyond the fixture idle state')
  assert.equal(named(cell, 'vis2-shuttle-lamp').material.color.getHex(), VIS2_COLORS.lampWork, 'delivery uses the work lamp color')
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

test('shuttle reserve guide stays 2 mm above the finished floor', () => {
  const root = new THREE.Group()
  const shell = buildCampusShell({ THREE, root, canvasTex, layout, quality: { tier: 'high' } })
  const guide = root.getObjectByName('campus-shuttle-reserve')
  assert.ok(guide)
  assert.ok(near(worldBox(guide).min.y, CAMPUS_FINISHED_FLOOR_Y + .002, 1e-6))
  shell.dispose()
})

test('rack and shuttle replacement paths build real legacy or VIS2 support objects as intended', () => {
  const legacyRoot = new THREE.Group()
  const legacyRacks = buildCampusRacks({ THREE, root: legacyRoot, canvasTex, layout, quality: { tier: 'high' }, replaceRackCell: false })
  assert.ok(legacyRoot.getObjectByName('campus-racks-static'))
  assert.equal(legacyRoot.getObjectByName('campus-racks-support'), undefined)

  const replacementRoot = new THREE.Group()
  const replacementRacks = buildCampusRacks({ THREE, root: replacementRoot, canvasTex, layout, quality: { tier: 'high' }, baseY: CAMPUS_FINISHED_FLOOR_Y, replaceRackCell: true })
  assert.equal(replacementRoot.getObjectByName('campus-racks-static'), undefined)
  assert.equal(replacementRoot.getObjectByName('campus-racks-support').count, 10)

  const legacyShuttle = buildCampusShuttle({ THREE, root: legacyRoot, canvasTex, layout, quality: { tier: 'high' }, visualCell: null })
  assert.ok(legacyRoot.getObjectByName('campus-shuttle-static'))
  assert.ok(legacyRoot.getObjectByName('campus-shuttle-vehicle'))
  for (const { legacy } of VIS2_REPLACES) {
    assert.ok(legacyRoot.getObjectByName(legacy), `replacement list names an exact legacy object: ${legacy}`)
  }

  const replacementShuttle = buildCampusShuttle({ THREE, root: replacementRoot, canvasTex, layout, quality: { tier: 'high' }, visualCell: { setShuttle() {} } })
  assert.equal(replacementRoot.getObjectByName('campus-shuttle-static'), undefined)
  assert.equal(replacementRoot.getObjectByName('campus-shuttle-vehicle'), undefined)

  replacementShuttle.dispose()
  legacyShuttle.dispose()
  replacementRacks.dispose()
  legacyRacks.dispose()
})

test('rack cell module stays free of unsafe APIs', () => {
  const source = fs.readFileSync(new URL('../dr-vis2-rack-cell.js', import.meta.url), 'utf8')
  for (const forbidden of ['requestAnimationFrame', 'Math.random', 'Date.now', 'performance.now', 'fetch(', 'innerHTML', 'WebGLRenderer', 'setInterval', 'setTimeout', 'localStorage', 'computeVertexNormals']) assert.equal(source.includes(forbidden), false, forbidden)
})
