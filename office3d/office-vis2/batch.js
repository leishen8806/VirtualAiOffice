// 合并颜色和表面参数，避免把木材、织物与金属合并成同一种粗糙度。
export function createSampleBatch(THREE, assets) {
  const values = { position: [], normal: [], color: [], sampleSurface: [], sampleUv: [] }
  return {
    add(geometry, tint, position = [0, 0, 0], yaw = 0, roughness = .8, metalness = 0, grain = '') {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
      const c = new THREE.Color(tint || '#ffffff'), p = g.attributes.position, sourceColor = !tint && g.attributes.color, surface = g.attributes.sampleSurface, uv = g.attributes.sampleUv
      const kind = grain === 'wood' ? 1 : grain === 'stone' ? 2 : roughness >= .9 && typeof tint === 'string' && ['#3E5A4E', '#2F4A5C'].includes(tint.toUpperCase()) ? 3 : 0
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
        shader.fragmentShader = 'uniform sampler2D vis2oak; uniform sampler2D vis2stone; uniform sampler2D vis2fabric; uniform bool vis2Textured; varying vec3 surfaceParams; varying vec2 materialUv;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif (vis2Textured) { if (surfaceParams.z > 2.5) diffuseColor.rgb *= texture2D(vis2fabric, materialUv).rgb; else if (surfaceParams.z > 1.5) diffuseColor.rgb *= texture2D(vis2stone, materialUv).rgb; else if (surfaceParams.z > .5) diffuseColor.rgb *= texture2D(vis2oak, materialUv).rgb; }').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = surfaceParams.x;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = surfaceParams.y;')
      }
      material.customProgramCacheKey = () => 'office-vis2-pbr-v1'
      material.userData.officeVis2 = true
      const mesh = poses ? new THREE.InstancedMesh(geometry, material, poses.length) : new THREE.Mesh(geometry, material)
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
