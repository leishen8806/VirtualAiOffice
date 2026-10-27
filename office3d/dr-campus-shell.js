import { CAMPUS, CAMPUS_BUILDING, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from './office-layout.js'
import { whR1Requested } from './place-mode.js'
import { WH_R1_SITE } from './dr-wh-r1-zones.js'

const inside = (part, bounds) => part.x0 >= bounds.x0 && part.x1 <= bounds.x1 && part.z0 >= bounds.z0 && part.z1 <= bounds.z1
const rect = (name, bounds, extra = {}) => Object.freeze({ name, ...bounds, dynamic: false, ...extra })
const zone = (zones, id) => zones.find((item) => item.id === id)

export function buildCampusShellSpec(layout = { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }) {
  const { campus, building, zones, shuttle } = layout
  const front = zone(zones, 'frontPlaza'), parking = zone(zones, 'parking'), gate = zone(zones, 'logisticsGate')
  const shell = [
    rect('campus-paving', campus, { offset: .05, kind: 'ground' }),
    rect('campus-building-floor', building, { offset: .06, kind: 'ground' }),
    rect('campus-wall-north', { x0: building.x0, x1: building.x1, z0: building.z0, z1: building.z0 + .28 }),
    rect('campus-wall-west', { x0: building.x0, x1: building.x0 + .28, z0: building.z0, z1: building.z1 }),
    rect('campus-wall-east', { x0: building.x1 - .28, x1: building.x1, z0: building.z0, z1: building.z1 }),
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
  if (whR1Requested(globalThis.location?.search)) {
    const hidden = {}
    for (const item of inspectEnvironmentMeshes(THREE, scene, campusRoot, WH_R1_SITE)) {
      item.object.visible = false
      hidden[item.type] = (hidden[item.type] || 0) + 1
    }
    return hidden
  }
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

export function inspectEnvironmentMeshes(THREE, scene, campusRoot, bounds) {
  const site = new THREE.Box3(new THREE.Vector3(bounds.x0, -1, bounds.z0), new THREE.Vector3(bounds.x1, 6, bounds.z1))
  const box = new THREE.Box3(), items = []
  scene.updateMatrixWorld?.(true)
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry?.type === 'SphereGeometry' || campusRoot.getObjectById(object.id)) return
    box.setFromObject(object)
    if (!box.isEmpty() && box.intersectsBox(site)) {
      const type = object.name?.startsWith('entrance-step') ? 'entrance-step' : object.name || object.geometry?.type || 'unnamed'
      items.push({ object, type, bounds: { x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: box.max.y, z0: box.min.z, z1: box.max.z } })
    }
  })
  return items
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
