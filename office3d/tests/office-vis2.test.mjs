import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LAYOUT_V3 } from '../office-layout.js'
import { barSeats, barLounges, barColliders } from '../office-bar-geometry.js'
import { buildOfficeBar } from '../office-bar.js'
import { officeVis2Enabled, loadOfficeVis2Assets } from '../office-vis2/assets.js'
import { createOfficeVis2Controller } from '../office-vis2/sample.js'
import { buildOfficeBrandMarks } from '../office-vis2/brand.js'
import { createSceneQuality } from '../quality.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'
import { buildOfficePreviewContext } from '../office-vis2/preview-context.js'
import { buildOfficeCompletionVisual } from '../office-vis2/completion.js'
import { buildOfficeFoyerFurniture } from '../office-vis2/foyer.js'
import { buildOfficeTeaBarSample } from '../office-vis2/bar.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficePlaza } from '../office-vis2/plaza.js'

const loader = () => { const state = { created: 0, disposed: 0 }; return { state, async loadAsync() { state.created++; const t = new THREE.Texture(); t.addEventListener('dispose', () => state.disposed++); return t } } }
const canvasTex = (w, h, draw) => { assert.equal(draw.length, 3); draw({ clearRect() {}, fillText() {}, set fillStyle(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set font(v) {} }, w, h); return new THREE.Texture() }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const sourceHash = text => sha256(text.replace(/\r\n/g, '\n'))

test('Q-V1 reception curve has continuous outward normals while caps stay flat', () => {
  const value = buildOfficeFoyerFurniture({ THREE, root: new THREE.Group(), layout: LAYOUT_V3 }), f = LAYOUT_V3.frontDesk
  const g = value.root.getObjectByName('foyer-reception-coffee-tables').geometry, p = g.attributes.position, n = g.attributes.normal
  let curved = 0, caps = 0
  try {
    for (let i = 0; i < p.count; i++) {
      if (![.215, 1.1].some(y => Math.abs(p.getY(i) - y) < 1e-6) || p.getX(i) < f.x0 || p.getX(i) > f.x1 || p.getZ(i) < f.z0 || p.getZ(i) > f.z1) continue
      const normal = new THREE.Vector3().fromBufferAttribute(n, i)
      if (Math.abs(normal.y) > .9) { assert.ok(Math.abs(normal.y) > .99999); caps++; continue }
      if (normal.z <= .001) continue
      const x = p.getX(i) - f.center.x, t = Math.sqrt(Math.max(0, 1 - 2 * Math.abs(x) / (f.x1 - f.x0)))
      const expected = new THREE.Vector3(Math.sign(x) * 2 * (f.z1 - f.z0) * (1 - t), 0, (f.x1 - f.x0) * t).normalize()
      assert.ok(normal.distanceTo(expected) < .0001, 'each duplicated curve vertex uses the same analytic normal')
      curved++
    }
    assert.ok(curved >= 200, 'actual reception curved sides sampled')
    assert.ok(caps >= 100, 'top and bottom hard edges retained')
  } finally { value.dispose() }
})

test('Q-V1 cabinet seams clear actual faceted inner-wall triangles in both quality tiers', () => {
  for (const low of [false, true]) {
    const value = buildOfficeTeaBarSample({ THREE, root: new THREE.Group(), layout: LAYOUT_V3, low })
    const mesh = value.root.getObjectByName('tea-bar-body-top-equipment'), p = mesh.geometry.attributes.position, colors = mesh.geometry.attributes.color
    const tint = new THREE.Color('#756857'), seams = [], walls = []
    for (let i = 0; i < p.count; i += 3) {
      const seam = Math.abs(colors.getX(i) - tint.r) < 1e-6 && Math.abs(colors.getY(i) - tint.g) < 1e-6 && Math.abs(colors.getZ(i) - tint.b) < 1e-6
      for (let j = 0; j < 3; j++) {
        if (seam) seams.push(new THREE.Vector3().fromBufferAttribute(p, i + j))
        else walls.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j))
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3))
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), body = new THREE.Mesh(geometry, material); body.updateMatrixWorld()
    try {
      assert.equal(seams.length, 360, 'all ten seam boxes are sampled, not an empty selection')
      for (const vertex of seams) {
        const origin = new THREE.Vector3(LAYOUT_V3.bar.center.x, vertex.y, LAYOUT_V3.bar.center.z), direction = vertex.clone().sub(origin).normalize()
        const wall = new THREE.Raycaster(origin, direction).intersectObject(body)[0]
        assert.ok(wall, 'actual inner-wall triangle exists behind each seam vertex')
        const clearance = wall.distance - origin.distanceTo(vertex)
        assert.ok(clearance > .0002 && clearance < .01, `${low ? 'low' : 'high'} clearance ${clearance}`)
      }
    } finally { geometry.dispose(); material.dispose(); value.dispose() }
  }
})

test('O-V2 plaza reuses props, keeps source anchors and exports nonoverlapping integration footprints', () => {
  const before = JSON.stringify(LAYOUT_V3), batch = createSampleBatch(THREE), root = new THREE.Group()
  const placements = appendOfficePlaza({ THREE, batch, layout: LAYOUT_V3 }), built = batch.build(root, 'plaza-test')
  const intersects = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.z1, b.z1) > Math.max(a.z0, b.z0)
  assert.equal(placements.filter(p => p.kind === 'vendors').length, 4)
  assert.equal(placements.filter(p => p.kind === 'cafe').length, 4)
  assert.equal(placements.filter(p => p.kind === 'benches').length, 6)
  assert.equal(placements.filter(p => p.kind === 'flowers').length, 2)
  assert.equal(placements.filter(p => p.kind === 'lamps').length, 2)
  for (const [i, p] of placements.entries()) {
    assert.equal(p.interaction, 'preview-only')
    assert.ok(!intersects(p.bounds, { x0: 0, x1: 4, z0: 12, z1: 32.5 }), p.id + ' clears the 4m entrance axis')
    for (const other of placements.slice(i + 1)) assert.ok(!intersects(p.bounds, other.bounds), p.id + ' / ' + other.id)
    if (p.kind === 'vendors' || p.kind === 'cafe') assert.deepEqual({ x: p.x, z: p.z }, p.source)
  }
  const positions = built.mesh.geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    assert.ok(placements.some(p => x >= p.bounds.x0 - .001 && x <= p.bounds.x1 + .001 && z >= p.bounds.z0 - .001 && z <= p.bounds.z1 + .001 && y >= p.bounds.y0 - .001 && y <= p.bounds.y1 + .001), 'every rendered vertex has an exported footprint')
  }
  assert.equal(root.children.length, 1, 'all props use one existing material batch')
  assert.ok(built.triangles() <= 10000)
  assert.equal(JSON.stringify(LAYOUT_V3), before)
  let disposed = 0; built.mesh.geometry.addEventListener('dispose', () => disposed++)
  built.dispose(); built.dispose(); assert.equal(disposed, 1); assert.equal(root.children.length, 0)
})

test('O-V2 plaza static geometry is deterministic and cleanup leaves no source props mounted', () => {
  const a = createSampleBatch(THREE), b = createSampleBatch(THREE)
  const pa = appendOfficePlaza({ THREE, batch: a, layout: LAYOUT_V3 }), pb = appendOfficePlaza({ THREE, batch: b, layout: LAYOUT_V3 })
  const ma = a.build(new THREE.Group(), 'a'), mb = b.build(new THREE.Group(), 'b')
  assert.deepEqual(pa, pb)
  assert.equal(sha256(ma.mesh.geometry.attributes.position.array), sha256(mb.mesh.geometry.attributes.position.array))
  ma.dispose(); mb.dispose()
})

test('O-V1 equipment stays above the existing counter and leaves both circulation openings unchanged', () => {
  const value = buildOfficeTeaBarSample({ THREE, root: new THREE.Group(), layout: LAYOUT_V3 })
  const mesh = value.root.getObjectByName('tea-bar-body-top-equipment'), c = LAYOUT_V3.bar.center
  mesh.updateMatrixWorld(true)
  const down = (x, z) => new THREE.Raycaster(new THREE.Vector3(c.x + x, 2, c.z + z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)
  assert.deepEqual(value.colliders, barColliders(LAYOUT_V3))
  assert.equal(down(2.8, 0).length, 0); assert.equal(down(-2.8, 0).length, 0)
  assert.ok(down(1.6, 0)[0].point.y < .05)
  assert.ok(down(-1.55, -2.52)[0].point.y > 1.25, 'storage canister has a separate lid above countertop')
  const p = mesh.geometry.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.06) {
    const r = Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z)
    assert.ok(r > 2.1 && r < LAYOUT_V3.bar.radius, 'all raised equipment sits on original annulus')
  }
  value.dispose()
})

test('O-V1 reception waist trim has one exterior surface and explicit fabric survives batching', () => {
  const value = buildOfficeFoyerFurniture({ THREE, root: new THREE.Group(), layout: LAYOUT_V3 }), f = LAYOUT_V3.frontDesk
  const mesh = value.root.getObjectByName('foyer-reception-coffee-tables'); mesh.updateMatrixWorld(true)
  for (const y of [.15, .195, .25]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(f.center.x + .23, y, f.z1 + 1), new THREE.Vector3(0, 0, -1)).intersectObject(mesh)
    const frontHits = hits.filter(hit => hit.point.z > f.center.z)
    assert.equal(frontHits.length, 1, `one exterior surface at y=${y}, no coplanar trim/body`)
  }
  const batch = createSampleBatch(THREE)
  batch.add(new THREE.BoxGeometry(), '#687D68', [0, 0, 0], 0, .97, 0, 'fabric')
  const built = batch.build(new THREE.Group(), 'fabric-probe'), surfaces = built.mesh.geometry.attributes.sampleSurface
  for (let i = 0; i < surfaces.count; i++) { assert.equal(surfaces.getZ(i), 3); assert.ok(surfaces.getX(i) > .96) }
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>' }
  built.mesh.material.onBeforeCompile(shader)
  assert.equal(shader.uniforms.vis2Textured.value, false, 'missing textures retain untextured fallback')
  assert.ok(shader.fragmentShader.includes('roughnessFactor = surfaceParams.x'))
  built.dispose(); value.dispose()
})

test('VIS2 source hashing canonicalizes checkout newlines without hiding source changes', () => {
  const lf = 'export const example = 1\n// 中文\n', crlf = lf.replace(/\n/g, '\r\n')
  assert.equal(sourceHash(lf), sourceHash(crlf))
  assert.notEqual(sourceHash(lf.replace('= 1', '= 2')), sourceHash(lf))
  assert.notEqual(sourceHash(lf + '\n'), sourceHash(lf), 'trailing content is not silently trimmed')
})

test('VIS2 manifest hashes match tracked geometry, textures and brand asset', async () => {
  const manifest = JSON.parse(await readFile(new URL('../office-vis2/MANIFEST.json', import.meta.url), 'utf8'))
  for (const entry of manifest.geometry) {
    const source = await readFile(new URL('../' + entry.file, import.meta.url), 'utf8'), lf = source.replace(/\r\n/g, '\n')
    assert.equal(entry.sha256, sourceHash(lf), entry.file + ' LF checkout')
    assert.equal(entry.sha256, sourceHash(lf.replace(/\n/g, '\r\n')), entry.file + ' CRLF checkout')
    assert.notEqual(entry.sha256, sourceHash(lf + '\n// source mutation'), entry.file + ' rejects content change')
  }
  for (const entry of [...manifest.textures, manifest.brandAsset]) {
    assert.equal(entry.sha256, sha256(await readFile(new URL('../' + entry.file, import.meta.url))), entry.file)
  }
})

test('VIS2 completion places display furniture inside rooms and keeps the entrance axis clear', () => {
  const root = new THREE.Group(), value = buildOfficeCompletionVisual({ THREE, root, layout: LAYOUT_V3, low: true })
  const desks = value.placements.filter(p => p.kind === 'display-desk')
  assert.equal(desks.length, 12)
  for (const desk of desks) {
    const seat = LAYOUT_V3.displaySeats.find(s => s.x === desk.x && s.z - .55 === desk.z)
    assert.ok(seat, 'display desk uses existing nonfunctional display position')
    const room = LAYOUT_V3.regions.find(r => r.id === seat.region)
    assert.ok(desk.x - desk.width / 2 > room.x0 && desk.x + desk.width / 2 < room.x1)
    assert.ok(desk.z - desk.depth / 2 > room.z0 && desk.z + desk.depth / 2 < room.z1)
  }
  const furniture = value.root.getObjectByName('office-completion-furniture-and-plaza')
  assert.ok(furniture.geometry.attributes.position.count > 0)
  assert.equal(value.root.getObjectByName('office-vis2-completion'), value.root)
  value.dispose(); assert.equal(root.children.length, 0)
})

test('VIS2 defaults closed for missing or malformed config and requests no textures', async () => {
  const l = loader()
  for (const config of [undefined, null, true, 'true', [], { enabled: 'true' }, { enabled: 1 }]) {
    assert.equal(officeVis2Enabled(config), false)
    assert.equal(await loadOfficeVis2Assets(THREE, config, l), null)
  }
  assert.equal(l.state.created, 0)
})

test('VIS2 material loading configures sRGB and releases partial successes on failure', async () => {
  const l = loader(), original = l.loadAsync
  l.loadAsync = url => url.includes('stone-floor') ? Promise.reject(new Error('unavailable')) : original(url)
  await assert.rejects(loadOfficeVis2Assets(THREE, { enabled: true }, l))
  assert.equal(l.state.created, 2); assert.equal(l.state.disposed, 2)
  const complete = loader(), assets = await loadOfficeVis2Assets(THREE, { enabled: true }, complete)
  assert.equal(assets.oak.colorSpace, THREE.SRGBColorSpace)
  assets.dispose(); assets.dispose(); assert.equal(complete.state.disposed, 4)
})

test('VIS2 logo loading is optional and absent logos use named replacement slots', async () => {
  const l = loader(), original = l.loadAsync
  l.loadAsync = url => url.includes('logo.png') ? Promise.reject(new Error('logo unavailable')) : original(url)
  const assets = await loadOfficeVis2Assets(THREE, { enabled: true }, l)
  assert.equal(assets.logo, null); assets.dispose(); assert.equal(l.state.disposed, 3)
  const marks = buildOfficeBrandMarks({ THREE, root: new THREE.Group(), layout: LAYOUT_V3, assets, canvasTex })
  assert.equal(marks.placeholder, true); assert.equal(marks.marks.length, 3)
  assert.equal(marks.root.getObjectByName('office-vis2-brand-placeholder-slots').userData.replaceable, true)
  assert.equal(marks.root.getObjectByName('office-vis2-brushed-metal-brand-backing').userData.depthOffset, .026)
  marks.dispose()
})

test('VIS2 brand marks follow the curved fascia without trim penetration and preserve the approved ratio', () => {
  const assets = { logo: new THREE.Texture() }, root = new THREE.Group()
  const marks = buildOfficeBrandMarks({ THREE, root, layout: LAYOUT_V3, assets, canvasTex })
  assert.equal(marks.placeholder, false); assert.equal(marks.marks.length, 3)
  for (const mark of marks.marks) assert.ok(Math.abs(mark.width / mark.height - 979 / 544) < 1e-12)
  assert.equal(marks.root.getObjectByName('office-vis2-approved-logo-marks').material.map, assets.logo)
  assert.equal(marks.root.getObjectByName('office-vis2-brushed-metal-brand-backing').userData.depthOffset, .026)
  const fascia = marks.marks.find(m => m.id === 'bar-fascia'), center = LAYOUT_V3.bar.center
  const backing = marks.root.getObjectByName('office-vis2-brushed-metal-brand-backing'), logos = marks.root.getObjectByName('office-vis2-approved-logo-marks')
  assert.ok(Math.hypot(fascia.x - center.x, fascia.z - center.z) > LAYOUT_V3.bar.radius + .05)
  for (const mesh of [backing, logos]) {
    const p = mesh.geometry.attributes.position, n = mesh.userData.barVertexCount, distances = []
    for (let i = 0; i < n; i++) distances.push(Math.hypot(p.getX(i) - center.x, p.getZ(i) - center.z))
    assert.ok(Math.min(...distances) > LAYOUT_V3.bar.radius + .025, 'center and edge vertices clear bar and metallic trim')
    assert.ok(Math.max(...distances) - Math.min(...distances) < .021, 'curved surface keeps even stand-off')
    assert.ok(Math.max(...Array.from({ length: n }, (_, i) => p.getY(i))) < .88, 'all plaque points below upper metal trim')
  }
  assert.equal(logos.material.map, assets.logo)
  assert.equal(backing.userData.depthOffset, .026)
  let released = 0
  marks.root.traverse(mesh => { if (mesh.isMesh) mesh.geometry.addEventListener('dispose', () => released++) })
  marks.dispose(); marks.dispose(); assert.equal(released, 2)
})

test('VIS2 reception lettering and brand backing attach to the actual grille within its boundaries', async () => {
  const root = new THREE.Group(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: loader(), canvasTex })
  assert.equal(await ctl.setConfig({ enabled: true }), true)
  const foyer = buildOfficeFoyerFurniture({ THREE, root: new THREE.Group(), layout: LAYOUT_V3 }), front = LAYOUT_V3.frontDesk
  foyer.root.updateMatrixWorld(true); root.updateMatrixWorld(true)
  const solid = foyer.root.getObjectByName('foyer-reception-coffee-tables'), slatX = front.x0 + .5 + 7 * (front.x1 - front.x0 - 1) / 13
  const hit = new THREE.Raycaster(new THREE.Vector3(slatX, 2.2, front.z1 + 1), new THREE.Vector3(0, 0, -1)).intersectObject(solid)[0]
  assert.ok(hit, 'ray samples the real grille triangles, not a repeated target constant')
  const label = ctl.root.getObjectByName('vis2-reception-wayfinding'), bounds = new THREE.Box3().setFromObject(label)
  const points = solid.geometry.attributes.position, grillePoints = Array.from({ length: points.count }, (_, i) => i).filter(i => Math.abs(points.getZ(i) - hit.point.z) < 1e-5)
  const grilleTop = Math.max(...grillePoints.map(i => points.getY(i)))
  assert.ok(bounds.min.z - hit.point.z >= .001 && bounds.max.z - hit.point.z <= .003, 'lettering is 1–3 mm in front of the visible grille')
  assert.ok(bounds.min.y >= 0 && bounds.max.y <= grilleTop - .005, 'entire plane remains below architectural top')
  assert.ok(bounds.min.x >= foyer.footprints.backdrop.x0 && bounds.max.x <= foyer.footprints.backdrop.x1)
  const normal = new THREE.Vector3().fromBufferAttribute(label.geometry.attributes.normal, 0).transformDirection(label.matrixWorld)
  assert.ok(normal.dot(hit.face.normal) > .9999, 'front face points toward the entrance, parallel to grille')
  const backing = ctl.root.getObjectByName('office-vis2-brushed-metal-brand-backing').geometry.attributes.position
  const wallPoints = Array.from({ length: backing.count }, (_, i) => i).filter(i => backing.getY(i) > 1.05)
  const backZ = Math.min(...wallPoints.map(i => backing.getZ(i))), frontZ = Math.max(...wallPoints.map(i => backing.getZ(i)))
  assert.ok(backZ - hit.point.z >= .001 && backZ - hit.point.z <= .003, 'actual backing rear clears grille by 1–3 mm')
  assert.ok(bounds.min.y > Math.max(...wallPoints.map(i => backing.getY(i))) + .01, 'lettering and logo backplate do not overlap')
  const logos = ctl.root.getObjectByName('office-vis2-approved-logo-marks'), lp = logos.geometry.attributes.position, ln = logos.geometry.attributes.normal
  const logoPoints = Array.from({ length: lp.count }, (_, i) => i).filter(i => lp.getY(i) > 1.05)
  for (const i of logoPoints) {
    assert.ok(lp.getZ(i) - frontZ > .0005 && lp.getZ(i) - frontZ < .0015, 'brand plane clears backing front by 1 mm')
    assert.ok(ln.getZ(i) > .9999, 'brand faces the entrance')
  }
  ctl.dispose(); foyer.dispose()
})

test('VIS2 construction failure releases mounted resources', async () => {
  const root = new THREE.Group()
  const allocated = new Set(), released = new Set(), registered = new Set()
  const failing = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: loader(), collision: { add(v) { registered.add(v) }, remove(v) { registered.delete(v) } }, canvasTex() {
    root.traverse(mesh => { if (mesh.isMesh) for (const value of [mesh.geometry, ...[mesh.material].flat()]) { allocated.add(value.uuid); value.addEventListener('dispose', () => released.add(value.uuid)) } })
    throw new Error('simulated host canvas failure')
  } })
  assert.equal(await failing.setConfig({ enabled: true }), false)
  assert.equal(failing.status, 'fallback'); assert.equal(root.children.length, 0); assert.equal(registered.size, 0)
  assert.deepEqual([...released].sort(), [...allocated].sort()); failing.dispose()
})

test('VIS2 closing while images load prevents late mounting and releases owned images', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve }), l = loader(), original = l.loadAsync
  l.loadAsync = async url => { await gate; return original(url) }
  const root = new THREE.Group(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l })
  const opening = ctl.setConfig({ enabled: true }); await ctl.setConfig(null); release()
  assert.equal(await opening, false); assert.equal(root.children.length, 0); assert.equal(l.state.disposed, 4)
  ctl.dispose()
})

test('VIS2 preserves its owned shader surfaces through the actual host quality and merge contracts', async () => {
  const scene = new THREE.Scene(), ctl = createOfficeVis2Controller({ THREE, root: scene, layout: LAYOUT_V3, textureLoader: loader(), canvasTex })
  assert.equal(await ctl.setConfig({ enabled: true }), true)
  const before = []
  ctl.root.traverse(mesh => { if (mesh.isMesh) before.push({ mesh, material: mesh.material.uuid, geometry: mesh.geometry.uuid }) })
  const policy = createSceneQuality(THREE, { scene, renderer: { shadowMap: {}, compile() {} }, camera: new THREE.PerspectiveCamera(), env: { setQuality() {} }, characters: () => [], mergeStatic: root => mergeOfficeStatic(THREE, root) })
  policy.prepare('low'); policy.activate('medium'); policy.activate('high')
  assert.equal(policy.summary().sourceMeshes, 0)
  assert.equal(mergeOfficeStatic(THREE, ctl.root).removed, 0)
  for (const { mesh, material, geometry } of before) { assert.equal(mesh.material.uuid, material); assert.equal(mesh.geometry.uuid, geometry) }
  ctl.dispose(); assert.equal(scene.getObjectByName('office-sample-zone'), undefined)
})

test('office context reuses the 25 layout workstations and never disposes injected model assets', () => {
  const names = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'table', 'chairModernCushion', 'bookcaseOpen', 'books', 'pottedPlant']
  const A = { furn: Object.fromEntries(names.map(name => [name, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())])) }
  const visible = A.furn.desk, hidden = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshStandardMaterial())
  const second = new THREE.MeshStandardMaterial({ color: '#A07040' })
  visible.material = [visible.material, second]; hidden.visible = false; visible.add(hidden)
  let sharedDisposed = 0
  for (const source of Object.values(A.furn)) source.traverse(mesh => { if (!mesh.isMesh) return; mesh.geometry.addEventListener('dispose', () => sharedDisposed++); for (const material of [mesh.material].flat()) material.addEventListener('dispose', () => sharedDisposed++) })
  const canvasTex = (w, h, draw) => { const ctx = { clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, canvas: {} }, image = { getContext: () => ctx }; draw(ctx, w, h); const texture = new THREE.Texture(); texture.image = image; return texture }
  const clones = []
  const placeFurniture = (assets, name, x, z, options) => { const group = new THREE.Group(); group.add(assets.furn[name].clone()); group.position.set(x, options.y, z); group.rotation.y = options.rotY; clones.push(group); return { group, size: new THREE.Vector3(1, 1, 1) } }
  const root = new THREE.Group(), value = buildOfficePreviewContext({ THREE, root, layout: LAYOUT_V3, A, placeFurniture, canvasTex })
  assert.deepEqual(value.seats, Object.entries(LAYOUT_V3.seats).map(([name, [region, x, z]]) => ({ name, region, x, z })))
  assert.equal(value.seats.length, 25); value.onFrame(new THREE.PerspectiveCamera())
  const clonedDesk = clones[0].children[0]
  assert.equal(clonedDesk.material.length, 2, 'both source material slots are retained')
  assert.notEqual(clonedDesk.material[0], visible.material[0]); assert.notEqual(clonedDesk.material[1], visible.material[1])
  assert.equal(clonedDesk.children[0].visible, false)
  const ownedMaterialDisposals = [0, 0]
  clonedDesk.material.forEach((material, i) => material.addEventListener('dispose', () => ownedMaterialDisposals[i]++))
  let hiddenDisposed = 0
  value.root.traverse(mesh => { if (mesh.isMesh && !mesh.visible) mesh.geometry.addEventListener('dispose', () => hiddenDisposed++) })
  value.dispose(); value.dispose(); assert.equal(root.children.length, 0); assert.equal(sharedDisposed, 0)
  assert.deepEqual(ownedMaterialDisposals, [1, 1]); assert.ok(hiddenDisposed > 0, 'preview-owned hidden collision proxies released')
  for (const source of Object.values(A.furn)) source.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); for (const material of [mesh.material].flat()) material.dispose() } })
})

test('VIS2 repeated entry/exit preserves host objects and cleans collisions and textures', async () => {
  const root = new THREE.Group(), sentinel = new THREE.Group(); root.add(sentinel)
  const registered = [], collision = { add(p) { registered.push(p) }, remove(p) { const i = registered.indexOf(p); if (i >= 0) registered.splice(i, 1) } }
  const l = loader(), ctl = createOfficeVis2Controller({ THREE, root, layout: LAYOUT_V3, textureLoader: l, collision, canvasTex })
  for (let i = 0; i < 5; i++) {
    assert.equal(await ctl.setConfig({ enabled: true }), true)
    assert.equal(registered.length, 12); assert.ok(ctl.summary().calls <= 12); assert.ok(ctl.summary().triangles < 28000)
    assert.equal(ctl.mapping.frontage.entrance.width, 4)
    await ctl.setConfig(null); assert.equal(root.children.length, 1); assert.equal(registered.length, 0)
  }
  ctl.dispose(); ctl.dispose(); assert.equal(l.state.created, 20); assert.equal(l.state.disposed, 20); assert.equal(root.children[0].uuid, sentinel.uuid)
})

test('VIS2 public bar hook preserves closed B0 geometry and active seat IDs/positions', async () => {
  const baseline = buildOfficeBar({ THREE, root: new THREE.Group(), layout: LAYOUT_V2 })
  for (const visualSample of [undefined, { enabled: 'true' }, { enabled: true, assets: null }]) {
    const value = buildOfficeBar({ THREE, root: new THREE.Group(), layout: LAYOUT_V2, visualSample })
    assert.deepEqual(value.summary(), baseline.summary()); value.dispose()
  }
  const l = loader(), assets = await loadOfficeVis2Assets(THREE, { enabled: true }, l), root = new THREE.Group()
  class Collision { items = new Set(); add(item) { this.items.add(item) } remove(item) { this.items.delete(item) } }
  const collision = new Collision()
  const active = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, collision, visualSample: { enabled: true, assets } })
  const anchors = rows => rows.map(({ id, x, z, yaw }) => ({ id, x, z, yaw }))
  assert.deepEqual(anchors(active.seats), anchors(barSeats(LAYOUT_V2)))
  assert.deepEqual(anchors(active.lounges), anchors(barLounges(LAYOUT_V2)))
  assert.deepEqual(active.colliders, barColliders(LAYOUT_V2))
  assert.equal(collision.items.size, 12)
  active.dispose(); active.dispose(); assert.equal(collision.items.size, 0); assert.equal(root.children.length, 0); assert.equal(l.state.disposed, 0); assets.dispose(); baseline.dispose()
})

test('VIS2 bar surfaces leave centre, both entry openings and operation floor clear', async () => {
  const assets = await loadOfficeVis2Assets(THREE, { enabled: true }, loader()), root = new THREE.Group()
  const value = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, visualSample: { enabled: true, assets } })
  const body = value.root.getObjectByName('tea-bar-body-top-equipment'), c = LAYOUT_V2.bar.center; body.updateMatrixWorld(true)
  const height = (x, z) => new THREE.Raycaster(new THREE.Vector3(c.x + x, 2, c.z + z), new THREE.Vector3(0, -1, 0)).intersectObject(body)[0]?.point.y
  assert.equal(height(0, 0), undefined); assert.equal(height(2.8, 0), undefined); assert.equal(height(-2.8, 0), undefined)
  assert.ok(height(0, 2.8) > .95); assert.ok(height(1.6, 0) < .05)
  assert.ok(body.geometry.attributes.sampleUv.count > 0)
  assert.equal(value.root.getObjectByName('tea-bar-instanced-stools').isInstancedMesh, true)
  value.dispose(); assets.dispose()
})
