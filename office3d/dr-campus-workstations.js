import { CAMPUS_FINISHED_FLOOR_Y } from './dr-campus-shell.js'

const rect = (id, kind, x0, x1, z0, z1, extra = {}) => Object.freeze({ id, kind, x0, x1, z0, z1, ...extra })
const center = item => Object.freeze({ x: (item.x0 + item.x1) / 2, z: (item.z0 + item.z1) / 2 })

const qualityTables = Object.freeze([
  [-136.7, -134.3, -16.7, -15.5], [-132.3, -129.9, -16.7, -15.5], [-127.9, -125.5, -16.7, -15.5],
  [-136.7, -134.3, -13.5, -12.3], [-132.3, -129.9, -13.5, -12.3], [-127.9, -125.5, -13.5, -12.3],
].map((bounds, index) => rect(`Q${String(index + 1).padStart(2, '0')}`, 'quality-table', ...bounds)))

const pickingRacks = Object.freeze([
  [-148.7, -144.7, -.7, -.1], [-144.6, -140.6, -.7, -.1], [-140.5, -136.5, -.7, -.1], [-136.4, -132.4, -.7, -.1],
  [-148.7, -144.7, 1.4, 2], [-144.6, -140.6, 1.4, 2], [-140.5, -136.5, 1.4, 2], [-136.4, -132.4, 1.4, 2],
].map((bounds, index) => rect(`P${String(index + 1).padStart(2, '0')}`, 'picking-rack', ...bounds)))

const packingColumns = [
  [-124.2, -121.8], [-121.3, -118.9], [-118.4, -116], [-115.5, -113.1], [-112.6, -110.2],
]
const packingBenches = Object.freeze([
  ...packingColumns.map((bounds, index) => rect(`PK${String(index + 1).padStart(2, '0')}`, 'packing-bench', ...bounds, 5, 5.9)),
  ...packingColumns.map((bounds, index) => rect(`PK${String(index + 6).padStart(2, '0')}`, 'packing-bench', ...bounds, 7.4, 8.3)),
])

export const B3_WORKSTATION_PLAN = Object.freeze({
  qualityTables,
  staging: rect('Q-STAGE-01', 'inspection-staging', -136.7, -128.7, -10.3, -4.3),
  pickingRacks,
  packingBenches,
  corridors: Object.freeze([
    rect('Q-AISLE-X-01', 'quality-aisle', -134.3, -132.3, -16.7, -12.3),
    rect('Q-AISLE-X-02', 'quality-aisle', -129.9, -127.9, -16.7, -12.3),
    rect('Q-AISLE-Z-01', 'quality-aisle', -136.7, -125.5, -15.5, -13.5),
    rect('P-OP-01', 'picking-operator-aisle', -148.7, -132.4, -.1, 1.4),
    rect('P-FORK-01', 'forklift-cross-aisle', -148.7, -105.3, 11.2, 14.7),
    rect('PK-OP-01', 'packing-operator-aisle', -124.2, -110.2, 5.9, 7.4),
    rect('PK-DISPATCH-01', 'shipping-dispatch-aisle', -109, -105.3, -.7, 14.7),
  ]),
  conveyors: Object.freeze([
    Object.freeze({ id: 'F03', points: Object.freeze([[-148, 4], [-129, 4]]), width: 1 }),
    Object.freeze({ id: 'F04', points: Object.freeze([[-148, 9], [-129, 9]]), width: 1 }),
    Object.freeze({ id: 'F03-F04', points: Object.freeze([[-129, 4], [-126, 6.5], [-129, 9]]), width: 1 }),
  ]),
})

const put = (mesh, index, THREE, item, y, height, color, rotation = 0) => {
  const c = center(item), matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(c.x, y + height / 2, c.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.angle || rotation),
    new THREE.Vector3(item.sx || item.x1 - item.x0, height, item.sz || item.z1 - item.z0),
  )
  mesh.setMatrixAt(index, matrix)
  mesh.setColorAt(index, new THREE.Color(color))
}

const instanced = (THREE, root, name, items, y, height, color) => {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .16 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length)
  mesh.name = name
  mesh.userData.qualityProxy = true
  mesh.receiveShadow = true
  items.forEach((item, index) => put(mesh, index, THREE, item, y + (item.level || 0), height, color))
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  root.add(mesh)
  return mesh
}

const box = (id, x, z, sx, sz, extra = {}) => ({ id, x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2, ...extra })
const segments = B3_WORKSTATION_PLAN.conveyors.flatMap(line => line.points.slice(0, -1).map((from, index) => {
  const to = line.points[index + 1], dx = to[0] - from[0], dz = to[1] - from[1]
  return { id: `${line.id}-${index + 1}`, from, to, x: (from[0] + to[0]) / 2, z: (from[1] + to[1]) / 2, length: Math.hypot(dx, dz), angle: Math.atan2(dx, dz) }
}))

const segmentParts = (segment, width, height, offset = 0) => {
  const x = segment.x + Math.sin(segment.angle) * offset, z = segment.z + Math.cos(segment.angle) * offset
  return box(segment.id, x, z, width, segment.length, { angle: segment.angle, height, sx: width, sz: segment.length })
}

const post = (segment, distance, side) => {
  const offset = distance - segment.length / 2, x = segment.x + Math.cos(segment.angle) * side * .43 + Math.sin(segment.angle) * offset
  const z = segment.z - Math.sin(segment.angle) * side * .43 + Math.cos(segment.angle) * offset
  return box(`${segment.id}-leg-${distance}-${side}`, x, z, .11, .11)
}

export function buildCampusWorkstations({ THREE, root, quality }) {
  const low = quality?.tier === 'low'
  const plan = B3_WORKSTATION_PLAN
  const staticRoot = new THREE.Group()
  staticRoot.name = 'campus-workstations-static'
  root.add(staticRoot)
  const tableHeight = low ? .62 : .76, tables = [...plan.qualityTables, ...plan.packingBenches]
  const tableLegs = tables.flatMap(item => {
    const insetX = (item.x1 - item.x0) / 2 - .11, insetZ = (item.z1 - item.z0) / 2 - .11, c = center(item)
    return [-1, 1].flatMap(dx => [-1, 1].map(dz => box(`${item.id}-leg-${dx}-${dz}`, c.x + dx * insetX, c.z + dz * insetZ, .12, .12)))
  })
  const packingCargo = plan.packingBenches.map((item, index) => box(`${item.id}-carton`, center(item).x + (index % 2 ? .32 : -.32), center(item).z, .48, .44))
  const rackShelves = plan.pickingRacks.flatMap(item => [0, .5, 1, 1.5].map(level => ({ ...item, id: `${item.id}-shelf-${level}`, level })))
  const rackPosts = plan.pickingRacks.flatMap(item => {
    const c = center(item)
    return [-1, 1].flatMap(dx => [-1, 1].map(dz => box(`${item.id}-post-${dx}-${dz}`, c.x + dx * 1.86, c.z + dz * .22, .1, .1)))
  })
  const rackCargo = plan.pickingRacks.flatMap((item, index) => [0, 1].map(slot => box(`${item.id}-cargo-${slot}`, center(item).x + (slot ? .85 : -.85), center(item).z, .52, .32, { level: .25 + (index % 3) * .48 })))
  const stageMarks = [
    box('stage-north', -132.7, -10.25, 8, .05), box('stage-south', -132.7, -4.35, 8, .05),
    box('stage-west', -136.65, -7.3, .05, 6), box('stage-east', -128.75, -7.3, .05, 6),
  ]
  const pallets = [-135.1, -132.7, -130.3].map((x, index) => box(`stage-pallet-${index + 1}`, x, -7.3, 1.5, 1.2))
  const beltSurface = segments.map(segment => segmentParts(segment, 1, .08))
  const beltGuards = segments.flatMap(segment => [-1, 1].map(side => {
    const part = segmentParts(segment, .08, .16)
    const x = segment.x + Math.cos(segment.angle) * side * .46, z = segment.z - Math.sin(segment.angle) * side * .46
    return { ...part, x0: x - .04, x1: x + .04, z0: z - segment.length / 2, z1: z + segment.length / 2, angle: segment.angle, sx: .08, sz: segment.length }
  }))
  const beltLegs = segments.flatMap(segment => Array.from(
    { length: Math.ceil(segment.length / 2) + 1 },
    (_, index) => [post(segment, Math.min(segment.length, index * 2), -1), post(segment, Math.min(segment.length, index * 2), 1)],
  ).flat())
  const rollers = segments.flatMap(segment => Array.from({ length: Math.ceil(segment.length / .45) }, (_, index) => {
    const offset = -segment.length / 2 + .225 + index * .45
    return box(`${segment.id}-roller-${index}`, segment.x + Math.sin(segment.angle) * offset, segment.z + Math.cos(segment.angle) * offset, .86, .04, { angle: segment.angle, sx: .86, sz: .04 })
  }))
  const meshes = [
    instanced(THREE, staticRoot, 'b3-table-tops', tables, CAMPUS_FINISHED_FLOOR_Y + tableHeight - .05, .05, 0x345d8a),
    instanced(THREE, staticRoot, 'b3-table-legs', tableLegs, CAMPUS_FINISHED_FLOOR_Y, tableHeight - .05, 0x263744),
    instanced(THREE, staticRoot, 'b3-packing-cargo', packingCargo, CAMPUS_FINISHED_FLOOR_Y + tableHeight, .28, 0xbe8b4b),
    instanced(THREE, staticRoot, 'b3-picking-shelves', rackShelves, CAMPUS_FINISHED_FLOOR_Y, .06, 0x416f9a),
    instanced(THREE, staticRoot, 'b3-picking-posts', rackPosts, CAMPUS_FINISHED_FLOOR_Y, low ? 1.2 : 1.7, 0x263744),
    instanced(THREE, staticRoot, 'b3-picking-cargo', rackCargo, CAMPUS_FINISHED_FLOOR_Y, .3, 0xbc9560),
    instanced(THREE, staticRoot, 'b3-stage-marks', stageMarks, CAMPUS_FINISHED_FLOOR_Y + .004, .01, 0xf1c85a),
    instanced(THREE, staticRoot, 'b3-stage-pallets', pallets, CAMPUS_FINISHED_FLOOR_Y, .3, 0x8a633d),
    instanced(THREE, staticRoot, 'b3-conveyor-belt', beltSurface, CAMPUS_FINISHED_FLOOR_Y + .67, .08, 0x20282d),
    instanced(THREE, staticRoot, 'b3-conveyor-guards', beltGuards, CAMPUS_FINISHED_FLOOR_Y + .67, .16, 0x394650),
    instanced(THREE, staticRoot, 'b3-conveyor-legs', beltLegs, CAMPUS_FINISHED_FLOOR_Y, .67, 0x303a42),
    instanced(THREE, staticRoot, 'b3-conveyor-rollers', rollers, CAMPUS_FINISHED_FLOOR_Y + .71, .04, 0xb8c1c6),
  ]
  const summary = Object.freeze({
    qualityTables: plan.qualityTables.length,
    staging: 1,
    pickingRacks: plan.pickingRacks.length,
    packingBenches: plan.packingBenches.length,
    conveyorSegments: segments.length,
    oldStationsDisabled: Object.freeze(['station-inspection', 'station-picking', 'station-packing']),
  })
  const conveyorPath = Object.freeze([
    ...plan.conveyors[0].points,
    ...plan.conveyors[2].points.slice(1),
    ...plan.conveyors[1].points.slice(1),
  ].map(([x, z]) => Object.freeze({ x, z, pauseMs: 0 })))
  root.userData.b3Workstations = Object.freeze({ plan, summary, conveyorPath, conveyorSurfaceY: CAMPUS_FINISHED_FLOOR_Y + .75 })
  return {
    plan,
    summary,
    dispose() {
      if (root.userData.b3Workstations?.plan === plan) delete root.userData.b3Workstations
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose() }
      staticRoot.removeFromParent()
    },
  }
}
