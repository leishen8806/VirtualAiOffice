import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { buildOfficeShellV2Spec } from './office-layout-v2-scene.js'
import { LAYOUT_V1 } from './office-layout.js'

const bounds = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

export function officeFurnitureV2Spec(layout) {
  const workstations = Object.entries(layout.seats).map(([name, [region, x, z]]) => ({
    name, region, x, z, desk: bounds(x, z, 1.4, .7),
    chair: { x, z: z + 1, yaw: 0, ...bounds(x, z + 1, .62, .6) },
    front: bounds(x, z - .8, 1.4, .9),
  }))
  const meetings = [
    { id: 'A', region: 'review', x: -12.5, z: -14, w: 4, d: 1.4, round: false },
    { id: 'B', region: 'plan', x: -5.5, z: -14, w: 1.8, d: 1.8, round: true },
  ].map(room => ({ ...room, seats: room.round
    ? Array.from({ length: 6 }, (_, i) => { const angle = i * Math.PI / 3; return { room: room.id, x: room.x + Math.sin(angle) * 1.45, z: room.z + Math.cos(angle) * 1.45, yaw: angle, meeting: true } })
    : [...[-1.4, 0, 1.4].flatMap(dx => [{ room: room.id, x: room.x + dx, z: room.z - 1.15, yaw: Math.PI, meeting: true }, { room: room.id, x: room.x + dx, z: room.z + 1.15, yaw: 0, meeting: true }]), { room: room.id, x: room.x - 2.5, z: room.z, yaw: -Math.PI / 2, meeting: true }, { room: room.id, x: room.x + 2.5, z: room.z, yaw: Math.PI / 2, meeting: true }],
  }))
  const boss = { desk: layout.boss.desk, chair: { x: layout.boss.desk.x, z: layout.boss.desk.z - 1, yaw: Math.PI }, stand: layout.boss.stand }
  // 会议桌沿南北方向，避开同房间内固定的老板桌。
  const board = { ...layout.boardTable, w: 1.4, d: 3.6 }
  const boardSeats = [...[-1.2, 0, 1.2].flatMap(dz => [{ x: board.x - 1.15, z: board.z + dz, yaw: -Math.PI / 2 }, { x: board.x + 1.15, z: board.z + dz, yaw: Math.PI / 2 }]), { x: board.x, z: board.z - 2.35, yaw: Math.PI }, { x: board.x, z: board.z + 2.35, yaw: 0 }]
  const shelves = [{ x: 30.5, z: -17.45, w: 2.8, d: .6, yaw: 0 }, { x: 32.45, z: -15.7, w: 2, d: .6, yaw: Math.PI / 2 }]
  return { workstations, meetings, boss, board, boardSeats, shelves, opsScreen: { x: -22.5, z: 7.2, y: 2.45, w: 3.6, h: 1.2 } }
}

export function placeOfficeFurnitureV2({ THREE, scene, parent = scene, layout, A, placeFurniture, collision, canvasTex, makeScreenTexture }) {
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
  const atlas = canvasTex(2048, 1024, (ctx, w, h) => { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h) })
  const atlasContext = atlas.image.getContext('2d')
  const wood = new THREE.Color(THEME.trim).lerp(new THREE.Color(THEME.nameplate), .55)
  const white = new THREE.Color(THEME.nameplate), trim = new THREE.Color(THEME.trim)
  const colorFor = material => !material.name || /plant/i.test(material.name) ? material.color : /wood/i.test(material.name) ? wood : /metalDark/i.test(material.name) ? trim : white
  function bake(group, screen = null) {
    group.updateWorldMatrix(true, true)
    group.traverse(mesh => {
      if (!mesh.isMesh) return
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
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
    if (solid) collision.add(f.group, name)
    bake(f.group)
    return f.group
  }
  function box(x, y, z, w, h, d, color, solid = false, kind = 'desk') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }))
    mesh.position.set(x, y, z)
    if (solid) collision.add(mesh, kind)
    bake(mesh); mesh.geometry.dispose(); mesh.material.dispose()
  }
  function chair(seat, name = 'chairDesk') { return asset(name, seat.x, seat.z, .62, 1.04, .6, 0, seat.yaw + Math.PI, true) }
  function screen(x, y, z, w, h, title = '', yaw = 0) {
    const slot = { x: screenSlots.length % 8 * 256, y: Math.floor(screenSlots.length / 8) * 144 }
    const scr = makeScreenTexture(); scr.tex.dispose()
    scr.tex = { set needsUpdate(value) { if (value) { atlasContext.drawImage(scr.ctx.canvas, slot.x, slot.y); atlas.needsUpdate = true } } }
    if (title) { scr.ctx.fillStyle = THEME.nameplate; scr.ctx.fillRect(0, 0, 256, 144); scr.ctx.fillStyle = THEME.nameplateText; scr.ctx.font = '18px sans-serif'; scr.ctx.fillText(title, 12, 42); scr.tex.needsUpdate = true }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial())
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; bake(mesh, slot); mesh.geometry.dispose(); mesh.material.dispose()
    screenSlots.push(scr)
    return scr
  }
  for (const seat of spec.workstations) {
    asset('desk', seat.x, seat.z, 1.4, .76, .7)
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.4, .76, .7)); proxy.position.set(seat.x, .38, seat.z); proxy.visible = false; root.add(proxy); collision.add(proxy, 'desk')
    const c = chair(seat.chair)
    asset('computerScreen', seat.x, seat.z - .17, .66, .46, .16, .76)
    asset('computerKeyboard', seat.x - .12, seat.z + .15, .42, .02, .14, .765)
    asset('computerMouse', seat.x + .42, seat.z + .15, .06, .025, .09, .765)
    const scr = screen(seat.x, 1.065, seat.z - .075, .55, .31)
    // 保留运行层的桌位句柄与徽标，整体可见性由注册根控制。
    const group = new THREE.Group(); group.name = `office2-desk-${seat.name}`; group.userData.dynamic = true; group.position.set(seat.x, 0, seat.z); root.add(group)
    handles.set(`${seat.x},${seat.z}`, { group, scr, chair: c })
  }
  for (const room of spec.meetings) {
    asset('table', room.x, room.z, room.round ? 1 : room.w, .76, room.round ? 1 : room.d, 0, 0, true)
    if (room.round) { const disk = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .055, 32), new THREE.MeshStandardMaterial({ color: wood })); disk.position.set(room.x, .79, room.z); collision.add(disk, 'meetingTable'); bake(disk); disk.geometry.dispose(); disk.material.dispose() }
    room.seats.forEach(seat => chair(seat, 'chairModernCushion'))
  }
  asset('desk', spec.boss.desk.x, spec.boss.desk.z, 1.4, .76, .7, 0, Math.PI, true)
  chair(spec.boss.chair)
  asset('table', spec.board.x, spec.board.z, spec.board.w, .76, spec.board.d, 0, 0, true)
  spec.boardSeats.forEach(seat => chair(seat, 'chairModernCushion'))
  for (const shelf of spec.shelves) { asset('bookcaseOpen', shelf.x, shelf.z, shelf.w, 1.85, shelf.d, 0, shelf.yaw, true); asset('books', shelf.x, shelf.z, shelf.w * .65, .2, shelf.d * .8, .85, shelf.yaw) }
  for (const [x, z] of [[15, -16.8], [27, -16.8], [-26.5, 11.8], [-16.5, 11.8], [25.8, 11.8]]) asset('pottedPlant', x, z, .6, 1.3, .6, 0, 0, true)
  const ops = spec.opsScreen
  box(ops.x, ops.y + ops.h / 2, ops.z, ops.w + .08, ops.h + .08, .08, THEME.trim)
  screen(ops.x, ops.y + ops.h / 2, ops.z + .17, ops.w, ops.h, '运维 · 状态见任务面板')
  // 屏幕在门洞上方，支柱落在门洞两侧，不侵入通行高度。
  for (const dx of [-2, 2]) box(ops.x + dx, 1.83, ops.z, .035, 3.66, .035, THEME.trim, true, 'screenPost')
  const meetingScreens = Object.fromEntries(spec.meetings.map(room => [room.id, screen(room.x, 2.4, -17.72, 2, 1.125, `会议室 ${room.id}`)]))
  const boardScr = screen(-20, 2.4, -17.72, 2, 1.125, '董事会')
  // v2 独立浅金细线，旧布局材质保持原样。
  for (const part of buildOfficeShellV2Spec(layout).filter(part => part.kind === 'glass' && !part.locked)) {
    const w = part.x1 - part.x0, d = part.z1 - part.z0, x = (part.x0 + part.x1) / 2, z = (part.z0 + part.z1) / 2
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d)); proxy.position.set(x, 1.1, z); proxy.visible = false; root.add(proxy); collision.add(proxy, 'officeWall')
    box(x, 2.21, z, w > d ? w : .025, .025, d > w ? d : .025, THEME.trim)
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: atlas, roughness: .82, metalness: .02 })
  // 只统一顶点格式与屏幕 atlas；跨部件的合并交给注册口，避免维护第二套合并器。
  geometryParts.forEach(({ geometry, colors, uv }, index) => {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `office2-furniture-part-${index}`; root.add(mesh)
  })
  const write = (scr, title, lines) => { const ctx = scr.ctx; ctx.fillStyle = THEME.nameplate; ctx.fillRect(0, 0, 256, 144); ctx.fillStyle = THEME.nameplateText; ctx.font = '18px sans-serif'; ctx.fillText(title, 10, 25); ctx.font = '13px sans-serif'; lines.slice(0, 5).forEach((line, i) => ctx.fillText(String(line).slice(0, 30), 10, 48 + i * 19)); scr.tex.needsUpdate = true }
  const wing = { seats: spec.meetings.flatMap(room => room.seats.map(seat => ({ ...seat, taken: null }))), drawSchedule(list) { write(meetingScreens.A, '日程', list.map(item => item.title)) }, drawRoom(id, data) { if (meetingScreens[id]) write(meetingScreens[id], `会议室 ${id}`, data ? [data.topic, ...(data.here || [])] : ['暂无会议']) } }
  const board = { scr: boardScr, amber: { intensity: 0 }, beacon: { userData: {}, material: { color: new THREE.Color() } } }
  parent.add(root)
  return { root, spec, wing, board, legacyHidden, partitions: { visible: false }, deskAt: (x, z) => handles.get(`${x},${z}`), dispose() { root.removeFromParent(); handles.forEach(handle => handle.group.removeFromParent()); legacyHidden.forEach(mesh => { mesh.visible = true }); geometryParts.forEach(part => part.geometry.dispose()); material.dispose(); atlas.dispose() } }
}
