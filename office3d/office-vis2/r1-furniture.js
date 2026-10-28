import { r1ToWorld } from '../office-r1-layout.js'
import { monitorScreenFit, workstationDesktop } from '../office-furniture-v2.js'

const FURNITURE = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '书架', '共享显示站', '协作桌', '咖啡台', '弧形接待台', '弧形座段', '弧形沙发段', '室外长椅', '吧凳'])
const SOLID = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '吧凳'])
const MODEL = Object.freeze({ 办公桌: 'desk', 办公椅: 'chairDesk', 显示器: 'computerScreen', 会议桌: 'table', 椅子: 'chairModernCushion', 书架: 'bookcaseOpen', 共享显示站: 'cabinetTelevision', 协作桌: 'table', 咖啡台: 'table', 吧凳: 'chairRounded' })
const COLOR = Object.freeze({ wood: '#9a7650', fabric: '#66706c', trim: '#4f6670', dark: '#3e4b50', screen: '#18242d' })
const key = (x, z) => `${x},${z}`
const yawFor = item => -Number(item.yawDeg || 0) * Math.PI / 180
const dimensions = item => ({ x: Math.max(.02, Number(item.lengthM) || .1), y: Math.max(.02, Number(item.heightM) || .1), z: Math.max(.02, Number(item.widthM) || .1) })
const bucketFor = item => item.category === '显示器' || item.category === '共享显示站' ? 'screen' : item.category === '办公椅' || item.category === '椅子' || item.category === '弧形座段' || item.category === '弧形沙发段' || item.category === '吧凳' ? 'fabric' : item.category === '桌间屏风' ? 'trim' : 'wood'

function mergeGeometries(THREE, geometries) {
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'color']) {
    const length = geometries.reduce((sum, item) => sum + item.attributes[name].array.length, 0), values = new Float32Array(length)
    let offset = 0
    for (const item of geometries) { values.set(item.attributes[name].array, offset); offset += item.attributes[name].array.length }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, 3))
  }
  return geometry
}

function cleanGeometry(THREE, geometry, color) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const copy = new THREE.BufferGeometry(), position = source.getAttribute('position'), normal = source.getAttribute('normal')
  copy.setAttribute('position', position.clone())
  if (normal) copy.setAttribute('normal', normal.clone()); else copy.computeVertexNormals()
  const colors = new Float32Array(copy.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
  copy.setAttribute('color', new THREE.BufferAttribute(colors, 3)); source.dispose()
  return copy
}
function bake(THREE, target, group, bucket, color) {
  group.updateWorldMatrix(true, true)
  group.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    target.get(bucket).push(cleanGeometry(THREE, geometry, color))
  })
}
function fallbackBox(THREE, x, z, size, yaw, bucket, color, target) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z))
  mesh.position.set(x, size.y / 2, z); mesh.rotation.y = yaw; bake(THREE, target, mesh, bucket, color)
  return mesh
}
function screenAtlas(THREE, stations, makeScreenTexture) {
  const atlas = makeScreenTexture(), grid = Math.ceil(Math.sqrt(stations.length)), width = 256, height = 144
  if (atlas.ctx?.canvas) { atlas.ctx.canvas.width = grid * width; atlas.ctx.canvas.height = grid * height; atlas.tex.needsUpdate = true }
  const positions = [], uvs = [], indices = []
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM), chair = r1ToWorld(station.chairXM, station.chairYM), yaw = Math.atan2(-(desk.x - chair.x), -(desk.z - chair.z))
    const fit = monitorScreenFit({ ...workstationDesktop({ x: desk.x, z: desk.z, yaw }).monitor, y: .76, yaw }), right = { x: Math.cos(fit.yaw), z: -Math.sin(fit.yaw) }, half = fit.width / 2, top = fit.height / 2, offset = index * 4
    positions.push(fit.center.x - right.x * half, fit.center.y - top, fit.center.z - right.z * half, fit.center.x + right.x * half, fit.center.y - top, fit.center.z + right.z * half, fit.center.x + right.x * half, fit.center.y + top, fit.center.z + right.z * half, fit.center.x - right.x * half, fit.center.y + top, fit.center.z - right.z * half)
    const col = index % grid, row = Math.floor(index / grid), u0 = col / grid, u1 = (col + 1) / grid, v0 = row / grid, v1 = (row + 1) / grid
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1); indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
  })
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false })); mesh.name = 'r1-workstation-screen-atlas'
  const connect = (scr, index) => { scr.tex.dispose?.(); const col = index % grid, row = Math.floor(index / grid); scr.tex = { set needsUpdate(value) { if (value && atlas.ctx?.drawImage) { atlas.ctx.drawImage(scr.ctx.canvas, col * width, row * height); atlas.tex.needsUpdate = true } }, dispose() {} } }
  return { atlas, mesh, connect }
}
function badgeBatch(THREE, stations) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .06, .012, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), stations.length), transform = new THREE.Object3D()
  mesh.name = 'r1-workstation-badges'
  stations.forEach((station, index) => { const desk = r1ToWorld(station.xM, station.yM); transform.position.set(desk.x + .3, .8, desk.z); transform.rotation.set(Math.PI / 2, 0, 0); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, new THREE.Color(0xffffff)) })
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true
  return mesh
}

// R1 furniture is baked by material bucket: detailed GLB assets without a draw call per record.
export function buildR1Furniture({ THREE, root, layout, collision, makeScreenTexture, A, placeFurniture }) {
  if (layout?.r1Phase !== 'R1' || typeof makeScreenTexture !== 'function' || !A?.furn || typeof placeFurniture !== 'function') return { deskAt() { return null }, dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-furniture'; group.userData.dynamic = true
  const items = layout.r1.elements.filter(item => FURNITURE.has(item.category) && !(item.regionId === '07' && ['吧凳', '弧形座段'].includes(item.category)))
  const buckets = new Map(Object.keys(COLOR).map(name => [name, []])), collisionGroups = [], ids = new Map(), itemBounds = new Map(), chairModels = new Map(), itemCategories = new Map()
  const chairYaw = new Map(layout.r1.workstations.map(station => [station.chair_id, layout.seats[station.business_id][4].yaw + Math.PI]))
  const stationByDesk = new Map(layout.r1.workstations.map(station => [station.desk_id, station]))
  const addAsset = (name, item, bucket = bucketFor(item), size = dimensions(item), yaw = yawFor(item), placement = {}) => {
    const world = placement.world || r1ToWorld(item.xM, item.yM), f = placeFurniture(A, name, world.x, world.z, { scale: 1, y: placement.y ?? (Number(item.zM) || 0), rotY: yaw })
    f.group.scale.set(size.x / f.size.x, size.y / f.size.y, size.z / f.size.z); f.group.name = `r1-source-${item.id}`; f.group.userData.r1Id = item.id
    f.group.updateWorldMatrix(true, true); itemBounds.set(item.id, new THREE.Box3().setFromObject(f.group)); itemCategories.set(item.id, item.category)
    if (item.category === '办公椅') chairModels.set(item.id, f.group)
    bake(THREE, buckets, f.group, bucket, new THREE.Color(COLOR[bucket]))
    if (SOLID.has(item.category)) { collision?.add(f.group, item.category); collisionGroups.push(f.group) }
    return f.group
  }
  for (const item of items) {
    const bucket = bucketFor(item), model = MODEL[item.category], size = dimensions(item)
    ids.set(item.category, [...(ids.get(item.category) || []), item.id])
    if (item.category === '圆桌') {
      const world = r1ToWorld(item.xM, item.yM), radius = Math.min(size.x, size.z) / 2, disk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .06, 32))
      disk.position.set(world.x, size.y, world.z); bake(THREE, buckets, disk, bucket, new THREE.Color(COLOR[bucket])); disk.geometry.dispose(); addAsset('table', item, bucket); continue
    }
    if (item.category === '显示器' && stationByDesk.has(item.parentId)) {
      const station = stationByDesk.get(item.parentId), desk = r1ToWorld(station.xM, station.yM), yaw = layout.seats[station.business_id][4].yaw
      addAsset(model, item, bucket, { x: .66, y: .46, z: .16 }, yaw, { world: workstationDesktop({ x: desk.x, z: desk.z, yaw }).monitor, y: .76 }); continue
    }
    if (model) { addAsset(model, item, bucket, item.category === '办公椅' ? { x: .62, y: 1.04, z: .6 } : size, chairYaw.get(item.id) ?? yawFor(item)); continue }
    const world = r1ToWorld(item.xM, item.yM), fallback = fallbackBox(THREE, world.x, world.z, size, chairYaw.get(item.id) ?? yawFor(item), bucket, new THREE.Color(COLOR[bucket]), buckets)
    fallback.name = `r1-source-${item.id}`; fallback.userData.r1Id = item.id
    fallback.updateWorldMatrix(true, true); itemBounds.set(item.id, new THREE.Box3().setFromObject(fallback)); itemCategories.set(item.id, item.category)
    if (SOLID.has(item.category)) { collision?.add(fallback, item.category); collisionGroups.push(fallback) }
  }
  const materials = [], merged = []
  for (const [bucket, geometries] of buckets) {
    if (!geometries.length) continue
    const geometry = mergeGeometries(THREE, geometries); geometries.forEach(value => value.dispose())
    if (!geometry) throw new Error(`R1 家具合批失败: ${bucket}`)
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: bucket === 'screen' ? .35 : .72, metalness: bucket === 'screen' ? .18 : .02 }), mesh = new THREE.Mesh(geometry, material)
    mesh.name = `r1-furniture-${bucket}`; mesh.userData.itemIds = items.filter(item => bucketFor(item) === bucket).map(item => item.id); group.add(mesh); materials.push(material); merged.push(mesh)
  }
  const stations = layout.r1.workstations, screens = screenAtlas(THREE, stations, makeScreenTexture), badges = badgeBatch(THREE, stations), handles = new Map()
  group.add(screens.mesh, badges)
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM), chair = r1ToWorld(station.chairXM, station.chairYM), anchor = new THREE.Group(), scr = makeScreenTexture()
    anchor.name = `r1-desk-${station.business_id}`; anchor.position.set(desk.x, 0, desk.z); anchor.userData = { r1DeskId: station.desk_id, r1ChairId: station.chair_id }; group.add(anchor); screens.connect(scr, index)
    const chairAnchor = new THREE.Group(); chairAnchor.name = `r1-chair-${station.chair_id}`; chairAnchor.position.set(chair.x, 0, chair.z); chairAnchor.rotation.y = chairYaw.get(station.chair_id) ?? 0
    handles.set(key(desk.x, desk.z), { group: anchor, scr, chair: chairAnchor, setBadge(color) { badges.setColorAt(index, new THREE.Color(color)); badges.instanceColor.needsUpdate = true } })
  })
  root.add(group); let disposed = false
  return { root: group, instanceIds: Object.freeze(Object.fromEntries([...ids].map(([category, value]) => [`r1-${category}`, Object.freeze(value)]))), itemBounds, itemCategories, chairAt(x, z) { const station = stations.find(value => { const chair = r1ToWorld(value.chairXM, value.chairYM); return chair.x === x && chair.z === z }); return station ? chairModels.get(station.chair_id) || null : null }, deskAt(x, z) { return handles.get(key(x, z)) || null }, dispose() { if (disposed) return; disposed = true; collisionGroups.forEach(value => collision?.remove?.(value)); handles.forEach(handle => handle.scr.tex.dispose?.()); screens.mesh.geometry.dispose(); screens.mesh.material.dispose(); screens.atlas.tex.dispose?.(); badges.geometry.dispose(); badges.material.dispose(); merged.forEach(mesh => mesh.geometry.dispose()); materials.forEach(material => material.dispose()); group.removeFromParent() } }
}
