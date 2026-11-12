import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { wholeFloorSpec } from '../office-vis2/whole-floor.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficePlaza } from '../office-vis2/plaza.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'

test('cutaway room crowns retain an open centre and at least 2.68m walking clearance', () => {
  const before = JSON.stringify(layout), details = wholeFloorSpec(layout).details
  for (const room of layout.regions) {
    const crowns = details.filter(p => p.owner === room.id && p.kind === 'ceiling-edge')
    assert.equal(crowns.length, room.walled ? 4 : 0)
    const centre = { x0: room.x0 + .65, x1: room.x1 - .65, z0: room.z0 + .65, z1: room.z1 - .65 }
    for (const p of [...crowns, ...details.filter(p => p.owner === room.id && p.kind === 'light-recess')]) {
      assert.ok(p.x - p.w / 2 >= room.x0 - 1e-6 && p.x + p.w / 2 <= room.x1 + 1e-6)
      assert.ok(p.z - p.d / 2 >= room.z0 - 1e-6 && p.z + p.d / 2 <= room.z1 + 1e-6)
      assert.ok(p.y - p.h / 2 >= 2.68 && p.y + p.h / 2 <= 2.95)
      assert.ok(p.x + p.w / 2 <= centre.x0 || p.x - p.w / 2 >= centre.x1 || p.z + p.d / 2 <= centre.z0 || p.z - p.d / 2 >= centre.z1)
    }
    for (let i = 0; i < crowns.length; i++) for (let j = 0; j < i; j++) {
      const a = crowns[i], b = crowns[j]
      assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-6 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-6, 'no coplanar overlapping crown geometry')
    }
  }
  assert.equal(JSON.stringify(layout), before)
})

test('only high-quality ALIGN adds one existing shadow caster, with no lights or low-tier change', () => {
  for (const activeLayout of [LAYOUT_V3, layout]) for (const low of [false, true]) {
    const root = new THREE.Group(), shell = buildOfficeAlignedShell({THREE, root, layout:activeLayout, low, search:'?officeSample=1'})
    const frames = root.getObjectByName('office-aligned-frames-and-inlays'), enabled = activeLayout === layout && !low
    assert.equal(frames.castShadow, enabled); assert.equal(frames.receiveShadow, enabled)
    assert.equal(shell.ground.receiveShadow, enabled)
    const lights = [], casters = []
    root.traverse(o => { if (o.isLight) lights.push(o.uuid); if (o.castShadow) casters.push(o.name) })
    assert.deepEqual(lights, []); assert.deepEqual(casters, enabled ? [frames.name] : [])
    shell.dispose(); assert.equal(shell.ground.receiveShadow, false); assert.equal(root.children.length, 0)
  }
  const root = new THREE.Group(), injected = {...THREE, InstancedMesh: class extends THREE.InstancedMesh {
    constructor(g, m, count) { if (m.opacity === .085) throw Error('injected after shadow flag'); super(g, m, count) }
  }}
  const fallback = buildOfficeAlignedShell({THREE:injected, root, layout, low:false, search:'?officeSample=1'})
  assert.equal(fallback.finishSpec, undefined); assert.equal(fallback.ground.receiveShadow, false)
  assert.equal(root.getObjectByName('office-aligned-frames-and-inlays'), undefined)
  fallback.dispose(); assert.equal(root.children.length, 0)
})

test('untextured wood retains its own surface class, UVs and fragment grain without another material', () => {
  const root = new THREE.Group(), batch = createSampleBatch(THREE)
  batch.add(new THREE.BoxGeometry(2, .1, 3), '#C3AA87', [0, 0, 0], 0, .78, 0, 'wood')
  batch.add(new THREE.BoxGeometry(1, .1, 1), '#F4F1EA', [3, 0, 0], 0, .78, 0, 'stone')
  const result = batch.build(root, 'wood-probe'), g = result.mesh.geometry
  assert.equal(root.children.length, 1)
  const classes = new Set(Array.from({length:g.attributes.sampleSurface.count}, (_, i) => g.attributes.sampleSurface.getZ(i)))
  assert.deepEqual([...classes], [1, 2])
  assert.ok(new Set(g.attributes.sampleUv.array).size > 2)
  const shader = { uniforms:{}, vertexShader:'#include <begin_vertex>', fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>' }
  result.mesh.material.onBeforeCompile(shader)
  assert.equal(shader.uniforms.vis2Textured.value, false)
  assert.match(shader.fragmentShader, /!vis2Textured && surfaceParams.z > \.5 && surfaceParams.z < 1\.5/)
  assert.match(shader.fragmentShader, /materialUv.x \* 165\.0/)
  assert.match(shader.fragmentShader, /roughnessFactor = surfaceParams.x/)
  result.dispose(); result.dispose(); assert.equal(root.children.length, 0)
})

test('plaza service details fit the existing vendor footprint and awning stripes mark only the roof', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), batch = createSampleBatch(THREE), cups = [], add = batch.add.bind(batch)
    batch.add = (geometry, color, position, ...rest) => {
      if (geometry.type === 'CylinderGeometry' && geometry.parameters.height === .14) {
        geometry.computeBoundingBox(); cups.push(geometry.boundingBox.clone().translate(new THREE.Vector3(...position)))
      }
      add(geometry, color, position, ...rest)
    }
    const placements = appendOfficePlaza({THREE, batch, layout, low}), built = batch.build(root, 'plaza'), vendors = placements.filter(p => p.kind === 'vendors')
    assert.equal(cups.length, (layout.plaza.carts.length + layout.plaza.kiosks.length) * 2)
    for (const cup of cups) assert.ok(vendors.some(({bounds:b}) => cup.min.x >= b.x0 && cup.max.x <= b.x1 && cup.min.z >= b.z0 && cup.max.z <= b.z1 && cup.max.y <= b.y1))
    const {position:p, normal:n, sampleSurface:s} = built.mesh.geometry.attributes
    let roof = 0
    for (let i = 0; i < p.count; i++) if (s.getZ(i) === 4) {
      roof++; assert.ok(p.getY(i) > 2.2 && n.getY(i) > .5)
      assert.ok(vendors.some(({bounds:b}) => p.getX(i) >= b.x0 - 1e-5 && p.getX(i) <= b.x1 + 1e-5 && p.getZ(i) >= b.z0 - 1e-5 && p.getZ(i) <= b.z1 + 1e-5))
    }
    assert.ok(roof > 0); assert.equal(root.children.length, 1)
    built.dispose(); assert.equal(root.children.length, 0)
  }
})
