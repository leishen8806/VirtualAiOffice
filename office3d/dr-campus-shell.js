import { CAMPUS, CAMPUS_BUILDING, CAMPUS_DOCKS, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from './office-layout.js'

const inside = (part, bounds) => part.x0 >= bounds.x0 && part.x1 <= bounds.x1 && part.z0 >= bounds.z0 && part.z1 <= bounds.z1
const rect = (name, bounds, extra = {}) => Object.freeze({ name, ...bounds, dynamic: false, ...extra })
const zone = (zones, id) => zones.find((item) => item.id === id)
const wallSegments = (side, building, docks) => {
  const vertical = side === 'east' || side === 'west'
  const lo = vertical ? building.z0 : building.x0, hi = vertical ? building.z1 : building.x1
  const openings = docks.filter((dock) => dock.side === side).map((dock) => ({ lo: dock.at - dock.width / 2, hi: dock.at + dock.width / 2 })).sort((a, b) => a.lo - b.lo)
  let start = lo, index = 1
  const segments = []
  for (const opening of openings) {
    if (opening.lo > start) segments.push(vertical
      ? rect(`campus-wall-${side}-${index++}`, { x0: building.x1 - .28, x1: building.x1, z0: start, z1: opening.lo })
      : rect(`campus-wall-${side}-${index++}`, { x0: start, x1: opening.lo, z0: building.z0, z1: building.z0 + .28 }))
    start = opening.hi
  }
  if (start < hi) segments.push(vertical
    ? rect(`campus-wall-${side}-${index}`, { x0: building.x1 - .28, x1: building.x1, z0: start, z1: hi })
    : rect(`campus-wall-${side}-${index}`, { x0: start, x1: hi, z0: building.z0, z1: building.z0 + .28 }))
  return segments
}

export function buildCampusShellSpec(layout = { campus: CAMPUS, building: CAMPUS_BUILDING, docks: CAMPUS_DOCKS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }) {
  const { campus, building, zones, shuttle } = layout, docks = layout.docks || CAMPUS_DOCKS
  const front = zone(zones, 'frontPlaza'), parking = zone(zones, 'parking'), gate = zone(zones, 'logisticsGate')
  const shell = [
    rect('campus-paving', campus, { offset: .05, kind: 'ground' }),
    rect('campus-building-floor', building, { offset: .06, kind: 'ground' }),
    ...wallSegments('north', building, docks),
    rect('campus-wall-west', { x0: building.x0, x1: building.x0 + .28, z0: building.z0, z1: building.z1 }),
    ...wallSegments('east', building, docks),
    rect('campus-roof-north', { x0: building.x0, x1: building.x1, z0: building.z0, z1: building.z0 + 5 }),
    rect('campus-roof-south', { x0: building.x0, x1: building.x1, z0: building.z1 - 5, z1: building.z1 }),
    ...zones.filter((item) => item.v1 !== 'reserved').map((item) => rect(`campus-zone-${item.id}`, item, { kind: item.v1 === 'visible' ? 'volume' : 'mark', offset: item.v1 === 'mark' ? .08 : .1 })),
    rect('campus-shuttle-reserve', shuttle, { kind: 'mark', offset: .09 }),
    rect('campus-water', { x0: front.x0 + 20, x1: front.x0 + 40, z0: front.z0 + 1.2, z1: front.z0 + 3.8 }, { offset: .08, kind: 'water' }),
    rect('campus-sign', { x0: front.x0 + 25, x1: front.x0 + 35, z0: front.z1 - .36, z1: front.z1 }, { offset: .14, kind: 'thin' }),
    rect('campus-parking-lines', parking, { offset: .08, kind: 'mark' }),
    rect('campus-logistics-gate', gate, { kind: 'volume' }),
    rect('campus-road-guide', { x0: campus.x1 - .45, x1: campus.x1, z0: front.z0, z1: front.z1 }, { offset: .08, kind: 'mark' }),
  ]
  return Object.freeze(shell.filter((part) => inside(part, campus)))
}

const cube = (THREE, root, part, y, height, material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(part.x1 - part.x0, height, part.z1 - part.z0), material)
  mesh.name = part.name; mesh.position.set((part.x0 + part.x1) / 2, y, (part.z0 + part.z1) / 2); mesh.receiveShadow = !part.kind && !part.name.startsWith('campus-roof-'); root.add(mesh)
  return mesh
}
const plane = (THREE, root, part, y, material) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(part.x1 - part.x0, part.z1 - part.z0), material)
  mesh.name = part.name; mesh.rotation.x = -Math.PI / 2; mesh.position.set((part.x0 + part.x1) / 2, y, (part.z0 + part.z1) / 2); mesh.castShadow = false; mesh.receiveShadow = false; root.add(mesh)
  return mesh
}

export function hideCampusEnvironment(THREE, scene, campusRoot, bounds = CAMPUS) {
  const point = new THREE.Vector3(), hidden = {}
  const occupied = CAMPUS_BUILDING
  const occludingAncestor = (object) => {
    for (let current = object.parent; current; current = current.parent) if (current.userData?.campusOccluder) return current
    return null
  }
  scene.traverse((object) => {
    if (!object.isMesh || campusRoot.getObjectById(object.id)) return
    object.getWorldPosition(point)
    const occluder = occludingAncestor(object)
    const anchor = occluder?.getWorldPosition(new THREE.Vector3()) || point
    if ((occluder && anchor.x >= bounds.x0 && anchor.x <= bounds.x1 && anchor.z >= bounds.z0 && anchor.z <= bounds.z1) ||
        (point.x >= occupied.x0 && point.x <= occupied.x1 && point.z >= occupied.z0 && point.z <= occupied.z1)) {
      object.visible = false
      const type = occluder?.name || (object.name?.startsWith('entrance-step') ? 'entrance-step' : object.name || object.geometry?.type || 'unnamed')
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
    structure: low ? flat : new THREE.MeshStandardMaterial({ color: 0x53626a, roughness: .76, metalness: .3 }),
    roof: low ? flat : new THREE.MeshStandardMaterial({ color: 0x75919a, roughness: .55, transparent: true, opacity: .34, depthWrite: false }),
    zone: low ? flat : new THREE.MeshStandardMaterial({ color: 0x81979b, roughness: .8, transparent: true, opacity: .28 }),
    mark: low ? flat : new THREE.MeshBasicMaterial({ color: 0xd5af62, transparent: true, opacity: .72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    water: low ? flat : new THREE.MeshStandardMaterial({ color: 0x407c9e, roughness: .18, metalness: .35 }),
  }
  for (const part of spec) {
    if (part.name === 'campus-paving') plane(THREE, root, part, part.offset - .6, mats.paving)
    else if (part.name === 'campus-building-floor') plane(THREE, root, part, part.offset - .6, mats.structure)
    else if (part.name.startsWith('campus-wall-')) cube(THREE, root, part, 2.25, 4.5, mats.structure)
    else if (part.name.startsWith('campus-roof-')) cube(THREE, root, part, 4.68, .28, mats.roof)
    else if (part.kind === 'volume') cube(THREE, root, part, .42, .72, mats.zone)
    else if (part.kind === 'water') plane(THREE, root, part, part.offset - .6, mats.water)
    else if (part.name !== 'campus-sign') plane(THREE, root, part, part.offset - .6, mats.mark)
  }
  let texture
  if (!low) {
    const sign = spec.find((part) => part.name === 'campus-sign')
    texture = canvasTex(1024, 180, (ctx, width, height) => { ctx.fillStyle = '#18232b'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = '#d5af62'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, width - 10, height - 10); ctx.fillStyle = '#f4f1eb'; ctx.font = '600 56px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('智序小镇 | DR 仓配服务中心（示意）', width / 2, height * .62) })
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.x1 - sign.x0, 1.75), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }))
    board.name = sign.name; board.position.set((sign.x0 + sign.x1) / 2, 1.35, sign.z0 + .14); root.add(board)
  }
  return { dispose() { texture?.dispose(); new Set(Object.values(mats)).forEach((material) => material.dispose()) } }
}
