import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN } from '../office-layout.js'
import { buildOfficeShellV3 } from '../office-layout-v3-scene.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'
import { createOfficeV2Registry } from '../office-v2-registry.js'
import { createFurnitureCollision } from '../furniture-collision.js'

function checkLifecycle(build) {
  const scene = new THREE.Scene(), world = createFurnitureCollision()
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  other.position.set(200, .5, 200); scene.add(other); world.add(other, 'other-module')
  const baseline = world.stats(), removed = [], owned = []
  let otherReleased = 0, registeredCount
  for (const resource of [other.geometry, other.material]) resource.addEventListener('dispose', () => otherReleased++)
  const collision = { ...world,
    add(proxy, kind) { owned.push(proxy); return world.add(proxy, kind) },
    remove(proxy) { removed.push(proxy); return world.remove(proxy) },
  }
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      owned.length = 0; removed.length = 0
      const value = build({ scene, collision }), resources = new Set(), releases = new Map()
      value.root.traverse(mesh => {
        if (!mesh.isMesh) return
        for (const resource of [mesh.geometry, ...[].concat(mesh.material)]) resources.add(resource)
      })
      for (const resource of resources) resource.addEventListener('dispose', () => releases.set(resource.uuid, (releases.get(resource.uuid) || 0) + 1))
      try {
        assert.ok(owned.length > 0, 'the real collision world must receive shell bodies')
        registeredCount ??= owned.length
        assert.equal(owned.length, registeredCount, 'rebuild must not change the registered body count')
        assert.equal(world.stats().bodies, baseline.bodies + registeredCount)
        assert.equal(world.hit(200, 200)?.group?.uuid, other.uuid)
      } finally { value.dispose() }
      assert.equal(world.stats().bodies, baseline.bodies, 'dispose must unregister every owned collision body')
      assert.equal(world.stats().triangles, baseline.triangles, 'no owned triangle data may remain')
      assert.deepEqual(removed.map(proxy => proxy.uuid).sort(), owned.map(proxy => proxy.uuid).sort())
      value.dispose()
      assert.equal(removed.length, registeredCount, 'repeated dispose must not unregister twice')
      for (const resource of resources) assert.equal(releases.get(resource.uuid), 1, 'owned render resources must be released once')
      assert.equal(world.hit(200, 200)?.group?.uuid, other.uuid, 'another module must remain collidable')
      assert.equal(otherReleased, 0, 'another module keeps its render resources')
      assert.deepEqual(scene.children.map(child => child.uuid), [other.uuid])
    }
  } finally {
    world.remove(other); other.removeFromParent(); other.geometry.dispose(); other.material.dispose()
  }
}

for (const layout of [LAYOUT_V3, LAYOUT_V3_ALIGN]) for (const sample of [false, true]) for (const low of [false, true]) {
  test(`O0-R1 registry ${layout.variant || 'v3'} sample=${sample} low=${low}: owned cleanup, foreign isolation and three rebuilds`, () => {
    checkLifecycle(({ scene, collision }) => {
      const registry = createOfficeV2Registry({ THREE, scene, layout, quality: { tier: low ? 'low' : 'high' } })
      registry.register('shell3', buildOfficeAlignedShell)
      registry.buildAll({ collision, search: sample ? '?officeSample=1' : '' })
      assert.ok(registry.get('shell3'), 'exercise the real registry, without a fallback that hides build failure')
      assert.deepEqual(registry.summary().skipped, [])
      return registry
    })
  })
}

for (const low of [false, true]) test(`O0-R1 base shell owns cleanup without a sample wrapper, low=${low}`, () => {
  checkLifecycle(({ scene, collision }) => {
    const root = new THREE.Group(); scene.add(root)
    const shell = buildOfficeShellV3({ THREE, root, collision, layout: LAYOUT_V3, low })
    return { root, dispose() { shell.dispose(); root.removeFromParent() } }
  })
})
