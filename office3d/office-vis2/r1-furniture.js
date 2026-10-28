import { r1ToWorld } from '../office-r1-layout.js'

const FURNITURE = new Set([
  '办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子',
  '书架', '共享显示站', '协作桌', '咖啡台', '弧形接待台', '弧形座段',
  '弧形沙发段', '室外长椅', '吧凳',
])
const SOLID = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '吧凳'])
const COLOR = Object.freeze({
  办公桌: '#9a7650', 办公椅: '#333b44', 显示器: '#18242d', 端柜: '#765f45',
  桌间屏风: '#4f6670', 会议桌: '#8f6d49', 圆桌: '#917250', 椅子: '#3e4b50',
  书架: '#765f45', 共享显示站: '#1d2b34', 协作桌: '#92704c', 咖啡台: '#80694e',
  弧形接待台: '#8f7353', 弧形座段: '#66706c', 弧形沙发段: '#66706c', 室外长椅: '#725c43',
  吧凳: '#4d4640',
})

const key = (x, z) => `${x},${z}`
const yawFor = item => -Number(item.yawDeg || 0) * Math.PI / 180
const dimensions = item => ({
  x: Math.max(.02, Number(item.lengthM) || .1),
  y: Math.max(.02, Number(item.heightM) || .1),
  z: Math.max(.02, Number(item.widthM) || .1),
})

function instanceBatch(THREE, category, items) {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: COLOR[category] || '#777777', roughness: .72 })
  const mesh = new THREE.InstancedMesh(geometry, material, items.length)
  mesh.name = `r1-${category}`
  mesh.userData.instanceIds = items.map(item => item.id)
  const transform = new THREE.Object3D()
  items.forEach((item, index) => {
    const world = r1ToWorld(item.xM, item.yM), size = dimensions(item)
    transform.position.set(world.x, (Number(item.zM) || 0) + size.y / 2, world.z)
    transform.rotation.set(0, yawFor(item), 0)
    transform.scale.set(size.x, size.y, size.z)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function collisionProxy(THREE, item) {
  const world = r1ToWorld(item.xM, item.yM), size = dimensions(item)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z))
  proxy.name = `r1-collision-${item.id}`
  proxy.position.set(world.x, (Number(item.zM) || 0) + size.y / 2, world.z)
  proxy.rotation.y = yawFor(item)
  proxy.visible = false
  proxy.userData = { r1Id: item.id, collisionProxy: true }
  return proxy
}

function screenHandle(THREE, makeScreenTexture, desk) {
  const group = new THREE.Group()
  group.name = `r1-desk-${desk.business_id}`
  group.position.set(desk.x, 0, desk.z)
  group.userData = { r1DeskId: desk.desk_id, r1ChairId: desk.chair_id }
  const scr = makeScreenTexture()
  return { group, scr }
}

function screenAtlas(THREE, stations, makeScreenTexture) {
  const atlas = makeScreenTexture(), grid = Math.ceil(Math.sqrt(stations.length)), width = 256, height = 144
  if (atlas.ctx?.canvas) { atlas.ctx.canvas.width = grid * width; atlas.ctx.canvas.height = grid * height; atlas.tex.needsUpdate = true }
  const positions = [], uvs = [], indices = []
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM), chair = r1ToWorld(station.chairXM, station.chairYM)
    const yaw = Math.atan2(-(desk.x - chair.x), -(desk.z - chair.z)), half = .25, y0 = .81, y1 = 1.11
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) }, offset = index * 4
    positions.push(desk.x - right.x * half, y0, desk.z - right.z * half, desk.x + right.x * half, y0, desk.z + right.z * half, desk.x + right.x * half, y1, desk.z + right.z * half, desk.x - right.x * half, y1, desk.z - right.z * half)
    const col = index % grid, row = Math.floor(index / grid), u0 = col / grid, u1 = (col + 1) / grid, v0 = row / grid, v1 = (row + 1) / grid
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1); indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false }))
  mesh.name = 'r1-workstation-screen-atlas'
  const connect = (scr, index) => {
    scr.tex.dispose?.()
    const col = index % grid, row = Math.floor(index / grid)
    scr.tex = { set needsUpdate(value) { if (value && atlas.ctx?.drawImage) { atlas.ctx.drawImage(scr.ctx.canvas, col * width, row * height); atlas.tex.needsUpdate = true } }, dispose() {} }
  }
  return { atlas, mesh, connect }
}

function badgeBatch(THREE, stations) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .06, .012, 6), new THREE.MeshBasicMaterial({ toneMapped:false }), stations.length)
  mesh.name = 'r1-workstation-badges'
  const transform = new THREE.Object3D()
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM)
    transform.position.set(desk.x + .3, .8, desk.z); transform.rotation.set(Math.PI / 2, 0, 0); transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, new THREE.Color(0xffffff))
  })
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true
  return mesh
}

// R1 owns its procedural furniture root; dynamic screens stay per active workstation,
// while all static registered furniture is instanced by material/category.
export function buildR1Furniture({ THREE, root, layout, collision, makeScreenTexture }) {
  if (layout?.r1Phase !== 'R1' || typeof makeScreenTexture !== 'function') return { deskAt() { return null }, dispose() {} }
  const group = new THREE.Group()
  group.name = 'r1-furniture'
  group.userData.dynamic = true
  // 07 is the central island and its fourteen stools are owned by I4; the five
  // registered stools outside that island are ordinary I3 furniture.
  const items = layout.r1.elements.filter(item => FURNITURE.has(item.category) && !(item.category === '吧凳' && item.regionId === '07'))
  const byCategory = new Map()
  for (const item of items) byCategory.set(item.category, [...(byCategory.get(item.category) || []), item])
  const batches = []
  for (const [category, rows] of byCategory) {
    const batch = instanceBatch(THREE, category, rows)
    group.add(batch)
    batches.push(batch)
  }

  const proxies = []
  for (const item of items) if (SOLID.has(item.category)) {
    const proxy = collisionProxy(THREE, item)
    group.add(proxy)
    collision?.add(proxy, item.category)
    proxies.push(proxy)
  }

  const proxyById = new Map(proxies.map(proxy => [proxy.userData.r1Id, proxy]))
  const handles = new Map()
  const stations = layout.r1.workstations, screens = screenAtlas(THREE, stations, makeScreenTexture), badges = badgeBatch(THREE, stations)
  group.add(screens.mesh, badges)
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM)
    const handle = screenHandle(THREE, makeScreenTexture, { ...station, ...desk })
    screens.connect(handle.scr, index)
    handle.chair = proxyById.get(station.chair_id)
    handle.setBadge = color => { badges.setColorAt(index, new THREE.Color(color)); badges.instanceColor.needsUpdate = true }
    group.add(handle.group)
    handles.set(key(desk.x, desk.z), handle)
  })
  root.add(group)

  let disposed = false
  return {
    root: group,
    instanceIds: Object.freeze(Object.fromEntries(batches.map(batch => [batch.name, Object.freeze([...batch.userData.instanceIds])]))),
    deskAt(x, z) { return handles.get(key(x, z)) || null },
    dispose() {
      if (disposed) return
      disposed = true
      for (const proxy of proxies) collision?.remove?.(proxy)
      for (const handle of handles.values()) {
        handle.scr.tex.dispose?.()
      }
      screens.mesh.geometry.dispose(); screens.mesh.material.dispose(); screens.atlas.tex.dispose?.()
      badges.geometry.dispose(); badges.material.dispose()
      for (const batch of batches) { batch.geometry.dispose(); batch.material.dispose() }
      group.removeFromParent()
    },
  }
}
