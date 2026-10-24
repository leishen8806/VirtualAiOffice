// VIS-ALIGN W-V1：独立装卸月台样板。它不注册到主场景，也不创建动画、请求或业务状态。
// 全部局部 Y 坐标以完成面为 0；集成方必须显式传入 CAMPUS_FINISHED_FLOOR_Y。

const COLORS = Object.freeze({
  concrete: 0x8d918f,
  wall: 0xd4d0c7,
  door: 0x5c6668,
  white: 0xf2f3ef,
  window: 0x25424b,
  tire: 0x171a1a,
  steel: 0x53626a,
  yellow: 0xe5b13f,
  pallet: 0x9b6a3d,
  cargo: 0xc89a58,
  forklift: 0xd28526,
  warm: 0xffce7a,
})

export function createVis2DockSamplePlan(layout) {
  const receiving = layout?.zones?.find(zone => zone.id === 'receiving')
  if (!receiving || ![receiving.x0, receiving.x1, receiving.z0, receiving.z1].every(Number.isFinite)) {
    throw new Error('装卸月台样板需要有效的 receiving 区域')
  }
  const width = receiving.x1 - receiving.x0
  if (width < 20 || receiving.z1 - receiving.z0 < 4) throw new Error('receiving 区域不足以容纳装卸月台样板')
  const centerX = (receiving.x0 + receiving.x1) / 2
  const dockZ = receiving.z0
  return Object.freeze({
    id: 'vis2-dock-sample',
    receiving: Object.freeze({ x0: receiving.x0, x1: receiving.x1, z0: receiving.z0, z1: receiving.z1 }),
    platform: Object.freeze({ x0: centerX - 8, x1: centerX + 8, z0: dockZ, z1: dockZ + 2.4, height: .4 }),
    wall: Object.freeze({ x0: centerX - 8, x1: centerX + 8, z: dockZ + 2.4, height: 4.2 }),
    doors: Object.freeze([
      Object.freeze({ id: '01', x: centerX - 4.1, z: dockZ + 2.25, width: 4.8, height: 3.05 }),
      Object.freeze({ id: '02', x: centerX + 4.1, z: dockZ + 2.25, width: 4.8, height: 3.05 }),
    ]),
    truck: Object.freeze({ x: centerX - 4.1, z: dockZ - 3.25, width: 2.45, length: 5.6, height: 2.9, wheelRadius: .34 }),
    rail: Object.freeze({ x0: centerX + 5.1, x1: centerX + 7.5, z: dockZ + .25, height: 1.05 }),
    marking: Object.freeze({ x0: centerX - 7, x1: centerX + 6.6, z0: dockZ - 6.15, z1: dockZ - .25 }),
    cargo: Object.freeze({ x: centerX + 2.4, z: dockZ + 1.15 }),
    forklift: Object.freeze({ x: centerX + 5.2, z: dockZ - 2.35 }),
  })
}

function createBatch(THREE, name, color, capacity, geometry = new THREE.BoxGeometry(1, 1, 1)) {
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .15 }),
    capacity,
  )
  mesh.name = name
  mesh.count = 0
  mesh.castShadow = true
  mesh.receiveShadow = true
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  return {
    mesh,
    add(x, y, z, sx, sy, sz, yaw = 0, pitch = 0, roll = 0) {
      if (mesh.count >= capacity) throw new Error(`${name} 实例容量不足`)
      matrix.compose(position.set(x, y, z), rotation.setFromEuler(new THREE.Euler(pitch, yaw, roll)), scale.set(sx, sy, sz))
      mesh.setMatrixAt(mesh.count++, matrix)
    },
    finish() {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
      if (!mesh.boundingBox || !mesh.boundingSphere || !Number.isFinite(mesh.boundingBox.min.x) || !Number.isFinite(mesh.boundingSphere.radius)) {
        throw new Error(`${name} 产生无效包围盒`)
      }
    },
    dispose() {
      mesh.geometry.dispose()
      mesh.material.dispose()
    },
  }
}

export function buildVis2DockSample({ THREE, root, layout, baseY = 0, quality = {} } = {}) {
  if (!THREE || !root) throw new Error('装卸月台样板需要 THREE 和 root')
  if (!Number.isFinite(baseY)) throw new Error('baseY 必须是有限数值')
  const plan = createVis2DockSamplePlan(layout)
  const low = quality.tier === 'low'
  const group = new THREE.Group()
  group.name = 'vis2-dock-sample'
  group.position.y = baseY
  group.userData.vis2 = 'dock-sample'
  const concrete = createBatch(THREE, 'vis2-dock-concrete', COLORS.concrete, 5)
  const wall = createBatch(THREE, 'vis2-dock-wall', COLORS.wall, 4)
  const doors = createBatch(THREE, 'vis2-dock-doors', COLORS.door, 8)
  const white = createBatch(THREE, 'vis2-dock-white-vehicle', COLORS.white, 4)
  const dark = createBatch(THREE, 'vis2-dock-dark-details', COLORS.window, 9)
  const wheels = createBatch(THREE, 'vis2-dock-wheels', COLORS.tire, 8, new THREE.CylinderGeometry(1, 1, 1, 12))
  const steel = createBatch(THREE, 'vis2-dock-safety-rails', COLORS.steel, 18)
  const yellow = createBatch(THREE, 'vis2-dock-markings', COLORS.yellow, low ? 32 : 32)
  const timber = createBatch(THREE, 'vis2-dock-cargo', COLORS.pallet, 10)
  const forklift = createBatch(THREE, 'vis2-dock-forklift', COLORS.forklift, 8)

  const platform = plan.platform, truck = plan.truck
  const top = platform.height
  concrete.add((platform.x0 + platform.x1) / 2, top / 2, (platform.z0 + platform.z1) / 2, platform.x1 - platform.x0, top, platform.z1 - platform.z0)
  // 后墙、卷帘门、编号和前沿调节板构成可辨认的收货月台。
  const [doorA, doorB] = plan.doors
  const wallZ = plan.wall.z
  // 三段墙体加门楣保留两个门洞，避免整面实体墙遮住卷帘门和室内月台。
  wall.add((plan.wall.x0 + doorA.x - doorA.width / 2) / 2, plan.wall.height / 2, wallZ, doorA.x - doorA.width / 2 - plan.wall.x0, plan.wall.height, .26)
  wall.add((doorA.x + doorA.width / 2 + doorB.x - doorB.width / 2) / 2, plan.wall.height / 2, wallZ, doorB.x - doorB.width / 2 - (doorA.x + doorA.width / 2), plan.wall.height, .26)
  wall.add((doorB.x + doorB.width / 2 + plan.wall.x1) / 2, plan.wall.height / 2, wallZ, plan.wall.x1 - (doorB.x + doorB.width / 2), plan.wall.height, .26)
  wall.add((plan.wall.x0 + plan.wall.x1) / 2, top + doorA.height + (plan.wall.height - top - doorA.height) / 2, wallZ, plan.wall.x1 - plan.wall.x0, plan.wall.height - top - doorA.height, .26)
  for (const door of plan.doors) {
    doors.add(door.x, door.height / 2 + top, door.z, door.width, door.height, .12)
    doors.add(door.x, top + .04, platform.z0 + .22, door.width - .35, .08, .8)
  }
  const segment = (x, y, z, horizontal) => yellow.add(x, y, z, horizontal ? .18 : .05, horizontal ? .05 : .18, .01)
  const digit = (value, cx, y, z) => {
    const parts = { 0: 'abcedf', 1: 'bc', 2: 'abged', }
    const points = { a: [0, .14, true], b: [.11, .07, false], c: [.11, -.07, false], d: [0, -.14, true], e: [-.11, -.07, false], f: [-.11, .07, false], g: [0, 0, true] }
    for (const key of parts[value]) segment(cx + points[key][0], y + points[key][1], z, points[key][2])
  }
  for (const door of plan.doors) {
    const labelZ = wallZ - .14
    digit(0, door.x - .13, door.height + top + .23, labelZ)
    digit(door.id === '01' ? 1 : 2, door.x + .13, door.height + top + .23, labelZ)
  }
  // 白色厢式车：货箱与驾驶室分界明确，四个圆柱轮胎与车体不互穿。
  white.add(truck.x, 1.8, truck.z + .48, truck.width, 2.2, 3.82)
  white.add(truck.x, 1.37, truck.z - 2.08, truck.width, 1.3, 1.5)
  dark.add(truck.x, 1.48, truck.z - 2.83, 1.68, .48, .05)
  for (const side of [-1, 1]) {
    dark.add(truck.x + side * 1.255, 1.1, truck.z - 2.05, .035, .62, 1.08)
  }
  for (const z of [-1.7, 1.22]) for (const x of [-.94, .94]) {
    wheels.add(truck.x + x, truck.wheelRadius, truck.z + z, truck.wheelRadius, .3, truck.wheelRadius, 0, 0, Math.PI / 2)
  }
  // 右侧防坠护栏位于平台顶面，通向月台外的安全边缘。
  const rail = plan.rail
  for (const x of [rail.x0, (rail.x0 + rail.x1) / 2, rail.x1]) steel.add(x, top + rail.height / 2, rail.z, .1, rail.height, .1)
  steel.add((rail.x0 + rail.x1) / 2, top + rail.height - .1, rail.z, rail.x1 - rail.x0, .1, .1)
  steel.add((rail.x0 + rail.x1) / 2, top + .48, rail.z, rail.x1 - rail.x0, .08, .08)
  const marking = plan.marking
  for (let z = marking.z0; z < marking.z1; z += low ? 1.5 : .9) yellow.add(marking.x0, .012, z, .12, .024, low ? .7 : .45)
  yellow.add((marking.x0 + marking.x1) / 2, .014, marking.z1, marking.x1 - marking.x0, .028, .12)
  // 可见托盘和纸箱全部落在平台顶面之上，叉车停在右侧，不侵占车辆靠门位。
  timber.add(plan.cargo.x, top + .075, plan.cargo.z, 1.5, .15, 1.15)
  for (const [x, z, h] of [[-.4, -.3, .58], [.4, -.3, .72], [-.4, .3, .5], [.4, .3, .64]]) {
    timber.add(plan.cargo.x + x, top + .15 + h / 2, plan.cargo.z + z, .68, h, .5)
  }
  const fork = plan.forklift
  forklift.add(fork.x, .325, fork.z, 1.35, .65, 1.55)
  forklift.add(fork.x, 1.22, fork.z + .35, .12, 1.12, .12)
  forklift.add(fork.x, .5, fork.z - 1.02, .72, .07, .85)
  for (const x of [-.5, .5]) for (const z of [-.52, .52]) wheels.add(fork.x + x, .16, fork.z + z, .16, .3, .16, 0, 0, Math.PI / 2)
  steel.add(fork.x, 1.58, fork.z + .35, .95, .08, .08)

  for (const batch of [concrete, wall, doors, white, dark, wheels, steel, yellow, timber, forklift]) {
    batch.finish()
    group.add(batch.mesh)
  }
  root.add(group)
  let disposed = false
  const summary = () => {
    let calls = 0, triangles = 0
    group.traverse(node => {
      if (!node.isMesh || !node.visible || !node.count) return
      calls++
      triangles += ((node.geometry.index?.count || node.geometry.attributes.position.count) / 3) * node.count
    })
    return {
      module: 'vis2-dock-sample',
      preview: '候选静态预览，非部署',
      baseY,
      quality: low ? 'low' : 'high',
      calls,
      triangles: Math.round(triangles),
      plan,
      resources: { meshes: calls, materials: 10, textures: 0, animationLoops: 0, businessRequests: 0 },
      batches: Object.fromEntries(group.children.filter(node => node.isInstancedMesh).map(node => [node.name, { count: node.count, capacity: node.instanceMatrix.count }])),
    }
  }
  return {
    group,
    summary,
    dispose() {
      if (disposed) return
      disposed = true
      for (const batch of [concrete, wall, doors, white, dark, wheels, steel, yellow, timber, forklift]) batch.dispose()
      group.removeFromParent()
    },
  }
}
