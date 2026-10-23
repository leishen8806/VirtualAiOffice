import { LAYOUT_V3 } from './office-layout.js'
import { monitorScreenFit } from './office-furniture-v2.js'

const seatRows = layout => Object.entries(layout?.seats || LAYOUT_V3.seats).map(([name, [, x, z]]) => ({ name, x, z, yaw: 0 }))
const make = (THREE, color, roughness = .82) => new THREE.MeshStandardMaterial({ color, roughness })
const put = (THREE, mesh, index, position, scale, rotation = 0) => {
  const helper = new THREE.Object3D()
  helper.position.set(position.x, position.y, position.z)
  helper.rotation.y = rotation
  helper.scale.set(scale.x, scale.y, scale.z)
  helper.updateMatrix()
  mesh.setMatrixAt(index, helper.matrix)
}

export function buildOpenOfficeDeskGroups({ THREE, root, layout = LAYOUT_V3, low = false } = {}) {
  if (!THREE || !root) throw new TypeError('buildOpenOfficeDeskGroups requires THREE and root')
  const seats = seatRows(layout)
  const group = new THREE.Group(); group.name = 'office3-r3-open-desk-groups'
  const owned = [], meshes = []
  const deskMat = make(THREE, '#F5F3EE'), chairMat = make(THREE, '#2F4A5C'), monitorMat = new THREE.MeshBasicMaterial({ color: '#243746' }), accentMat = make(THREE, '#C9A57A')
  owned.push(deskMat, chairMat, monitorMat, accentMat)
  const add = (geometry, material, count, name) => { const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); meshes.push(mesh); return mesh }
  const desks = add(new THREE.BoxGeometry(1.35, .72, .7), deskMat, seats.length, 'office3-open-desks')
  const chairs = add(new THREE.BoxGeometry(.58, .92, .55), chairMat, seats.length, 'office3-open-chairs')
  const monitors = add(new THREE.PlaneGeometry(1, 1), monitorMat, seats.length, 'office3-open-monitors')
  const keyboards = add(new THREE.BoxGeometry(.36, .035, .12), accentMat, seats.length, 'office3-open-keyboards')
  const deskGeo = new THREE.BoxGeometry(1.35, .72, .7)
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i]
    put(THREE, desks, i, { x: seat.x, y: .36, z: seat.z }, { x: 1, y: 1, z: 1 }, seat.yaw)
    put(THREE, chairs, i, { x: seat.x, y: .46, z: seat.z + .92 }, { x: 1, y: 1, z: 1 }, seat.yaw + Math.PI)
    const fit = monitorScreenFit({ x: seat.x, y: .76, z: seat.z - .17, yaw: seat.yaw })
    const helper = new THREE.Object3D(); helper.position.set(fit.center.x, fit.center.y, fit.center.z); helper.rotation.order = 'YXZ'; helper.rotation.set(fit.pitch, fit.yaw, 0); helper.scale.set(fit.width, fit.height, 1); helper.updateMatrix(); monitors.setMatrixAt(i, helper.matrix)
    put(THREE, keyboards, i, { x: seat.x - .12, y: .765, z: seat.z + .15 }, { x: 1, y: 1, z: 1 }, seat.yaw)
  }
  for (const mesh of [desks, chairs, monitors, keyboards]) { mesh.instanceMatrix.needsUpdate = true }
  group.userData.module = 'r3-open-desk-groups'; group.userData.groups = ['2x3', '2x4']; root.add(group)
  return { root: group, seats, monitorSource: 'MONITOR_GLASS_SOURCE', summary: () => ({ calls: meshes.filter(mesh => mesh.visible).length, triangles: meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count, 0), desks: seats.length, groups: { '2x3': Math.min(12, seats.length), '2x4': Math.max(0, seats.length - 12) }, low }), dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.removeFromParent() }; for (const material of owned) material.dispose(); group.removeFromParent() } }
}

export const buildOfficeOpenDeskGroups = buildOpenOfficeDeskGroups

