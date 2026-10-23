import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { VIS2_COLORS, VIS2_DIMENSIONS, VIS2_REPLACES, buildVis2RackCell } from '../dr-vis2-rack-cell.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const highRack = CAMPUS_ZONES.find((zone) => zone.id === 'highRack')
const D = VIS2_DIMENSIONS
const build = (options = {}) => { const root = new THREE.Group(), cell = buildVis2RackCell({ THREE, root, layout, quality: { tier: 'high' }, ...options }); return { root, cell } }
const batch = (cell, name) => cell.group.getObjectByName(name)
const hash = (mesh) => crypto.createHash('sha256').update(Buffer.from(mesh.instanceMatrix.array.buffer, 0, mesh.count * 16 * 4)).digest('hex')
const instances = (mesh) => {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), color = new THREE.Color(), out = []
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale); mesh.getColorAt(i, color); out.push({ x: position.x, y: position.y, z: position.z, sx: scale.x, sy: scale.y, sz: scale.z, hex: color.getHex(), rotated: Math.abs(quaternion.z) > 1e-6 }) }
  return out
}
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) < tolerance // 实例矩阵是 float32，不能用严格相等
const half = (item, axis) => Math.abs(item.sx) * (axis === 'x' ? 0.5 : 0) + Math.abs(item.sy) * (axis === 'y' ? 0.5 : 0) + Math.abs(item.sz) * (axis === 'z' ? 0.5 : 0)

test('structure uses exactly the approved blue and orange, from the shared layout rows', () => {
  const { cell } = build(), frame = instances(batch(cell, 'vis2-rack-frames'))
  const colors = new Set(frame.map((item) => item.hex))
  assert.deepEqual([...colors].sort(), [VIS2_COLORS.upright, VIS2_COLORS.beam].sort())
  assert.equal(VIS2_COLORS.upright, 0x2f6fa8); assert.equal(VIS2_COLORS.beam, 0xe8832a)
  const summary = cell.summary()
  assert.deepEqual(summary.rows, ['A1', 'R2', 'C2', 'B2'])
  assert.equal(summary.uprights, 4 * 7 * 2)
  assert.ok(summary.beams >= 4 * 6 * 4 * 2)
  assert.ok(summary.braces > 0 && summary.loads > 0 && summary.empty > 0)
})

test('every rack element stays inside the high-rack zone and below the building roof', () => {
  const { cell } = build()
  for (const name of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons', 'vis2-rack-film']) for (const item of instances(batch(cell, name))) {
    if (item.rotated) continue
    assert.ok(item.x - half(item, 'x') >= highRack.x0 - 1e-6 && item.x + half(item, 'x') <= highRack.x1 + 1e-6, `${name} x`)
    assert.ok(item.z - half(item, 'z') >= highRack.z0 - 1e-6 && item.z + half(item, 'z') <= highRack.z1 + 1e-6, `${name} z`)
    assert.ok(item.y - half(item, 'y') >= -1e-6 && item.y + half(item, 'y') <= 4.45, `${name} y`)
  }
})

test('loads rest on beams, never reach the beam above, and leave the top beam empty', () => {
  const { cell } = build(), pallets = instances(batch(cell, 'vis2-rack-pallets')), cartons = instances(batch(cell, 'vis2-rack-cartons')), film = instances(batch(cell, 'vis2-rack-film'))
  const beamTop = D.beamLevels.map((level) => level + D.beamHeight / 2), loadLevels = beamTop.slice(0, 3)
  const decks = pallets.filter((item) => near(item.sy, 0.03))
  assert.ok(decks.length > 50)
  for (const deck of decks) {
    const base = deck.y + 0.015 - D.palletHeight
    assert.ok(loadLevels.some((top) => near(top, base)), 'pallet base sits on a load-level beam')
    assert.ok(deck.sx / 2 > 0.475, 'pallet overhangs both beams (beam offset 0.475)')
  }
  for (const carton of cartons) {
    const level = loadLevels.findLastIndex((top) => carton.y - carton.sy / 2 >= top + D.palletHeight - 1e-6)
    assert.ok(level >= 0)
    const ceiling = beamTop[level + 1] - D.beamHeight
    assert.ok(carton.y + carton.sy / 2 <= ceiling - 0.05, 'carton top clears the next beam')
  }
  for (const wrap of film) assert.ok(wrap.y + wrap.sy / 2 <= beamTop[3] - D.beamHeight, 'film stays under the top beam')
  assert.ok(Math.max(...decks.map((deck) => deck.y)) < D.beamLevels[3])
})

test('no two pallets overlap on the same level of the same bay', () => {
  const { cell } = build(), decks = instances(batch(cell, 'vis2-rack-pallets')).filter((item) => near(item.sy, 0.03)), seen = new Map()
  for (const deck of decks) {
    const key = `${deck.x.toFixed(2)}|${deck.y.toFixed(2)}`
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key).push(deck)
  }
  for (const row of seen.values()) { row.sort((a, b) => a.z - b.z); for (let i = 1; i < row.length; i++) assert.ok(row[i].z - row[i - 1].z >= D.palletZ - 1e-6 || Math.abs(row[i].z - row[i - 1].z) > 1.9, 'pallets in one level do not overlap') }
})

test('rails and shuttle: wheels ride on the two rails, low body, pallet on the carrier, inside the strip', () => {
  const { cell } = build(), rails = instances(batch(cell, 'vis2-rails')), shuttle = cell.group.getObjectByName('vis2-shuttle')
  const rail = rails.filter((item) => near(item.sx, D.railWidth))
  assert.equal(rail.length, 2)
  const centerX = (CAMPUS_SHUTTLE_STRIP.x0 + CAMPUS_SHUTTLE_STRIP.x1) / 2
  assert.ok(near(Math.abs(rail[0].x - centerX), 0.7))
  assert.ok(rail.every((item) => item.x >= CAMPUS_SHUTTLE_STRIP.x0 && item.x <= CAMPUS_SHUTTLE_STRIP.x1))
  const box = shuttle.geometry.boundingBox, railTop = 0.045 + D.railHeight
  assert.ok(Math.abs(box.min.y - railTop) < 0.002, 'wheel bottoms touch the rail top')
  assert.ok(box.max.x - box.min.x <= CAMPUS_SHUTTLE_STRIP.x1 - CAMPUS_SHUTTLE_STRIP.x0, 'shuttle is narrower than the strip')
  assert.ok(box.max.y < 1.7, 'body plus load stays low')
  assert.ok(shuttle.userData.dynamic === true && shuttle.frustumCulled === false)
  const lowBodyTop = D.shuttle.rideHeight + D.shuttle.height
  assert.ok(lowBodyTop < 0.6)
})

test('shuttle state is clamped to the rail path and ignores non-finite input', () => {
  const { cell } = build(), shuttle = cell.group.getObjectByName('vis2-shuttle'), z0 = CAMPUS_SHUTTLE_STRIP.z0 + 1.15, z1 = CAMPUS_SHUTTLE_STRIP.z1 - 1.15
  cell.setShuttle({ z: -1000, lift: 5 }); assert.equal(shuttle.position.z, z0); assert.equal(shuttle.position.y, 0.12)
  cell.setShuttle({ z: 1000, lift: -3 }); assert.equal(shuttle.position.z, z1); assert.equal(shuttle.position.y, 0)
  cell.setShuttle({ z: Number.NaN, lift: 0 }); assert.equal(shuttle.position.z, z1)
  cell.setShuttle({ z: 0.5, lift: Number.POSITIVE_INFINITY }); assert.equal(shuttle.position.z, z1)
})

test('deterministic for a seed, different for another, and low quality is lighter', () => {
  const a = build(), b = build(), c = build({ seed: 999 }), low = build({ quality: { tier: 'low' } })
  for (const name of ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons']) assert.equal(hash(batch(a.cell, name)), hash(batch(b.cell, name)))
  assert.notEqual(hash(batch(a.cell, 'vis2-rack-cartons')), hash(batch(c.cell, 'vis2-rack-cartons')))
  const high = a.cell.summary(), light = low.cell.summary()
  assert.ok(high.drawCalls <= 6 && light.drawCalls <= 6)
  assert.ok(high.triangles <= 30000, `high triangles ${high.triangles}`)
  assert.ok(light.triangles < high.triangles / 2, `low triangles ${light.triangles}`)
  assert.deepEqual(light.rows, ['A1', 'R2'])
})

test('works inside the campus registry: film keeps its own transparency, shuttle stays dynamic, static parts merge', () => {
  const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout })
  registry.register('vis2Rack', (context) => buildVis2RackCell(context))
  registry.buildAll({ quality: { tier: 'high' } })
  const root = registry.root, summary = registry.summary()
  assert.deepEqual(summary.modules, ['vis2Rack']); assert.equal(summary.skipped.length, 0)
  assert.ok(root.getObjectByName('vis2-rack-film'), 'film not merged into the .46 batch')
  assert.equal(root.getObjectByName('vis2-rack-film').material.opacity, 0.28)
  assert.ok(root.getObjectByName('vis2-shuttle'))
  assert.ok(root.getObjectByName('campus-opaque-batch-1'), 'static instances are merged by the registry')
  assert.equal(root.getObjectByName('vis2-rack-frames'), undefined)
  registry.dispose()
})

test('dispose is idempotent and frees geometry and materials it owns', () => {
  const { root, cell } = build(), geometries = [], materials = []
  cell.group.traverse((node) => { if (node.geometry) geometries.push(node.geometry); if (node.material) materials.push(node.material) })
  let disposedGeometry = 0, disposedMaterial = 0
  geometries.forEach((geometry) => geometry.addEventListener('dispose', () => disposedGeometry++)); materials.forEach((material) => material.addEventListener('dispose', () => disposedMaterial++))
  cell.dispose(); cell.dispose()
  assert.equal(cell.group.parent, null); assert.equal(root.children.length, 0)
  assert.equal(disposedGeometry, geometries.length); assert.equal(disposedMaterial, materials.length)
})

test('the replacement list names real legacy objects and the module stays free of unsafe APIs', () => {
  const racks = fs.readFileSync(new URL('../dr-campus-racks.js', import.meta.url), 'utf8'), shuttle = fs.readFileSync(new URL('../dr-campus-shuttle.js', import.meta.url), 'utf8')
  for (const item of VIS2_REPLACES) assert.ok(racks.includes(item.legacy) || shuttle.includes(item.legacy), `legacy object exists: ${item.legacy}`)
  const source = fs.readFileSync(new URL('../dr-vis2-rack-cell.js', import.meta.url), 'utf8')
  for (const forbidden of ['requestAnimationFrame', 'Math.random', 'Date.now', 'performance.now', 'fetch(', 'innerHTML', 'WebGLRenderer', 'setInterval', 'localStorage']) assert.equal(source.includes(forbidden), false, forbidden)
  assert.equal(source.includes('董事会'), false)
})
