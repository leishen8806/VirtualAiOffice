import * as THREE from './vendor/three/three.module.js'
import { OFFICE_ROOMS, roomSegments, ENVELOPE, ENTRANCE } from './office-layout.js'

// 参考 historical/photo_7_2026-10-09_11-17-44.jpg：深色框架、完整玻璃隔断、独立门洞。
export function buildOfficePartitions({ scene, collision, canvasTex, VI }) {
  const root = new THREE.Group(); root.name = 'office-room-partitions'
  scene.add(root)
  const height = 3.1, thickness = 0.14
  const frame = new THREE.MeshStandardMaterial({ color: VI.graphite, roughness: 0.48, metalness: 0.35 })
  const stone = new THREE.MeshStandardMaterial({ color: 0xd6d0c5, roughness: 0.75 })
  const gold = new THREE.MeshStandardMaterial({ color: VI.gold, roughness: 0.4, metalness: 0.65 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x7b9695, roughness: 0.28, transparent: true, opacity: 0.29, depthWrite: false })
  const frost = new THREE.MeshBasicMaterial({ color: 0xd4ded8, transparent: true, opacity: 0.46, depthWrite: false })
  function block(group, w, h, d, x, y, z, material, solid = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z); mesh.castShadow = !material.transparent; mesh.receiveShadow = true
    group.add(mesh)
    if (solid) collision.add(mesh, 'officeWall')
    return mesh
  }
  function wall(group, side, lo, hi, room) {
    const vertical = side === 'west' || side === 'east', length = hi - lo
    const x = vertical ? (side === 'west' ? room.x0 : room.x1) : (lo + hi) / 2
    const z = vertical ? (lo + hi) / 2 : (side === 'north' ? room.z0 : room.z1)
    const w = vertical ? thickness : length, d = vertical ? length : thickness
    block(group, w, 1.02, d, x, 0.51, z, stone, true)
    block(group, w, height - 1.02, d, x, (height + 1.02) / 2, z, glass, true)
    block(group, w + 0.03, 0.10, d + 0.03, x, height, z, frame)
    block(group, w + 0.025, 0.12, d + 0.025, x, 0.06, z, frame)
    block(group, w + 0.04, 0.025, d + 0.04, x, 1.04, z, gold)
    block(group, w + 0.01, 0.23, d + 0.01, x, 1.65, z, frost)
    const panels = Math.ceil(length / 2.5)
    for (let i = 0; i <= panels; i++) {
      const t = lo + length * i / panels
      block(group, 0.07, height, 0.07, vertical ? x : t, height / 2, vertical ? t : z, frame)
    }
  }
  for (const room of OFFICE_ROOMS) {
    const group = new THREE.Group(); group.name = `room-${room.id}`; root.add(group)
    for (const segment of roomSegments(room)) {
      // 相邻标准模块共用一道隔墙，避免重叠玻璃和重复碰撞体。
      if (segment.side === 'west' && OFFICE_ROOMS.some(r => r !== room && r.x1 === room.x0 && r.z0 === room.z0 && r.z1 === room.z1)) continue
      wall(group, segment.side, segment.lo, segment.hi, room)
    }
    for (const door of room.doors) {
      const vertical = door.side === 'east' || door.side === 'west', width = door.width || 2.2
      const x = vertical ? (door.side === 'west' ? room.x0 : room.x1) : door.at
      const z = vertical ? door.at : (door.side === 'north' ? room.z0 : room.z1)
      block(group, vertical ? thickness : width, 0.55, vertical ? width : thickness, x, height - 0.275, z, frame)
      for (const sign of [-1, 1]) block(group, 0.11, 2.55, 0.11, x + (vertical ? 0 : sign * width / 2), 1.275, z + (vertical ? sign * width / 2 : 0), gold, true)
      block(group, vertical ? 0.42 : width, 0.012, vertical ? width : 0.42, x, 0.022, z, gold)
      const texture = canvasTex(768, 144, (g, w, h) => {
        g.fillStyle = '#202326'; g.fillRect(0, 0, w, h)
        g.fillStyle = '#b69a64'; g.fillRect(0, h - 5, w, 5)
        g.fillStyle = '#f4f1eb'; g.textAlign = 'center'; g.font = '500 55px "Microsoft YaHei",sans-serif'; g.fillText(room.name, w / 2, 90)
      })
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, 0.37), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }))
      plaque.position.set(x + (vertical ? (door.side === 'east' ? 0.09 : -0.09) : 0), 2.8, z + (vertical ? 0 : 0.09))
      if (vertical) plaque.rotation.y = door.side === 'east' ? Math.PI / 2 : -Math.PI / 2
      group.add(plaque)
    }
  }
  // 正门与台阶同宽，与主竖廊同轴。
  wall(root, 'south', ENVELOPE.x0, ENTRANCE.x0, ENVELOPE); wall(root, 'south', ENTRANCE.x1, ENVELOPE.x1, ENVELOPE)
  wall(root, 'west', ENVELOPE.z0, ENVELOPE.z1, ENVELOPE); wall(root, 'east', ENVELOPE.z0, ENVELOPE.z1, ENVELOPE)
  return { root, rooms: OFFICE_ROOMS }
}
