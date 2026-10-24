import { LAYOUT_V3 } from './office-layout.js'
const mat = (THREE, color) => new THREE.MeshStandardMaterial({ color, roughness: .82 })
const add = (THREE, group, geometry, material, count, name) => { const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); return mesh }
const setAt = (THREE, mesh, i, x, y, z, sx = 1, sy = 1, sz = 1, yaw = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = yaw; o.scale.set(sx, sy, sz); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix) }
export function buildOfficeFoyerFurniture({ THREE, root, layout = LAYOUT_V3 } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeFoyerFurniture requires THREE and root')
  const group = new THREE.Group(); group.name = 'office3-r3-foyer-furniture'; const owned = [mat(THREE, '#F5F3EE'), mat(THREE, '#C9A57A'), mat(THREE, '#2F4A5C'), mat(THREE, '#3E5A4E')]
  const [white, wood, navy, green] = owned; const front = layout.frontDesk || LAYOUT_V3.frontDesk; const bar = layout.serviceBar || LAYOUT_V3.serviceBar; const sofa = layout.waitingArc || LAYOUT_V3.waitingArc
  const counters = add(THREE, group, new THREE.BoxGeometry(1, 1, 1), white, 2, 'office3-r3-foyer-counters'); setAt(THREE, counters, 0, front.center.x, .65, front.center.z, front.x1 - front.x0, 1.3, front.z1 - front.z0); setAt(THREE, counters, 1, bar.center.x, .65, bar.center.z, bar.x1 - bar.x0, 1.3, bar.z1 - bar.z0)
  const tops = add(THREE, group, new THREE.BoxGeometry(1, 1, 1), wood, 2, 'office3-r3-foyer-counter-tops'); setAt(THREE, tops, 0, front.center.x, 1.34, front.center.z, front.x1 - front.x0 + .1, .08, front.z1 - front.z0 + .1); setAt(THREE, tops, 1, bar.center.x, 1.34, bar.center.z, bar.x1 - bar.x0 + .1, .08, bar.z1 - bar.z0 + .1)
  const sofas = add(THREE, group, new THREE.BoxGeometry(1, 1, 1), navy, 2, 'office3-r3-foyer-sofas'); setAt(THREE, sofas, 0, sofa.center.x - 1.2, .42, sofa.center.z, 2.2, .65, .7, Math.PI / 2); setAt(THREE, sofas, 1, sofa.center.x + 1.2, .42, sofa.center.z, 2.2, .65, .7, -Math.PI / 2)
  const cushions = add(THREE, group, new THREE.BoxGeometry(1, 1, 1), green, 4, 'office3-r3-foyer-cushions'); for (let i = 0; i < 4; i++) setAt(THREE, cushions, i, sofa.center.x + (i % 2 ? 1.1 : -1.1), .83, sofa.center.z + (i < 2 ? -.2 : .2), .7, .12, .45)
  for (const mesh of [counters, tops, sofas, cushions]) mesh.instanceMatrix.needsUpdate = true
  group.userData.module = 'r3-foyer-furniture'; root.add(group)
  return { root: group, summary: () => ({ calls: 4, triangles: group.children.filter(item => item.isMesh).reduce((sum, item) => sum + (item.geometry.index?.count || item.geometry.attributes.position.count) / 3 * item.count, 0), counters: 2, sofas: 2, seats: 4 }), dispose() { group.traverse(item => item.isMesh && item.geometry.dispose()); owned.forEach(material => material.dispose()); group.removeFromParent() } }
}
export const buildOfficeFoyer = buildOfficeFoyerFurniture

