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
  const doorGeometry = new THREE.PlaneGeometry(1, 1), doorPanels = new THREE.InstancedMesh(doorGeometry, doorMaterial, WH_R1_DOORS.length)
  const doorMatrix = new THREE.Matrix4(), doorPosition = new THREE.Vector3(), doorScale = new THREE.Vector3(), doorRotation = new THREE.Quaternion(), doorEuler = new THREE.Euler()
  WH_R1_DOORS.forEach((door, index) => {
    doorMatrix.compose(doorPosition.set(door.x, door.height / 2 - .6, door.z), doorRotation.setFromEuler(doorEuler.set(0, door.yaw, 0)), doorScale.set(door.width, door.height, 1))
    doorPanels.setMatrixAt(index, doorMatrix)
  })
  doorPanels.instanceMatrix.needsUpdate = true; doorPanels.name = 'wh-r1-door-panels'
  doorPanels.userData = { whR1DoorIds: WH_R1_DOORS.map(door => door.id), instanceToRegisterId: WH_R1_DOORS.map(door => door.id), collisionProxy: false, noMerge: true, state: 'UNKNOWN' }
  root.add(doorPanels)
  let doorLabels = null
  const labelledDoors = canvasTex ? WH_R1_DOORS.filter(door => door.label) : []
  if (labelledDoors.length) {
    const texture = canvasTex(2048, 96, (context, width, height) => {
      context.clearRect(0, 0, width, height); context.fillStyle = '#f4f1eb'; context.textAlign = 'center'; context.font = '700 58px sans-serif'
      labelledDoors.forEach((door, index) => context.fillText(door.label, (index + .5) * width / labelledDoors.length, height * .7))
    })
    const positions = [], uvs = [], indices = []
    labelledDoors.forEach((door, index) => {
      const width = Math.min(1.2, door.width * .42), height = .45, y = Math.min(door.height - .25, 2.7), cos = Math.cos(door.yaw), sin = Math.sin(door.yaw), u0 = index / labelledDoors.length, u1 = (index + 1) / labelledDoors.length, base = index * 4
      for (const [x, yy] of [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]) positions.push(door.x + x * cos, y + yy, door.z - x * sin)
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
    doorLabels = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }))
    doorLabels.name = 'wh-r1-door-labels'; doorLabels.userData = { whR1DoorLabelIds: labelledDoors.map(door => door.id), noMerge: true }; root.add(doorLabels)
  }
  const roof = [
    ['north', 88, .28, -124, -17.86], ['south', 88, .28, -124, 29.86],
    ['west', .28, 48, -167.86, 6], ['east', .28, 48, -80.14, 6],
  ]
  for (const [name, width, depth, x, z] of roof) box(THREE, root, `wh-r1-roof-${name}`, width, .28, depth, x, 3.9, z, 0, roofMaterial)
  return {
    shellSpec: WH_R1_SHELL_SPEC,
    dispose() {
      new Set([wallMaterial, floorMaterial, roofMaterial, doorMaterial]).forEach((material) => material.dispose()); doorGeometry.dispose()
      if (doorLabels) { doorLabels.geometry.dispose(); doorLabels.material.map?.dispose(); doorLabels.material.dispose() }
    },
  }
}
