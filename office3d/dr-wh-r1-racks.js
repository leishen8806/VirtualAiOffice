// Extracted and adapted from feat/dr-b5-dispatch-suite@640d7f4: rack batching only; WH-R1 coordinates come from wh-r1/data.js.
import { WH_R1_DATA } from './wh-r1/data.js'
import { whToWorld } from './wh-r1-layout.js'

const put = (mesh, index, THREE, x, y, z, sx, sy, sz, color) => {
  const object = new THREE.Object3D(); object.position.set(x, y, z); object.scale.set(sx, sy, sz); object.updateMatrix()
  mesh.setMatrixAt(index, object.matrix); mesh.setColorAt(index, new THREE.Color(color))
}
const batch = (THREE, root, name, rows, color) => {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .58, metalness: .3 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, rows.length)
  mesh.name = name; mesh.userData = { whR1RackIds: rows.map(row => row.id), instanceToRegisterId: rows.map(row => row.id), qualityProxy: true }
  rows.forEach((row, index) => put(mesh, index, THREE, row.x, row.y, row.z, row.sx, row.sy, row.sz, row.color || color)); mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; root.add(mesh)
  return { mesh, material }
}
const rackCentre = rack => {
  const element = WH_R1_DATA.elements.find(item => item.id === rack.id)
  if (!element) throw new Error(`缺少货架登记项：${rack.id}`)
  return whToWorld(element.xM, element.yM)
}
const yellowReview = Object.freeze(WH_R1_DATA.passageChecks.filter(check => ['F03', 'R02'].includes(check.id)).map(check => Object.freeze({ id: check.id, margin_mm: check.margin_mm, status: check.status, marker: 'yellow' })))

export function buildWhR1Racks({ THREE, root, collision, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-racks'; group.userData.dynamic = true
  root.add(group)
  const posts = [], beams = [], pallets = [], guards = [], rails = [], shuttles = [], proxies = [], labels = []
  for (const rack of WH_R1_DATA.racks) {
    const center = rackCentre(rack), z0 = center.z - rack.length / 2
    for (let bay = 0; bay <= rack.bays; bay++) for (const side of [-1, 1]) posts.push({ id: `${rack.id}-frame-${bay}-${side}`, x: center.x + side * .55, y: 2.2, z: z0 + bay * rack.length / rack.bays, sx: .1, sy: 4.4, sz: .1 })
    for (let bay = 0; bay < rack.bays; bay++) for (const level of [.25, 1.6, 3.05, 4.35]) for (const side of [-1, 1]) {
      const z = z0 + (bay + .5) * rack.length / rack.bays
      beams.push({ id: `${rack.id}-beam-${bay}-${level}-${side}`, x: center.x + side * .55, y: level, z, sx: .12, sy: .1, sz: rack.length / rack.bays })
      if (level < 4) for (const pallet of [-1, 1]) pallets.push({ id: `${rack.id}-slot-${bay}-${level}-${side}-${pallet}`, x: center.x + side * .55, y: level + .18, z: z + pallet * .6, sx: 1.0, sy: .22, sz: 1.1 })
    }
    for (const side of [-1, 1]) guards.push({ id: `${rack.id}-guard-${side}`, x: center.x + side * 1.3, y: .25, z: z0, sx: .18, sy: .5, sz: .35 })
    for (const side of [-1, 1]) rails.push({ id: `${rack.id}-shuttle-rail-${side}`, x: center.x + side * .36, y: .12, z: center.z, sx: .07, sy: .08, sz: rack.length - .2 })
    shuttles.push({ id: `${rack.id}-shuttle-demo`, x: center.x, y: .36, z: center.z, sx: .92, sy: .22, sz: 1.05 })
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(rack.depth, rack.height, rack.length), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = `wh-r1-rack-collision-${rack.id}`; proxy.position.set(center.x, 2.2, center.z); proxy.userData = { whR1Id: rack.id, collisionProxy: true, noMerge: true }; group.add(proxy); collision?.add?.(proxy, 'whR1Rack'); proxies.push(proxy)
    if (canvasTex) labels.push({ id: `${rack.id}-label`, tag: rack.source_tag, x: center.x, y: 4.65, z: z0 - .08 })
  }
  let label = null
  if (canvasTex) {
    const texture = canvasTex(2048, 96, (ctx, w, h) => { ctx.fillStyle = '#18232b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f4f1eb'; ctx.font = '700 46px sans-serif'; ctx.textAlign = 'center'; labels.forEach((item, index) => ctx.fillText(`${item.tag} · 演示 / 待核定`, (index + .5) * w / labels.length, 62)) })
    const positions = [], uvs = [], indices = []
    labels.forEach((item, index) => { const w = 1.15, h = .215, u0 = index / labels.length, u1 = (index + 1) / labels.length, base = index * 4; positions.push(item.x - w, item.y - h, item.z, item.x + w, item.y - h, item.z, item.x + w, item.y + h, item.z, item.x - w, item.y + h, item.z); uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3) })
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
    label = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })); label.name = 'wh-r1-rack-labels'; label.userData = { whR1LabelIds: labels.map(item => item.id), noMerge: true }; group.add(label)
  }
  const structure = [...posts.map(row => ({ ...row, color:0x2f6fa8 })), ...beams.map(row => ({ ...row, color:0xe8832a })), ...guards.map(row => ({ ...row, color:0x1e2428 }))]
  const shuttle = [...rails.map(row => ({ ...row, color:0x6b7780 })), ...shuttles.map(row => ({ ...row, color:0x56636d }))]
  const built = [batch(THREE, group, 'wh-r1-rack-structure', structure, 0x2f6fa8), batch(THREE, group, 'wh-r1-rack-pallets', pallets, 0xb98a58), batch(THREE, group, 'wh-r1-shuttle', shuttle, 0x56636d)]
  return { counts: { racks: 4, frames: posts.length, cells: 96, pallets: pallets.length, beams: beams.length, guards: guards.length, shuttleRails: rails.length, shuttleCars: shuttles.length }, yellowReview, dispose() { proxies.forEach(proxy => collision?.remove?.(proxy)); group.removeFromParent(); built.forEach(({ mesh, material }) => { mesh.geometry.dispose(); material.dispose() }); if (label) { label.geometry.dispose(); label.material.map?.dispose(); label.material.dispose() }; proxies.forEach(proxy => { proxy.geometry.dispose(); proxy.material.dispose() }) } }
}
