// Extracted and adapted from feat/dr-b5-dispatch-suite@640d7f4: rack batching only; WH-R1 coordinates come from wh-r1/data.js.
import { WH_R1_DATA } from './wh-r1/data.js'
import { whToWorld } from './wh-r1-layout.js'

const COLORS = Object.freeze({ frame: 0x2f6fa8, beam: 0xe8832a, pallet: 0xb98a58, guard: 0xf2b632, rail: 0x6b7780, shuttle: 0x56636d })
const CATEGORY = Object.freeze({ frames: '货架立柱框占位', beams: '货架横梁占位', pallets: '托盘占位子件', guards: '架端防撞占位', cells: '货架格控制体' })

const compositeBoxes = (THREE, parts) => {
  const geometries = parts.map(({ x = 0, y = 0, z = 0, sx, sy, sz, rz = 0 }) => {
    const indexed = new THREE.BoxGeometry(1, 1, 1)
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz))
    indexed.applyMatrix4(matrix)
    const geometry = indexed.toNonIndexed(); indexed.dispose()
    return geometry
  })
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) {
    const size = geometries[0].attributes[name].itemSize
    const values = new Float32Array(geometries.reduce((total, item) => total + item.attributes[name].array.length, 0))
    let offset = 0
    for (const item of geometries) { values.set(item.attributes[name].array, offset); offset += item.attributes[name].array.length }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size))
  }
  geometries.forEach(item => item.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

const frameGeometry = THREE => compositeBoxes(THREE, [
  { x: -.45, sx: .1, sy: 1, sz: 1 }, { x: .45, sx: .1, sy: 1, sz: 1 },
  { y: -.45, sx: .9, sy: .04, sz: .45 }, { y: .45, sx: .9, sy: .04, sz: .45 },
  { sx: 1.23, sy: .04, sz: .45, rz: Math.atan2(.84, .9) },
])
const palletGeometry = THREE => compositeBoxes(THREE, [
  ...[-.45, -.225, 0, .225, .45].map(z => ({ y: .4775, z, sx: 1, sy: .045, sz: .1 })),
  ...[-.4, 0, .4].map(x => ({ x, y: -.25, sx: .1, sy: .5, sz: 1 })),
])

const registeredRows = category => WH_R1_DATA.elements.filter(row => row.category === category).map(row => {
  const world = whToWorld(row.xM, row.yM)
  return { id: row.id, parentId: row.parentId, x: world.x, y: row.zM + row.heightM / 2, z: world.z, sx: row.lengthM, sy: row.heightM, sz: row.widthM, yaw: -row.yawDeg * Math.PI / 180 }
})
const put = (mesh, index, THREE, row) => {
  const object = new THREE.Object3D(); object.position.set(row.x, row.y, row.z); object.rotation.y = row.yaw || 0; object.scale.set(row.sx, row.sy, row.sz); object.updateMatrix()
  mesh.setMatrixAt(index, object.matrix)
  if (row.color !== undefined) mesh.setColorAt(index, new THREE.Color(row.color))
}
const batch = (THREE, root, name, rows, color, geometry = new THREE.BoxGeometry(1, 1, 1), visible = true) => {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .58, metalness: .3 })
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length)
  mesh.name = name; mesh.visible = visible
  mesh.userData = { whR1RackIds: rows.map(row => row.id), instanceToRegisterId: rows.map(row => row.id), instanceParentIds: rows.map(row => row.parentId), qualityProxy: true }
  rows.forEach((row, index) => put(mesh, index, THREE, { ...row, color: row.color ?? color })); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); root.add(mesh)
  return { mesh, material }
}
const rackElement = id => {
  const element = WH_R1_DATA.elements.find(item => item.id === id)
  if (!element) throw new Error(`缺少货架登记项：${id}`)
  return element
}
const yellowReview = Object.freeze(WH_R1_DATA.passageChecks.filter(check => ['F03', 'R02'].includes(check.id)).map(check => Object.freeze({ id: check.id, margin_mm: check.margin_mm, status: check.status, marker: 'yellow' })))

export function buildWhR1Racks({ THREE, root, collision, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-racks'; group.userData.dynamic = true
  root.add(group)
  const frames = registeredRows(CATEGORY.frames), beams = registeredRows(CATEGORY.beams), pallets = registeredRows(CATEGORY.pallets), guards = registeredRows(CATEGORY.guards), cells = registeredRows(CATEGORY.cells)
  const rails = [], shuttles = [], proxies = [], labels = []
  for (const rack of WH_R1_DATA.racks) {
    const element = rackElement(rack.id), center = whToWorld(element.xM, element.yM), z0 = center.z - element.widthM / 2
    for (const side of [-1, 1]) rails.push({ id: `${rack.id}-shuttle-rail-${side}`, parentId: rack.id, x: center.x + side * .36, y: .12, z: center.z, sx: .07, sy: .08, sz: element.widthM - .2 })
    shuttles.push({ id: `${rack.id}-shuttle-demo`, parentId: rack.id, x: center.x, y: .36, z: center.z, sx: .92, sy: .22, sz: 1.05 })
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(element.lengthM, element.heightM, element.widthM), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = `wh-r1-rack-collision-${rack.id}`; proxy.position.set(center.x, element.zM + element.heightM / 2, center.z); proxy.userData = { whR1Id: rack.id, collisionProxy: true, noMerge: true }; group.add(proxy); collision?.add?.(proxy, 'whR1Rack'); proxies.push(proxy)
    if (canvasTex) labels.push({ id: `${rack.id}-label`, tag: rack.source_tag, x: center.x, y: 4.65, z: z0 - .08 })
  }
  for (const guard of guards) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(guard.sx, guard.sy, guard.sz), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = `wh-r1-rack-collision-${guard.id}`; proxy.position.set(guard.x, guard.y, guard.z); proxy.rotation.y = guard.yaw; proxy.userData = { whR1Id: guard.id, collisionProxy: true, noMerge: true }; group.add(proxy); collision?.add?.(proxy, 'whR1RackGuard'); proxies.push(proxy)
  }
  let label = null
  if (canvasTex) {
    const texture = canvasTex(2048, 96, (ctx, w, h) => { ctx.fillStyle = '#18232b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f4f1eb'; ctx.font = '700 46px sans-serif'; ctx.textAlign = 'center'; labels.forEach((item, index) => ctx.fillText(`${item.tag} · 演示 / 待核定`, (index + .5) * w / labels.length, 62)) })
    const positions = [], uvs = [], indices = []
    labels.forEach((item, index) => { const w = 1.15, h = .215, u0 = index / labels.length, u1 = (index + 1) / labels.length, base = index * 4; positions.push(item.x - w, item.y - h, item.z, item.x + w, item.y - h, item.z, item.x + w, item.y + h, item.z, item.x - w, item.y + h, item.z); uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3) })
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
    label = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })); label.name = 'wh-r1-rack-labels'; label.userData = { whR1LabelIds: labels.map(item => item.id), noMerge: true }; group.add(label)
  }
  const shuttle = [...rails.map(row => ({ ...row, color: COLORS.rail })), ...shuttles.map(row => ({ ...row, color: COLORS.shuttle }))]
  const built = [
    batch(THREE, group, 'wh-r1-rack-frames', frames, COLORS.frame, frameGeometry(THREE)),
    batch(THREE, group, 'wh-r1-rack-beams', beams, COLORS.beam),
    batch(THREE, group, 'wh-r1-rack-pallets', pallets, COLORS.pallet, palletGeometry(THREE)),
    batch(THREE, group, 'wh-r1-rack-guards', guards, COLORS.guard),
    batch(THREE, group, 'wh-r1-rack-cells', cells, 0xffffff, new THREE.BoxGeometry(1, 1, 1), false),
    batch(THREE, group, 'wh-r1-shuttle', shuttle, COLORS.shuttle),
  ]
  return {
    counts: { racks: 4, frames: frames.length, cells: cells.length, pallets: pallets.length, beams: beams.length, guards: guards.length, shuttleRails: rails.length, shuttleCars: shuttles.length },
    yellowReview,
    dispose() {
      proxies.forEach(proxy => collision?.remove?.(proxy)); group.removeFromParent()
      built.forEach(({ mesh, material }) => { mesh.geometry.dispose(); material.dispose() })
      if (label) { label.geometry.dispose(); label.material.map?.dispose(); label.material.dispose() }
      proxies.forEach(proxy => { proxy.geometry.dispose(); proxy.material.dispose() })
    },
  }
}
