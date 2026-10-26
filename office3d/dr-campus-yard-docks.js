import { CAMPUS, CAMPUS_BUILDING, CAMPUS_DOCKS, CAMPUS_VEHICLE_ROUTES, CAMPUS_ZONES } from './office-layout.js'

const zone = (zones, id) => zones.find((item) => item.id === id)
const box = (name, x0, x1, z0, z1, kind = 'mark') => Object.freeze({ name, x0, x1, z0, z1, kind })
const point = ([x, z]) => ({ x, z })
const segment = (name, from, to, width = .22) => {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz)
  return Object.freeze({ name, from, to, width, length, angle: Math.atan2(dx, dz) })
}

export function createCampusYardDockPlan({
  campus = CAMPUS,
  building = CAMPUS_BUILDING,
  docks = CAMPUS_DOCKS,
  routes = CAMPUS_VEHICLE_ROUTES,
  zones = CAMPUS_ZONES,
} = {}) {
  const bayMarks = docks.flatMap((dock) => [
    box(`campus-bay-${dock.id}`, dock.bay.x0, dock.bay.x1, dock.bay.z0, dock.bay.z1),
    box(`campus-work-${dock.id}`, dock.work.x0, dock.work.x1, dock.work.z0, dock.work.z1, 'work'),
  ])
  const doors = docks.map((dock) => {
    const horizontal = dock.side === 'north'
    const bounds = horizontal
      ? box(`campus-door-${dock.id}`, dock.at - dock.width / 2, dock.at + dock.width / 2, building.z0, building.z0 + .18, 'door')
      : box(`campus-door-${dock.id}`, building.x1 - .18, building.x1, dock.at - dock.width / 2, dock.at + dock.width / 2, 'door')
    return Object.freeze({ ...dock, bounds })
  })
  const routeMarks = routes.flatMap((route) => route.points.slice(0, -1).map((from, index) =>
    segment(`campus-route-${route.dockId}-${index + 1}`, point(from), point(route.points[index + 1]))))
  const gate = zone(zones, 'logisticsGate')
  const crosswalk = Array.from({ length: 7 }, (_, index) => box(
    `campus-zebra-${index + 1}`,
    gate.x0 + 1.2 + index * 1.7,
    gate.x0 + 2.1 + index * 1.7,
    gate.z1 - 2.4,
    gate.z1 - .8,
    'zebra',
  ))
  return Object.freeze({
    campus,
    building,
    docks: Object.freeze(doors),
    bayMarks: Object.freeze(bayMarks),
    routeMarks: Object.freeze(routeMarks),
    crosswalk: Object.freeze(crosswalk),
    guard: box('campus-guardhouse', gate.x0 + 1, gate.x0 + 4, gate.z0 + 1, gate.z0 + 4, 'guard'),
    truck: Object.freeze({ length: 9, width: 2.55, exteriorTurnRadius: 10 }),
  })
}

const cube = (THREE, root, item, material, height = .08) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(item.x1 - item.x0, height, item.z1 - item.z0), material)
  mesh.name = item.name
  mesh.position.set((item.x0 + item.x1) / 2, -.5 + height / 2, (item.z0 + item.z1) / 2)
  mesh.receiveShadow = false
  root.add(mesh)
  return mesh
}

const routeMesh = (THREE, root, item, material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(item.width, .1, item.length), material)
  mesh.name = item.name
  mesh.rotation.y = item.angle
  mesh.position.set((item.from.x + item.to.x) / 2, -.45, (item.from.z + item.to.z) / 2)
  mesh.receiveShadow = false
  root.add(mesh)
  return mesh
}

export function buildCampusYardDocks({ THREE, root, layout = {} }) {
  const plan = createCampusYardDockPlan(layout)
  const materials = {
    bay: new THREE.MeshBasicMaterial({ color: 0xd5af62, transparent: true, opacity: .62, depthWrite: false }),
    work: new THREE.MeshBasicMaterial({ color: 0xe18a3b, transparent: true, opacity: .52, depthWrite: false }),
    route: new THREE.MeshBasicMaterial({ color: 0x4aa0be, transparent: true, opacity: .72, depthWrite: false }),
    zebra: new THREE.MeshBasicMaterial({ color: 0xf4f1eb, transparent: true, opacity: .82, depthWrite: false }),
    door: new THREE.MeshBasicMaterial({ color: 0x20333d }),
    guard: new THREE.MeshStandardMaterial({ color: 0x344b58, roughness: .72 }),
  }
  const meshes = []
  for (const mark of plan.bayMarks) meshes.push(cube(THREE, root, mark, mark.kind === 'work' ? materials.work : materials.bay))
  for (const door of plan.docks) meshes.push(cube(THREE, root, door.bounds, materials.door, .18))
  for (const mark of plan.routeMarks) meshes.push(routeMesh(THREE, root, mark, materials.route))
  for (const mark of plan.crosswalk) meshes.push(cube(THREE, root, mark, materials.zebra))
  meshes.push(cube(THREE, root, plan.guard, materials.guard, 2.4))
  return {
    plan,
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose()
      new Set(Object.values(materials)).forEach((material) => material.dispose())
    },
  }
}
