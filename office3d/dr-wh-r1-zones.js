import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_BUILDING_SOURCE_BBOX, WH_R1_SITE_SOURCE_BBOX, whToWorld, whZoneToWorld } from './wh-r1-layout.js'

const bounds = source => { const [x0, x1, z0, z1] = whZoneToWorld(source); return Object.freeze({ x0, x1, z0, z1, width: x1 - x0, depth: z1 - z0 }) }
export const WH_R1_SITE = bounds(WH_R1_SITE_SOURCE_BBOX)
export const WH_R1_BUILDING = bounds(WH_R1_BUILDING_SOURCE_BBOX)
export const WH_R1_ZONE_SOURCE_OVERRIDES = Object.freeze({ '14': Object.freeze([152, 0, 160, 12]) })
export const WH_R1_ZONES = Object.freeze(WH_R1_DATA.zones.map((zone) => {
  const [x0, x1, z0, z1] = whZoneToWorld(WH_R1_ZONE_SOURCE_OVERRIDES[zone.id] || zone.sourceBboxM)
  return Object.freeze({ id: zone.id, label: `${zone.id} · ${zone.name}`, name: zone.name, businessId: zone.businessId, x0, x1, z0, z1 })
}))
export const WH_R1_CAMERA_VIEWS = Object.freeze([
  Object.freeze({ id: 'overview', label: '全景', az: -25, el: 52, r: 132, t: Object.freeze([(WH_R1_SITE.x0 + WH_R1_SITE.x1) / 2, 0, (WH_R1_SITE.z0 + WH_R1_SITE.z1) / 2]) }),
  Object.freeze({ id: 'northDock', label: '北侧 5 车位', az: 180, el: 36, r: 46, t: Object.freeze([whToWorld(14.5, 56).x, 0, whToWorld(14.5, 56).z]) }),
  Object.freeze({ id: 'eastAnnex', label: '东侧附建发货区', az: 270, el: 38, r: 54, t: Object.freeze([whToWorld(113, 26).x, 0, whToWorld(113, 26).z]) }),
  Object.freeze({ id: 'frontPlaza', label: '前广场', az: 180, el: 42, r: 42, t: Object.freeze([whToWorld(44, -3).x, 0, whToWorld(44, -3).z]) }),
])

export function buildWhR1Zones({ THREE, root, quality, canvasTex }) {
  const low = quality?.tier === 'low'
  const material = low
    ? new THREE.MeshBasicMaterial({ color: 0xd5af62, transparent: true, opacity: .22, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0xd5af62, transparent: true, opacity: .18, depthWrite: false, roughness: .8 })
  const textures = []
  for (const zone of WH_R1_ZONES) {
    const width = zone.x1 - zone.x0, depth = zone.z1 - zone.z0
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
    mesh.name = `wh-r1-zone-${zone.id}`; mesh.rotation.x = -Math.PI / 2; mesh.position.set((zone.x0 + zone.x1) / 2, -.575, (zone.z0 + zone.z1) / 2); mesh.userData = { whR1Id: zone.id, businessId: zone.businessId }; root.add(mesh)
    if (canvasTex) {
      const texture = canvasTex(768, 96, (context, canvasWidth, canvasHeight) => { context.clearRect(0, 0, canvasWidth, canvasHeight); context.fillStyle = '#e8d6aa'; context.textAlign = 'center'; context.font = '600 42px "Microsoft YaHei",sans-serif'; context.fillText(zone.label, canvasWidth / 2, canvasHeight * .66) })
      textures.push(texture)
      const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width - .5, 8), .5), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
      label.name = `wh-r1-zone-label-${zone.id}`; label.rotation.x = -Math.PI / 2; label.position.set((zone.x0 + zone.x1) / 2, -.565, zone.z1 - .38); root.add(label)
    }
  }
  return { dispose() { material.dispose(); textures.forEach((texture) => texture.dispose()) } }
}
