import { r1ToWorld } from '../office-r1-layout.js'

// R1 小物件（OFFICE-R1-I6B）：沿用仓库里旧版办公室的小物件模型，按 R1 分区落位。
// 这些件不在 R1 登记表里，坐标与朝向是本卡的 DESIGN_ASSUMPTION；每个位置都用真实碰撞网格、
// 17 条路线中心线（H2：半径 .6 / 高 2.1）和门扇扫掠盘校验过，见 tests/office-r1-decor.test.mjs。
// rotYDeg 是运行时绕 Y 轴的旋转角（度），不是登记表的罗盘 yaw_deg，不走 r1 的 yaw 换算。
export const R1_DECOR = Object.freeze([
  // 门口衣帽架（区 11 前台与等候区，入口内侧、避开入口与 10-D-001 的门扇扫掠）
  { id: '11-DC-COAT-001', regionId: '11', model: 'coatRack', xM: 22.5, yM: 6.8, rotYDeg: 90, collide: true },
  // 每组工位一只垃圾桶
  { id: '01-DC-BIN-001', regionId: '01', model: 'trashcan', xM: 1.8, yM: 35.5, rotYDeg: 0, collide: true },
  { id: '04-DC-BIN-001', regionId: '04', model: 'trashcan', xM: 32, yM: 34.6, rotYDeg: 0, collide: true },
  { id: '05-DC-BIN-001', regionId: '05', model: 'trashcan', xM: 54.3, yM: 35.5, rotYDeg: 0, collide: true },
  { id: '06-DC-BIN-001', regionId: '06', model: 'trashcan', xM: 2.6, yM: 11.8, rotYDeg: 0, collide: true },
  { id: '08-DC-BIN-001', regionId: '08', model: 'trashcan', xM: 39.5, yM: 12.3, rotYDeg: 0, collide: true },
  { id: '09-DC-BIN-001', regionId: '09', model: 'trashcan', xM: 1.83, yM: 4.83, rotYDeg: 0, collide: true },
  { id: '13-DC-BIN-001', regionId: '13', model: 'trashcan', xM: 54.2, yM: 4.9, rotYDeg: 0, collide: true },
  // 会议室音箱（区 02 会议与决策，会议桌东南角）
  { id: '02-DC-SPK-001', regionId: '02', model: 'speaker', xM: 17.4, yM: 41.4, rotYDeg: 0, collide: true },
  // 咖啡区与休闲区落地灯
  { id: '10-DC-LAMP-001', regionId: '10', model: 'lampSquareFloor', xM: 8.4, yM: 4.9, rotYDeg: 0, collide: true },
  { id: '12-DC-LAMP-001', regionId: '12', model: 'lampSquareFloor', xM: 48.1, yM: 4.4, rotYDeg: 0, collide: true },
  // 休闲区边几与地毯（区 12，弧形沙发东侧的空档）
  { id: '12-DC-SIDE-001', regionId: '12', model: 'sideTable', xM: 46.3, yM: 4.4, rotYDeg: 90, collide: true },
  // 地毯是地面饰面（高 .02 m）：按设计铺在边几与落地灯下面，不注入碰撞，不挡行人
  { id: '12-DC-RUG-001', regionId: '12', model: 'rugRectangle', xM: 46.9, yM: 4.4, rotYDeg: 0, collide: false },
].map(Object.freeze))

// R1 的门 open_motion 全是 UNVERIFIED，算不出真实开启方向。保守口径：每扇门两叶，
// 每叶长 = 净宽 / 2，以两侧门樘为圆心取整圆（不分内外开），返回点到最近扫掠盘外沿的余量。
export function r1DoorSweepMargin(layout, worldX, worldZ) {
  let margin = Infinity
  for (const frame of layout?.r1?.data?.doorTargetFrames || []) {
    if (!frame.a_m || !frame.b_m) continue
    const reach = frame.clear_target_m / 2
    for (const point of [frame.a_m, frame.b_m]) margin = Math.min(margin, Math.hypot(worldX - (point[0] - 26), worldZ - (18 - point[1])) - reach)
  }
  return margin
}

// 合批时保留每个源材质自己的颜色（旧版小物件的配色），用顶点色换成一个 draw call。
function bakedGeometry(THREE, mesh) {
  // clone / toNonIndexed 都是新几何；源 GLB 的几何由 assets3d 共享，这里不碰也不释放。
  const baked = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  baked.applyMatrix4(mesh.matrixWorld)
  if (!baked.attributes.normal) baked.computeVertexNormals()
  const color = mesh.material?.color || { r: 1, g: 1, b: 1 }, colors = new Float32Array(baked.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
  baked.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  for (const name of Object.keys(baked.attributes)) if (!['position', 'normal', 'color'].includes(name)) baked.deleteAttribute(name)
  return baked
}

function mergeGeometries(THREE, geometries) {
  const merged = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'color']) {
    const length = geometries.reduce((sum, item) => sum + item.attributes[name].array.length, 0), values = new Float32Array(length)
    let offset = 0
    for (const item of geometries) { values.set(item.attributes[name].array, offset); offset += item.attributes[name].array.length }
    merged.setAttribute(name, new THREE.BufferAttribute(values, 3))
  }
  return merged
}

export function buildR1Decor({ THREE, root, layout, A, placeFurniture, collision }) {
  if (layout?.r1Phase !== 'R1' || !A?.furn || typeof placeFurniture !== 'function') return { items: [], proxies: [], summary: () => ({ calls: 0, triangles: 0, items: 0 }), dispose() {} }
  const group = new THREE.Group()
  group.name = 'r1-decor'
  group.userData.dynamic = true
  const geometries = [], items = [], proxies = []
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const row of R1_DECOR) {
    if (!A.furn[row.model]) throw new Error(`R1 小物件缺少模型 ${row.model}`)
    const world = r1ToWorld(row.xM, row.yM), rotY = (row.rotYDeg * Math.PI) / 180
    const placed = placeFurniture(A, row.model, world.x, world.z, { rotY })
    placed.group.name = `r1-decor-source-${row.id}`
    placed.group.userData.r1DecorId = row.id
    placed.group.updateWorldMatrix(true, true)
    const meshes = []
    placed.group.traverse(mesh => { if (mesh.isMesh && mesh.geometry?.attributes.position) meshes.push(mesh) })
    const bounds = new THREE.Box3().setFromObject(placed.group)
    for (const mesh of meshes) geometries.push(bakedGeometry(THREE, mesh))
    items.push({ id: row.id, regionId: row.regionId, model: row.model, position: world, rotY, bounds, size: bounds.getSize(new THREE.Vector3()), meshes })
    if (!row.collide) continue
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), proxyMaterial)
    proxy.position.copy(center)
    proxy.name = `r1-decor-collision-${row.id}`
    proxy.visible = false
    proxy.userData = { collisionProxy: true, r1DecorId: row.id }
    proxy.updateWorldMatrix(true, true)
    collision?.add(proxy, row.model)
    proxies.push(proxy)
  }
  const merged = mergeGeometries(THREE, geometries)
  geometries.forEach(geometry => geometry.dispose())
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .74, metalness: .03 })
  const mesh = new THREE.Mesh(merged, material)
  mesh.name = 'r1-decor-batch'
  mesh.userData.itemIds = items.map(item => item.id)
  mesh.castShadow = mesh.receiveShadow = true
  group.add(mesh)
  root.add(group)
  const triangles = merged.attributes.position.count / 3
  let disposed = false
  return {
    root: group,
    items,
    proxies,
    summary: () => ({ calls: 1, triangles, items: items.length }),
    dispose() {
      if (disposed) return
      disposed = true
      proxies.forEach(proxy => { collision?.remove?.(proxy); proxy.geometry.dispose() })
      proxyMaterial.dispose()
      merged.dispose()
      material.dispose()
      group.removeFromParent()
    },
  }
}
