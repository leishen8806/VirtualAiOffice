import { LAYOUT_V3 } from './office-layout.js'
const placements = layout => {
  const center = layout?.island?.center || LAYOUT_V3.island.center
  return {
    pots: [{ x: center.x - 6, z: center.z - 3 }, { x: center.x + 6, z: center.z - 3 }, { x: center.x - 7, z: center.z + 4 }, { x: center.x + 7, z: center.z + 4 }],
    planters: [{ x: center.x - 8, z: center.z }, { x: center.x + 8, z: center.z }],
    flowerbeds: [{ x: center.x - 9, z: center.z + 8 }, { x: center.x + 9, z: center.z + 8 }],
  }
}
const instance = (THREE, geometry, material, count, name, group) => { const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); return mesh }
const setAt = (THREE, mesh, i, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix) }
export function buildOfficePlants({ THREE, root, layout = LAYOUT_V3, low = false } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficePlants requires THREE and root')
  const group = new THREE.Group(); group.name = 'office3-r3-plants'
  const owned = [new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: .9 }), new THREE.MeshStandardMaterial({ color: '#3E5A4E', roughness: .95 }), new THREE.MeshStandardMaterial({ color: '#C9A57A', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#82A987', roughness: .95 })]
  const [potMat, leafMat, soilMat, flowerMat] = owned
  const p = placements(layout); const pots = [...p.pots, ...p.planters, ...p.flowerbeds]
  const potMesh = instance(THREE, new THREE.CylinderGeometry(.36, .42, .52, low ? 8 : 12), potMat, pots.length, 'office3-r3-plant-pots', group)
  const leafMesh = instance(THREE, new THREE.IcosahedronGeometry(.55, low ? 0 : 1), leafMat, pots.length, 'office3-r3-plant-crowns', group)
  const flowers = instance(THREE, new THREE.IcosahedronGeometry(.13, 0), flowerMat, pots.length * 3, 'office3-r3-plant-flowers', group)
  pots.forEach((row, i) => { const type = i < p.pots.length ? 'pot' : i < p.pots.length + p.planters.length ? 'planter' : 'flowerbed'; const sx = type === 'flowerbed' ? 2.4 : type === 'planter' ? 1.7 : 1; const sz = type === 'flowerbed' ? .55 : type === 'planter' ? .55 : 1; setAt(THREE, potMesh, i, row.x, .26, row.z, sx, 1, sz); setAt(THREE, leafMesh, i, row.x, type === 'flowerbed' ? .95 : 1.2, row.z, sx, type === 'flowerbed' ? .65 : 1, sz); for (let j = 0; j < 3; j++) setAt(THREE, flowers, i * 3 + j, row.x + (j - 1) * .18 * sx, 1.1 + (j % 2) * .18, row.z + (j % 2 ? .12 : -.08) * sz, 1, 1, 1) })
  for (const mesh of [potMesh, leafMesh, flowers]) { mesh.instanceMatrix.needsUpdate = true }
  group.userData.module = 'r3-plants'; root.add(group)
  return { root: group, placements: p, summary: () => ({ calls: 3, triangles: [potMesh, leafMesh, flowers].reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count, 0), pots: p.pots.length, planters: p.planters.length, flowerbeds: p.flowerbeds.length, low }), dispose() { group.traverse(item => item.isMesh && item.geometry.dispose()); owned.forEach(material => material.dispose()); group.removeFromParent() } }
}
export const buildOfficePlantModule = buildOfficePlants

