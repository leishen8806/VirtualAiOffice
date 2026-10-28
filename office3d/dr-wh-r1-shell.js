import { WH_R1_DATA } from './wh-r1/data.js'
import { whToWorld } from './wh-r1-layout.js'
import { WH_R1_BUILDING, WH_R1_SITE, WH_R1_ZONES } from './dr-wh-r1-zones.js'

const point = ([x, y]) => whToWorld(x, y)
const wallSpec = (wall) => {
  const [a, b] = wall.geometry.points.map(point)
  const dx = b.x - a.x, dz = b.z - a.z
  return Object.freeze({
    id: wall.id,
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    length: Math.hypot(dx, dz),
    height: wall.geometry.height,
    thickness: wall.geometry.thickness,
    yaw: Math.atan2(-dz, dx),
    endpoints: Object.freeze([a, b]),
  })
}
const doorSpec = (door) => Object.freeze({
  id: door.id,
  label: door.sourceTag,
  ...whToWorld(door.xM, door.yM),
  width: door.lengthM,
  height: door.heightM,
  yaw: -door.yawDeg * Math.PI / 180,
  collisionRole: door.collisionRole,
})

export const WH_R1_WALLS = Object.freeze(WH_R1_DATA.walls.map(wallSpec))
export const WH_R1_DOORS = Object.freeze(WH_R1_DATA.doors.map(doorSpec))
export const WH_R1_SHELL_SPEC = Object.freeze({
  site: WH_R1_SITE,
  building: WH_R1_BUILDING,
  walls: WH_R1_WALLS,
  wallFaces: WH_R1_DATA.wallFaces,
  doors: WH_R1_DOORS,
  zones: WH_R1_ZONES,
})

const box = (THREE, root, name, width, height, depth, x, y, z, yaw, material, userData = {}) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.name = name
  mesh.position.set(x, y, z)
  mesh.rotation.y = yaw
  mesh.userData = { ...mesh.userData, ...userData }
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

export function buildWhR1Shell({ THREE, root, quality, canvasTex }) {
  const low = quality?.tier === 'low'
  const wallMaterial = low
    ? new THREE.MeshLambertMaterial({ color: 0x53626a })
    : new THREE.MeshStandardMaterial({ color: 0x53626a, roughness: .76, metalness: .3 })
  const floorMaterial = low
    ? new THREE.MeshLambertMaterial({ color: 0xbcc4c6 })
    : new THREE.MeshStandardMaterial({ color: 0xbcc4c6, roughness: .9 })
  const roofMaterial = low
    ? new THREE.MeshLambertMaterial({ color: 0x75919a, transparent: true, opacity: .34 })
    : new THREE.MeshStandardMaterial({ color: 0x75919a, roughness: .55, transparent: true, opacity: .34, depthWrite: false })
  const doorMaterial = new THREE.MeshBasicMaterial({ color: 0xd5af62, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false })
  const site = new THREE.Mesh(new THREE.PlaneGeometry(WH_R1_SITE.width, WH_R1_SITE.depth), floorMaterial)
  site.name = 'wh-r1-site-paving'; site.rotation.x = -Math.PI / 2; site.position.set(-123, -.595, 8); root.add(site)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WH_R1_BUILDING.width, WH_R1_BUILDING.depth), wallMaterial)
  floor.name = 'wh-r1-building-floor'; floor.rotation.x = -Math.PI / 2; floor.position.set(-124, -.59, 6); root.add(floor)

  for (const wall of WH_R1_WALLS) {
    box(THREE, root, `wh-r1-wall-${wall.id}`, wall.length, wall.height, wall.thickness, wall.x, wall.height / 2 - .6, wall.z, wall.yaw, wallMaterial, {
      whR1Id: wall.id,
      collisionProxy: true,
      noMerge: true,
      faceIds: WH_R1_DATA.wallFaces.filter((face) => face.wallId === wall.id).map((face) => face.id),
    })
  }
  for (const door of WH_R1_DOORS) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(door.width, door.height), doorMaterial)
    panel.name = `wh-r1-door-${door.id}`
    panel.position.set(door.x, door.height / 2 - .6, door.z)
    panel.rotation.y = door.yaw
    panel.userData = { whR1Id: door.id, collisionProxy: false, noMerge: true, state: 'UNKNOWN', label: door.label }
    root.add(panel)
    if (door.label && canvasTex) {
      const texture = canvasTex(256, 96, (context, width, height) => {
        context.clearRect(0, 0, width, height); context.fillStyle = '#f4f1eb'; context.textAlign = 'center'; context.font = '700 58px sans-serif'; context.fillText(door.label, width / 2, height * .7)
      })
      const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.2, door.width * .42), .45), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }))
      label.name = `wh-r1-door-label-${door.id}`; label.position.set(door.x, Math.min(door.height - .25, 2.7), door.z); label.rotation.y = door.yaw; label.userData = { whR1Id: door.id, label: door.label }; root.add(label)
    }
  }
  const roof = [
    ['north', 88, .28, -124, -17.86], ['south', 88, .28, -124, 29.86],
    ['west', .28, 48, -167.86, 6], ['east', .28, 48, -80.14, 6],
  ]
  for (const [name, width, depth, x, z] of roof) box(THREE, root, `wh-r1-roof-${name}`, width, .28, depth, x, 3.9, z, 0, roofMaterial)
  return {
    shellSpec: WH_R1_SHELL_SPEC,
    dispose() { new Set([wallMaterial, floorMaterial, roofMaterial, doorMaterial]).forEach((material) => material.dispose()) },
  }
}
