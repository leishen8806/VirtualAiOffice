import { buildOfficeTeaBarSample } from './bar.js'
import { buildOfficeFoyerFurniture } from './foyer.js'
import { buildOfficeFloorPattern } from './floor.js'
import { buildOfficeSamplePlants } from './plants.js'
import { createSampleBatch, bindOfficeFurnitureSurfaces } from './batch.js'
import { officeVis2Enabled, loadOfficeVis2Assets } from './assets.js'
import { buildOfficeVis2Frontage } from './frontage.js'
import { buildOfficeBrandMarks } from './brand.js'

// 只收拢样板资产自己创建的静态表面，保留小叶裁边着色器和家具实例。
export function buildOfficeSampleZone(context) {
  const { THREE, root } = context
  if (!THREE || !root) throw new TypeError('buildOfficeSampleZone requires THREE and root')
  const group = new THREE.Group(); group.name = 'office-sample-zone'; root.add(group)
  const modules = []; let merged, bar, foyer, floor, plants, brand, frontage, disposed = false
  const dispose = () => { if (disposed) return; disposed = true; merged?.dispose(); modules.slice().reverse().forEach(v => v.dispose()); group.removeFromParent() }
  try {
    modules.push(bar = buildOfficeTeaBarSample({ ...context, root: group }))
    modules.push(foyer = buildOfficeFoyerFurniture({ ...context, root: group }))
    modules.push(floor = buildOfficeFloorPattern({ ...context, root: group }))
    modules.push(plants = buildOfficeSamplePlants({ ...context, root: group }))
    group.updateWorldMatrix(true, true)
    const inverse = group.matrixWorld.clone().invert(), parts = [], batch = createSampleBatch(THREE, context.assets)
    group.traverse(m => { if (m.isMesh && m.visible && (!m.isInstancedMesh || m.name.includes('concentric-rings'))) parts.push(m) })
    for (const mesh of parts) {
      for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
        const matrix = inverse.clone().multiply(mesh.matrixWorld)
        if (mesh.isInstancedMesh) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(i, instance); matrix.multiply(instance) }
        const geometry = mesh.geometry.clone(); geometry.applyMatrix4(matrix)
        batch.add(geometry, mesh.material.vertexColors ? null : mesh.material.color, [0, 0, 0], 0, mesh.material.roughness ?? .9, mesh.material.metalness ?? 0)
      }
      mesh.removeFromParent()
    }
    merged = batch.build(group, 'sample-zone-static-surfaces')
    merged.mesh.castShadow = !context.low
    modules.push(brand = buildOfficeBrandMarks({ ...context, root: group }))
    modules.push(frontage = buildOfficeVis2Frontage({ ...context, root: group }))
    if (context.layout.variant === 'align' && !context.low) group.traverse(mesh => {
      if (mesh.isMesh && mesh.material.userData.officeVis2) mesh.material.userData.officeWarmReflection = true
    })
  } catch (error) { dispose(); throw error }
  // 样板已自行合批；沿用宿主 qualityProxy 约定，避免通用降档抹去表面/小叶着色器。
  group.userData.dynamic = true
  group.traverse(mesh => { if (mesh.isMesh) mesh.userData.qualityProxy = true })
  const summary = () => {
    let calls = 0, triangles = 0
    group.traverse(m => { if (m.isMesh && m.visible) { calls++; triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1) } })
    return { calls, triangles, seats: bar.seats.length, sofas: 8, brandMarks: brand.marks.length, realStaff: 0, scope: 'tea-bar-and-foyer' }
  }
  return { root: group, summary, seats: bar.seats, lounges: bar.lounges, colliders: bar.colliders, mapping: { foyer: foyer.footprints, frontage: frontage.mapping, brandMarks: brand.marks, plants: plants.placements.map(p => ({ ...p, radius: .5, height: 1.6 })), treePool: { ...context.layout.bar.center, radius: 1.05, height: .4 }, unchangedBarColliders: bar.colliders }, dispose }
}

export function createOfficeVis2Controller(context) {
  let epoch = 0, sample = null, assets = null, furnitureSurfaces = null, destroyed = false, status = 'closed'
  const clear = () => { furnitureSurfaces?.dispose(); furnitureSurfaces = null; sample?.dispose(); assets?.dispose(); sample = null; assets = null }
  return {
    get root() { return sample?.root || null },
    get mapping() { return sample?.mapping || null },
    get status() { return status },
    summary() { return sample?.summary() || { enabled: false, calls: 0, triangles: 0 } },
    async setConfig(config) {
      const version = ++epoch; clear(); status = 'closed'
      if (destroyed || !officeVis2Enabled(config)) return false
      let loaded
      try {
        loaded = await loadOfficeVis2Assets(context.THREE, config, context.textureLoader)
        if (destroyed || version !== epoch) { loaded?.dispose(); return false }
        assets = loaded; sample = buildOfficeSampleZone({ ...context, assets })
        if (context.layout.variant==='align' && !context.low) furnitureSurfaces = bindOfficeFurnitureSurfaces(context.THREE,context.get?.('furniture3')?.surfaceMaterials,assets)
        status = 'open'; return true
      } catch { loaded?.dispose(); if (version === epoch) { clear(); status = 'fallback' } return false }
    },
    dispose() { if (destroyed) return; destroyed = true; epoch++; clear(); status = 'closed' },
  }
}
