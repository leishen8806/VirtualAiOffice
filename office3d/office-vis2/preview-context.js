import { buildOfficeShellV3 } from '../office-layout-v3-scene.js'
import { placeOfficeFurnitureV2 } from '../office-furniture-v2.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'
import { buildOfficeCompletionVisual } from './completion.js'

// 预览只借用既有外壳/工位，不注册业务热点、人物或第二套场景生命周期。
export function buildOfficePreviewContext({ THREE, root, layout, A, placeFurniture, canvasTex, low = false }) {
  const group = new THREE.Group(); group.name = 'office-vis2-preview-context'; root.add(group)
  const collision = { add() {} }
  let shell, furniture, completion, merged, floorMaterial, disposed = false
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
    completion?.dispose(); merged?.dispose(); furniture?.dispose()
    furnitureMaterials.forEach(material => material.dispose())
    shell?.dispose(); floorMaterial?.dispose(); group.removeFromParent()
  }
  try {
    shell = buildOfficeShellV3({ THREE, root: group, layout, collision, low })
    group.traverse(mesh => { if (mesh.isInstancedMesh) instances.push(mesh) })
    // 既有工位和墙位完全照用；只让预览地面退到样板地面下面，避免两层地面闪烁。
    shell.ground.position.y = -.15
    floorMaterial = new THREE.MeshStandardMaterial({ color: '#E8DECD', roughness: .85 })
    shell.ground.material = floorMaterial; shell.ground.receiveShadow = !low
    // 共享外壳的实例色与材质色相乘会使独立预览呈深灰；这里仅调整本实例的材质。
    shell.walls.material.vertexColors = false; shell.walls.material.color.set('#F4F1EA')
    shell.walls.material.emissive.set('#000000'); shell.walls.material.emissiveIntensity = 0; shell.walls.material.toneMapped = true
    if (shell.innerGlass) { shell.innerGlass.material.color.set('#ffffff'); shell.innerGlass.material.opacity = .085; shell.innerGlass.material.forceSinglePass = true }
    const warmFurniture = (...args) => {
      const value = placeFurniture(...args)
      value.group.traverse(mesh => { if (mesh.isMesh && mesh.material) {
        const materials = [mesh.material].flat().map(source => {
        const material = source.clone(), name = source.name || ''
        const tint = /carpet|fabric|cushion/i.test(name) ? '#3E5A4E' : /wood/i.test(name) ? '#C9A57A' : /metalDark/i.test(name) ? '#596455' : null
        if (tint) material.color.set(tint)
        material.name = ''; furnitureMaterials.push(material); return material
        })
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
      } })
      return value
    }
    furniture = placeOfficeFurnitureV2({ THREE, scene: group, parent: group, layout, A, placeFurniture: warmFurniture, collision, canvasTex, makeScreenTexture() {
      const tex = canvasTex(256, 144, (ctx, w, h) => { ctx.clearRect(0, 0, w, h) })
      return { tex, ctx: tex.image.getContext('2d'), scroll: 0, last: '' }
    } })
    furniture.root.traverse(mesh => { if (mesh.isMesh && !mesh.visible) hiddenParts.push(mesh) })
    merged = mergeOfficeStatic(THREE, furniture.root, 'vis2-context')
    completion = buildOfficeCompletionVisual({ THREE, root: group, layout, canvasTex, low })
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
