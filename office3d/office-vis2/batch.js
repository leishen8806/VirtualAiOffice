// 细石粒在远景淡出，避免规则正弦条纹把石材画成木纹，或细噪点产生闪烁。
export const officeStoneGrain = uv => `vec2 stoneCell = floor(${uv} * 180.0); float stoneGrain = fract(sin(dot(stoneCell, vec2(127.1, 311.7))) * 43758.5453); float stoneFade = 1.0 - smoothstep(0.002, 0.006, max(fwidth(${uv}.x), fwidth(${uv}.y))); diffuseColor.rgb *= mix(0.99, 0.982 + 0.018 * stoneGrain, stoneFade);`

const officeWarmIbl = gain => `\n#ifdef USE_ENVMAP\niblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, vec3(.2126, .7152, .0722))) * vec3(1.04, 1.01, .94), .9) * ${gain};\nradiance = mix(radiance, vec3(dot(radiance, vec3(.2126, .7152, .0722))) * vec3(1.04, 1.01, .94), .9) * ${gain};\n#endif`

// 建筑表面只接入已有环境采样；自有材质销毁时一并释放，不创建反射贴图或改灯光。
export function warmOfficeArchitecture(material) {
  if (material.userData.officeArchitectureWarmth) return
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey.call(material)
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>' + officeWarmIbl(1.2))
  }
  material.customProgramCacheKey = () => key + '-office-architecture-warm-ibl-v1'
  material.userData.officeArchitectureWarmth = true; material.needsUpdate = true
}

// 家具仍用原 atlas 和合批；只给明确的暖木/织物顶点色补纹理，屏幕白色顶点不受影响。
const furnitureSurfaceOwners = new WeakSet()
export function bindOfficeFurnitureSurfaces(THREE, targets, assets) {
  const records = []
  if (assets?.oak?.isTexture && assets?.fabric?.isTexture) for (const material of new Set(targets || [])) {
    if (!material?.isMeshStandardMaterial || !material.vertexColors || !material.map?.isCanvasTexture || furnitureSurfaceOwners.has(material)) continue
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey, key = previousKey.call(material)
    material.onBeforeCompile = function(shader,renderer) {
      previous.call(this,shader,renderer)
      Object.assign(shader.uniforms,{officeFurnitureOak:{value:assets.oak},officeFurnitureFabric:{value:assets.fabric},officeFurnitureWoodColor:{value:new THREE.Color('#C49A6C')},officeFurnitureFabricColor:{value:new THREE.Color('#506A5A')}})
      shader.vertexShader = 'varying vec3 officeFurniturePosition; varying vec3 officeFurnitureNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nofficeFurniturePosition = position; officeFurnitureNormal = normal;')
      shader.fragmentShader = 'uniform sampler2D officeFurnitureOak; uniform sampler2D officeFurnitureFabric; uniform vec3 officeFurnitureWoodColor; uniform vec3 officeFurnitureFabricColor; varying vec3 officeFurniturePosition; varying vec3 officeFurnitureNormal;\n' + shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float officeWood = 0.0; float officeFabric = 0.0;
        #ifdef USE_COLOR
        officeWood = 1.0 - step(.01,length(vColor.rgb-officeFurnitureWoodColor)); officeFabric = 1.0 - step(.01,length(vColor.rgb-officeFurnitureFabricColor));
        #endif
        vec3 officeN = abs(normalize(officeFurnitureNormal)); vec2 officeUv = officeN.y > max(officeN.x,officeN.z) ? officeFurniturePosition.xz : (officeN.x > officeN.z ? officeFurniturePosition.zy : officeFurniturePosition.xy);
        if (officeWood > .5) diffuseColor.rgb *= mix(vec3(1.0),texture2D(officeFurnitureOak,officeUv/1.2).rgb,.45);
        else if (officeFabric > .5) diffuseColor.rgb *= mix(vec3(1.0),texture2D(officeFurnitureFabric,officeUv*3.0).rgb,.35);
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nif (officeWood > .5) roughnessFactor = .64; else if (officeFabric > .5) roughnessFactor = .96;')
    }
    material.customProgramCacheKey = () => key+'-office-owned-furniture-surfaces-v1'; material.needsUpdate = true
    records.push({material,previous,previousKey,installed:material.onBeforeCompile})
    furnitureSurfaceOwners.add(material)
  }
  let disposed = false
  return {count:records.length,dispose(){if(disposed)return;disposed=true;for(const r of records){furnitureSurfaceOwners.delete(r.material);if(r.material.onBeforeCompile===r.installed){r.material.onBeforeCompile=r.previous;r.material.customProgramCacheKey=r.previousKey;r.material.needsUpdate=true}}records.length=0}}
}

// 合并颜色和表面参数，避免把木材、织物与金属合并成同一种粗糙度。
export function createSampleBatch(THREE, assets) {
  const values = { position: [], normal: [], color: [], sampleSurface: [], sampleUv: [] }
  return {
    triangles: () => values.position.length / 9,
    add(geometry, tint, position = [0, 0, 0], yaw = 0, roughness = .8, metalness = 0, grain = '') {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
      const c = new THREE.Color(tint || '#ffffff'), p = g.attributes.position, sourceColor = !tint && g.attributes.color, surface = g.attributes.sampleSurface, uv = g.attributes.sampleUv
      const kind = grain === 'wood' ? 1 : grain === 'stone' ? 2 : grain === 'fabric' || roughness >= .9 && typeof tint === 'string' && ['#3E5A4E', '#2F4A5C'].includes(tint.toUpperCase()) ? 3 : 0
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
        const shade = grain === 'wood' ? .92 + .08 * Math.sin(x * 90 + z * 4) : grain === 'stone' ? .97 + .03 * Math.sin(x * 17 + y * 11 + z * 29) : 1
        values.color.push((sourceColor ? sourceColor.getX(i) : c.r) * shade, (sourceColor ? sourceColor.getY(i) : c.g) * shade, (sourceColor ? sourceColor.getZ(i) : c.b) * shade)
        values.sampleSurface.push(surface ? surface.getX(i) : roughness, surface ? surface.getY(i) : metalness, surface ? surface.getZ(i) : kind)
        const n = g.attributes.normal, ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i))
        values.sampleUv.push(uv ? uv.getX(i) : (nx > ny && nx > nz ? z : x) / 1.2, uv ? uv.getY(i) : (ny > nx && ny > nz ? z : y) / 1.2)
      }
      g.rotateY(yaw); g.translate(...position)
      values.position.push(...g.attributes.position.array); values.normal.push(...g.attributes.normal.array)
      g.dispose(); geometry.dispose()
    },
    build(root, name, poses) {
      const geometry = new THREE.BufferGeometry()
      for (const [key, list] of Object.entries(values)) geometry.setAttribute(key, new THREE.Float32BufferAttribute(list, key === 'sampleUv' ? 2 : 3))
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
      material.onBeforeCompile = shader => {
        for (const name of ['oak', 'stone', 'fabric']) shader.uniforms[`vis2${name}`] = { value: assets?.[name] || null }
        shader.uniforms.vis2Textured = { value: !!(assets?.oak && assets?.stone && assets?.fabric) }
        shader.vertexShader = 'attribute vec3 sampleSurface; attribute vec2 sampleUv; varying vec3 surfaceParams; varying vec2 materialUv;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfaceParams = sampleSurface; materialUv = sampleUv;')
        // 已有贴图仅作材料细节，保留基色；避免每个石面都被同一张纹理染成深米黄。
        shader.fragmentShader = 'uniform sampler2D vis2oak; uniform sampler2D vis2stone; uniform sampler2D vis2fabric; uniform bool vis2Textured; varying vec3 surfaceParams; varying vec2 materialUv;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif (vis2Textured) { if (surfaceParams.z > 2.5) diffuseColor.rgb *= mix(vec3(1.0), texture2D(vis2fabric, materialUv * 3.0).rgb, 0.45); else if (surfaceParams.z > 1.5) diffuseColor.rgb *= mix(vec3(1.0), texture2D(vis2stone, materialUv).rgb, 0.28); else if (surfaceParams.z > .5) diffuseColor.rgb *= mix(vec3(1.0), texture2D(vis2oak, materialUv).rgb, 0.55); }').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = surfaceParams.x;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = surfaceParams.y;')
        // 无贴图的广场批次也保留细石纹；只调本材质，不增加纹理请求或绘制批次。
        const stone = material.userData.officeFineStone ? officeStoneGrain('materialUv') : 'float vein = sin(materialUv.x * 24.0 + sin(materialUv.y * 9.0) * 2.0); diffuseColor.rgb *= 0.965 + 0.035 * smoothstep(-0.95, -0.5, vein);'
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\nif (!vis2Textured && surfaceParams.z > 1.5 && surfaceParams.z < 2.5) { ${stone} }`)
        // 大面木材逐片元计算细纹，避免只有四个平面顶点的色差。
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif (!vis2Textured && surfaceParams.z > .5 && surfaceParams.z < 1.5) { float grain = sin(materialUv.x * 165.0 + sin(materialUv.y * 3.0) * 1.7 + sin(materialUv.x * 13.0) * 2.0); diffuseColor.rgb *= .93 + .07 * smoothstep(-.9, .55, grain); }')
        // 棚布仅在既有棚顶标记，和柜体分开；无额外图像、透明层或绘制批次。
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif (surfaceParams.z > 3.5) { float stripe = step(.5, fract(materialUv.y * 4.0)); diffuseColor.rgb = mix(vec3(.48, .55, .43), vec3(.90, .86, .76), stripe); }')
        if (material.userData.officeBookSpines) {
          shader.fragmentShader = shader.fragmentShader.replace('if (vis2Textured) {', 'if (vis2Textured && surfaceParams.z < 4.5) {').replace('if (surfaceParams.z > 3.5)', 'if (surfaceParams.z > 3.5 && surfaceParams.z < 4.5)')
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\nif (surfaceParams.z > 5.0) { float height = surfaceParams.z - 5.0; float band = max(1.0 - step(.0055, abs(materialUv.y - height * .18)), 1.0 - step(.0055, abs(materialUv.y - height * .8))); band *= 1.0 - step(.0285, abs(materialUv.x)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${new THREE.Color('#D9D3C6').toArray().join(',')}), band); }`)
        }
        // 复用天气环境反射，仅中和室内饰面的天空蓝；不改直射光、叶片或全局曝光。
        if (material.userData.officeWarmReflection) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>' + officeWarmIbl(1.8))
      }
      material.customProgramCacheKey = () => (material.userData.officeFineStone ? 'office-vis2-pbr-v3-fine-stone' : 'office-vis2-pbr-v3') + (material.userData.officeWarmReflection ? '-warm-ibl-v1' : '') + (material.userData.officeBookSpines ? '-book-spines-v1' : '')
      material.userData.officeVis2 = true
      let mesh
      try { mesh = poses ? new THREE.InstancedMesh(geometry, material, poses.length) : new THREE.Mesh(geometry, material) }
      catch (error) { geometry.dispose(); material.dispose(); throw error }
      if (poses) {
        const transform = new THREE.Object3D()
        poses.forEach((p, i) => { transform.position.set(p.x, 0, p.z); transform.rotation.y = p.yaw || 0; transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix) })
        mesh.instanceMatrix.needsUpdate = true
        // 保留实例以复用席位几何；宿主合并器已有 onBeforeRender 排除约定。
        mesh.onBeforeRender = () => {}
      }
      mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true
      root.add(mesh); let disposed = false
      return { mesh, triangles: () => geometry.attributes.position.count / 3 * (poses?.length ?? 1), dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); geometry.dispose(); material.dispose(); if (poses) mesh.dispose() } }
    },
  }
}
