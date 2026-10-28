import { WH_R1_DATA } from './wh-r1/data.js'

export const WH_R1_SITE = Object.freeze({ x0: -174, x1: -72, z0: -26, z1: 42, width: 102, depth: 68 })
export const WH_R1_BUILDING = Object.freeze({ x0: -168, x1: -80, z0: -18, z1: 30, width: 88, depth: 48 })
export const WH_R1_ZONES = Object.freeze(WH_R1_DATA.zones.map((zone) => Object.freeze({
  id: zone.id,
  label: `${zone.id} · ${zone.name}`,
  name: zone.name,
  businessId: zone.businessId,
  x0: zone.worldBboxXZ[0],
  x1: zone.worldBboxXZ[1],
  z0: zone.worldBboxXZ[2],
  z1: zone.worldBboxXZ[3],
})))
export const WH_R1_CAMERA_VIEWS = Object.freeze([
  Object.freeze({ id: 'overview', label: '全景', az: -25, el: 48, r: 76, t: Object.freeze([-124, 0, 6]) }),
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
