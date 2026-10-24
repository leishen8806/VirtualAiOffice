import { buildOfficeAlignedShell } from './shell-finish.js'
import { placeOfficeFurnitureV2 } from '../office-furniture-v2.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'
import { buildOfficeCompletionVisual } from './completion.js'
import { buildOfficeAlignedZones } from './zone-finish.js'

// 预览只借用既有外壳/工位，不注册业务热点、人物或第二套场景生命周期。
export function buildOfficePreviewContext({ THREE, root, layout, A, placeFurniture, canvasTex, low = false }) {
  const group = new THREE.Group(); group.name = 'office-vis2-preview-context'; root.add(group)
  const collision = { add() {} }
  let shell, furniture, completion, merged, zones, disposed = false
  const instances = [], hiddenParts = [], furnitureMaterials = []
  const sharedGeometries = new Set(), sharedMaterials = new Set()
  for (const model of Object.values(A?.furn || {})) model?.traverse(mesh => {
    if (mesh.geometry) sharedGeometries.add(mesh.geometry)
    for (const material of [mesh.material].flat()) if (material) sharedMaterials.add(material)
  })
  const dispose = () => {
    if (disposed) return; disposed = true
    for (const mesh of instances) mesh.dispose()
    for (const mesh of hiddenParts) {
      if (!sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose()
      for (const material of [mesh.material].flat()) if (material && !sharedMaterials.has(material) && !furnitureMaterials.includes(material)) material.dispose()
    }
    completion?.dispose(); zones?.dispose(); merged?.dispose(); furniture?.dispose()
    furnitureMaterials.forEach(material => material.dispose())
    shell?.dispose(); group.removeFromParent()
  }
  try {
    shell = buildOfficeAlignedShell({ THREE, root: group, layout, collision, low, search: '?officeSample=1' })
    group.traverse(mesh => { if (mesh.isInstancedMesh && !mesh.userData.dynamic) instances.push(mesh) })
    shell.ground.receiveShadow = !low
    const privateFurniture = (...args) => {
      const value = placeFurniture(...args)
      value.group.traverse(mesh => { if (mesh.isMesh && mesh.material) {
        const materials = [mesh.material].flat().map(source => { const material = source.clone(); furnitureMaterials.push(material); return material })
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
      } })
      return value
    }
    furniture = placeOfficeFurnitureV2({ THREE, scene: group, parent: group, layout, A, placeFurniture: privateFurniture, collision, canvasTex, warmPalette: true, makeScreenTexture() {
      const tex = canvasTex(256, 144, (ctx, w, h) => { ctx.clearRect(0, 0, w, h) })
      return { tex, ctx: tex.image.getContext('2d'), scroll: 0, last: '' }
    } })
    furniture.root.traverse(mesh => { if (mesh.isMesh && !mesh.visible) hiddenParts.push(mesh) })
    merged = mergeOfficeStatic(THREE, furniture.root, 'vis2-context')
    zones = buildOfficeAlignedZones({ THREE, root: group, layout, canvasTex, low, search: '?officeSample=1' })
    completion = buildOfficeCompletionVisual({ THREE, root: group, layout, canvasTex, low, includePaving: !shell.finishSpec, includeZones: false })
    furniture.root.traverse(mesh => { if (mesh.isMesh && mesh.name.startsWith('vis2-context-merged')) { mesh.castShadow = !low; mesh.receiveShadow = !low } })
    group.userData.dynamic = true
    group.traverse(mesh => { if (mesh.isMesh) mesh.userData.qualityProxy = true })
  } catch (error) { dispose(); throw error }
  return { root: group, seats: furniture.spec.workstations.map(({ name, region, x, z }) => ({ name, region, x, z })), completion: completion.placements, onFrame(camera) { if (group.visible) shell.onFrame(.3, { camera }) }, dispose }
}

// 只由独立预览释放它自己调用 loadAssets 得到的资产，宿主传入的 A 不走这里。
export function disposePreviewAssets(A) {
  const owned = new Set(), images = new Set()
  for (const source of [...Object.values(A?.furn || {}), ...Object.values(A?.hairs || {}), ...Object.values(A?.chars || {}).map(value => value.scene)]) source?.traverse(object => {
    if (object.geometry) owned.add(object.geometry)
    if (object.skeleton) owned.add(object.skeleton)
    for (const material of [object.material].flat()) if (material) { owned.add(material); for (const value of Object.values(material)) if (value?.isTexture) owned.add(value) }
  })
  for (const value of owned) { if (value.isTexture && typeof value.image?.close === 'function') images.add(value.image); value.dispose() }
  for (const image of images) image.close()
}
