import { r1ToWorld, isReservedDesk } from '../office-r1-layout.js'
import { monitorPanelFit, workstationDesktop } from '../office-furniture-v2.js'

const FURNITURE = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '书架', '共享显示站', '协作桌', '咖啡台', '弧形接待台', '弧形座段', '弧形沙发段', '室外长椅', '吧凳'])
const SOLID = new Set(['办公桌', '办公椅', '显示器', '端柜', '桌间屏风', '会议桌', '圆桌', '椅子', '吧凳'])
const MODEL = Object.freeze({ 办公桌: 'desk', 办公椅: 'chairDesk', 显示器: 'computerScreen', 会议桌: 'table', 椅子: 'chairModernCushion', 书架: 'bookcaseOpen', 共享显示站: 'cabinetTelevision', 协作桌: 'table', 咖啡台: 'table', 吧凳: 'chairRounded' })
const COLOR = Object.freeze({ wood: '#9a7650', fabric: '#66706c', trim: '#4f6670', dark: '#3e4b50', screen: '#18242d' })
const key = (x, z) => `${x},${z}`

// R7: fixed seat/hand heights (metres), certified at every source key and at least 30 Hz.
export const R1_SEATED_PROFILES = Object.freeze(Object.fromEntries([
  ['OpsLead', 0.076, 0.842, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['OpsEngineer', 0.065, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['QAAutomation', 0.076, 0.842, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['Reviewer1', -0.026, 0.82, ['neutral_01', 'neutral_02']],
  ['Reviewer2', 0.075, 0.841, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['SecurityReviewer', 0.072, 0.841, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['Lead', 0.076, 0.84, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['PM', 0.053, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['Architect', 0.078, 0.839, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['UIUX', 0.075, 0.84, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['FrontendSenior', 0.08, 0.838, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['Frontend1', 0.075, 0.836, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['Frontend2', 0.017, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['BackendSenior', 0.08, 0.84, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['Backend1', 0.062, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['Backend2', 0.075, 0.84, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['KnowledgeKeeper', 0, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['GoSenior', 0.07, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['Go1', 0.06, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['Go2', 0.074, 0.839, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['DBEngineer', 0.017, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['LedgerAuditor', 0.005, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['ReactSenior', 0.079, 0.842, ['neutral_01', 'nervous_01', 'neutral_02']],
  ['React1', 0, 0.82, ['neutral_01', 'waiting_01', 'neutral_02']],
  ['Localizer', 0.079, 0.84, ['neutral_01', 'nervous_01', 'neutral_02']],
].map(([name, seat, handY, motions]) => [name, Object.freeze({ seat, handY, motions: Object.freeze(motions) })])))
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
function bake(THREE, target, group, bucket, color, preserveColor = false) {
  group.updateWorldMatrix(true, true)
  group.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    target.get(bucket).push(cleanGeometry(THREE, geometry, preserveColor && material?.color ? material.color : color))
    geometry.dispose()
  })
}
function fallbackBox(THREE, x, z, size, yaw, bucket, color, target) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z))
  mesh.position.set(x, size.y / 2, z); mesh.rotation.y = yaw; bake(THREE, target, mesh, bucket, color)
  return mesh
}
// 每格 512×288（5×5 图集共 2560×1440，卡面 D 行允许的上限）：256×144 下中文任务名
// 在真实显示器尺寸上糊得认不出，提到 512×288 后正文 15px 等比放大到 30px。
export const R1_SCREEN_CELL = { width: 512, height: 288 }
const SCREEN_CELL = R1_SCREEN_CELL
function screenAtlas(THREE, stations, makeScreenTexture) {
  const atlas = makeScreenTexture(), grid = Math.ceil(Math.sqrt(stations.length)), { width, height } = SCREEN_CELL
  if (atlas.ctx?.canvas) { atlas.ctx.canvas.width = grid * width; atlas.ctx.canvas.height = grid * height; atlas.tex.needsUpdate = true }
  const positions = [], uvs = [], indices = []
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM), chair = r1ToWorld(station.chairXM, station.chairYM), yaw = Math.atan2(-(desk.x - chair.x), -(desk.z - chair.z))
    // 贴片铺满整块黑色面板，并跟着面板后仰 8°：四角由 monitorPanelFit 的 right/up 算出，
    // 不能再用「竖直矩形」，那样下半片会埋进外壳里被挡掉（董事会看到的「只覆盖了一半」）。
    const fit = monitorPanelFit({ ...workstationDesktop({ x: desk.x, z: desk.z, yaw }).monitor, y: .76, yaw, aspect: width / height }), offset = index * 4
    for (const c of fit.corners) positions.push(c.x, c.y, c.z)
    // 行号要翻过来：下面 connect 用 drawImage 从图集画布的顶边往下贴（row 0 在最上），
    // 而图集贴图 flipY = true 让 v=0 落在画布底边。不翻就会整格取错行、25 块屏互相串格。
    const col = index % grid, row = Math.floor(index / grid), u0 = col / grid, u1 = (col + 1) / grid, v0 = 1 - (row + 1) / grid, v1 = 1 - row / grid
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1); indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
  })
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false })); mesh.name = 'r1-workstation-screen-atlas'
  // 把单屏画布也放大到一格的尺寸；改尺寸会清空画布，所以同时清掉去重键，保证下一轮重画一次。
  const connect = (scr, index) => {
    scr.tex.dispose?.(); const col = index % grid, row = Math.floor(index / grid)
    if (scr.ctx?.canvas && (scr.ctx.canvas.width !== width || scr.ctx.canvas.height !== height)) { scr.ctx.canvas.width = width; scr.ctx.canvas.height = height; scr.last = '' }
    scr.tex = { set needsUpdate(value) { if (value && atlas.ctx?.drawImage) { atlas.ctx.drawImage(scr.ctx.canvas, col * width, row * height); atlas.tex.needsUpdate = true } }, dispose() {} }
  }
  return { atlas, mesh, connect }
}
function badgeBatch(THREE, stations) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .06, .012, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), stations.length), transform = new THREE.Object3D()
  mesh.name = 'r1-workstation-badges'
  stations.forEach((station, index) => { const desk = r1ToWorld(station.xM, station.yM); transform.position.set(desk.x + .3, .8, desk.z); transform.rotation.set(Math.PI / 2, 0, 0); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, new THREE.Color(0xffffff)) })
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true
  return mesh
}
// 桌角状态灯（卡面 E / F 行）。**不挪用上面 badgeBatch 的模型圆片**：那一片表示的是模型家族，
// 这里另起细铜杆 + 发光灯头。杆和灯头各合一个 InstancedMesh，共 +2 draw calls（预算 +≤2）；
// 灯头颜色走 instanceColor，闪烁只改颜色、不加真实光源。
const LAMP = { postTop: .012, postBottom: .018, postHeight: .16, cap: .035, deskTop: .76, capY: .18, insetX: .6, insetZ: .26 }
// 两个轴对齐盒之间的最小距离；相交时为 0。
const boxGap = (a, b) => Math.hypot(
  Math.max(b.min.x - a.max.x, a.min.x - b.max.x, 0),
  Math.max(b.min.y - a.max.y, a.min.y - b.max.y, 0),
  Math.max(b.min.z - a.max.z, a.min.z - b.max.z, 0))
// 灯放在桌面靠里的一角。个人物品（书 / 台灯 / 绿植）只占其中一个后角，所以两个后角各试一次，
// 取离桌面件最远的那个；并列时固定选左手边，保证确定性。
function lampSpot(THREE, deskWorld, yaw, obstacles) {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  let best = null
  for (const side of [-1, 1]) {
    const x = deskWorld.x + c * (side * LAMP.insetX) + s * -LAMP.insetZ, z = deskWorld.z - s * (side * LAMP.insetX) + c * -LAMP.insetZ
    const box = new THREE.Box3(
      new THREE.Vector3(x - LAMP.cap, LAMP.deskTop, z - LAMP.cap),
      new THREE.Vector3(x + LAMP.cap, LAMP.deskTop + LAMP.capY + LAMP.cap, z + LAMP.cap))
    let clear = Infinity
    for (const obstacle of obstacles) clear = Math.min(clear, boxGap(box, obstacle))
    if (!best || clear > best.clear + 1e-9) best = { x, z, side, clear }
  }
  return best
}
// 分段数压到 DS-3 的三角形预算内：25 盏合计 600（杆）+ 2,000（灯头）= 2,600 ≤ 3,000。
// 杆直径 24–36 mm、灯头直径 70 mm，都是远景里的小件，低分段看不出棱。
function statusLampBatch(THREE, spots) {
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(LAMP.postTop, LAMP.postBottom, LAMP.postHeight, 6),
    new THREE.MeshStandardMaterial({ color: '#8a6d3b', metalness: .6, roughness: .35 }), spots.length)
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(LAMP.cap, 8, 6),
    new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length)
  posts.name = 'r1-workstation-status-posts'; caps.name = 'r1-workstation-status-lamps'
  const transform = new THREE.Object3D(), white = new THREE.Color('#d8dde2')
  spots.forEach((spot, index) => {
    transform.position.set(spot.x, LAMP.deskTop + LAMP.postHeight / 2, spot.z); transform.updateMatrix(); posts.setMatrixAt(index, transform.matrix)
    transform.position.set(spot.x, LAMP.deskTop + LAMP.capY, spot.z); transform.updateMatrix(); caps.setMatrixAt(index, transform.matrix)
    caps.setColorAt(index, white)
  })
  posts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; caps.instanceColor.needsUpdate = true
  return { posts, caps }
}

// R1 furniture is baked by material bucket: detailed GLB assets without a draw call per record.
export function buildR1Furniture({ THREE, root, layout, collision, makeScreenTexture, A, placeFurniture }) {
  if (layout?.r1Phase !== 'R1' || typeof makeScreenTexture !== 'function' || !A?.furn || typeof placeFurniture !== 'function') return { deskAt() { return null }, dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-furniture'; group.userData.dynamic = true
  // 区 07 的吧凳 / 弧形座段由 I4 岛台重建，接待台与区 12 弧形沙发段由 I5 重建，区 14 的室外长椅由 I6 广场重建；这里不再画成素色方块。
  const items = layout.r1.elements.filter(item => FURNITURE.has(item.category) && !(item.regionId === '07' && ['吧凳', '弧形座段'].includes(item.category)) && item.id !== '11-CT-001' && !(item.regionId === '12' && item.category === '弧形沙发段') && !(item.regionId === '14' && item.category === '室外长椅'))
  const buckets = new Map(Object.keys(COLOR).map(name => [name, []])), collisionGroups = [], ids = new Map(), itemBounds = new Map(), chairModels = new Map(), itemCategories = new Map(), desktopItems = new Map(), chairFacings = new Map(), ownedGeometries = []
  const tables = layout.r1.elements.filter(item => ['办公桌', '圆桌', '会议桌', '协作桌', '弧形接待台', '环形吧台', '咖啡台'].includes(item.category))
  for (const chair of layout.r1.elements.filter(item => ['办公椅', '椅子', '吧凳'].includes(item.category))) {
    const p = r1ToWorld(chair.xM, chair.yM), candidates = tables.map(table => {
      const t = r1ToWorld(table.xM, table.yM), yaw = yawFor(table), c = Math.cos(yaw), s = Math.sin(yaw), dx = p.x - t.x, dz = p.z - t.z
      let x = c * dx - s * dz, z = s * dx + c * dz
      if (['圆桌', '环形吧台'].includes(table.category)) { const k = table.lengthM / 2 / Math.hypot(x, z); x *= k; z *= k }
      else { x = THREE.MathUtils.clamp(x, -table.lengthM / 2, table.lengthM / 2); z = THREE.MathUtils.clamp(z, -table.widthM / 2, table.widthM / 2) }
      const edge = { x: t.x + c * x + s * z, z: t.z - s * x + c * z }
      return { table: table.id, category: table.category, edge, distance: Math.hypot(edge.x - p.x, edge.z - p.z), yaw: Math.atan2(edge.x - p.x, edge.z - p.z) }
    }).sort((a, b) => a.distance - b.distance)
    chairFacings.set(chair.id, candidates[0])
  }
  const chairYaw = new Map([...chairFacings].map(([id, facing]) => [id, facing.yaw]))
  for (const station of layout.r1.workstations) chairYaw.set(station.chair_id, layout.seats[station.business_id][4].yaw + Math.PI)
  const officeChairs = layout.r1.elements.filter(item => item.category === '办公椅')
  const deskYaw = new Map(items.filter(item => item.category === '办公桌').map(item => {
    const nearest = officeChairs.filter(chair => Math.hypot(chair.xM - item.xM, chair.yM - item.yM) <= 1.2)
    if (nearest.length !== 1) throw new Error(`R1 办公桌 ${item.id}: 1.2 m 内应恰有一把办公椅`)
    const desk = r1ToWorld(item.xM, item.yM), chair = r1ToWorld(nearest[0].xM, nearest[0].yM)
    return [item.id, Math.atan2(chair.x - desk.x, chair.z - desk.z)]
  }))
  const stationByDesk = new Map(layout.r1.workstations.map(station => [station.desk_id, station]))
  const chairAdjustments = new Map(layout.r1.workstations.map(station => [station.chair_id, R1_SEATED_PROFILES[station.business_id]?.seat || 0]))
  const movingChairs = new Map(), bucketMeshes = new Map()
  const deskMaterials = {}
  A.furn.desk?.traverse(mesh => { const material = mesh.material; if (material?.name === 'wood') deskMaterials.wood = material; if (/^metal/.test(material?.name)) deskMaterials.metal = material })
  const addAsset = (name, item, bucket = bucketFor(item), size = dimensions(item), yaw = yawFor(item), placement = {}) => {
    const world = placement.world || r1ToWorld(item.xM, item.yM), f = placeFurniture(A, name, world.x, world.z, { scale: 1, y: placement.y ?? (Number(item.zM) || 0), rotY: yaw })
    f.group.scale.set(size.x / f.size.x, size.y / f.size.y, size.z / f.size.z); f.group.name = `r1-source-${item.id}`; f.group.userData.r1Id = item.id
    const adjustment = chairAdjustments.get(item.id) || 0
    if (adjustment) {
      // Move the upper chair at its fixed measured height; the base footprint stays fixed.
      f.group.userData.seatAdjustment = adjustment; f.group.updateWorldMatrix(true, true)
      f.group.traverse(mesh => {
        if (!mesh.isMesh) return
        mesh.geometry = mesh.geometry.clone(); ownedGeometries.push(mesh.geometry)
        const p = mesh.geometry.attributes.position, inverse = mesh.matrixWorld.clone().invert(), v = new THREE.Vector3()
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); v.y += adjustment * THREE.MathUtils.clamp((v.y - .20) / .15, 0, 1); v.applyMatrix4(inverse); p.setXYZ(i, v.x, v.y, v.z) }
        mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere()
      })
    }
    f.group.updateWorldMatrix(true, true); itemBounds.set(item.id, new THREE.Box3().setFromObject(f.group)); itemCategories.set(item.id, item.category)
    if (item.category === '办公椅') chairModels.set(item.id, f.group)
    const first = buckets.get(bucket).reduce((sum, g) => sum + g.attributes.position.count, 0)
    bake(THREE, buckets, f.group, bucket, new THREE.Color(COLOR[bucket]), ['办公椅', '椅子', '吧凳'].includes(item.category) || placement.preserveColor)
    if (chairAdjustments.has(item.id)) {
      const end = buckets.get(bucket).reduce((sum, g) => sum + g.attributes.position.count, 0)
      movingChairs.set(item.id, { source: f.group, bucket, first, count: end - first, home: f.group.position.clone(), baseYaw: f.group.rotation.y, dx: 0, dz: 0, yaw: 0 })
    }
    if (SOLID.has(item.category)) { collision?.add(f.group, item.category); collisionGroups.push(f.group) }
    return f.group
  }
  for (const item of items) {
    const bucket = bucketFor(item), model = MODEL[item.category], size = dimensions(item)
    ids.set(item.category, [...(ids.get(item.category) || []), item.id])
    if (item.category === '办公桌') {
      const world = r1ToWorld(item.xM, item.yM), desk = new THREE.Group()
      desk.name = `r1-source-${item.id}`; desk.userData.r1Id = item.id
      desk.position.set(world.x, Number(item.zM) || 0, world.z); desk.rotation.y = deskYaw.get(item.id)
      for (const [name, x, y, z, width, height, depth] of [
        ['top', 0, .735, 0, 1.4, .03, .7],
        ['left', -.6875, .36, 0, .025, .72, .7],
        ['right', .6875, .36, 0, .025, .72, .7],
        ['back', 0, .5, -.291, 1.35, .4, .018]
      ]) {
        const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), deskMaterials[name === 'top' ? 'wood' : 'metal'])
        ownedGeometries.push(part.geometry)
        part.name = `${item.id}/${name}`; part.position.set(x, y, z); desk.add(part)
      }
      desk.updateWorldMatrix(true, true); itemBounds.set(item.id, new THREE.Box3().setFromObject(desk)); itemCategories.set(item.id, item.category)
      bake(THREE, buckets, desk, bucket, new THREE.Color(COLOR[bucket]), true)
      collision?.add(desk, item.category); collisionGroups.push(desk)
      const yaw = deskYaw.get(item.id), c = Math.cos(yaw), s = Math.sin(yaw), details = []
      const prop = (suffix, asset, x, z, w, h, d) => {
        const id = `${item.id}/${suffix}`, point = { x: world.x + c * x + s * z, z: world.z - s * x + c * z }, row = { ...item, id, category: '桌面物件' }
        const object = addAsset(asset, row, 'wood', { x: w, y: h, z: d }, yaw, { world: point, y: .762, preserveColor: true })
        details.push({ id, asset, bounds: new THREE.Box3().setFromObject(object) })
      }
      prop('keyboard', 'computerKeyboard', -.12, .15, .44, .022, .16)
      prop('mouse', 'computerMouse', .42, .15, .07, .03, .11)
      const pad = new THREE.Mesh(new THREE.BoxGeometry(.82, .012, .38)); pad.userData.r1Id = `${item.id}/pad`
      pad.position.set(world.x + c * .08 + s * .15, .756, world.z - s * .08 + c * .15); pad.rotation.y = yaw
      bake(THREE, buckets, pad, 'wood', new THREE.Color(COLOR.dark)); details.push({ id: `${item.id}/pad`, bounds: new THREE.Box3().setFromObject(pad) }); pad.geometry.dispose()
      // 预留座位（补充 R2，董事会 2026-10-29 授权）：这三张桌子不放个人物品，
      // 显示器、键盘、鼠标与鼠标垫照常保留，桌面只少这一件散件。
      if (!isReservedDesk(item.id)) {
        const choice = [...item.id].reduce((sum, value) => sum + value.charCodeAt(0), 0) % 3
        if (choice === 0) prop('small', 'books', .55, -.17, .18, .06, .24)
        if (choice === 1) prop('small', 'lampRoundTable', -.55, -.18, .18, .35, .18)
        if (choice === 2) prop('small', 'plantSmall1', .55, -.18, .18, .24, .18)
      }
      desktopItems.set(item.id, details); continue
    }
    if (item.category === '圆桌') {
      const world = r1ToWorld(item.xM, item.yM), radius = Math.min(size.x, size.z) / 2, disk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .06, 32))
      disk.position.set(world.x, size.y, world.z); bake(THREE, buckets, disk, bucket, new THREE.Color(COLOR[bucket])); disk.geometry.dispose(); addAsset('table', item, bucket); continue
    }
    if (item.category === '显示器' && stationByDesk.has(item.parentId)) {
      const station = stationByDesk.get(item.parentId), desk = r1ToWorld(station.xM, station.yM), yaw = layout.seats[station.business_id][4].yaw
      addAsset(model, item, bucket, { x: .66, y: .46, z: .16 }, yaw, { world: workstationDesktop({ x: desk.x, z: desk.z, yaw }).monitor, y: .76 }); continue
    }
    if (model) { addAsset(model, item, bucket, item.category === '办公椅' ? { x: .62, y: 1.04, z: .6 } : size, deskYaw.get(item.id) ?? chairYaw.get(item.id) ?? yawFor(item)); continue }
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
    mesh.name = `r1-furniture-${bucket}`; mesh.userData.itemIds = items.filter(item => bucketFor(item) === bucket).map(item => item.id); group.add(mesh); materials.push(material); merged.push(mesh); bucketMeshes.set(bucket, mesh)
  }
  for (const row of movingChairs.values()) {
    row.mesh = bucketMeshes.get(row.bucket)
    row.original = row.mesh.geometry.attributes.position.array.slice(row.first * 3, (row.first + row.count) * 3)
    row.normals = row.mesh.geometry.attributes.normal.array.slice(row.first * 3, (row.first + row.count) * 3)
  }
  for (const mesh of new Set([...movingChairs.values()].map(row => row.mesh))) {
    mesh.geometry.computeBoundingSphere(); mesh.geometry.boundingSphere.radius += .8
  }
  function moveChair(id, dx, dz, yaw = 0) {
    const row = movingChairs.get(id)
    if (!row || ![dx, dz, yaw].every(Number.isFinite) || Math.hypot(dx, dz) > .800001 || Math.abs(yaw) > Math.PI / 2) throw new Error(`Invalid R1 chair pose: ${id}`)
    if (row.dx === dx && row.dz === dz && row.yaw === yaw) return false
    const p = row.mesh.geometry.attributes.position, normals = row.mesh.geometry.attributes.normal, co = Math.cos(yaw), si = Math.sin(yaw)
    for (let i = 0; i < row.count; i++) {
      const x = row.original[i * 3] - row.home.x, z = row.original[i * 3 + 2] - row.home.z, nx = row.normals[i * 3], nz = row.normals[i * 3 + 2]
      p.setXYZ(row.first + i, row.home.x + co * x + si * z + dx, row.original[i * 3 + 1], row.home.z - si * x + co * z + dz)
      normals.setXYZ(row.first + i, co * nx + si * nz, row.normals[i * 3 + 1], -si * nx + co * nz)
    }
    p.addUpdateRange(row.first * 3, row.count * 3); p.needsUpdate = true
    normals.addUpdateRange(row.first * 3, row.count * 3); normals.needsUpdate = true
    row.source.position.set(row.home.x + dx, row.home.y, row.home.z + dz); row.source.updateWorldMatrix(true, true)
    row.source.rotation.y = row.baseYaw + yaw; row.source.updateWorldMatrix(true, true)
    collision?.poseNavigationBody(row.source, row.home, dx, dz, yaw)
    itemBounds.get(id).setFromObject(row.source)
    row.dx = dx; row.dz = dz; row.yaw = yaw; return true
  }
  const stations = layout.r1.workstations, screens = screenAtlas(THREE, stations, makeScreenTexture), badges = badgeBatch(THREE, stations), handles = new Map()
  // 状态灯落位：避让本桌的桌面件（键盘 / 鼠标 / 鼠标垫 / 个人物品）和显示器。
  const monitorByDesk = new Map(items.filter(item => item.category === '显示器' && item.parentId).map(item => [item.parentId, item.id]))
  const lampSpots = stations.map(station => {
    const desk = r1ToWorld(station.xM, station.yM), yaw = deskYaw.get(station.desk_id) ?? 0
    const obstacles = (desktopItems.get(station.desk_id) || []).map(detail => detail.bounds)
    const monitorBounds = itemBounds.get(monitorByDesk.get(station.desk_id))
    if (monitorBounds) obstacles.push(monitorBounds)
    return lampSpot(THREE, desk, yaw, obstacles)
  })
  const lamps = statusLampBatch(THREE, lampSpots)
  group.add(screens.mesh, badges, lamps.posts, lamps.caps)
  stations.forEach((station, index) => {
    const desk = r1ToWorld(station.xM, station.yM), chair = r1ToWorld(station.chairXM, station.chairYM), anchor = new THREE.Group(), scr = makeScreenTexture()
    anchor.name = `r1-desk-${station.business_id}`; anchor.position.set(desk.x, 0, desk.z); anchor.userData = { r1DeskId: station.desk_id, r1ChairId: station.chair_id }; group.add(anchor); screens.connect(scr, index)
    const chairAnchor = new THREE.Group(); chairAnchor.name = `r1-chair-${station.chair_id}`; chairAnchor.position.set(chair.x, 0, chair.z); chairAnchor.rotation.y = chairYaw.get(station.chair_id) ?? 0
    handles.set(key(desk.x, desk.z), { group: anchor, scr, chair: chairAnchor, lamp: lampSpots[index],
      setBadge(color) { badges.setColorAt(index, new THREE.Color(color)); badges.instanceColor.needsUpdate = true },
      // 状态灯只改灯头颜色（卡面 F 行：闪烁只改颜色，不加真实光源）。
      setStatusLight(color) { lamps.caps.setColorAt(index, new THREE.Color(color)); lamps.caps.instanceColor.needsUpdate = true } })
  })
  root.add(group); let disposed = false
  return { root: group, moveChair, chairMotion: id => { const r = movingChairs.get(id); return r ? { dx: r.dx, dz: r.dz, yaw: r.yaw } : null }, instanceIds: Object.freeze(Object.fromEntries([...ids].map(([category, value]) => [`r1-${category}`, Object.freeze(value)]))), itemBounds, itemCategories, desktopItems, chairFacings,
    statusLamps: { posts: lamps.posts, caps: lamps.caps, spots: lampSpots, metrics: LAMP, monitorByDesk }, seatedProfile(name) { return R1_SEATED_PROFILES[name] || null }, chairAt(x, z) { const station = stations.find(value => { const chair = r1ToWorld(value.chairXM, value.chairYM); return chair.x === x && chair.z === z }); return station ? chairModels.get(station.chair_id) || null : null }, deskAt(x, z) { return handles.get(key(x, z)) || null }, dispose() { if (disposed) return; disposed = true; collisionGroups.forEach(value => collision?.remove?.(value)); ownedGeometries.forEach(geometry => geometry.dispose()); handles.forEach(handle => handle.scr.tex.dispose?.()); screens.mesh.geometry.dispose(); screens.mesh.material.dispose(); screens.atlas.tex.dispose?.(); badges.geometry.dispose(); badges.material.dispose(); lamps.posts.geometry.dispose(); lamps.posts.material.dispose(); lamps.caps.geometry.dispose(); lamps.caps.material.dispose(); merged.forEach(mesh => mesh.geometry.dispose()); materials.forEach(material => material.dispose()); group.removeFromParent() } }
}
