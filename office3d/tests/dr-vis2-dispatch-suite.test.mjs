import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { buildSnapshot, deriveKpis } from '../dr-console-data.js'
import { VIS2B_DIMENSIONS, VIS2B_LABELS, VIS2B_REPLACES, buildVis2DispatchSuite, drawDeskAtlas, drawDispatchWall } from '../dr-vis2-dispatch-suite.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const zone = (id) => CAMPUS_ZONES.find((item) => item.id === id)
const snapshotA = buildSnapshot({ seed: 2808, timeSlice: 3 }), snapshotB = buildSnapshot({ seed: 2808, timeSlice: 9 })
snapshotA.generatedAt = 'fixture-a'; snapshotB.generatedAt = 'fixture-b' // 版本号由宿主给；构件只比较它

// 记录 fillText 的桩 2D 上下文：函数属性一律空操作，赋值属性被接受
const stubContext = () => {
  const texts = [], calls = []
  const target = { texts, calls }
  return new Proxy(target, {
    get: (t, key) => (key === 'texts' || key === 'calls' ? t[key] : key === 'fillText' ? (value) => { texts.push(String(value)); calls.push(`fillText:${value}`) } : () => { calls.push(String(key)) }),
    set: () => true,
  })
}
// 忠实模拟宿主 app.js 的 canvasTex(w, h, draw)：draw 收到 (ctx2d, w, h)，返回带 image.getContext 的纹理
const makeCanvasTex = (log = []) => (w, h, draw) => {
  const ctx = stubContext(); draw(ctx, w, h); log.push({ w, h, ctx })
  const texture = new THREE.Texture(); texture.image = { getContext: () => ctx, width: w, height: h }; texture.needsUpdate = false
  return texture
}
const build = (options = {}) => {
  const root = new THREE.Group(), log = []
  const suite = buildVis2DispatchSuite({ THREE, root, layout, quality: { tier: 'high' }, canvasTex: makeCanvasTex(log), snapshot: snapshotA, ...options })
  return { root, suite, log }
}

test('wall screen: Cambodia outline, highlighted Phnom Penh, persistent simulated label and values from the snapshot', () => {
  const ctx = stubContext(); drawDispatchWall(ctx, 1920, 800, snapshotA)
  const joined = ctx.texts.join('|'), k = deriveKpis(snapshotA)
  assert.ok(ctx.texts.filter((t) => t.includes(VIS2B_LABELS.simulated)).length >= 2, 'simulated label drawn at least twice')
  assert.ok(joined.includes('金边') && joined.includes('Phnom Penh'))
  assert.ok(ctx.calls.includes('stroke') && ctx.calls.includes('arc'), 'outline and nodes are drawn')
  assert.ok(joined.includes(String(k.inbound)) && joined.includes(String(k.outbound)) && joined.includes(String(k.onTimeRate)))
  assert.equal(/undefined|NaN|Infinity/.test(joined), false)
})

test('missing or malformed snapshots show the no-snapshot state, keep the label, and never invent numbers', () => {
  for (const bad of [null, undefined, {}, { waybills: [] }, { waybills: [{}], events: [] }]) {
    const ctx = stubContext(); drawDispatchWall(ctx, 1920, 800, bad)
    const joined = ctx.texts.join('|')
    assert.ok(joined.includes(VIS2B_LABELS.missing)); assert.ok(joined.includes(VIS2B_LABELS.simulated)); assert.equal(/undefined|NaN|Infinity/.test(joined), false)
    const atlas = stubContext(); drawDeskAtlas(atlas, 1024, 576, bad); assert.equal(/undefined|NaN|Infinity/.test(atlas.texts.join('|')), false)
  }
})

test('the screen is a pure function of the snapshot: identical input, identical drawing; different snapshot, different drawing', () => {
  const a1 = stubContext(), a2 = stubContext(), b = stubContext()
  drawDispatchWall(a1, 1920, 800, snapshotA); drawDispatchWall(a2, 1920, 800, snapshotA); drawDispatchWall(b, 1920, 800, snapshotB)
  assert.deepEqual(a1.calls, a2.calls); assert.notDeepEqual(a1.calls, b.calls)
})

test('screen aspect is 2.4:1 and the canvas has the same ratio, so nothing is stretched', () => {
  const { suite } = build(), summary = suite.summary(), screen = suite.group.getObjectByName('vis2b-wall-screen')
  assert.equal(summary.screen.ratio, 2.4); assert.ok(Math.abs(summary.screen.canvas.width / summary.screen.canvas.height - 2.4) < 1e-9)
  const geometry = screen.geometry.parameters; assert.ok(Math.abs(geometry.width / geometry.height - 2.4) < 1e-3)
})

test('exactly one straight row of four seats with equal pitch; every seat has two desk monitors', () => {
  const { suite } = build(), summary = suite.summary(), D = VIS2B_DIMENSIONS
  assert.equal(summary.seats, 4); assert.equal(summary.seatZ.length, 4)
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(summary.seatZ[i] - summary.seatZ[i - 1] - D.seatPitch) < 1e-6)
  assert.equal(suite.group.getObjectByName('vis2b-desk-screens').geometry.attributes.position.count, 4 * 2 * 4, '4 seats x 2 monitors x 4 vertices')
  assert.ok(summary.deskLength >= 3 * D.seatPitch)
})

test('everything stays inside its own zone and below the roof; no floor slab is laid on the shared floor', () => {
  const { suite } = build(), regions = suite.summary().regions, eps = 1e-6
  for (const [name, id] of [['control', 'dispatch'], ['reception', 'visitor'], ['showcase', 'showcase']]) {
    const r = regions[name], z = zone(id)
    assert.ok(r.x0 >= z.x0 - eps && r.x1 <= z.x1 + eps && r.z0 >= z.z0 - eps && r.z1 <= z.z1 + eps, `${name} within ${id}`)
  }
  const box = new THREE.Box3().setFromObject(suite.group)
  assert.ok(box.max.y <= VIS2B_DIMENSIONS.roomHeight + 0.01 && box.max.y < 4.68)
  assert.ok(box.min.y >= -1e-6)
})

test('update(): a new snapshot version redraws once, the same version does nothing, and it stops after dispose', () => {
  const { suite } = build()
  assert.equal(suite.summary().redraws, 0)
  assert.equal(suite.update(snapshotA), false, 'same generatedAt: no redraw'); assert.equal(suite.summary().redraws, 0)
  const wall = suite.group.getObjectByName('vis2b-wall-screen'), versionBefore = wall.material.map.version
  assert.equal(suite.update(snapshotB), true); assert.equal(suite.summary().redraws, 1)
  assert.equal(wall.material.map.version, versionBefore + 1, 'texture uploaded exactly once')
  assert.equal(suite.update(snapshotB), false); assert.equal(suite.summary().redraws, 1); assert.equal(wall.material.map.version, versionBefore + 1)
  suite.dispose(); assert.equal(suite.update(snapshotA), false)
})

test('works inside the campus registry: glass and glow keep their own materials, textured screens are not merged', () => {
  const scene = new THREE.Scene(), registry = createCampusRegistry({ THREE, scene, quality: { tier: 'high' }, layout })
  registry.register('vis2Dispatch', (context) => buildVis2DispatchSuite({ ...context, canvasTex: makeCanvasTex(), snapshot: snapshotA }))
  registry.buildAll({ quality: { tier: 'high' } })
  const root = registry.root
  assert.equal(registry.summary().skipped.length, 0)
  for (const name of ['vis2b-glass', 'vis2b-glow', 'vis2b-wall-screen', 'vis2b-desk-screens', 'vis2b-showcase-panels', 'vis2b-reception-plate']) assert.ok(root.getObjectByName(name), name)
  assert.equal(root.getObjectByName('vis2b-glass').material.opacity, 0.16)
  assert.ok(root.getObjectByName('campus-opaque-batch-1'))
  registry.dispose()
})

test('quality low is lighter, and budgets hold', () => {
  const high = build().suite.summary(), low = build({ quality: { tier: 'low' } }).suite.summary()
  assert.ok(high.drawCalls <= 9 && high.triangles <= 12000, `high ${high.triangles}`)
  assert.ok(low.triangles < high.triangles)
})

test('dispose is idempotent and frees geometry, materials and textures it owns', () => {
  const { root, suite } = build(), geometries = new Set(), materials = new Set(), textures = new Set()
  suite.group.traverse((node) => { if (node.geometry) geometries.add(node.geometry); if (node.material) { materials.add(node.material); if (node.material.map) textures.add(node.material.map) } })
  let g = 0, m = 0, t = 0
  geometries.forEach((x) => x.addEventListener('dispose', () => g++)); materials.forEach((x) => x.addEventListener('dispose', () => m++)); textures.forEach((x) => x.addEventListener('dispose', () => t++))
  suite.dispose(); suite.dispose()
  assert.equal(suite.group.parent, null); assert.equal(root.children.length, 0)
  assert.equal(g, geometries.size); assert.equal(m, materials.size); assert.equal(t, textures.size)
})

test('replacement list names real legacy objects; the module has no simulation engine, timers, renderer or network', () => {
  const interior = fs.readFileSync(new URL('../dr-campus-interior.js', import.meta.url), 'utf8'), control = fs.readFileSync(new URL('../dr-control-room.js', import.meta.url), 'utf8')
  for (const item of VIS2B_REPLACES) assert.ok(interior.includes(item.legacy) || (item.legacy.includes('buildDrControlRoom') && control.includes('buildDrControlRoom')), item.legacy)
  const source = fs.readFileSync(new URL('../dr-vis2-dispatch-suite.js', import.meta.url), 'utf8')
  for (const forbidden of ['requestAnimationFrame', 'setInterval', 'setTimeout', 'Math.random', 'Date.now', 'performance.now', 'fetch(', 'innerHTML', 'WebGLRenderer', 'localStorage']) assert.equal(source.includes(forbidden), false, forbidden)
  const imports = [...source.matchAll(/^import .* from '(.+)'$/gm)].map((match) => match[1]).sort()
  assert.deepEqual(imports, ['./dr-cambodia-outline.js', './dr-console-data.js'], 'no dependency on the demo event source or on A')
})
