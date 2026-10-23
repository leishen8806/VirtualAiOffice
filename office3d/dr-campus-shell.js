import { CAMPUS, CAMPUS_BUILDING, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from './office-layout.js'

const inside = (part, bounds) => part.x0 >= bounds.x0 && part.x1 <= bounds.x1 && part.z0 >= bounds.z0 && part.z1 <= bounds.z1
const rect = (name, bounds, extra = {}) => Object.freeze({ name, ...bounds, dynamic: false, ...extra })
const zone = (zones, id) => zones.find((item) => item.id === id)

export function buildCampusShellSpec(layout = { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }) {
  const { campus, building, zones, shuttle } = layout
  const front = zone(zones, 'frontPlaza'), parking = zone(zones, 'parking'), gate = zone(zones, 'logisticsGate')
  const shell = [
    rect('campus-paving', campus, { offset: .05, kind: 'ground', batchGroup: 'opaque-paving' }),
    rect('campus-building-floor', building, { offset: .06, kind: 'ground', batchGroup: 'opaque-building-ground' }),
    rect('campus-wall-north', { x0: building.x0, x1: building.x1, z0: building.z0, z1: building.z0 + .28 }, { batchGroup: 'opaque-structure' }),
    rect('campus-wall-west', { x0: building.x0, x1: building.x0 + .28, z0: building.z0, z1: building.z1 }, { batchGroup: 'opaque-structure' }),
    rect('campus-wall-east', { x0: building.x1 - .28, x1: building.x1, z0: building.z0, z1: building.z1 }, { batchGroup: 'opaque-structure' }),
    rect('campus-roof-north', { x0: building.x0, x1: building.x1, z0: building.z0, z1: building.z0 + 5 }, { batchGroup: 'transparent-roof', presentation: 'cutaway-only' }),
    rect('campus-roof-south', { x0: building.x0, x1: building.x1, z0: building.z1 - 5, z1: building.z1 }, { batchGroup: 'transparent-roof', presentation: 'cutaway-only' }),
    ...zones.filter((item) => item.v1 !== 'reserved').map((item) => rect(`campus-zone-${item.id}`, item, { kind: 'selection', offset: .1, batchGroup: 'selection-only' })),
    rect('campus-shuttle-reserve', shuttle, { kind: 'mark', offset: .09, batchGroup: 'transparent-guide' }),
    rect('campus-water', { x0: front.x0 + 20, x1: front.x0 + 40, z0: front.z0 + 1.2, z1: front.z0 + 3.8 }, { offset: .08, kind: 'water' }),
    rect('campus-sign', { x0: front.x0 + 27.5, x1: front.x0 + 32.5, z0: front.z1 - .26, z1: front.z1 }, { offset: .14, kind: 'thin' }),
    rect('campus-parking-lines', parking, { offset: .08, kind: 'mark', batchGroup: 'transparent-guide' }),
    rect('campus-logistics-gate', gate, { kind: 'selection', batchGroup: 'selection-only' }),
    rect('campus-road-guide', { x0: campus.x1 - .45, x1: campus.x1, z0: front.z0, z1: front.z1 }, { offset: .08, kind: 'mark', batchGroup: 'transparent-guide' }),
  ]
  return Object.freeze(shell.filter((part) => inside(part, campus)))
}

const cube = (THREE, root, part, y, height, material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(part.x1 - part.x0, height, part.z1 - part.z0), material)
  mesh.name = part.name; mesh.userData.batchGroup = part.batchGroup; mesh.userData.sourceIds = [part.name]; mesh.userData.bounds = { x0: part.x0, x1: part.x1, z0: part.z0, z1: part.z1 }
  mesh.position.set((part.x0 + part.x1) / 2, y, (part.z0 + part.z1) / 2); mesh.receiveShadow = !part.kind && !part.name.startsWith('campus-roof-'); root.add(mesh)
  return mesh
}
const plane = (THREE, root, part, y, material) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(part.x1 - part.x0, part.z1 - part.z0), material)
  mesh.name = part.name; mesh.userData.batchGroup = part.batchGroup; mesh.userData.sourceIds = [part.name]; mesh.userData.bounds = { x0: part.x0, x1: part.x1, z0: part.z0, z1: part.z1 }
  mesh.rotation.x = -Math.PI / 2; mesh.position.set((part.x0 + part.x1) / 2, y, (part.z0 + part.z1) / 2); mesh.castShadow = false; mesh.receiveShadow = false; root.add(mesh)
  return mesh
}

export function hideCampusEnvironment(THREE, scene, campusRoot, bounds = CAMPUS) {
  const point = new THREE.Vector3(), hidden = {}
  scene.traverse((object) => {
    if (!object.isMesh || campusRoot.getObjectById(object.id)) return
    object.getWorldPosition(point)
    if (point.x >= bounds.x0 && point.x <= bounds.x1 && point.z >= bounds.z0 && point.z <= bounds.z1) {
      object.visible = false
      const type = object.name?.startsWith('entrance-step') ? 'entrance-step' : object.name || object.geometry?.type || 'unnamed'
      hidden[type] = (hidden[type] || 0) + 1
    }
  })
  return hidden
}

export function buildCampusShell({ THREE, root, canvasTex, layout, quality }) {
  const spec = buildCampusShellSpec(layout)
  const low = quality?.tier === 'low'
  const flat = low ? new THREE.MeshLambertMaterial({ color: 0x718a96, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : null
  const mats = {
    paving: low ? flat : new THREE.MeshStandardMaterial({ color: 0xbcc4c6, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    buildingGround: low ? flat : new THREE.MeshStandardMaterial({ color: 0xc9c6be, roughness: .94, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    structure: low ? flat : new THREE.MeshStandardMaterial({ color: 0x53626a, roughness: .76, metalness: .3 }),
    roof: low ? flat : new THREE.MeshStandardMaterial({ color: 0x75919a, roughness: .55, transparent: true, opacity: .34, depthWrite: false }),
    mark: low ? flat : new THREE.MeshBasicMaterial({ color: 0xd5af62, transparent: true, opacity: .72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    water: low ? flat : new THREE.MeshStandardMaterial({ color: 0x407c9e, roughness: .18, metalness: .35 }),
  }
  const roofMeshes = []
  for (const part of spec) {
    if (part.name === 'campus-paving') plane(THREE, root, part, part.offset - .6, mats.paving)
    else if (part.name === 'campus-building-floor') plane(THREE, root, part, part.offset - .6, mats.buildingGround)
    else if (part.name.startsWith('campus-wall-')) cube(THREE, root, part, 2.25, 4.5, mats.structure)
    else if (part.name.startsWith('campus-roof-')) roofMeshes.push(cube(THREE, root, part, 4.68, .28, mats.roof))
    else if (part.kind === 'selection') continue
    else if (part.kind === 'water') plane(THREE, root, part, part.offset - .6, mats.water)
    else if (part.name !== 'campus-sign') plane(THREE, root, part, part.offset - .6, mats.mark)
  }
  // The default overview is a cutaway. Roof geometry remains available for future focused views.
  roofMeshes.forEach(mesh => { mesh.visible = false })
  let texture
  if (!low) {
    const sign = spec.find((part) => part.name === 'campus-sign')
    texture = canvasTex(640, 120, (ctx, width, height) => { ctx.fillStyle = '#18232b'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = '#d5af62'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, width - 6, height - 6); ctx.fillStyle = '#f4f1eb'; ctx.font = '600 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DR 仓配 · 模拟演示', width / 2, height * .62) })
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.x1 - sign.x0, .82), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }))
    board.name = sign.name; board.userData.sourceIds = [sign.name]; board.position.set((sign.x0 + sign.x1) / 2, .82, sign.z0 + .14); root.add(board)
  }
  return {
    setCutaway(enabled = true) { roofMeshes.forEach(mesh => { mesh.visible = !enabled }) },
    dispose() { texture?.dispose(); new Set(Object.values(mats)).forEach((material) => material.dispose()) },
  }
}
