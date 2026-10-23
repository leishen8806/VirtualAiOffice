import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V1, LAYOUT_V3 } from '../office-layout.js'
import { buildOfficeShellV3, buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { resolveWallOcclusion } from '../office-v3-occlusion.js'
import { startOfficeV3, selectEnvironmentConflicts, demolishLegacyScene } from '../office-v3-modules.js'

test('R3-3 shell reads the frozen V3 dimensions and has the required openings', () => {
  const spec = buildOfficeShellV3Spec(LAYOUT_V3)
  assert.equal(spec.envelope.height, undefined)
  assert.equal(spec.wallHeight.standard, 4.5)
  assert.ok(spec.outer.some(part => part.side === 'south'))
  assert.ok(spec.outer.some(part => part.side === 'north'))
  assert.equal(spec.cameraDefaults.low.wallMode, 'camera-side-lowered')
})

test('R3-3 occlusion lowers only the camera-facing wall below the trigger angle', () => {
  const thresholds = { standard: 4.5, triggerElevation: 40, loweredHeight: .9, glassOpacity: .08 }
  assert.deepEqual(resolveWallOcclusion({ elevation: 50, cameraPosition: { x: 0, z: 10 }, target: { x: 0, z: 0 }, wallNormal: { x: 0, z: 1 }, thresholds }), { height: 4.5, glassOpacity: 1, lowered: false })
  assert.deepEqual(resolveWallOcclusion({ elevation: 28, cameraPosition: { x: 0, z: 10 }, target: { x: 0, z: 0 }, wallNormal: { x: 0, z: 1 }, thresholds }), { height: .9, glassOpacity: .08, lowered: true })
  assert.equal(resolveWallOcclusion({ elevation: 28, cameraPosition: { x: 0, z: 10 }, target: { x: 0, z: 0 }, wallNormal: { x: 0, z: -1 }, thresholds }).lowered, false)
})

test('R3-4 registry is opt-in, isolated and exposes the complete V3 module chain', () => {
  const scene = new THREE.Scene(), collisions = []
  assert.equal(startOfficeV3({ THREE, scene, layout: LAYOUT_V1 }), null)
  const registry = startOfficeV3({ THREE, scene, layout: LAYOUT_V3, quality: { tier: 'high' }, collision: { add: (...args) => collisions.push(args) } })
  assert.ok(registry)
  assert.equal(registry.root.name, 'office3-root')
  assert.deepEqual(registry.summary().modules, ['shell3', 'furniture3', 'island', 'zones', 'displayDepartments', 'displayStaff'])
  assert.equal(registry.get('island').pending, undefined)
  assert.equal(registry.get('zones').pending, undefined)
  assert.equal(registry.get('displayDepartments').pending, undefined)
  assert.equal(registry.get('displayStaff').pending, undefined)
  assert.equal(registry.get('furniture3').pending, true)
  assert.ok(collisions.length >= 1)
  assert.equal(scene.children.includes(registry.root), true)
  registry.dispose()
  assert.equal(scene.children.includes(registry.root), false)
})

test('R3-3b removes only named/located conflicts and preserves environment backdrops', () => {
  const scene = new THREE.Scene()
  const sky = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()); sky.name = 'sky'; scene.add(sky)
  const ground = new THREE.Mesh(new THREE.BoxGeometry(10, .1, 10), new THREE.MeshBasicMaterial()); ground.name = 'ground'; ground.position.set(0, 0, 0); scene.add(ground)
  const insideTree = new THREE.Group(); insideTree.name = 'tree-inside'; insideTree.position.set(0, 0, 0); scene.add(insideTree)
  const outsideTree = new THREE.Group(); outsideTree.name = 'tree-outside'; outsideTree.position.set(100, 0, 100); scene.add(outsideTree)
  const legacy = new THREE.Group(); legacy.name = 'legacy-shell'; scene.add(legacy)
  const conflicts = selectEnvironmentConflicts(new Set([sky, ground, insideTree, outsideTree]), LAYOUT_V3)
  assert.deepEqual(conflicts, [insideTree])
  demolishLegacyScene(scene, new Set([...conflicts, legacy]))
  assert.equal(scene.children.includes(sky), true)
  assert.equal(scene.children.includes(ground), true)
  assert.equal(scene.children.includes(insideTree), false)
  assert.equal(scene.children.includes(outsideTree), true)
  assert.equal(scene.children.includes(legacy), false)
})

test('R3-3c keeps the dynamically instanced crowns that belong to outside trees', () => {
  const scene = new THREE.Scene()
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), 1)
  crown.name = 'environment-tree-crowns'; crown.userData.dynamic = true; crown.position.set(0, 0, 0); scene.add(crown)
  const conflicts = selectEnvironmentConflicts(new Set([crown]), LAYOUT_V3)
  assert.equal(conflicts.includes(crown), false)
})

test('R3-3 shell source stays local and does not depend on warehouse or network code', () => {
  const source = fs.readFileSync(new URL('../office-layout-v3-scene.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|Math\.random|Date\.now|dr-campus|#(?:0d2942|24485c|d6f8ff)/i)
})
