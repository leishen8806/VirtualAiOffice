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
  staging: rect('Q-STAGE-01', 'inspection-staging', -136.7, -128.7, -9.3, -3.3),
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

const put = (mesh, index, THREE, item, y, height, color) => {
  const c = center(item), matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(c.x, y + height / 2, c.z),
    new THREE.Quaternion(),
    new THREE.Vector3(item.x1 - item.x0, height, item.z1 - item.z0),
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
  items.forEach((item, index) => put(mesh, index, THREE, item, y, height, color))
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  root.add(mesh)
  return mesh
}

const conveyorSegment = (THREE, root, id, from, to) => {
  const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz)
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, .18, 1),
    new THREE.MeshStandardMaterial({ color: 0x4a6870, roughness: .66, metalness: .32 }),
  )
  mesh.name = `b3-conveyor-${id}`
  mesh.userData.qualityProxy = true
  mesh.position.set((from[0] + to[0]) / 2, CAMPUS_FINISHED_FLOOR_Y + .09, (from[1] + to[1]) / 2)
  mesh.scale.set(1, 1, length)
  mesh.rotation.y = Math.atan2(dx, dz)
  root.add(mesh)
  return mesh
}

export function buildCampusWorkstations({ THREE, root, quality }) {
  const low = quality?.tier === 'low'
  const plan = B3_WORKSTATION_PLAN
  const staticRoot = new THREE.Group()
  staticRoot.name = 'campus-workstations-static'
  root.add(staticRoot)
  const tableHeight = low ? .54 : .76
  const meshes = [
    instanced(THREE, staticRoot, 'b3-quality-tables', plan.qualityTables, CAMPUS_FINISHED_FLOOR_Y, tableHeight, 0x345d8a),
    instanced(THREE, staticRoot, 'b3-inspection-staging', [plan.staging], CAMPUS_FINISHED_FLOOR_Y, .14, 0x5b8c5a),
    instanced(THREE, staticRoot, 'b3-picking-racks', plan.pickingRacks, CAMPUS_FINISHED_FLOOR_Y, low ? 1.15 : 1.7, 0x416f9a),
    instanced(THREE, staticRoot, 'b3-packing-benches', plan.packingBenches, CAMPUS_FINISHED_FLOOR_Y, tableHeight, 0x2f628e),
  ]
  const conveyorRoot = new THREE.Group()
  conveyorRoot.name = 'campus-b3-conveyors'
  conveyorRoot.userData.dynamic = true
  root.add(conveyorRoot)
  const conveyors = plan.conveyors.flatMap((line) => line.points.slice(0, -1).map((from, index) =>
    conveyorSegment(THREE, conveyorRoot, `${line.id}-${index + 1}`, from, line.points[index + 1]),
  ))
  const summary = Object.freeze({
    qualityTables: plan.qualityTables.length,
    staging: 1,
    pickingRacks: plan.pickingRacks.length,
    packingBenches: plan.packingBenches.length,
    conveyorSegments: conveyors.length,
    oldStationsDisabled: Object.freeze(['station-inspection', 'station-picking', 'station-packing']),
  })
  root.userData.b3Workstations = Object.freeze({ plan, summary })
  return {
    plan,
    summary,
    dispose() {
      if (root.userData.b3Workstations?.plan === plan) delete root.userData.b3Workstations
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose() }
      for (const mesh of conveyors) { mesh.geometry.dispose(); mesh.material.dispose() }
      staticRoot.removeFromParent()
      conveyorRoot.removeFromParent()
    },
  }
}
