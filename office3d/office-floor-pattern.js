import { LAYOUT_V3 } from './office-layout.js'
export function buildOfficeFloorPattern({ THREE, root, layout = LAYOUT_V3, low = false, radii = [6.2, 7.5, 8.8] } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeFloorPattern requires THREE and root')
  const group = new THREE.Group(); group.name = 'office3-r3-floor-pattern'; const mat = new THREE.MeshBasicMaterial({ color: '#B8935A', transparent: true, opacity: .72 })
  const center = layout.ring?.center || { x: 2, z: -6 }; const mesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .045, 6, low ? 32 : 64), mat, radii.length); mesh.name = 'office3-r3-concentric-rings'; const helper = new THREE.Object3D()
  radii.forEach((radius, i) => { helper.position.set(center.x, .012 + i * .002, center.z); helper.scale.set(radius, 1, radius); helper.updateMatrix(); mesh.setMatrixAt(i, helper.matrix) }); mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); root.add(group)
  return { root: group, radii: [...radii], summary: () => ({ calls: 1, triangles: (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count, center, radii: [...radii], low }), dispose() { mesh.geometry.dispose(); mat.dispose(); group.removeFromParent() } }
}
export const buildOfficeConcentricFloorPattern = buildOfficeFloorPattern
