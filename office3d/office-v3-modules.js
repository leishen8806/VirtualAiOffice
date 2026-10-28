import { LAYOUT_V3 } from './office-layout.js'
import { createOfficeV2Registry } from './office-v2-registry.js'
import { buildOfficeAlignedShell } from './office-vis2/shell-finish.js'
import { buildOfficeShellV3 } from './office-layout-v3-scene.js'
import { placeOfficeFurnitureV2 } from './office-furniture-v2.js'
import { buildOfficeSampleHost, officeSampleRequested } from './office-vis2/host.js'
import { buildOfficeAlignedZones } from './office-vis2/zone-finish.js'
import { buildOfficePlazaHost } from './office-vis2/plaza-host.js'
import { buildOfficeDisplayFinish as buildDisplayDepartments } from './office-vis2/display-finish.js'
import { buildDisplayStaff } from './display-staff.js'
import { createOfficePottedFoliage } from './office-vis2/plants.js'
import { facingSample, facingHome, posedPoint } from './office-vis2/furniture-sample.js'
import { buildR1Furniture } from './office-vis2/r1-furniture.js'
import { buildR1Island } from './office-vis2/r1-island.js'
import { buildR1Plants } from './office-vis2/r1-plants.js'
import { buildR1Plaza } from './office-vis2/r1-plaza.js'

const pendingModule = name => ({
  pending: true,
  status: '待接',
  name,
  dispose() {},
})

function buildOfficeFurnitureV3(context) {
  if (!context.A?.furn || typeof context.placeFurniture !== 'function' || typeof context.canvasTex !== 'function' || typeof context.makeScreenTexture !== 'function') {
    return pendingModule('office-furniture-v3')
  }
  const foliage=context.layout.variant==='align'&&officeSampleRequested(context.search)?createOfficePottedFoliage(context.THREE,context.A.furn.pottedPlant,context.low):null
  const plantPlacements=[],placeFurniture=(A,name,x,z,options)=>{
    const nextZ=context.layout.variant==='align'&&officeSampleRequested(context.search)&&name==='pottedPlant'?Math.min(z,context.layout.envelope.z1-.6):z
    if(name==='pottedPlant')plantPlacements.push({x,fromZ:z,z:nextZ})
    return context.placeFurniture(A,name,x,nextZ,options)
  }
  const plantProxies=new Map(),registered=new Set(),collision=context.layout.variant==='align'&&officeSampleRequested(context.search)&&context.collision?{...context.collision,
    add(group,kind){const proxy=kind==='pottedPlant'&&foliage?.enabled?foliage.collisionProxy(group):group;if(proxy!==group)plantProxies.set(group,proxy);registered.add(proxy);return context.collision.add(proxy,kind)},
    remove(group){const proxy=plantProxies.get(group)||group;registered.delete(proxy);return context.collision.remove?.(proxy)}}:context.collision
  let furniture, badges, disposed=false
  const dispose=()=>{if(disposed)return;disposed=true;try{badges?.removeFromParent();badges?.geometry.dispose();badges?.material.dispose();badges?.dispose();furniture?.dispose()}finally{for(const p of registered)context.collision.remove?.(p);registered.clear();for(const p of plantProxies.values())p.clear();plantProxies.clear();foliage?.dispose()}}
  try {
    const A=foliage?.enabled?{...context.A,furn:{...context.A.furn,pottedPlant:foliage.source}}:context.A
    furniture = placeOfficeFurnitureV2({ ...context, A, collision, placeFurniture, parent: context.root, layout: context.layout, warmPalette: officeSampleRequested(context.search) })
    const surfaceMaterials = new Set()
    if (context.layout.variant==='align' && officeSampleRequested(context.search)) furniture.root.traverse(m=>{if(m.isMesh&&m.name.startsWith('office2-furniture-part-'))surfaceMaterials.add(m.material)})
    if (officeSampleRequested(context.search)) {
      const { THREE } = context, seats = Object.values(context.layout.seats)
      const geometry = new THREE.CylinderGeometry(.06, .06, .012, 6), material = new THREE.MeshBasicMaterial({ toneMapped: false })
      badges = new THREE.InstancedMesh(geometry, material, seats.length); badges.name = 'agent-model-badges'; badges.onBeforeRender = () => {}
      const transform = new THREE.Object3D()
      seats.forEach((seat, i) => {
        const [,x,z]=seat,yaw=facingSample(context.layout)&&facingHome(seat)?.yaw||0,p=posedPoint(x,z,yaw,.62,.06)
        transform.position.set(p.x, .8, p.z); transform.rotation.x = Math.PI / 2; transform.updateMatrix()
        badges.setMatrixAt(i, transform.matrix); badges.setColorAt(i, new THREE.Color(0xffffff))
        furniture.deskAt(x, z).setBadge = color => { badges.setColorAt(i, new THREE.Color(color)); badges.instanceColor.needsUpdate = true }
      })
      context.root.add(badges)
    }
    return { ...furniture, plantPlacements, surfaceMaterials:[...surfaceMaterials], displaySeats: context.layout.displaySeats, version: 3, dispose }
  }catch(error){dispose();throw error}
}

const displayLayout = layout => ({ ...layout, version: 2, corridors: {
  ...layout.corridors,
  north: layout.corridors.westNorthCross,
  south: layout.corridors.eastSouthCross,
}, displayAdapter: 'v3' })

function buildDisplayDepartmentsV3(context) {
  return buildDisplayDepartments({ ...context, layout: displayLayout(context.layout) })
}

function buildDisplayStaffV3(context) {
  const layout=context.get?.('displayDepartments')?.displayLayout || displayLayout(context.layout)
  return buildDisplayStaff({ ...context, layout, search: context.search || '', compact: true })
}

export const officeV3Modules = Object.freeze([
  ['shell3', buildOfficeAlignedShell],
  ['furniture3', buildOfficeFurnitureV3],
  ['island', buildOfficeSampleHost],
  ['zones', buildOfficeAlignedZones],
  ['plaza', buildOfficePlazaHost],
  ['displayDepartments', buildDisplayDepartmentsV3],
  ['displayStaff', buildDisplayStaffV3],
])

export const officeV3ModulesFor = layout => layout?.r1Phase === 'R1'
  ? Object.freeze([['shell3', buildOfficeShellV3], ['furniture3', buildR1Furniture], ['r1Island', buildR1Island], ['r1Plants', buildR1Plants], ['r1Plaza', buildR1Plaza]])
  : officeV3Modules

export function startOfficeV3(shared) {
  if ((shared.layout || LAYOUT_V3).version !== 3) return null
  const registry = createOfficeV2Registry({ THREE: shared.THREE, scene: shared.scene, quality: shared.quality, layout: shared.layout || LAYOUT_V3, rootName: 'office3-root', batchPrefix: 'office3' })
  officeV3ModulesFor(shared.layout || LAYOUT_V3).forEach(([name, factory]) => registry.register(name, factory))
  registry.buildAll(shared)
  if (!registry.get('shell3')) { registry.dispose(); return null }
  shared.scene.userData.officeV3 = registry
  return registry
}

const worldPosition = (object) => {
  const p = object?.position
  return { x: Number(p?.x) || 0, z: Number(p?.z) || 0 }
}

const isEnvironmentBackdrop = (object) => {
  const ctor = object?.constructor?.name || ''
  const name = String(object?.name || '').toLowerCase()
  return ctor === 'Sky' || /sky|cloud|rain|star|landmark|city|background/.test(name)
}

const isInside = (p, box, pad = 0) => p.x >= box.x0 - pad && p.x <= box.x1 + pad && p.z >= box.z0 - pad && p.z <= box.z1 + pad

// 只挑环境里与新站点冲突的局部物件；天空、远景和全局地面不能随外壳一起拆掉。
export function selectEnvironmentConflicts(environmentRoots, layout) {
  const site = layout?.site
  if (!site) return []
  return [...(environmentRoots || [])].filter((object) => {
    if (!object || object.isLight || object.isCamera || object.userData?.dynamic || isEnvironmentBackdrop(object)) return false
    const name = String(object.name || '').toLowerCase()
    if (/^(ground|terrain|world-ground)$/.test(name)) return false
    const p = worldPosition(object)
    if (!isInside(p, site, Number(layout.greenBuffer?.width) || 0)) return false
    if (object.isGroup) return true // 环境树 / 棕榈树等局部组
    if (layout.variant === 'align' && !object.geometry?.boundingBox) object.geometry?.computeBoundingBox?.()
    const box = object.geometry?.boundingBox
    if (!box) return true
    const w = Math.abs((box.max.x - box.min.x) * (object.scale?.x || 1))
    const d = Math.abs((box.max.z - box.min.z) * (object.scale?.z || 1))
    return w <= 140 && d <= 100
  })
}

export function demolishLegacyScene(scene, remove = new Set()) {
  const removed = []
  for (const child of [...(remove || [])]) {
    if (!child || child.parent !== scene || child.isCamera || child.isLight) continue
    removed.push(child.name || child.type); child.removeFromParent()
  }
  return removed
}
