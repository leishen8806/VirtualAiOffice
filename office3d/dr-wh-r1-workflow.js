import { WH_R1_DATA, WH_R1_ASSIGNMENT } from './wh-r1/data.js'
import { whToWorld, WH_R1_FLOOR_Y, runtimeYawFromFacing } from './wh-r1-layout.js'
import { pathPoint } from './dr-campus-motion-logic.js'

const assigned = new Set(WH_R1_ASSIGNMENT.filter(row => row.card === 'I4').map(row => row.id))
export const WH_R1_WORKFLOW = Object.freeze(WH_R1_DATA.elements.filter(row => assigned.has(row.id)))
const conveyor = WH_R1_WORKFLOW.filter(row => row.category === '输送线模块')
const endpoints = row => {
  const a = row.yawDeg * Math.PI / 180, dx = Math.cos(a) * row.lengthM / 2, dy = Math.sin(a) * row.lengthM / 2
  return [whToWorld(row.xM - dx, row.yM - dy), whToWorld(row.xM + dx, row.yM + dy)]
}
export const WH_R1_CONVEYOR_PATH = Object.freeze([endpoints(conveyor[0])[0], ...conveyor.map(row => endpoints(row)[1])].map(p => Object.freeze({ ...p, pauseMs: 0 })))

export function buildWhR1Workflow({ THREE, root, collision, canvasTex, quality }) {
  const group = new THREE.Group(); group.name = 'wh-r1-workflow'; group.position.y = WH_R1_FLOOR_Y; group.userData.dynamic = true; root.add(group)
  const parts = { boxes: [], cylinders: [], foliage: [], rollers: [], markers: [] }, meshes = [], proxies = [], screens = [], orientations = []
  const put = (kind, row, offset, size, color, rotationX = 0) => {
    const p = whToWorld(row.xM, row.yM), yaw = row.yawDeg * Math.PI / 180, [x, y, z] = offset
    const parent = WH_R1_WORKFLOW.find(r => r.id === row.parentId)
    parts[kind].push({ id: row.id, parentId: ['椅子', '绿植总成', '低位拣选架总成'].includes(parent?.category) ? row.parentId : null, x: p.x + x * Math.cos(yaw) + z * Math.sin(yaw), y: row.zM + y, z: p.z - x * Math.sin(yaw) + z * Math.cos(yaw), size, color, yaw, rotationX })
  }
  const box = (r, offset, size, color) => put('boxes', r, offset, size, color)
  const proxy = row => {
    const p = whToWorld(row.xM, row.yM), mesh = new THREE.Mesh(new THREE.BoxGeometry(row.lengthM, row.heightM, row.widthM), new THREE.MeshBasicMaterial({ visible: false }))
    mesh.position.set(p.x, row.zM + row.heightM / 2, p.z); mesh.rotation.y = row.yawDeg * Math.PI / 180
    mesh.name = `wh-r1-workflow-proxy-${row.id}`; mesh.userData = { whR1Id: row.id, noMerge: true, collisionProxy: true }; group.add(mesh); collision?.add(mesh, row.category); proxies.push(mesh)
  }
  const table = row => {
    const { lengthM: l, widthM: w, heightM: h } = row
    box(row, [0, h - .04, 0], [l, .08, w], '#c4a171')
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(row, [x * (l / 2 - .05), (h - .08) / 2, z * (w / 2 - .05)], [.1, h - .08, .1], '#637a85')
  }
  for (const row of WH_R1_WORKFLOW) {
    const { category: cat, lengthM: l, widthM: w, heightM: h } = row
    if (['低位拣选架总成', '墙边短架'].includes(cat)) {
      for (const x of [-1, 1]) for (const z of [-1, 1]) box(row, [x * (l / 2 - .03), h / 2, z * (w / 2 - .03)], [.06, h, .06], '#3375a0')
      box(row, [0, h - .03, 0], [l, .06, w], '#7b929c')
      if (cat === '墙边短架') for (const y of [.15, .7, 1.25]) box(row, [0, y + .02, 0], [l, .04, w], '#d69a50')
      proxy(row)
    } else if (cat === '低架格控制体') {
      box(row, [0, .02, 0], [l, .04, w], '#d69a50')
      for (const x of [-1, 1]) for (const z of [-1, 1]) box(row, [x * (l / 2 - .015), h / 2, z * (w / 2 - .015)], [.03, h, .03], '#6b858f')
    } else if (['工作台', '拣选长工作台'].includes(cat)) { table(row); proxy(row)
    } else if (cat === '输送线模块') {
      box(row, [0, h - .09, 0], [l, .08, w - .1], '#3b646c')
      for (const side of [-1, 1]) {
        box(row, [0, h - .05, side * (w / 2 - .025)], [l, .1, .05], '#aebbc1')
        const count = Math.ceil(l / 2.5)
        for (let i = 0; i <= count; i++) box(row, [(i / count - .5) * (l - .12), (h - .14) / 2, side * (w / 2 - .065)], [.1, h - .14, .08], '#637a85')
      }
      const count = Math.ceil(l / (quality?.tier === 'low' ? .7 : .4))
      for (let i = 0; i < count; i++) put('rollers', row, [(i + .5) / count * l - l / 2, h - .03, 0], [.06, w - .1, .06], '#c5ced1', Math.PI / 2)
      proxy(row)
    } else if (cat === '椅子子件') {
      if (row.id.endsWith('-BASE')) {
        box(row, [0, .03, 0], [l, .06, .08], '#637a85'); box(row, [0, .03, 0], [.08, .06, w], '#637a85'); box(row, [0, (h + .06) / 2, 0], [.08, h - .06, .08], '#637a85')
      } else box(row, [0, h / 2, 0], [l, h, w], '#4f796e')
    } else if (cat === '椅子') {
      const back = WH_R1_WORKFLOW.find(r => r.id === `${row.id}-BACK`), seat = whToWorld(row.xM, row.yM), rear = whToWorld(back.xM, back.yM), dx = seat.x - rear.x, dz = seat.z - rear.z, norm = Math.hypot(dx, dz)
      // The registered seat/back positions define the procedural chair's front; no GLB yaw convention is assumed.
      orientations.push({ id: row.id, yaw: runtimeYawFromFacing(dx / norm, dz / norm) })
    } else if (['显示终端', '状态屏'].includes(cat)) {
      box(row, [0, h / 2, 0], [l, h, w], '#4d606b'); screens.push(row)
    } else if (cat === '工艺设备占位') {
      box(row, [0, h / 2, 0], [l, h, w], '#5d8e9b'); box(row, [0, h * .65, w / 2 - .005], [l * .7, h * .35, .01], '#d2dcda'); proxy(row)
    } else if (cat === '地面托盘载荷占位') {
      for (const x of [-.4, 0, .4]) box(row, [x * l, .065, 0], [.12 * l, .13, w], '#ab8051')
      box(row, [0, .14, 0], [l, .02, w], '#bb9565'); box(row, [0, (.15 + h) / 2, 0], [l, h - .15, w], '#cfb38a'); proxy(row)
    } else if (cat === '盆器') { put('cylinders', row, [0, h / 2, 0], [l, h, w], '#cbbca4'); proxy(row)
    } else if (cat === '树干') put('cylinders', row, [0, h / 2, 0], [l, h, w], '#88704b')
    else if (cat === '冠幅') put('foliage', row, [0, h / 2, 0], [l, h, w], '#4f8157')
    else if (cat === '待解决交叉点') put('markers', row, [0, .002, 0], [l, .004, w], '#efc14e')
    else if (cat !== '绿植总成') throw new Error(`Unknown WH-R1 workflow category: ${cat}`)
  }
  const mark = (id, x, y, l, w, h, zM = 0) => put('markers', { id, xM: x, yM: y, zM, yawDeg: 0 }, [0, h / 2, 0], [l, h, w], '#e24636')
  const eq = WH_R1_DATA.elements.find(r => r.id === 'WH-04-EQ-002'), cv = conveyor[0], eqEdge = eq.yM + eq.lengthM / 2, cvEdge = cv.yM - cv.widthM / 2
  mark('conflict-EQ-002', eq.xM, (eqEdge + cvEdge) / 2, eq.widthM, eqEdge - cvEdge, .02, cv.heightM)
  for (const id of ['WH-05-CH-003', 'WH-05-CH-004']) {
    const row = WH_R1_WORKFLOW.find(r => r.id === id)
    mark(`${id}-use`, row.xM, row.yM, .76, 1, .004)
    mark(`${id}-overlap`, row.xM, 23.375, .76, .05, .02, .9)
  }
  mark('P05-BLOCKED', 44.5, 16, 3, .9, .004)
  const object = new THREE.Object3D()
  const setMatrix = (mesh, index, item) => { object.position.set(item.x, item.y, item.z); object.rotation.set(0, item.yaw, 0); object.rotateX(item.rotationX || 0); object.scale.set(...item.size); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix) }
  const batch = (name, geometry, rows, material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length); mesh.name = `wh-r1-workflow-${name}`; mesh.userData = { instanceToRegisterId: rows.map(r => r.id), assemblyIds: rows.map(r => r.parentId), noMerge: true }
    rows.forEach((r, i) => { setMatrix(mesh, i, r); mesh.setColorAt(i, new THREE.Color(r.color || '#b58a54')) }); mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true
    group.add(mesh); meshes.push(mesh); return mesh
  }
  for (const [name, rows] of Object.entries(parts)) {
    const geometry = name === 'foliage' ? new THREE.SphereGeometry(.5, 12, 8) : ['cylinders', 'rollers'].includes(name) ? new THREE.CylinderGeometry(.5, .5, 1, 12) : new THREE.BoxGeometry(1, 1, 1)
    const material = name === 'markers' ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .72 })
    batch(name, geometry, rows, material)
  }
  let screenMesh = null
  if (canvasTex) {
    const texture = canvasTex(1024, 256, (ctx, w, h) => { ctx.fillStyle = '#172f3b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#8ed3b7'; ctx.font = 'bold 20px sans-serif'; screens.forEach((r, i) => { const x = i * w / screens.length; ctx.fillText(r.id.endsWith('005') ? '工序状态 · 演示' : '工位终端', x + 8, 44); for (let j = 0; j < 4; j++) ctx.fillRect(x + 10, 76 + j * 30, 120 - j * 16, 9) }) })
    const positions = [], uvs = [], indices = []
    screens.forEach((r, i) => { const p = whToWorld(r.xM, r.yM), base = positions.length / 3; for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) positions.push(p.x + x * (r.lengthM / 2 - .015), r.zM + r.heightM / 2 + y * (r.heightM / 2 - .015), p.z + r.widthM / 2 + .001); uvs.push(i / screens.length, 0, (i + 1) / screens.length, 0, (i + 1) / screens.length, 1, i / screens.length, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3) })
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
    screenMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture })); screenMesh.name = 'wh-r1-workflow-screens'; screenMesh.userData.noMerge = true; group.add(screenMesh)
  }
  const cargoCount = quality?.tier === 'low' ? 4 : 8, cargoRows = Array.from({ length: cargoCount }, (_, i) => ({ id: `workflow-cargo-${i}`, x: 0, y: .99, z: 0, size: [.22, .18, .22], yaw: 0 }))
  const cargo = batch('cargo', new THREE.BoxGeometry(1, 1, 1), cargoRows, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }))
  let elapsed = 0, disposed = false
  const move = () => { cargoRows.forEach((r, i) => { const p = pathPoint(WH_R1_CONVEYOR_PATH, elapsed + i * 8000, 1); Object.assign(r, { x: p.x, z: p.z }); setMatrix(cargo, i, r) }); cargo.instanceMatrix.needsUpdate = true; cargo.computeBoundingSphere() }
  move()
  group.userData.registerIds = WH_R1_WORKFLOW.map(r => r.id); group.userData.orientations = orientations
  return { root: group, records: WH_R1_WORKFLOW, orientations, cargo,
    onFrame(dt) { if (disposed || globalThis.document?.hidden || !group.visible || !Number.isFinite(dt) || dt <= 0) return; elapsed += dt * 1000; move() },
    dispose() { if (disposed) return; disposed = true; proxies.forEach(p => { collision?.remove(p); p.geometry.dispose(); p.material.dispose() }); meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); m.dispose() }); if (screenMesh) { screenMesh.geometry.dispose(); screenMesh.material.map.dispose(); screenMesh.material.dispose() } group.removeFromParent() } }
}
