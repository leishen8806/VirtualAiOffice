import { createR1Layout, r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'

export const isOfficeR1Layout = layout => layout?.r1Phase === 'R1'
export const r1World = ([x, y]) => r1ToWorld(x, y)

const worldBox = ([x0, y0, x1, y1]) => ({ x0: x0 - 26, x1: x1 - 26, z0: 18 - y1, z1: 18 - y0 })

const workstationSeats = workstations => Object.freeze(Object.fromEntries(workstations.map((station) => {
  const desk = r1ToWorld(station.xM, station.yM)
  const chair = r1ToWorld(station.chairXM, station.chairYM)
  return [station.business_id, Object.freeze([station.group, desk.x, desk.z, 0, Object.freeze({
    x: chair.x,
    z: chair.z,
    yaw: runtimeYawFromFacing(desk.x - chair.x, desk.z - chair.z),
  })])]
})))

// R1 is an independent layout object: it never reuses or mutates the frozen L1/L2/L2B layout graph.
export function createOfficeR1Layout({ candidateC01 = true } = {}) {
  const r1 = createR1Layout({ candidateC01 })
  const envelope = worldBox([0, 0, 56, 43])
  const site = { x0: -38, x1: 42, z0: -31, z1: 44 }
  const regions = r1.data.zones.map(zone => {
    const [x0, x1, z0, z1] = zone.worldBboxXZ
    return Object.freeze({ id: zone.id, name: zone.name, x0, x1, z0, z1 })
  })
  return Object.freeze({
    version: 3,
    variant: 'r1',
    r1Phase: 'R1',
    candidateC01,
    r1,
    envelope: Object.freeze(envelope),
    site: Object.freeze(site),
    greenBuffer: Object.freeze({ ...site, width: 2 }),
    miniBounds: Object.freeze({ x0: -38, x1: 42, z0: -31, z1: 44 }),
    axis: Object.freeze(r1ToWorld(...r1.data.central.center_m)),
    regions: Object.freeze(regions),
    // I3 supplies the existing 25 colleagues with their registered desks and chairs.
    seats: workstationSeats(r1.workstations),
    cameraDefaults: Object.freeze({ target: Object.freeze({ x: 2, z: -3.5 }), radius: 57 }),
  })
}

export function buildR1Site({ THREE, root, layout }) {
  const group = new THREE.Group()
  group.name = 'r1-site'
  group.userData.dynamic = true
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#E7E1D5', roughness: .86 })
  const greenMaterial = new THREE.MeshStandardMaterial({ color: '#789467', roughness: .95 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(layout.site.x1 - layout.site.x0, .08, layout.site.z1 - layout.site.z0), floorMaterial)
  floor.name = 'r1-site-paved-ground'
  floor.position.set((layout.site.x0 + layout.site.x1) / 2, -.04, (layout.site.z0 + layout.site.z1) / 2)
  const buffer = new THREE.Mesh(new THREE.RingGeometry(1, 2, 4), greenMaterial)
  buffer.name = 'r1-site-green-buffer'
  buffer.scale.set((layout.site.x1 - layout.site.x0) / 2, (layout.site.z1 - layout.site.z0) / 2, 1)
  buffer.rotation.x = -Math.PI / 2
  buffer.position.y = .003
  group.add(floor, buffer)
  root.add(group)
  return { root: group, floor, dispose() { group.removeFromParent(); floor.geometry.dispose(); floorMaterial.dispose(); buffer.geometry.dispose(); greenMaterial.dispose() } }
}
