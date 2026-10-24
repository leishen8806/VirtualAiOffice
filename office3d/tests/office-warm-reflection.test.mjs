import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, LAYOUT_V3_ALIGN } from '../office-layout.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { buildOfficeSampleZone } from '../office-vis2/sample.js'

const compile = material => {
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <lights_fragment_maps>\n#include <lights_fragment_end>' }
  material.onBeforeCompile(shader); return shader
}

test('warm reflection reuses environmental IBL after sampling and before BRDF, preserving base materials', () => {
  const root = new THREE.Group(), batch = createSampleBatch(THREE)
  batch.add(new THREE.BoxGeometry(1, 1, 1), '#D9D3C6', [0, 0, 0], 0, .32, .7, 'stone')
  const result = batch.build(root, 'material-probe'), material = result.mesh.material
  try {
    const geometry = result.mesh.geometry.uuid, before = compile(material), oldKey = material.customProgramCacheKey()
    material.userData.officeWarmReflection = true
    const after = compile(material)
    assert.ok(after.fragmentShader.indexOf('iblIrradiance = mix') > after.fragmentShader.indexOf('#include <lights_fragment_maps>'))
    assert.ok(after.fragmentShader.indexOf('radiance = mix') < after.fragmentShader.indexOf('#include <lights_fragment_end>'))
    assert.ok(after.fragmentShader.includes('#ifdef USE_ENVMAP'))
    assert.ok(after.fragmentShader.includes('dot(iblIrradiance, vec3(.2126, .7152, .0722))'))
    assert.equal(before.fragmentShader.includes('iblIrradiance = mix'), false)
    assert.notEqual(material.customProgramCacheKey(), oldKey)
    assert.ok(after.fragmentShader.includes('roughnessFactor = surfaceParams.x;'))
    assert.ok(after.fragmentShader.includes('metalnessFactor = surfaceParams.y;'))
    assert.equal(material.envMap, null); assert.equal(result.mesh.geometry.uuid, geometry)
    assert.deepEqual(Object.keys(after.uniforms), Object.keys(before.uniforms))
  } finally { result.dispose() }
  assert.equal(root.children.length, 0)
})

test('warm office reflection is limited to high-quality ALIGN private batches; canopy, logos, scene and low/legacy stay untouched', () => {
  const scene = new THREE.Scene(), environment = new THREE.Texture()
  scene.environment = environment; scene.environmentIntensity = .0576
  let environmentReleased = 0; environment.addEventListener('dispose', () => environmentReleased++)
  try {
    for (const layout of [LAYOUT_V3, LAYOUT_V3_ALIGN]) for (const low of [false, true]) {
      const sample = buildOfficeSampleZone({ THREE, root: scene, layout, low, includeEnclosure: false })
      let affected = 0, leaves = 0, logos = 0
      try {
        sample.root.traverse(mesh => {
          assert.equal(!!mesh.isLight, false)
          if (!mesh.isMesh) return
          const material = mesh.material, enabled = layout.variant === 'align' && !low && !!material.userData.officeVis2
          assert.equal(!!material.userData.officeWarmReflection, enabled)
          if (enabled) { affected++; assert.ok(compile(material).fragmentShader.includes('iblIrradiance = mix')) }
          if (mesh.name.includes('small-leaf-clusters')) { leaves++; assert.equal(enabled, false) }
          if (mesh.name.includes('brand-') || mesh.name.includes('approved-logo')) { logos++; assert.equal(enabled, false) }
          assert.equal(material.envMap, null)
        })
        assert.equal(affected, layout.variant === 'align' && !low ? 5 : 0)
        assert.equal(leaves, 1); assert.ok(logos >= 1)
        assert.equal(scene.environment.uuid, environment.uuid); assert.equal(scene.environmentIntensity, .0576)
      } finally { sample.dispose(); sample.dispose() }
      assert.equal(scene.children.length, 0); assert.equal(environmentReleased, 0)
    }
  } finally { environment.dispose() }
})
