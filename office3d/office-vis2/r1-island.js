import { r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'
import { buildHeartBanyan } from '../office-heart-banyan.js'
import { createSampleBatch } from './batch.js'

// Exact sector shapes from the R1 element register; its compact runtime rows retain only bounding boxes.
export const r1IslandSectors = Object.freeze([[145, 174], [184, 215], [-35, -4], [6, 35], [115, 135], [45, 65]].map(angles => Object.freeze(angles)))

function sector(THREE, inner, outer, a0, a1, height, opening = 0) {
  const shape = new THREE.Shape(), half = opening / 2
  const outerStart = opening ? Math.PI / 2 + Math.asin(half / outer) : a0
  const outerEnd = opening ? Math.PI * 2.5 - Math.asin(half / outer) : a1
  const innerStart = opening ? Math.PI / 2 + Math.asin(half / inner) : a0
  const innerEnd = opening ? Math.PI * 2.5 - Math.asin(half / inner) : a1
  shape.absarc(0, 0, outer, outerStart, outerEnd, false)
  shape.lineTo(inner * Math.cos(innerEnd), inner * Math.sin(innerEnd))
  shape.absarc(0, 0, inner, innerEnd, innerStart, true); shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 96 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

export function buildR1Island({ THREE, root, layout, collision, quality, low = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-island'; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), proxies = [], items = [], ownGeometries = []
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const center = r1ToWorld(...layout.r1.data.central.center_m), radii = layout.r1.data.central.radii_m
  const add = (id, geometry, color, x, y, z, yaw = 0, grain = '') => {
    const proxy = new THREE.Mesh(geometry.clone(), proxyMaterial)
    proxy.position.set(x, y, z); proxy.rotation.y = yaw; proxy.name = id; proxy.userData = { r1Id: id, collisionProxy: true }
    ownGeometries.push(proxy.geometry); collision?.add(proxy, id); proxies.push(proxy)
    proxy.updateWorldMatrix(true, false)
    const bounds = new THREE.Box3().setFromObject(proxy)
    const item = { id, position: { x, y, z }, yaw, bounds, startVertex: batch.triangles() * 3 }
    items.push(item)
    batch.add(geometry, color, [x, y, z], yaw, .8, 0, grain)
    item.count = batch.triangles() * 3 - item.startVertex
  }
  const bar = layout.r1.elements.find(row => row.id === '07-BAR-001'), opening = layout.r1.controls.barEntryClearMm / 1000
  add(bar.id, sector(THREE, radii.bar_inner, radii.bar_outer, 0, 0, bar.heightM, opening), '#b18a61', center.x, 0, center.z, 0, 'wood')
  const stools = layout.r1.elements.filter(row => row.regionId === '07' && row.category === '吧凳')
  for (const stool of stools) {
    const p = r1ToWorld(stool.xM, stool.yM), yaw = runtimeYawFromFacing(center.x - p.x, center.z - p.z)
    const geometry = new THREE.CylinderGeometry(stool.lengthM / 2, stool.lengthM / 2, stool.heightM, 20)
    geometry.translate(0, stool.heightM / 2, 0)
    // The solid proxy follows the registered stool envelope; visible furniture has a seat, stem and footrest.
    const proxy = new THREE.Mesh(geometry, proxyMaterial); proxy.position.set(p.x, 0, p.z); proxy.name = stool.id; proxy.userData.collisionProxy = true
    collision?.add(proxy, stool.id); proxies.push(proxy); ownGeometries.push(geometry)
    const bounds = new THREE.Box3().setFromObject(proxy), item = { id: stool.id, position: { x: p.x, y: 0, z: p.z }, yaw, bounds, startVertex: batch.triangles() * 3 }
    items.push(item)
    batch.add(new THREE.CylinderGeometry(.23, .23, .08, 24), '#506a5a', [p.x, .71, p.z], yaw, .93, 0, 'fabric')
    batch.add(new THREE.CylinderGeometry(.045, .065, .63, 12), '#52534e', [p.x, .355, p.z], yaw, .4, .65)
    batch.add(new THREE.CylinderGeometry(.23, .23, .04, 24), '#52534e', [p.x, .02, p.z], yaw, .4, .65)
    const rest = new THREE.TorusGeometry(.17, .018, 6, 24); rest.rotateX(Math.PI / 2)
    batch.add(rest, '#8f8270', [p.x, .28, p.z], yaw, .4, .6)
    item.count = batch.triangles() * 3 - item.startVertex
  }
  r1IslandSectors.forEach(([a0, a1], index) => {
    const id = `07-SF-${String(index + 1).padStart(3, '0')}`, row = layout.r1.elements.find(item => item.id === id)
    add(id, sector(THREE, 6.3, 6.9, a0 * Math.PI / 180, a1 * Math.PI / 180, row.heightM), index < 4 ? '#466a80' : '#a98458', center.x, row.zM, center.z, 0, index < 4 ? 'fabric' : 'wood')
  })
  const plant = layout.r1.elements.find(row => row.id === '07-PL-001')
  const part = suffix => layout.r1.elements.find(row => row.id === `${plant.id}-${suffix}`)
  const pot = part('POT'), crown = part('CR'), trunk = part('TR')
  const tree = buildHeartBanyan({ THREE, root: group, center, low: quality ? quality.tier === 'low' : low,
    fit: { crownDiameter: crown.lengthM, crownBase: crown.zM, totalHeight: plant.heightM, poolDiameter: pot.lengthM, poolHeight: pot.heightM, trunkDiameter: trunk.lengthM, trunkTop: trunk.zM + trunk.heightM } })
  tree.root.userData.r1Id = plant.id
  const potGeometry = new THREE.CylinderGeometry(pot.lengthM / 2, pot.lengthM / 2, pot.heightM, 48)
  const potProxy = new THREE.Mesh(potGeometry, proxyMaterial); potProxy.position.set(center.x, pot.heightM / 2, center.z); potProxy.userData.collisionProxy = true
  collision?.add(potProxy, pot.id); proxies.push(potProxy); ownGeometries.push(potGeometry)
  const built = batch.build(group, 'r1-island-surfaces'); built.mesh.userData.itemIds = items.map(item => item.id)
  root.add(group); let disposed = false
  return { root: group, items, tree, proxies, opening, radii, dispose() { if (disposed) return; disposed = true; proxies.forEach(proxy => collision?.remove?.(proxy)); ownGeometries.forEach(g => g.dispose()); proxyMaterial.dispose(); built.dispose(); tree.dispose(); group.removeFromParent() } }
}
