import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { buildOfficeShellV2Spec } from './office-layout-v2-scene.js'
import { LAYOUT_V1 } from './office-layout.js'

const bounds = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

// computerScreen.glb 的 metal 四边面实测值；显示面原始法线向座椅侧并后仰 8°。
export const MONITOR_GLASS_SOURCE = Object.freeze({ center: Object.freeze([.19634400494396687, .1712790373712778, -.05207117833197117]), normal: Object.freeze([0, .13917310535907745, .9902680516242981]), width: .379136648029089, height: .2336606421593705 })
const MONITOR_MODEL = Object.freeze({ centerX: .1963440030813217, centerZ: -.05200199782848358, width: .39268800616264343, height: .29428520798683167, depth: .10400399565696716 })

export function monitorScreenFit({ x, y, z, width = .66, height = .46, depth = .16, yaw = 0 }) {
  const sx = width / MONITOR_MODEL.width, sy = height / MONITOR_MODEL.height, sz = depth / MONITOR_MODEL.depth
  const ny0 = MONITOR_GLASS_SOURCE.normal[1] / sy, nz0 = MONITOR_GLASS_SOURCE.normal[2] / sz, nl = Math.hypot(ny0, nz0)
  const ny = ny0 / nl, nz = nz0 / nl, sin = Math.sin(yaw), cos = Math.cos(yaw), lx = (MONITOR_GLASS_SOURCE.center[0] - MONITOR_MODEL.centerX) * sx, lz = (MONITOR_GLASS_SOURCE.center[2] - MONITOR_MODEL.centerZ) * sz
  const normal = [sin * nz, ny, cos * nz], glassCenter = { x: x + cos * lx + sin * lz, y: y + MONITOR_GLASS_SOURCE.center[1] * sy, z: z - sin * lx + cos * lz }
  const glassWidth = MONITOR_GLASS_SOURCE.width * sx, glassHeight = MONITOR_GLASS_SOURCE.height * Math.hypot(MONITOR_GLASS_SOURCE.normal[2] * sy, MONITOR_GLASS_SOURCE.normal[1] * sz)
  return { center: { x: glassCenter.x + normal[0] * .0015, y: glassCenter.y + normal[1] * .0015, z: glassCenter.z + normal[2] * .0015 }, glassCenter, normal, glassWidth, glassHeight, width: glassWidth - .012, height: glassHeight - .012, yaw, pitch: -Math.asin(ny), offset: .0015 }
}

export function workstationDesktop(seat) {
  const yaw = seat.yaw || 0, point = (dx, dz) => ({ x: seat.x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z: seat.z - Math.sin(yaw) * dx + Math.cos(yaw) * dz })
  const monitor = point(0, -.17), keyboard = point(-.12, .15), mouse = point(.42, .15)
  return { yaw, monitor, keyboard, mouse, fit: monitorScreenFit({ ...monitor, y: .76, yaw }) }
}

const meetingRegion = (layout, id) => {
  const region = layout.regions?.find(item => item.id === id)
  if (!region) throw new Error(`缺少会议区域: ${id}`)
  return region
}

const roomScreen = (region) => {
  const door = region.doors?.[0]
  const side = door?.side === 'south' ? 'north' : door?.side === 'north' ? 'south' : door?.side === 'east' ? 'west' : 'east'
  const center = { x: (region.x0 + region.x1) / 2, z: (region.z0 + region.z1) / 2 }
  if (side === 'north') return { ...center, z: region.z0 + .28, yaw: 0, side }
  if (side === 'south') return { ...center, z: region.z1 - .28, yaw: Math.PI, side }
  if (side === 'west') return { ...center, x: region.x0 + .28, yaw: Math.PI / 2, side }
  return { ...center, x: region.x1 - .28, yaw: -Math.PI / 2, side }
}

export function officeFurnitureV2Spec(layout) {
  const workstations = Object.entries(layout.seats).map(([name, [region, x, z]]) => ({
    name, region, x, z, desk: bounds(x, z, 1.4, .7),
    chair: { x, z: z + 1, yaw: 0, ...bounds(x, z + 1, .62, .6) },
    front: bounds(x, z - .8, 1.4, .9),
  }))
  const meetings = [
    { id: 'A', region: 'review', w: 4, d: 1.4, round: false },
    { id: 'B', region: 'plan', w: 1.8, d: 1.8, round: true },
  ].map((meeting) => {
    const region = meetingRegion(layout, meeting.region)
    // V2 的已验收位置保持不变；其余布局从稳定 room id 的真实边界推导。
    const center = layout.version === 2
      ? (meeting.id === 'A' ? { x: -12.5, z: -14 } : { x: -5.5, z: -14 })
      : { x: (region.x0 + region.x1) / 2, z: (region.z0 + region.z1) / 2 }
    const northPod = layout.variant === 'align' && region.z0 === layout.envelope.z0
    const room = { ...meeting, ...center, ...(northPod ? { round: true, w: 1.5, d: 1.5 } : {}), yaw: 0, screen: { ...roomScreen(region), y: 2.4, w: 2, h: 1.125 } }
    return { ...room, seats: northPod ? layout.meetingSeatPoints[room.id].map(seat => ({ ...seat })) : room.round
    ? Array.from({ length: 6 }, (_, i) => { const angle = i * Math.PI / 3; return { room: room.id, x: room.x + Math.sin(angle) * 1.45, z: room.z + Math.cos(angle) * 1.45, yaw: angle, meeting: true } })
    : [...[-1.4, 0, 1.4].flatMap(dx => [{ room: room.id, x: room.x + dx, z: room.z - 1.15, yaw: Math.PI, meeting: true }, { room: room.id, x: room.x + dx, z: room.z + 1.15, yaw: 0, meeting: true }]), { room: room.id, x: room.x - 2.5, z: room.z, yaw: -Math.PI / 2, meeting: true }, { room: room.id, x: room.x + 2.5, z: room.z, yaw: Math.PI / 2, meeting: true }],
    }
  })
  const boss = { desk: layout.boss.desk, chair: { x: layout.boss.desk.x, z: layout.boss.desk.z - 1, yaw: Math.PI }, stand: layout.boss.stand }
  // 会议桌沿南北方向，避开同房间内固定的老板桌。
  const boardRegion = meetingRegion(layout, 'board')
  const boardScreen = layout.version === 2
    ? { x: -20, z: -17.72, yaw: 0, side: 'north', y: 2.4, w: 2, h: 1.125 }
    : { ...roomScreen(boardRegion), y: 2.4, w: 2, h: 1.125 }
  const board = { ...layout.boardTable, w: 1.4, d: 3.6, screen: boardScreen }
  const boardSeats = [...[-1.2, 0, 1.2].flatMap(dz => [{ x: board.x - 1.15, z: board.z + dz, yaw: -Math.PI / 2 }, { x: board.x + 1.15, z: board.z + dz, yaw: Math.PI / 2 }]), { x: board.x, z: board.z - 2.35, yaw: Math.PI }, { x: board.x, z: board.z + 2.35, yaw: 0 }]
  let shelves = [{ x: 30.5, z: -17.45, w: 2.8, d: .6, yaw: 0 }, { x: 32.45, z: -15.7, w: 2, d: .6, yaw: Math.PI / 2 }]
  let opsScreen = { x: -22.5, z: 7.2, y: 2.45, w: 3.6, h: 1.2 }
  if (layout.variant === 'align') {
    const kb = meetingRegion(layout, 'kb'), west = meetingRegion(layout, 'west-open')
    const ops = layout.deskGroups.ops.map(name => layout.seats[name]), left = (kb.x0 + kb.x1 - 5.2) / 2
    shelves = [{ x: left + 1.4, z: kb.z0 + .55, w: 2.8, d: .6, yaw: 0 }, { x: left + 4.2, z: kb.z0 + .55, w: 2, d: .6, yaw: 0 }]
    opsScreen = { ...opsScreen, x: ops.reduce((sum, seat) => sum + seat[1], 0) / ops.length, z: Math.max(west.z0, layout.corridors.westNorthCross.z1) + .3 }
  }
  return { workstations, meetings, boss, board, boardSeats, shelves, opsScreen }
}

export function placeOfficeFurnitureV2({ THREE, scene, parent = scene, layout, A, placeFurniture, collision, canvasTex, makeScreenTexture, warmPalette = false }) {
  const spec = officeFurnitureV2Spec(layout)
  const required = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'table', 'chairModernCushion', 'bookcaseOpen', 'books', 'pottedPlant']
  for (const name of required) if (!A?.furn?.[name]) throw new Error(`缺少办公家具 ${name}`)
  const legacyHidden = [], legacyEnvelope = LAYOUT_V1.ENVELOPE
  const legacyBox = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3()
  // 旧版后墙和东墙尚在场景顶层，会横穿 v2 的会议桌和 Dr.life 工位。
  for (const mesh of scene.children.filter(child => child.isMesh && child.visible)) {
    legacyBox.setFromObject(mesh).getCenter(center); legacyBox.getSize(size)
    const rear = Math.abs(center.z - legacyEnvelope.z0) <= .35 && size.z <= .4 && center.x >= legacyEnvelope.x0 && center.x <= legacyEnvelope.x1
    const east = Math.abs(center.x - legacyEnvelope.x1) <= .2 && size.x <= .4 && center.z >= legacyEnvelope.z0 && center.z <= legacyEnvelope.z1
    if ((rear || east) && size.y > .1 && center.y > .1) { mesh.visible = false; legacyHidden.push(mesh) }
  }
  const root = new THREE.Group(); root.name = 'office2-furniture'
  const geometryParts = [], handles = new Map(), screenSlots = []
  const detailBounds = new Map(), detailCollisions = []
  let detailId = null
  const atlas = canvasTex(2048, 1024, (ctx, w, h) => { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h) })
  const atlasContext = atlas.image.getContext('2d')
  const wood = warmPalette ? new THREE.Color('#C49A6C') : new THREE.Color(THEME.trim).lerp(new THREE.Color(THEME.nameplate), .55)
  const white = new THREE.Color(THEME.nameplate), trim = new THREE.Color(THEME.trim)
  const fabric = new THREE.Color('#506A5A'), metal = new THREE.Color('#756D60'), dark = new THREE.Color('#3D4541')
  const colorFor = material => !material.name || /plant/i.test(material.name) ? material.color
    : warmPalette && /carpet|fabric|cushion/i.test(material.name) ? fabric
    : warmPalette && /metalDark/i.test(material.name) ? dark
    : warmPalette && /metal/i.test(material.name) ? metal
    : /wood/i.test(material.name) ? wood : /metalDark/i.test(material.name) ? trim : white
  function bake(group, screen = null) {
    group.updateWorldMatrix(true, true)
    group.traverse(mesh => {
      if (!mesh.isMesh) return
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
      if (layout.variant === 'align' && detailId) {
        const b = detailBounds.get(detailId) || new THREE.Box3()
        b.union(new THREE.Box3().setFromBufferAttribute(geometry.attributes.position)); detailBounds.set(detailId, b)
      }
      const count = geometry.attributes.position.count, colors = new Float32Array(count * 3), uv = new Float32Array(count * 2)
      const sourceUv = geometry.attributes.uv
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const color = screen ? new THREE.Color(1, 1, 1) : colorFor(material)
      for (let i = 0; i < count; i++) {
        colors.set([color.r, color.g, color.b], i * 3)
        uv.set(screen ? [(screen.x + sourceUv.getX(i) * 256) / 2048, 1 - (screen.y + (1 - sourceUv.getY(i)) * 144) / 1024] : [.99, .01], i * 2)
      }
      geometryParts.push({ geometry, colors, uv })
    })
  }
  function asset(name, x, z, w, h, d, y = 0, yaw = 0, solid = false) {
    const f = placeFurniture(A, name, x, z, { scale: 1, y, rotY: yaw })
    f.group.scale.set(w / f.size.x, h / f.size.y, d / f.size.z)
    f.group.name = `office2-${name}`
    if (solid) { collision.add(f.group, name); if (layout.variant === 'align' && detailId) detailCollisions.push(f.group) }
    bake(f.group)
    return f.group
  }
  function box(x, y, z, w, h, d, color, solid = false, kind = 'desk') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }))
    mesh.position.set(x, y, z)
    if (solid) { collision.add(mesh, kind); if (layout.variant === 'align' && detailId) detailCollisions.push(mesh) }
    bake(mesh); mesh.geometry.dispose(); mesh.material.dispose()
  }
  function chair(seat, name = 'chairDesk') { return asset(name, seat.x, seat.z, .62, 1.04, .6, 0, seat.yaw + Math.PI, true) }
  function screen(x, y, z, w, h, title = '', yaw = 0, pitch = 0) {
    const slot = { x: screenSlots.length % 8 * 256, y: Math.floor(screenSlots.length / 8) * 144 }
    const scr = makeScreenTexture(); scr.tex.dispose()
    scr.tex = { set needsUpdate(value) { if (value) { atlasContext.drawImage(scr.ctx.canvas, slot.x, slot.y); atlas.needsUpdate = true } } }
    if (title) { scr.ctx.fillStyle = THEME.nameplate; scr.ctx.fillRect(0, 0, 256, 144); scr.ctx.fillStyle = THEME.nameplateText; scr.ctx.font = '18px sans-serif'; scr.ctx.fillText(title, 12, 42); scr.tex.needsUpdate = true }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
    mesh.position.set(x, y, z); mesh.rotation.order = 'YXZ'; mesh.rotation.set(pitch, yaw, 0); bake(mesh, slot); mesh.geometry.dispose(); mesh.material.dispose()
    screenSlots.push(scr)
    return scr
  }
  for (const seat of spec.workstations) {
    const { yaw, monitor, keyboard, mouse, fit } = workstationDesktop(seat)
    asset('desk', seat.x, seat.z, 1.4, .76, .7)
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.4, .76, .7)); proxy.position.set(seat.x, .38, seat.z); proxy.visible = false; root.add(proxy); collision.add(proxy, 'desk')
    const c = chair(seat.chair)
    asset('computerScreen', monitor.x, monitor.z, .66, .46, .16, .76, yaw)
    asset('computerKeyboard', keyboard.x, keyboard.z, .42, .02, .14, .765, yaw)
    asset('computerMouse', mouse.x, mouse.z, .06, .025, .09, .765, yaw)
    const scr = screen(fit.center.x, fit.center.y, fit.center.z, fit.width, fit.height, '', fit.yaw, fit.pitch)
    // 保留运行层的桌位句柄与徽标，整体可见性由注册根控制。
    const group = new THREE.Group(); group.name = `office2-desk-${seat.name}`; group.userData.dynamic = true; group.position.set(seat.x, 0, seat.z); root.add(group)
    handles.set(`${seat.x},${seat.z}`, { group, scr, chair: c })
  }
  for (const room of spec.meetings) {
    asset('table', room.x, room.z, room.round ? 1 : room.w, .76, room.round ? 1 : room.d, 0, 0, true)
    if (room.round) { const radius = room.w / 2; const disk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .055, 32), new THREE.MeshStandardMaterial({ color: wood })); disk.position.set(room.x, .79, room.z); collision.add(disk, 'meetingTable'); bake(disk); disk.geometry.dispose(); disk.material.dispose() }
    room.seats.forEach(seat => chair(seat, 'chairModernCushion'))
  }
  asset('desk', spec.boss.desk.x, spec.boss.desk.z, 1.4, .76, .7, 0, Math.PI, true)
  chair(spec.boss.chair)
  asset('table', spec.board.x, spec.board.z, spec.board.w, .76, spec.board.d, 0, 0, true)
  spec.boardSeats.forEach(seat => chair(seat, 'chairModernCushion'))
  for (const [index, shelf] of spec.shelves.entries()) { detailId = `align-kb-shelf-${index}`; asset('bookcaseOpen', shelf.x, shelf.z, shelf.w, 1.85, shelf.d, 0, shelf.yaw, true); asset('books', shelf.x, shelf.z, shelf.w * .65, .2, shelf.d * .8, .85, shelf.yaw) }
  detailId = null
  for (const [x, z] of [[15, -16.8], [27, -16.8], [-26.5, 11.8], [-16.5, 11.8], [25.8, 11.8]]) asset('pottedPlant', x, z, .6, 1.3, .6, 0, 0, true)
  const ops = spec.opsScreen
  detailId = 'align-ops-screen'
  box(ops.x, ops.y + ops.h / 2, ops.z, ops.w + .08, ops.h + .08, .08, THEME.trim)
  screen(ops.x, ops.y + ops.h / 2, ops.z + .17, ops.w, ops.h, '运维 · 状态见任务面板')
  // 屏幕在门洞上方，支柱落在门洞两侧，不侵入通行高度。
  for (const dx of [-2, 2]) box(ops.x + dx, 1.83, ops.z, .035, 3.66, .035, THEME.trim, true, 'screenPost')
  detailId = null
  const meetingScreens = Object.fromEntries(spec.meetings.map(room => [room.id, screen(room.screen.x, room.screen.y, room.screen.z, room.screen.w, room.screen.h, `会议室 ${room.id}`, room.screen.yaw)]))
  const boardScr = screen(spec.board.screen.x, spec.board.screen.y, spec.board.screen.z, spec.board.screen.w, spec.board.screen.h, '董事会', spec.board.screen.yaw)
  // v2 独立浅金细线，旧布局材质保持原样。
  if (layout.version === 2) {
    for (const part of buildOfficeShellV2Spec(layout).filter(part => part.kind === 'glass' && !part.locked)) {
      const w = part.x1 - part.x0, d = part.z1 - part.z0, x = (part.x0 + part.x1) / 2, z = (part.z0 + part.z1) / 2
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d)); proxy.position.set(x, 1.1, z); proxy.visible = false; root.add(proxy); collision.add(proxy, 'officeWall')
      box(x, 2.21, z, w > d ? w : .025, .025, d > w ? d : .025, THEME.trim)
    }
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: atlas, roughness: .82, metalness: .02, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  // 只统一顶点格式与屏幕 atlas；跨部件的合并交给注册口，避免维护第二套合并器。
  geometryParts.forEach(({ geometry, colors, uv }, index) => {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `office2-furniture-part-${index}`; root.add(mesh)
  })
  const write = (scr, title, lines) => { const ctx = scr.ctx; ctx.fillStyle = THEME.nameplate; ctx.fillRect(0, 0, 256, 144); ctx.fillStyle = THEME.nameplateText; ctx.font = '18px sans-serif'; ctx.fillText(title, 10, 25); ctx.font = '13px sans-serif'; lines.slice(0, 5).forEach((line, i) => ctx.fillText(String(line).slice(0, 30), 10, 48 + i * 19)); scr.tex.needsUpdate = true }
  const wing = { seats: spec.meetings.flatMap(room => room.seats.map(seat => ({ ...seat, taken: null }))), drawSchedule(list) { write(meetingScreens.A, '日程', list.map(item => item.title)) }, drawRoom(id, data) { if (meetingScreens[id]) write(meetingScreens[id], `会议室 ${id}`, data ? [data.topic, ...(data.here || [])] : ['暂无会议']) } }
  const board = { scr: boardScr, amber: { intensity: 0 }, beacon: { userData: {}, material: { color: new THREE.Color() } } }
  parent.add(root)
  // 与 zones.obstacles 同格式；边界来自烘焙后的真实顶点，供导航接线消费。
  const obstacles = () => [...detailBounds].map(([id, b]) => ({ id, x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }))
  return { root, spec, wing, board, legacyHidden, partitions: { visible: false }, obstacles, deskAt: (x, z) => handles.get(`${x},${z}`), dispose() { detailCollisions.forEach(p => collision.remove?.(p)); root.removeFromParent(); handles.forEach(handle => handle.group.removeFromParent()); legacyHidden.forEach(mesh => { mesh.visible = true }); geometryParts.forEach(part => part.geometry.dispose()); material.dispose(); atlas.dispose() } }
}
