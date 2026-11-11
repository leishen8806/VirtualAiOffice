import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN } from '../office-layout.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'
import { buildAlignZones } from '../office-vis2/align-zones.js'

const compile = material => {
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>' }
  material.onBeforeCompile(shader); return shader
}

test('fine stone is material-scoped, uses an independent shader cache key and preserves all geometry', () => {
  const root = new THREE.Group(), a = createSampleBatch(THREE), b = createSampleBatch(THREE)
  for (const batch of [a, b]) batch.add(new THREE.BoxGeometry(2, .1, 2), '#D9D3C6', [0, 0, 0], 0, .78, 0, 'stone')
  const old = a.build(root, 'old-stone'), fine = b.build(root, 'fine-stone'); fine.mesh.material.userData.officeFineStone = true
  try {
    for (const key of Object.keys(old.mesh.geometry.attributes)) assert.deepEqual(fine.mesh.geometry.attributes[key].array, old.mesh.geometry.attributes[key].array)
    assert.equal(old.mesh.material.customProgramCacheKey(), 'office-vis2-pbr-v3')
    assert.notEqual(fine.mesh.material.customProgramCacheKey(), old.mesh.material.customProgramCacheKey())
    const oldShader = compile(old.mesh.material), fineShader = compile(fine.mesh.material)
    assert.ok(oldShader.fragmentShader.includes('float vein = sin(materialUv.x * 24.0'))
    assert.equal(fineShader.fragmentShader.includes('float vein = sin(materialUv.x * 24.0'), false)
    assert.ok(fineShader.fragmentShader.includes('fwidth(materialUv.x)'))
    assert.ok(fineShader.fragmentShader.includes('mix(0.99, 0.982 + 0.018 * stoneGrain, stoneFade)'))
    assert.equal(fineShader.uniforms.vis2Textured.value, false)
    assert.equal(root.children.length, 2); assert.equal(fine.triangles(), old.triangles())
  } finally { old.dispose(); fine.dispose() }
  assert.equal(root.children.length, 0)
})

test('only ALIGN floor materials use quiet stone; stable V3 keeps the former stone and no lights are added', () => {
  for (const layout of [LAYOUT_V3, LAYOUT_V3_ALIGN]) for (const low of [false, true]) {
    const root = new THREE.Group(), shell = buildOfficeAlignedShell({ THREE, root, layout, low, search: '?officeSample=1' })
    let zones
    try {
      const aligned = layout.variant === 'align'
      const floorShader = compile(shell.ground.material)
      assert.equal(floorShader.fragmentShader.includes('stoneFade'), aligned)
      const paving = root.getObjectByName('office-aligned-plaza-paving')
      assert.equal(compile(paving.material).fragmentShader.includes('stoneFade'), aligned)
      if (aligned) {
        zones = buildAlignZones({ THREE, root, layout, low })
        assert.ok(compile(root.getObjectByName('align-floor-and-ring').material).fragmentShader.includes('stoneFade'))
        for (const f of zones.furnishings) f.root.traverse(m => { if (m.isMesh) assert.equal(m.material.userData.officeFineStone, undefined, 'upholstery and cabinet finishes are not changed') })
      }
      root.traverse(o => assert.equal(!!o.isLight, false))
    } finally { zones?.dispose(); shell.dispose() }
    assert.equal(root.children.length, 0)
  }
})
