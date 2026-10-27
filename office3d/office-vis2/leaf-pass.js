// 只用于自有标准材质：GTAO 也走同一叶片裁边，不能把透明叶角写成实体法线。
export function bindOfficeLeafNormalPass(mesh) {
  const material = mesh.material, normalPass = { value: false }
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey, before = mesh.onBeforeRender
  material.allowOverride = false
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer)
    shader.uniforms.officeLeafNormalPass = normalPass
    shader.fragmentShader = 'uniform bool officeLeafNormalPass;\n' + shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (officeLeafNormalPass) { gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0); return; }')
  }
  material.customProgramCacheKey = () => key.call(material) + '-office-leaf-normal-v1'
  mesh.onBeforeRender = function(renderer, scene, ...rest) {
    before.call(this, renderer, scene, ...rest)
    normalPass.value = scene.overrideMaterial?.isMeshNormalMaterial === true
  }
}
