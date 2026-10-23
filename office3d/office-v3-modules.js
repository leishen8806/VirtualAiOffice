import { LAYOUT_V3 } from './office-layout.js'
import { createOfficeV2Registry } from './office-v2-registry.js'
import { buildOfficeAlignedShell } from './office-vis2/shell-finish.js'
import { placeOfficeFurnitureV2 } from './office-furniture-v2.js'
import { buildOfficeSampleHost, officeSampleRequested } from './office-vis2/host.js'
import { buildOfficeAlignedZones } from './office-vis2/zone-finish.js'
import { buildDisplayDepartments } from './display-departments.js'
import { buildDisplayStaff } from './display-staff.js'

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
  const furniture = placeOfficeFurnitureV2({ ...context, parent: context.root, layout: context.layout, warmPalette: officeSampleRequested(context.search) })
  return { ...furniture, displaySeats: context.layout.displaySeats, version: 3 }
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
  return buildDisplayStaff({ ...context, layout: displayLayout(context.layout), search: context.search || '', compact: true })
}

export const officeV3Modules = Object.freeze([
  ['shell3', buildOfficeAlignedShell],
  ['furniture3', buildOfficeFurnitureV3],
  ['island', buildOfficeSampleHost],
  ['zones', buildOfficeAlignedZones],
  ['displayDepartments', buildDisplayDepartmentsV3],
  ['displayStaff', buildDisplayStaffV3],
])

export function startOfficeV3(shared) {
  if (shared.layout?.version !== 3) return null
  const registry = createOfficeV2Registry({ THREE: shared.THREE, scene: shared.scene, quality: shared.quality, layout: LAYOUT_V3, rootName: 'office3-root', batchPrefix: 'office3' })
  officeV3Modules.forEach(([name, factory]) => registry.register(name, factory))
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
