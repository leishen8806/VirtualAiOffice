import { WH_R1_FLOOR_Y, whToWorld, whZoneToWorld } from './wh-r1-layout.js'
import { WH_R1_ANNEX, WH_R1_DEVIATIONS, WH_R1_I7_ROWS, WH_R1_PARKING_BAYS, WH_R1_RESERVED_YARDS } from './wh-r1-site-plan.js'

const colors = Object.freeze({
  '停车控制位': 0xd7b95f, '小汽车占位': 0x50788a, '连续花池': 0xb99b70, '长椅': 0x725740,
  '入口标识': 0x203846, '水景占位': 0x6ca9bf, '道闸占位': 0xe5d7a5, '盆器': 0xb99b70,
})

const instance = (THREE, root, name, geometry, material, rows, transform) => {
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length), dummy = new THREE.Object3D()
  mesh.name = name; mesh.userData = { noMerge: true, instanceToRegisterId: rows.map(row => row.id) }
  rows.forEach((row, index) => { transform(dummy, row); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); if (row.color !== undefined) mesh.setColorAt(index, new THREE.Color(row.color)) })
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; root.add(mesh)
  return mesh
}

export function buildWhR1Site({ THREE, root, quality, collision, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-site'; group.userData = { noMerge: true, motion: 'NONE', levels: 'UNKNOWN', deviations: WH_R1_DEVIATIONS }; root.add(group)
  const low = quality?.tier === 'low', meshes = [], proxies = [], textures = []
  const solidMaterial = low ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .05 })
  const foliageMaterial = low ? new THREE.MeshLambertMaterial({ color: 0x437957 }) : new THREE.MeshStandardMaterial({ color: 0x437957, roughness: .88 })
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x6d5337 })
  const planningMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .38, depthWrite: false })
  const addProxy = (row, category = row.category) => {
    const p = whToWorld(row.xM, row.yM), proxy = new THREE.Mesh(new THREE.BoxGeometry(row.lengthM, row.heightM, row.widthM), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = `wh-r1-site-proxy-${row.id}`; proxy.position.set(p.x, WH_R1_FLOOR_Y + row.zM + row.heightM / 2, p.z); proxy.rotation.y = row.yawDeg * Math.PI / 180
    proxy.userData = { whR1Id: row.id, collisionProxy: true, noMerge: true }; group.add(proxy); collision?.add(proxy, category); proxies.push(proxy)
  }

  const visibleRows = WH_R1_I7_ROWS.filter(row => row.collisionRole !== 'assembly_reference_only')
  const crowns = visibleRows.filter(row => row.category === '冠幅')
  const trunks = visibleRows.filter(row => row.category === '树干')
  const solids = visibleRows.filter(row => !['冠幅', '树干', '水景占位'].includes(row.category)).map(row => ({ ...row, color: colors[row.category] || 0x8d9b87 }))
  const transform = (dummy, row) => { const p = whToWorld(row.xM, row.yM); dummy.position.set(p.x, WH_R1_FLOOR_Y + row.zM + row.heightM / 2, p.z); dummy.rotation.set(0, row.yawDeg * Math.PI / 180, 0); dummy.scale.set(row.lengthM, row.heightM, row.widthM) }
  meshes.push(instance(THREE, group, 'wh-r1-site-crowns', new THREE.SphereGeometry(.5, low ? 8 : 12, low ? 5 : 8), foliageMaterial, crowns, transform))
  meshes.push(instance(THREE, group, 'wh-r1-site-trunks', new THREE.CylinderGeometry(.5, .5, 1, low ? 6 : 10), trunkMaterial, trunks, transform))
  const waterRows = visibleRows.filter(row => row.category === '水景占位')
  const waterMaterial = new THREE.MeshBasicMaterial({ color: 0x6ca9bf, transparent: true, opacity: .6, depthWrite: false })
  meshes.push(instance(THREE, group, 'wh-r1-site-water', new THREE.BoxGeometry(1, 1, 1), waterMaterial, waterRows, transform))
  visibleRows.filter(row => !['停车控制位'].includes(row.category)).forEach(addProxy)

  const annexBounds = whZoneToWorld(WH_R1_ANNEX.bboxSource), annexWidth = annexBounds[1] - annexBounds[0], annexDepth = annexBounds[3] - annexBounds[2]
  const annexRows = WH_R1_ANNEX.walls.map(row => ({ ...row, zM: 0, color: 0x64767d }))
  WH_R1_ANNEX.walls.forEach(row => addProxy({ ...row, zM: 0, category: '方案新增外墙' }))
  const doorRows = WH_R1_ANNEX.doors.map(row => ({ ...row, zM: 0, color: 0xd5af62 }))
  WH_R1_ANNEX.doors.forEach(row => addProxy({ ...row, zM: 0, category: '方案新门静态占位' }))

  const bayEdges = WH_R1_PARKING_BAYS.flatMap(bay => {
    const edge = .07, long = bay.lengthM, wide = bay.widthM, yaw = bay.yawDeg * Math.PI / 180
    return [[0, -wide / 2, long, edge], [0, wide / 2, long, edge], [-long / 2, 0, edge, wide], [long / 2, 0, edge, wide]].map(([dx, dz, lengthM, widthM], index) => ({ id: `${bay.id}-BAY-${index + 1}`, xM: bay.xM + dx * Math.cos(yaw) + dz * Math.sin(yaw), yM: bay.yM - dx * Math.sin(yaw) + dz * Math.cos(yaw), zM: .01, lengthM, widthM, heightM: .025, yawDeg: bay.yawDeg, color: 0xd7b95f }))
  })
  const boxes = instance(THREE, group, 'wh-r1-site-boxes', new THREE.BoxGeometry(1, 1, 1), solidMaterial, [...solids, ...annexRows, ...doorRows, ...bayEdges], transform)
  boxes.userData.groups = Object.freeze({ fixtures: solids.length, annexWalls: annexRows.length, annexDoors: doorRows.length, bayEdges: bayEdges.length }); meshes.push(boxes)

  const yardRows = WH_R1_RESERVED_YARDS.map(yard => { const [x0, x1, z0, z1] = whZoneToWorld(yard.bboxSource); return { ...yard, x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 } })
  const planes = [{ id: 'WH-R1-ANNEX-FLOOR', x: (annexBounds[0] + annexBounds[1]) / 2, z: (annexBounds[2] + annexBounds[3]) / 2, width: annexWidth, depth: annexDepth, color: 0x9ea9a8 }, ...yardRows.map(row => ({ ...row, color: 0xe1bd61 }))]
  const yardMesh = instance(THREE, group, 'wh-r1-site-planes', new THREE.PlaneGeometry(1, 1), planningMaterial, planes, (dummy, row) => { dummy.position.set(row.x, WH_R1_FLOOR_Y + .006, row.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(row.width, row.depth, 1) })
  yardMesh.userData.yards = yardRows; yardMesh.userData.level = 'UNKNOWN'; yardMesh.userData.designStatus = 'DESIGN_ASSUMPTION'; meshes.push(yardMesh)

  if (canvasTex) {
    const labels = [...WH_R1_RESERVED_YARDS.map((yard, index) => ({ id: yard.id, text: yard.label, x: yardRows[index].x, z: yardRows[index].z })), { id: 'WH-R1-LOGISTICS-ENTRY', text: '物流出入口 · 规划标示 / 道路未验证', ...whToWorld(154, 6) }, { id: 'WH-R1-ANNEX-UNKNOWN', text: '附建发货区 · 高差 UNKNOWN', ...whToWorld(100, 27) }]
    const texture = canvasTex(2048, 128, (context, width, height) => { context.fillStyle = '#23323b'; context.fillRect(0, 0, width, height); context.fillStyle = '#ffffe8'; context.font = 'bold 42px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; labels.forEach((row, index) => context.fillText(row.text, (index + .5) * width / labels.length, height / 2, width / labels.length - 12)) })
    textures.push(texture)
    const positions = [], uvs = [], indices = []
    labels.forEach((row, index) => { const base = positions.length / 3, width = index < 2 ? 16 : 12, u0 = index / labels.length, u1 = (index + 1) / labels.length; positions.push(row.x - width / 2, .04, row.z + .4, row.x + width / 2, .04, row.z + .4, row.x + width / 2, .04, row.z - .4, row.x - width / 2, .04, row.z - .4); uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3) })
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices)
    const labelMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })); labelMesh.name = 'wh-r1-site-labels'; labelMesh.userData = { noMerge: true, labels }; group.add(labelMesh); meshes.push(labelMesh)
  }

  return {
    root: group,
    sitePlan: Object.freeze({ annex: WH_R1_ANNEX, bays: WH_R1_PARKING_BAYS, yards: WH_R1_RESERVED_YARDS, deviations: WH_R1_DEVIATIONS }),
    dispose() {
      proxies.forEach(proxy => { collision?.remove(proxy); proxy.geometry.dispose(); proxy.material.dispose() })
      meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose?.() })
      textures.forEach(texture => texture.dispose()); group.removeFromParent()
    },
  }
}
