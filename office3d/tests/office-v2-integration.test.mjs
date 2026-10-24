import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2 } from '../office-layout.js'
import { barColliders, barSeats } from '../office-bar-geometry.js'
import { officeV2Modules } from '../office-v2-modules.js'
import { createOfficeV2Registry } from '../office-v2-registry.js'
import { createSceneQuality } from '../quality.js'

const factory = id => officeV2Modules.find(([name]) => name === id)[1]
const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
process.once('exit', () => console.log('O6O7_PROCESS_MEMORY ' + JSON.stringify({ file: 'office-v2-integration', peakRssMB: process.resourceUsage().maxRSS / 1024, seconds: process.uptime() })))
function appTexture() {
  const calls = [], context = { fillRect() {}, fillText(...args) { calls.push(args) } }
  let canvases = 0
  const document = { createElement() { canvases++; return { getContext: kind => { assert.equal(kind, '2d'); return context } } } }
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 } }
  const code = source('app.js').match(/function canvasTex\([\s\S]*?\r?\n}\r?\n/)[0]
  return { canvasTex: vm.runInNewContext(`(${code})`, { document, THREE, renderer }), calls, textureCount: () => canvases }
}
function registry(quality = { tier: 'high' }) {
  return createOfficeV2Registry({ THREE, scene: new THREE.Scene(), quality, layout: LAYOUT_V2 })
}

test('O6O7 actual app canvasTex constructs all three modules and twelve synthetic staff', { timeout: 60_000 }, t => {
  const { canvasTex, calls } = appTexture(), root = new THREE.Group(), context = { THREE, root, layout: LAYOUT_V2, canvasTex, now: () => 9 * 3600000, quality: { tier: 'high' }, search: '?layout=2&display=1' }
  const allocated = []
  t.after(() => { for (const value of allocated.toReversed()) value.dispose() })
  const bar = factory('bar')(context); allocated.push(bar)
  const departments = factory('displayDepartments')(context); allocated.push(departments)
  const staff = factory('displayStaff')(context); allocated.push(staff)
  assert.equal(bar.summary().calls, 3); assert.equal(departments.summary().desks, 12)
  assert.equal(staff.summary().failure, null); assert.equal(staff.summary().count, 12)
  assert.ok(calls.some(line => line[0] === '展示部门 · 模拟角色'))
  const firstMesh = staff.root.children[0]
  staff.onFrame(.1); assert.ok(staff.root.children[0] === firstMesh, 'updates must not recreate meshes')
  for (const module of [staff, departments, bar]) { assert.ok(module.root.parent === root); module.dispose() }
  assert.equal(root.children.length, 0)
})

test('O6O7 URL only opt-in allocates no meshes, config cannot enable it, low keeps zero calls', { timeout: 60_000 }, () => {
  for (const search of ['', '?layout=2', '?display=0', '?display=1&display=1']) {
    const root = new THREE.Group(), result = factory('displayStaff')({ root, config: { enabled: true }, search })
    assert.equal(root.children.length, 0); assert.deepEqual(result, {})
  }
  const quality = { tier: 'low' }, { canvasTex } = appTexture()
  const result = factory('displayStaff')({ THREE, root: new THREE.Group(), layout: LAYOUT_V2, quality, low: true, search: '?display=1', canvasTex, now: () => 0 })
  assert.equal(result.summary().count, 0); assert.equal(result.summary().calls, 0)
  quality.tier = 'high'; result.onFrame(.1); assert.equal(result.summary().count, 12)
  quality.tier = 'low'; result.onFrame(.1); assert.equal(result.summary().calls, 0); result.dispose()
})

test('O6O7 twelve collider bounds match layout; navigation alone registers them', { timeout: 60_000 }, () => {
  const expected = barColliders(LAYOUT_V2), keys = ['x0', 'x1', 'z0', 'z1']
  assert.equal(expected.length, 12)
  expected.forEach((box, index) => keys.forEach(key => assert.equal(box[key], LAYOUT_V2.bar.segments[index][key])))
  const r = registry(), proxies = []
  for (const id of ['navigation', 'bar']) r.register(id, factory(id))
  r.buildAll({ collision: { add: (mesh, kind) => proxies.push({ mesh, kind }) } })
  assert.equal(proxies.length, 12); assert.ok(proxies.every(p => p.kind === 'officeBar'))
  for (const seat of [...LAYOUT_V2.bar.seats, ...barSeats(LAYOUT_V2)]) assert.equal(expected.some(b => seat.x > b.x0 - .26 && seat.x < b.x1 + .26 && seat.z > b.z0 - .26 && seat.z < b.z1 + .26), false)
  r.root.visible = false
  r.root.traverse(mesh => { for (let p = mesh; p; p = p.parent) if (!p.visible) return; assert.fail('hidden root leaked a visible child') })
  r.dispose()
})

test('O6O7 partial display failure preserves bar and departments with factory isolation', { timeout: 60_000 }, () => {
  const r = registry(), { canvasTex } = appTexture()
  r.register('bar', factory('bar')); r.register('displayStaff', ({ root }) => { root.add(new THREE.Group()); throw new Error('expected display failure') })
  r.register('displayDepartments', factory('displayDepartments')); r.buildAll({ canvasTex })
  assert.deepEqual(r.summary().modules, ['bar', 'displayDepartments'])
  assert.equal(r.summary().skipped.length, 1); assert.equal(r.root.children.length, 2); r.dispose()
})

test('O6O7 low quality cannot clone bar/departments outside the owning office root', { timeout: 60_000 }, () => {
  const scene = new THREE.Scene(), quality = { tier: 'low' }, r = createOfficeV2Registry({ THREE, scene, quality, layout: LAYOUT_V2 })
  const { canvasTex } = appTexture()
  r.register('bar', factory('bar')); r.register('displayDepartments', factory('displayDepartments')); r.buildAll({ canvasTex })
  const renderer = { shadowMap: {}, compile() {} }, env = { setQuality() {} }
  const variants = createSceneQuality(THREE, { scene, renderer, camera: new THREE.PerspectiveCamera(), env, characters: () => [], mergeStatic: () => ({ removed: 0, added: 0 }) })
  variants.prepare('low')
  assert.equal(variants.summary().sourceMeshes, 0)
  r.root.visible = false; let leakedMeshes = 0
  scene.traverseVisible(mesh => { if (mesh.isMesh) leakedMeshes++ })
  assert.equal(leakedMeshes, 0); r.dispose()
})

test('O6O7 onFrame isolates errors, skips hidden/culled scenes, freezes clock and restores hooks', { timeout: 60_000 }, () => {
  const previousDocument = globalThis.document, listeners = new Map()
  globalThis.document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  try {
    const scene = new THREE.Scene(), previous = () => {}, camera = new THREE.PerspectiveCamera(45, 1, .1, 100)
    scene.onBeforeRender = previous; camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const r = createOfficeV2Registry({ THREE, scene, layout: LAYOUT_V2 }), updates = []
    let sourceTime = 9 * 3600000, badCalls = 0
    r.register('bad', () => ({ onFrame() { badCalls++; throw new Error('one failure') } }))
    r.register('good', ({ root, now }) => { root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); return { onFrame() { updates.push(now()) } } })
    r.buildAll({ now: () => sourceTime }); const hook = scene.onBeforeRender
    hook(null, scene, camera); sourceTime += 50; hook(null, scene, camera)
    assert.deepEqual(updates, [9 * 3600000, 9 * 3600000 + 50]); assert.equal(badCalls, 1)
    globalThis.document.hidden = true; sourceTime += 100000; hook(null, scene, camera)
    globalThis.document.hidden = false; listeners.get('visibilitychange')(); hook(null, scene, camera)
    assert.equal(updates.at(-1), 9 * 3600000 + 50, 'resume must not jump after hidden time')
    const count = updates.length; r.root.visible = false; r.onFrame(.1, { camera }); assert.equal(updates.length, count)
    r.root.visible = true; camera.lookAt(0, 0, 10); camera.updateMatrixWorld(); r.onFrame(.1, { camera }); assert.equal(updates.length, count)
    r.dispose(); assert.equal(scene.onBeforeRender, previous); assert.equal(listeners.size, 0)
    r.onFrame(.1); assert.equal(updates.length, count)
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument }
})

test('O6O7 production wiring contains no business, network, warehouse or wall-clock reads', { timeout: 60_000 }, () => {
  for (const file of ['office-v2-registry.js', 'office-v2-modules.js']) assert.doesNotMatch(source(file), /fetch\s*\(|innerHTML|Math\.random|Date\.now|dr-campus|dr-console|display-staff\.json|#(?:0d2942|24d7df|d6f8ff)/i)
  const before = fs.readFileSync(new URL('../../office3d-backup-o6o7/resume-20261022/app.js', import.meta.url), 'utf8').split(/\r?\n/)
  const after = fs.readFileSync(new URL('../../office3d-backup-nav-1d/app.js', import.meta.url), 'utf8').split(/\r?\n/), previous = new Set(before)
  assert.ok(after.filter(line => !previous.has(line)).length <= 3)
  assert.ok(after.length - before.length <= 3)
})

test('O6O7 frame identity regression stays bounded and releases resources', { timeout: 60_000 }, async t => {
  // 只复现旧状态判断；禁止用失败的对象相等断言展开整个 Three.js 场景。
  const moduleUrl = new URL('../office-v2-modules.js', import.meta.url)
  const currentSource = source('office-v2-modules.js')
  assert.equal(currentSource.split("let low = context.quality?.tier === 'low'").length, 2)
  const legacySource = currentSource.replace("let low = context.quality?.tier === 'low'", 'let low = context.low')
    .replace(/(['"])(\.\/[^'"]+\.js)\1/g, (_, quote, spec) => JSON.stringify(new URL(spec, moduleUrl).href))
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(legacySource).toString('base64')}`)
  const oldFactory = legacy.officeV2Modules.find(([id]) => id === 'displayStaff')[1]
  const old = oldFactory({ THREE, root: new THREE.Group(), layout: LAYOUT_V2, quality: { tier: 'high' }, search: '?display=1' })
  t.after(() => old.dispose())
  const oldId = old.root.children[0].uuid
  old.onFrame(.016)
  assert.notEqual(old.root.children[0].uuid, oldId, 'old low=undefined must reproduce a first-frame rebuild')

  let time = 0, disposedGeometry = 0, disposedTexture = 0
  const { canvasTex, textureCount } = appTexture()
  const current = factory('displayStaff')({ THREE, root: new THREE.Group(), layout: LAYOUT_V2, quality: { tier: 'high' }, search: '?display=1', now: () => time, canvasTex })
  t.after(() => current.dispose())
  const ids = current.root.children.map(mesh => mesh.uuid)
  current.root.children.forEach(mesh => mesh.geometry.addEventListener('dispose', () => disposedGeometry++))
  current.root.children[1].material.map.addEventListener('dispose', () => disposedTexture++)
  for (let frame = 0; frame < 600; frame++) {
    time += 16; current.onFrame(.016)
    assert.equal(current.root.children.length, 2)
    assert.ok(current.root.children.every((mesh, i) => mesh.uuid === ids[i]), 'frame must reuse the two existing meshes')
  }
  assert.equal(textureCount(), 1); assert.equal(disposedGeometry, 0); assert.equal(disposedTexture, 0)
  current.dispose(); assert.equal(disposedGeometry, 2); assert.equal(disposedTexture, 1)
  console.log('O6O7_MEMORY_REGRESSION ' + JSON.stringify({ oldFirstFrameRebuilt: true, frames: 600, retainedMeshes: ids.length, texturesCreated: textureCount(), disposedGeometry, disposedTexture, rssMB: process.memoryUsage().rss / 1048576 }))
})
