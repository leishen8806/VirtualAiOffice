// VIS-ALIGN W-V1：独立装卸月台样板。它不注册到主场景，也不创建动画、请求或业务状态。
// 全部局部 Y 坐标以完成面为 0；集成方必须显式传入 CAMPUS_FINISHED_FLOOR_Y。

const COLORS = Object.freeze({
  concrete: 0xb9b8b2,
  white: 0xe7eceb,
  window: 0x35535e,
  tire: 0x22282b,
  steel: 0x647078,
  yellow: 0xe5b13f,
  safety: 0xf6f1df,
  pallet: 0xa97848,
  cargo: 0xc99d63,
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
    platform: Object.freeze({ x0: centerX - 8, x1: centerX + 8, z0: dockZ, z1: dockZ + 2.4 }),
    truck: Object.freeze({ x: centerX - 2.8, z: dockZ - 3.25, width: 2.45, length: 5.6, height: 2.55 }),
    rail: Object.freeze({ x0: centerX + 4.4, x1: centerX + 7.4, z: dockZ - .4 }),
    marking: Object.freeze({ x0: centerX - 6.8, x1: centerX + 1.2, z0: dockZ - 6.15, z1: dockZ - .25 }),
    cargo: Object.freeze({ x: centerX + 2.2, z: dockZ + 1.3 }),
  })
}

function createBatch(THREE, name, color, capacity) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .15 }),
    capacity,
  )
  mesh.name = name
  mesh.count = 0
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  return {
    mesh,
    add(x, y, z, sx, sy, sz) {
      matrix.compose(position.set(x, y, z), rotation.identity(), scale.set(sx, sy, sz))
      mesh.setMatrixAt(mesh.count++, matrix)
    },
    finish() {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
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
  const concrete = createBatch(THREE, 'vis2-dock-concrete', COLORS.concrete, 4)
  const white = createBatch(THREE, 'vis2-dock-white-vehicle', COLORS.white, 4)
  const dark = createBatch(THREE, 'vis2-dock-dark-details', COLORS.window, 8)
  const steel = createBatch(THREE, 'vis2-dock-safety-rails', COLORS.steel, 12)
  const yellow = createBatch(THREE, 'vis2-dock-markings', COLORS.yellow, low ? 8 : 16)
  const timber = createBatch(THREE, 'vis2-dock-cargo', COLORS.pallet, 8)

  const platform = plan.platform, truck = plan.truck
  concrete.add((platform.x0 + platform.x1) / 2, .2, (platform.z0 + platform.z1) / 2, platform.x1 - platform.x0, .4, platform.z1 - platform.z0)
  concrete.add(plan.cargo.x, .075, plan.cargo.z, 1.4, .15, 1.1)
  // 白色厢式车：货箱、驾驶室、挡风玻璃与四轮分批合并，避免每个零件一个 draw call。
  white.add(truck.x, 1.55, truck.z + .45, truck.width, 2.35, 3.9)
  white.add(truck.x, 1.08, truck.z - 2.05, truck.width, 1.42, 1.55)
  dark.add(truck.x, 1.55, truck.z - 2.82, 1.7, .72, .04)
  for (const side of [-1, 1]) {
    dark.add(truck.x + side * 1.26, .42, truck.z - 1.85, .22, .46, .55)
    dark.add(truck.x + side * 1.26, .42, truck.z + 1.2, .22, .46, .55)
  }
  for (const z of [-1.7, 1.25]) for (const x of [-.9, .9]) dark.add(truck.x + x, .32, truck.z + z, .38, .64, .64)
  // 右侧防坠护栏与黄黑可视边线。
  const rail = plan.rail
  for (const x of [rail.x0, (rail.x0 + rail.x1) / 2, rail.x1]) steel.add(x, .72, rail.z, .1, 1.44, .1)
  steel.add((rail.x0 + rail.x1) / 2, 1.24, rail.z, rail.x1 - rail.x0, .1, .1)
  steel.add((rail.x0 + rail.x1) / 2, .6, rail.z, rail.x1 - rail.x0, .08, .08)
  const marking = plan.marking
  for (let z = marking.z0; z < marking.z1; z += low ? 1.5 : .9) yellow.add(marking.x0, .012, z, .12, .024, low ? .7 : .45)
  yellow.add((marking.x0 + marking.x1) / 2, .014, marking.z1, marking.x1 - marking.x0, .028, .12)
  for (const [x, z] of [[-.4, -.3], [.4, -.3], [-.4, .3], [.4, .3]]) timber.add(plan.cargo.x + x, .5, plan.cargo.z + z, .72, .7, .52)

  for (const batch of [concrete, white, dark, steel, yellow, timber]) {
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
      resources: { meshes: calls, materials: 6, textures: 0, animationLoops: 0, businessRequests: 0 },
    }
  }
  return {
    group,
    summary,
    dispose() {
      if (disposed) return
      disposed = true
      for (const batch of [concrete, white, dark, steel, yellow, timber]) batch.dispose()
      group.removeFromParent()
    },
  }
}
