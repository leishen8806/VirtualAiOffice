import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN as layout, createOfficeNavigation } from '../office-layout.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'
import { buildOfficeVis2Frontage } from '../office-vis2/frontage.js'
import { appendOfficePlazaPaving } from '../office-vis2/completion.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { createFurnitureCollision } from '../furniture-collision.js'

test('ALIGN entrance is centred and data-owned at 6m by 3.5m without changing the 4m inner axis', () => {
  assert.deepEqual(layout.doors.south, { x0: -1, x1: 5, z: 12, width: 6, height: 3.5 })
  assert.deepEqual(LAYOUT_V3.doors.south, { x0: 0, x1: 4, z: 12, width: 4 })
  assert.equal(layout.passages.entranceSpine.width, 4); assert.equal(layout.corridors.entranceAxis.width, 4)
  assert.equal((layout.doors.south.x0 + layout.doors.south.x1) / 2, layout.frontDesk.center.x)
  assert.equal(layout.frontDesk.center.x, layout.island.center.x); assert.equal(layout.island.center.x, layout.plaza.center.x)
  assert.equal(Object.keys(layout.seats).length, 25); assert.equal(layout.displaySeats.length, 12)
  const nav = createOfficeNavigation(layout)
  assert.equal(nav.ENTRANCE.x0, -1); assert.equal(nav.ENTRANCE.x1, 5)
  for (const x of [-.5, 4.5]) assert.ok(nav.corridorPath({ x, z: 13 }, { x: 2, z: 10.8 }).length > 0)
})

test('actual shell frame and glazing leave the enlarged opening and header clearance at both qualities', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), world = createFurnitureCollision(), shell = buildOfficeAlignedShell({ THREE, root, layout, low, collision: world, search: '?officeSample=1' })
    root.updateMatrixWorld(true)
    try {
      const frames = root.getObjectByName('office-aligned-frames-and-inlays'), glass = root.getObjectByName('office-aligned-clear-glass')
      const floorHit = new THREE.Raycaster(new THREE.Vector3(2, 1, 12), new THREE.Vector3(0, -1, 0)).intersectObject(shell.ground)[0]
      const topHit = new THREE.Raycaster(new THREE.Vector3(2, 1, 12), new THREE.Vector3(0, 1, 0)).intersectObject(frames)[0]
      assert.ok(floorHit && topHit); assert.ok(Math.abs(topHit.point.y - floorHit.point.y - 3.5) < 1e-5)
      const header = shell.finishSpec.solid.find(p => p.kind === 'entrance-header' && p.z === 12)
      assert.equal(header.x, 2); assert.equal(header.w, 6)
      for (const x of [-.7, 0, 2, 4, 4.7]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.2, 13), new THREE.Vector3(0, 0, -1), 0, 2)
        assert.equal(ray.intersectObjects([frames, glass].filter(Boolean)).length, 0, 'frame/glass cannot silently close the new doorway')
        const position = { x, z: 13 }; world.move(position, 0, -2)
        assert.ok(Math.abs(position.z - 11) < 1e-6)
      }
    } finally { shell.dispose() }
    assert.equal(world.stats().bodies, 0)
  }
})

test('entrance paving and independent frontage use the same 6m opening, retain one text batch and clean up', () => {
  const root = new THREE.Group(), batch = createSampleBatch(THREE)
  appendOfficePlazaPaving({ THREE, batch, layout }); const paving = batch.build(root, 'paving')
  const frontage = buildOfficeVis2Frontage({ THREE, root, layout })
  try {
    const p = paving.mesh.geometry.attributes.position
    const slab = Array.from({ length: p.count }, (_, i) => i).filter(i => p.getY(i) > .114 && p.getZ(i) >= 12 && p.getZ(i) <= 14)
    const xs = slab.map(i => p.getX(i))
    assert.ok(Math.abs(Math.min(...xs) + 1) < 1e-5); assert.ok(Math.abs(Math.max(...xs) - 5) < 1e-5)
    assert.equal(frontage.mapping.entrance.width, 6)
    for (const panel of frontage.mapping.glass.filter(p => p.yaw === 0)) assert.ok(panel.x + panel.width / 2 <= -1 || panel.x - panel.width / 2 >= 5)
    assert.equal(frontage.summary().calls, 2)
  } finally { frontage.dispose(); paving.dispose() }
  assert.equal(root.children.length, 0)
})

test('ALIGN shell cycles and visual fallback release only their owned collision registrations', () => {
  const world = createFurnitureCollision(), sentinel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  sentinel.position.set(100, 1, 100); world.add(sentinel, 'other-module')
  try {
    for (const low of [false, true]) for (let cycle = 0; cycle < 3; cycle++) {
      const root = new THREE.Group(), shell = buildOfficeAlignedShell({ THREE, root, layout, low, collision: world, search: '?officeSample=1' })
      assert.ok(world.stats().bodies > 1); shell.dispose(); shell.dispose()
      assert.equal(world.stats().bodies, 1); assert.equal(root.children.length, 0)
    }
    const failing = { ...THREE, MeshPhysicalMaterial: class extends THREE.MeshPhysicalMaterial {
      constructor(parameters) { if (parameters.opacity === .085) throw Error('test visual failure'); super(parameters) }
    } }
    const root = new THREE.Group(), shell = buildOfficeAlignedShell({ THREE: failing, root, layout, collision: world, search: '?officeSample=1' })
    assert.equal(shell.finishSpec, undefined); assert.ok(world.stats().bodies > 1)
    shell.dispose(); shell.dispose(); assert.equal(world.stats().bodies, 1); assert.equal(root.children.length, 0)
  } finally { world.remove(sentinel); sentinel.geometry.dispose(); sentinel.material.dispose() }
})
