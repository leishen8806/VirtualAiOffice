import { CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from './office-layout.js'

const zone = (id, zones) => zones.find((item) => item.id === id)
const seeded = (value) => () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000)
const box = (id, x0, x1, z0, z1, extra = {}) => Object.freeze({ id, x0, x1, z0, z1, ...extra })

export function createCampusRackPlan({ zones = CAMPUS_ZONES, shuttle = CAMPUS_SHUTTLE_STRIP, seed = 2505 } = {}) {
  const highRack = zone('highRack', zones), receiving = zone('receiving', zones), shipping = zone('shipping', zones)
  const rng = seeded(seed), rowXs = [-142, -133, -124, -115], labels = ['A1', 'R2', 'C2', 'B2']
  const racks = rowXs.map((x0, row) => Object.freeze({
    id: `rack-${labels[row]}`, label: labels[row], x0, x1: x0 + 2, z0: -8, z1: 6,
    sections: Object.freeze(Array.from({ length: 6 }, (_, index) => box(`rack-${labels[row]}-${index + 1}`, x0, x0 + 2, -8 + index * (14 / 6), -8 + (index + 1) * (14 / 6), { row, index }))),
  }))
  const cargo = Object.freeze(racks.flatMap((rack) => rack.sections.flatMap((section) => Array.from({ length: 2 }, (_, index) => box(`cargo-${section.id}-${index + 1}`, section.x0 + .28 + index * .8, section.x0 + .92 + index * .8, section.z0 + .24 + rng() * .5, section.z0 + 1.04 + rng() * .5, { height: .5 + rng() * .7 })))))
  const doors = (prefix, area, count) => Object.freeze(Array.from({ length: count }, (_, index) => {
    const width = (area.x1 - area.x0 - 2) / count, x0 = area.x0 + 1 + index * width
    return box(`${prefix}-${index + 1}`, x0, x0 + width - .55, area.z1 - .16, area.z1, { offset: .13 })
  }))
  const stations = Object.freeze(['inspection', 'picking', 'packing'].map((id) => {
    const item = zone(id, zones)
    return box(`station-${id}`, item.x0 + 1, item.x1 - 1, item.z0 + 1, item.z0 + 2.1)
  }))
  const labelsPlan = Object.freeze(racks.map((rack) => Object.freeze({ id: `label-${rack.label}`, label: rack.label, x: (rack.x0 + rack.x1) / 2, z: rack.z1 + .13, offset: .13 })))
  return Object.freeze({ highRack, shuttle, racks: Object.freeze(racks), labels: labelsPlan, cargo, receivingDoors: doors('receiving-door', receiving, 4), shippingDoors: doors('shipping-door', shipping, 3), stations })
}

const put = (mesh, index, THREE, item, color) => {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(item.x, item.y, item.z), new THREE.Quaternion(), new THREE.Vector3(item.sx, item.sy, item.sz))
  mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, new THREE.Color(color))
}
const inside = (plan, low, replaceRackCell = false) => {
  const solids = []
  if (!replaceRackCell) {
    for (const rack of plan.racks.slice(0, low ? 2 : 4)) for (const section of rack.sections) {
      const z = (section.z0 + section.z1) / 2
      for (const x of [section.x0 + .12, section.x1 - .12]) for (const end of [section.z0 + .12, section.z1 - .12]) solids.push({ x, y: 1.8, z: end, sx: .16, sy: 3.6, sz: .16, color: 0x2d608b })
      for (const y of [1.1, 2.5]) solids.push({ x: (section.x0 + section.x1) / 2, y, z, sx: 2, sy: .16, sz: section.z1 - section.z0, color: 0xe18a3b })
    }
    for (const item of plan.cargo.filter((_, index) => !low || index % 5 === 0)) solids.push({ x: (item.x0 + item.x1) / 2, y: item.height / 2, z: (item.z0 + item.z1) / 2, sx: item.x1 - item.x0, sy: item.height, sz: item.z1 - item.z0, color: 0xc29b58 })
  }
  for (const item of [...plan.stations, ...plan.receivingDoors, ...plan.shippingDoors]) solids.push({ x: (item.x0 + item.x1) / 2, y: .55, z: (item.z0 + item.z1) / 2, sx: item.x1 - item.x0, sy: 1.1, sz: Math.max(.18, item.z1 - item.z0), color: 0x5b6c73 })
  if (!replaceRackCell) solids.push({ x: (plan.shuttle.x0 + plan.shuttle.x1) / 2, y: .12, z: (plan.shuttle.z0 + plan.shuttle.z1) / 2, sx: plan.shuttle.x1 - plan.shuttle.x0, sy: .12, sz: plan.shuttle.z1 - plan.shuttle.z0, color: 0x718a96 })
  return solids
}

export function buildCampusRacks({ THREE, root, canvasTex, layout, quality, replaceRackCell = false }) {
  const plan = createCampusRackPlan({ zones: layout.zones, shuttle: layout.shuttle })
  const low = quality?.tier === 'low', solids = inside(plan, low, replaceRackCell)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .68, metalness: .24 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, solids.length)
  mesh.name = 'campus-racks-static'
  if (replaceRackCell) mesh.name = 'campus-racks-support'
  mesh.userData.qualityProxy = true; mesh.receiveShadow = true
  solids.forEach((item, index) => put(mesh, index, THREE, item, item.color)); mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; root.add(mesh)
  let texture, labels
  if (!low) {
    texture = canvasTex(1024, 150, (ctx, width, height) => { ctx.fillStyle = '#18232b'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = '#d5af62'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, width - 6, height - 6); ctx.fillStyle = '#f4f1eb'; ctx.font = '700 55px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A1       R2       C2       B2', width / 2, 68); ctx.fillStyle = '#d5af62'; ctx.font = '500 30px sans-serif'; ctx.fillText('穿梭机展示位（预留）', width / 2, 118) })
    labels = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }))
    labels.name = 'campus-rack-labels'; labels.position.set(-127.5, 2.1, 6.13); root.add(labels)
  }
  return { instances: solids.length, triangles: solids.length * 12, dispose() { texture?.dispose(); material.dispose(); mesh.geometry.dispose(); labels?.geometry?.dispose?.(); labels?.material?.dispose?.() } }
}
