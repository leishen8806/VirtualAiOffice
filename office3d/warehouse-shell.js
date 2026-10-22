import { CAMPUS_PAVING, DOCK, LOGISTICS_GATE_ZONE, PARKING, WAREHOUSE, WAREHOUSE_ITEMS } from './office-layout.js'

const rect = (name, bounds, collides = false) => Object.freeze({ ...bounds, name, collides, dynamic: false })
const eastDoor = Object.freeze({ x0: WAREHOUSE.x1 - .5, x1: WAREHOUSE.x1, z0: WAREHOUSE.z1 - 4.5, z1: WAREHOUSE.z1 - 2.5 })
const cargoDoors = Object.freeze([[2, 6], [11, 15], [20, 24]].map(([a, b], i) => Object.freeze({ name: `warehouse-door-cargo-${i + 1}`, x0: WAREHOUSE.x0 + a, x1: WAREHOUSE.x0 + b, z0: WAREHOUSE.z1 - .25, z1: WAREHOUSE.z1 })))
const westGreen = WAREHOUSE_ITEMS.find(item => item.id === 'west_green')

export function thinPartOffsets() {
  return Object.freeze([
    Object.freeze({ name: 'warehouse-door-east', surface: 'wall', offset: .15 }),
    Object.freeze({ name: 'warehouse-door-east-frame', surface: 'wall', offset: .18 }),
    ...cargoDoors.flatMap(door => [
      Object.freeze({ name: door.name, surface: 'wall', offset: .15 }),
      Object.freeze({ name: `${door.name}-frame`, surface: 'wall', offset: .18 }),
    ]),
    Object.freeze({ name: 'warehouse-sign', surface: 'wall', offset: .131 }),
    Object.freeze({ name: 'warehouse-parking-lines', surface: 'ground', offset: .045 }),
  ])
}

export function warehouseShellSpec() {
  const wall = .25
  return Object.freeze([
    rect('warehouse-body', WAREHOUSE),
    rect('warehouse-wall-north', { x0: WAREHOUSE.x0, x1: WAREHOUSE.x1, z0: WAREHOUSE.z0, z1: WAREHOUSE.z0 + wall }, true),
    rect('warehouse-wall-south', { x0: WAREHOUSE.x0, x1: WAREHOUSE.x1, z0: WAREHOUSE.z1 - wall, z1: WAREHOUSE.z1 }, true),
    rect('warehouse-wall-west', { x0: WAREHOUSE.x0, x1: WAREHOUSE.x0 + wall, z0: WAREHOUSE.z0, z1: WAREHOUSE.z1 }, true),
    rect('warehouse-wall-east', { x0: WAREHOUSE.x1 - wall, x1: WAREHOUSE.x1, z0: WAREHOUSE.z0, z1: WAREHOUSE.z1 }, true),
    rect('warehouse-roof', WAREHOUSE),
    rect('warehouse-dock', DOCK, true),
    rect('warehouse-door-east', eastDoor),
    rect('warehouse-door-east-frame', eastDoor, true),
    ...cargoDoors.flatMap(door => [rect(door.name, door), rect(`${door.name}-frame`, door, true)]),
    rect('warehouse-parking', PARKING),
    rect('warehouse-logistics-gate', LOGISTICS_GATE_ZONE),
    rect('warehouse-sign', WAREHOUSE_ITEMS.find(item => item.id === 'warehouse_sign')),
    rect('warehouse-west-green', westGreen, true),
    rect('warehouse-entrance', eastDoor),
  ])
}

function put(instance, index, THREE, { x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0 }) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  )
  instance.setMatrixAt(index, matrix)
}

function instances(THREE, root, name, geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length)
  mesh.name = name; mesh.userData.qualityProxy = true; mesh.castShadow = true; mesh.receiveShadow = true
  items.forEach((item, index) => put(mesh, index, THREE, item)); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh)
  return mesh
}

export function buildWarehouseShell({ THREE, scene, collision, canvasTex, VI }) {
  const root = new THREE.Group(); root.name = 'warehouse-shell'; scene.add(root)
  const cx = (WAREHOUSE.x0 + WAREHOUSE.x1) / 2, cz = (WAREHOUSE.z0 + WAREHOUSE.z1) / 2
  const width = WAREHOUSE.x1 - WAREHOUSE.x0, depth = WAREHOUSE.z1 - WAREHOUSE.z0, wall = .25
  const graphite = new THREE.MeshStandardMaterial({ color: VI.graphite, roughness: .7, metalness: .28 })
  const roof = new THREE.MeshStandardMaterial({ color: 0x3f4b55, roughness: .58, metalness: .42 })
  const silver = new THREE.MeshStandardMaterial({ color: 0x87939d, roughness: .42, metalness: .58, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const groundSilver = new THREE.MeshStandardMaterial({ color: 0x87939d, roughness: .42, metalness: .58, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  const green = new THREE.MeshStandardMaterial({ color: 0x3d765d, roughness: .9 })
  const structure = [
    { x: cx, y: 2.75, z: WAREHOUSE.z0 + wall / 2, sx: width, sy: 5.5, sz: wall },
    { x: cx, y: 2.75, z: WAREHOUSE.z1 - wall / 2, sx: width, sy: 5.5, sz: wall },
    { x: WAREHOUSE.x0 + wall / 2, y: 2.75, z: cz, sx: wall, sy: 5.5, sz: depth },
    { x: WAREHOUSE.x1 - wall / 2, y: 2.75, z: cz, sx: wall, sy: 5.5, sz: depth },
    { x: (DOCK.x0 + DOCK.x1) / 2, y: .4, z: (DOCK.z0 + DOCK.z1) / 2, sx: DOCK.x1 - DOCK.x0, sy: .8, sz: DOCK.z1 - DOCK.z0 },
    ...[0, 1, 2].map(i => ({ x: DOCK.x0 + 1.25 + i * .42, y: .12 + i * .13, z: DOCK.z1 - .3, sx: .42, sy: .24 + i * .26, sz: .6 })),
    ...[-41, -28, -15].flatMap(x => [{ x, y: 1.05, z: DOCK.z1 - .18, sx: .1, sy: 1.3, sz: .1 }, { x, y: 1.68, z: DOCK.z1 - .18, sx: .9, sy: .1, sz: .1 }]),
    { x: LOGISTICS_GATE_ZONE.x0 + .18, y: 1.7, z: (LOGISTICS_GATE_ZONE.z0 + LOGISTICS_GATE_ZONE.z1) / 2, sx: .2, sy: 3.4, sz: .2 },
    { x: LOGISTICS_GATE_ZONE.x1 - .18, y: 1.7, z: (LOGISTICS_GATE_ZONE.z0 + LOGISTICS_GATE_ZONE.z1) / 2, sx: .2, sy: 3.4, sz: .2 },
    { x: (LOGISTICS_GATE_ZONE.x0 + LOGISTICS_GATE_ZONE.x1) / 2, y: 3.35, z: (LOGISTICS_GATE_ZONE.z0 + LOGISTICS_GATE_ZONE.z1) / 2, sx: LOGISTICS_GATE_ZONE.x1 - LOGISTICS_GATE_ZONE.x0, sy: .2, sz: .2 },
  ]
  instances(THREE, root, 'warehouse-body', new THREE.BoxGeometry(1, 1, 1), graphite, structure)
  const pitch = Math.atan2(1.5, depth / 2), slope = Math.hypot(depth / 2, 1.5)
  instances(THREE, root, 'warehouse-roof', new THREE.BoxGeometry(1, 1, 1), roof, [
    { x: cx, y: 6.25, z: cz - depth / 4, sx: width + .5, sy: .18, sz: slope + .3, rx: -pitch },
    { x: cx, y: 6.25, z: cz + depth / 4, sx: width + .5, sy: .18, sz: slope + .3, rx: pitch },
  ])
  const wallDetails = [
    { x: WAREHOUSE.x1 + .12, y: 1.3, z: (eastDoor.z0 + eastDoor.z1) / 2, sx: .06, sy: 2.6, sz: eastDoor.z1 - eastDoor.z0 },
    ...[eastDoor.z0 - .12, eastDoor.z1 + .12].map(z => ({ x: WAREHOUSE.x1 + .12, y: 1.45, z, sx: .12, sy: 2.9, sz: .14 })),
    { x: WAREHOUSE.x1 + .12, y: 2.86, z: (eastDoor.z0 + eastDoor.z1) / 2, sx: .12, sy: .14, sz: eastDoor.z1 - eastDoor.z0 + .38 },
    ...cargoDoors.flatMap(door => [
      { x: (door.x0 + door.x1) / 2, y: 2.1, z: WAREHOUSE.z1 + .12, sx: door.x1 - door.x0, sy: 4.2, sz: .06 },
      { x: door.x0 - .1, y: 2.2, z: WAREHOUSE.z1 + .12, sx: .18, sy: 4.4, sz: .12 },
      { x: door.x1 + .1, y: 2.2, z: WAREHOUSE.z1 + .12, sx: .18, sy: 4.4, sz: .12 },
      { x: (door.x0 + door.x1) / 2, y: 4.35, z: WAREHOUSE.z1 + .12, sx: door.x1 - door.x0 + .38, sy: .18, sz: .12 },
    ]),
  ]
  const groundDetails = []
  for (const bay of [[PARKING.x0 + 1.5, PARKING.x0 + 7.5], [PARKING.x0 + 9.5, PARKING.x0 + 15.5], [PARKING.x0 + 17.5, PARKING.x0 + 21.5]]) {
    for (const x of bay) groundDetails.push({ x, y: .035, z: (PARKING.z0 + PARKING.z1) / 2, sx: .08, sy: .02, sz: PARKING.z1 - PARKING.z0 - .4 })
    groundDetails.push({ x: (bay[0] + bay[1]) / 2, y: .035, z: PARKING.z1 - .2, sx: bay[1] - bay[0], sy: .02, sz: .08 })
  }
  instances(THREE, root, 'warehouse-details', new THREE.BoxGeometry(1, 1, 1), silver, wallDetails)
  const parkingLines = instances(THREE, root, 'warehouse-parking-lines', new THREE.BoxGeometry(1, 1, 1), groundSilver, groundDetails)
  parkingLines.castShadow = false
  instances(THREE, root, 'warehouse-west-green', new THREE.CylinderGeometry(.5, .5, 1, 10), green, Array.from({ length: 9 }, (_, i) => ({ x: westGreen.center.x, y: .45, z: westGreen.z0 + .5 + i, sx: .7, sy: .9, sz: .7 })))
  const signTexture = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#202326'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b69a64'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#f4f1eb'; g.textAlign = 'center'; g.font = '600 58px "Microsoft YaHei",sans-serif'; g.fillText('DR 仓库', w / 2, 84) })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sign.name = 'warehouse-sign'; sign.position.set(cx, 4.45, WAREHOUSE.z0 - .131); sign.rotation.y = Math.PI; root.add(sign)
  const entrance = new THREE.Mesh(new THREE.PlaneGeometry(eastDoor.z1 - eastDoor.z0, 2.8), new THREE.MeshBasicMaterial({ visible: false })); entrance.name = 'warehouse-entrance'; entrance.userData.warehouseEntrance = true; entrance.userData.qualityProxy = true; entrance.position.set(WAREHOUSE.x1 + .02, 1.4, (eastDoor.z0 + eastDoor.z1) / 2); entrance.rotation.y = Math.PI / 2; root.add(entrance)

  const proxy = (name, bounds, height, y = height / 2) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bounds.x1 - bounds.x0, height, bounds.z1 - bounds.z0), new THREE.MeshBasicMaterial({ visible: false })); mesh.name = name; mesh.visible = false; mesh.position.set((bounds.x0 + bounds.x1) / 2, y, (bounds.z0 + bounds.z1) / 2); root.add(mesh); collision.add(mesh, name); return mesh
  }
  const wallBounds = warehouseShellSpec().filter(part => /^warehouse-wall-/.test(part.name))
  wallBounds.forEach(part => proxy(part.name, part, 5.5))
  proxy('warehouse-dock', DOCK, .8, .4); proxy('warehouse-door-east-frame', eastDoor, 2.9)
  cargoDoors.forEach(door => proxy(`${door.name}-frame`, door, 4.4, 2.2)); proxy('warehouse-west-green', westGreen, .9, .45)
  for (const part of warehouseShellSpec()) if (!root.getObjectByName(part.name)) { const marker = new THREE.Object3D(); marker.name = part.name; marker.userData.warehousePart = true; root.add(marker) }
  return { root, entrance, spec: warehouseShellSpec(), renderedParts: 6 }
}
