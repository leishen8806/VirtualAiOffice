// VIS2-W · B：调度中控室（单排四席直线控制台）+ 建筑内部接待台与展示墙（仓配私有构件；组件级，尚未正式接入）。
// 契约沿用 campus registry：factory({ THREE, root, layout, quality, canvasTex, snapshot }) → { group, summary, update, dispose }。
// 本构件**没有任何定时器、RAF、轮询或随机数据**：所有运行指标来自宿主传入的快照（build 时的 snapshot 与之后的 update(snapshot)）；
// 快照版本（generatedAt）不变就不重绘、不上传纹理。缺字段显示「–」，不编造数值。柬埔寨轮廓与城市沿用 dr-cambodia-outline.js。
// 只画建筑内部：台阶、门牌、停车、月台、货车、公共地面都不在本构件范围内（本构件不铺地面）。
import { CAMBODIA_CITIES, CAMBODIA_OUTLINE_GEO, CAMBODIA_ROUTE_PAIRS, MAP_VIEW, projectLonLat } from './dr-cambodia-outline.js'
import { deriveKpis } from './dr-console-data.js'

export const VIS2B_COLORS = Object.freeze({
  wall: 0xf1ece2, stone: 0xe4ddcf, oak: 0xc9a57a, oakDark: 0xa88259, graphite: 0x2a3338, steel: 0x8e979c, gold: 0xd5af62,
  desk: 0xf2efe8, chairSeat: 0x2f4a5c, chairFrame: 0x23292d, sofa: 0x3e5a4e, pot: 0xcfc6b4, leaf: 0x4e7a4f, warm: 0xffe2b0, niche: 0xfff1d6, glass: 0xbfd6dc,
})

// 单位：米。房间净高 4.0（建筑屋面 4.68）。大屏 6.8×2.833 = 2.4:1，与画布 1920×800 同比例，不拉伸。
export const VIS2B_DIMENSIONS = Object.freeze({
  roomHeight: 4.0, glassThickness: 0.02, postSize: 0.06,
  screen: Object.freeze({ width: 6.8, height: 2.8333, centerY: 2.2, canvas: Object.freeze({ width: 1920, height: 800 }) }),
  desk: Object.freeze({ length: 8.8, depth: 0.95, height: 0.74, topThickness: 0.05 }),
  seats: 4, seatPitch: 2.1,
  monitor: Object.freeze({ width: 0.62, height: 0.36 }), deskTile: Object.freeze({ width: 512, height: 288 }),
})

export const VIS2B_LABELS = Object.freeze({ simulated: '模拟数据 · 示意', title: 'DR 仓配调度中控', phnom: '金边', phnomEn: 'Phnom Penh', missing: '未提供快照' })

// 本构件登记的「旧对象替换清单」。
export const VIS2B_REPLACES = Object.freeze([
  Object.freeze({ legacy: 'campus-dispatch-simulation', part: 'dr-campus-interior.js 里的两块深色大屏（调度中控后墙屏 + 服务中心展示墙大黑屏，同一个合并网格）', note: '两块都由本构件替换（中控后墙屏 → vis2b-wall-screen；展示墙大黑屏 → 带背光展龛的木格栅展示墙）。该网格是一个合并网格，Trae 需要在旧模块里整体停用或只保留其它用途的屏。' }),
  Object.freeze({ legacy: 'campus-interior-static', part: '调度中控 / 访客接待区 / 服务中心展示区的占位家具（同一个实例化网格里还混有办公会议区、设备维护区的占位）', note: '只停用这三个区的占位，保留其余两个区；本构件不画办公会议区与设备维护区。' }),
  Object.freeze({ legacy: 'dr-control-room.js / buildDrControlRoom', part: '独立中控室原型（?controlRoom=1 的 root）', note: '启用本构件后不得同时显示该原型，否则中控室会重复；其数据口径（dr-control-room-screen.js 的 controlRoomScreenSummary）可作参照，不重复开发事件源。' }),
])

const text = (value, fallback = '–') => { const out = String(value ?? '').trim(); return out || fallback }
const num = (value, fallback = '–') => (Number.isFinite(Number(value)) && value !== null && value !== '' ? String(Math.round(Number(value) * 10) / 10) : fallback)

// ——————————————————— 屏幕绘制（纯函数：ctx + 快照 → 画面；Node 里可用桩 ctx 测） ———————————————————
function safeKpis(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.waybills) || !snapshot.waybills.length || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.warehouses) || !Array.isArray(snapshot.inventoryByCategory) || !Array.isArray(snapshot.vehicles) || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.alerts)) return null
  try { return deriveKpis(snapshot) } catch { return null }
}

function drawMap(ctx, x, y, width, height) {
  ctx.save(); ctx.translate(x, y)
  const scale = Math.min(width / MAP_VIEW.width, height / MAP_VIEW.height)
  ctx.translate((width - MAP_VIEW.width * scale) / 2, (height - MAP_VIEW.height * scale) / 2); ctx.scale(scale, scale)
  const outline = CAMBODIA_OUTLINE_GEO.map(([lon, lat]) => projectLonLat(lon, lat))
  ctx.beginPath(); outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
  ctx.fillStyle = '#123446'; ctx.fill(); ctx.strokeStyle = '#8fb4c1'; ctx.lineWidth = 3 / scale; ctx.stroke()
  const point = (c) => projectLonLat(c.lon, c.lat), hub = CAMBODIA_CITIES.find((c) => c.id === 'phnom-penh'), hubPoint = point(hub)
  ctx.lineWidth = 1.6 / scale; ctx.strokeStyle = 'rgba(213,175,98,.55)'; ctx.setLineDash?.([5 / scale, 4 / scale])
  for (const [, to] of CAMBODIA_ROUTE_PAIRS) { const c = CAMBODIA_CITIES.find((item) => item.id === to), p = point(c); ctx.beginPath(); ctx.moveTo(hubPoint.x, hubPoint.y); ctx.lineTo(p.x, p.y); ctx.stroke() }
  ctx.setLineDash?.([])
  ctx.font = `${12 / scale * 1.9}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  for (const c of CAMBODIA_CITIES) { if (c.id === 'phnom-penh') continue; const p = point(c); ctx.fillStyle = '#7fc4d6'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d8e8ee'; ctx.fillText(c.label ?? c.name ?? c.id, p.x + (c.dx ?? 8), p.y + (c.dy ?? 0)) }
  // 金边节点：金色实心 + 外圈高亮 + 中文与英文标签（常驻）
  ctx.strokeStyle = 'rgba(213,175,98,.8)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(hubPoint.x, hubPoint.y, 13, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#ffd66e'; ctx.beginPath(); ctx.arc(hubPoint.x, hubPoint.y, 7, 0, Math.PI * 2); ctx.fill()
  ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff4d0'; ctx.fillText(`${VIS2B_LABELS.phnom} · ${VIS2B_LABELS.phnomEn}`, hubPoint.x + 18, hubPoint.y - 12)
  ctx.restore()
}

function tile(ctx, x, y, w, h, label, value, unit, sub) {
  ctx.fillStyle = 'rgba(15,48,66,.92)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(143,180,193,.55)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#9fc3cf'; ctx.font = '26px sans-serif'; ctx.fillText(label, x + 18, y + 38)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px sans-serif'; ctx.fillText(`${value}${unit}`, x + 18, y + 108)
  ctx.fillStyle = '#d5af62'; ctx.font = '22px sans-serif'; ctx.fillText(sub, x + 18, y + h - 16)
}

export function drawDispatchWall(ctx, width, height, snapshot) {
  const k = safeKpis(snapshot), missing = !k
  ctx.save()
  ctx.fillStyle = '#071a26'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0d2c3d'; ctx.fillRect(0, 0, width, 84)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px sans-serif'; ctx.fillText(VIS2B_LABELS.title, 36, 58)
  // 常驻「模拟数据 · 示意」：标题栏右侧大字 + 底部整行，缺快照时同样显示
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffd66e'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(VIS2B_LABELS.simulated, width - 36, 56)
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(213,175,98,.85)'; ctx.font = '26px sans-serif'; ctx.fillText(`${VIS2B_LABELS.simulated} · 非真实库存与调度结果`, 36, height - 22)
  drawMap(ctx, 36, 104, 1000, height - 150)
  const x0 = 1080, w = 380, h = 150
  tile(ctx, x0, 110, w, h, '今日入库', num(k?.inbound), ' 托盘', '托盘上架事件')
  tile(ctx, x0 + w + 20, 110, w, h, '今日出库', num(k?.outbound), ' 托盘', '出库发运事件')
  tile(ctx, x0, 280, w, h, '在途运单', k ? num(snapshot.waybills.filter((item) => item.status !== '已完成').length) : '–', ' 单', '未完成运单')
  tile(ctx, x0 + w + 20, 280, w, h, '准时交付率', num(k?.onTimeRate), '%', '由模拟运单推导')
  ctx.fillStyle = '#9fc3cf'; ctx.font = '26px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('运单进度', x0, 480); ctx.fillText('最近事件', x0 + 560, 480)
  const bills = k ? snapshot.waybills.slice(0, 3) : [], events = k ? snapshot.events.slice(-3) : []
  for (let i = 0; i < 3; i++) {
    const y = 500 + i * 56, bill = bills[i]
    ctx.fillStyle = '#d8e8ee'; ctx.font = '22px sans-serif'; ctx.fillText(bill ? `${text(bill.id).replace('DEMO-WB-', 'TRK-')} · ${text(bill.status)}` : '–', x0, y + 22)
    ctx.fillStyle = 'rgba(143,180,193,.25)'; ctx.fillRect(x0, y + 30, 420, 12); ctx.fillStyle = '#7fc4d6'; ctx.fillRect(x0, y + 30, 420 * Math.max(0, Math.min(100, Number(bill?.progress) || 0)) / 100, 12)
    ctx.fillStyle = '#ffffff'; ctx.fillText(bill ? `${num(bill.progress)}%` : '–', x0 + 440, y + 42)
    ctx.fillStyle = '#d8e8ee'; ctx.font = '22px sans-serif'; ctx.fillText(events[i] ? `${text(events[i].zone)} · ${text(events[i].kind)}` : '–', x0 + 560, y + 22)
  }
  if (missing) { ctx.fillStyle = 'rgba(255,214,110,.95)'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(VIS2B_LABELS.missing, 520, height / 2) }
  ctx.restore()
}

const DESK_TILES = Object.freeze([
  Object.freeze({ key: 'inbound', label: '入库', unit: ' 托盘', sub: 'W1 托盘上架' }),
  Object.freeze({ key: 'transit', label: '在途运单', unit: ' 单', sub: 'W3 配送' }),
  Object.freeze({ key: 'tasks', label: '进行中任务', unit: ' 项', sub: 'W2 周转' }),
  Object.freeze({ key: 'alerts', label: '异常预警', unit: ' 项', sub: '设备 / 库存 / 运单' }),
])

export function drawDeskAtlas(ctx, width, height, snapshot) {
  const k = safeKpis(snapshot), tw = width / 2, th = height / 2
  ctx.save(); ctx.fillStyle = '#0a2230'; ctx.fillRect(0, 0, width, height)
  DESK_TILES.forEach((item, index) => {
    const x = (index % 2) * tw, y = Math.floor(index / 2) * th
    const value = !k ? '–' : item.key === 'inbound' ? num(k.inbound) : item.key === 'transit' ? num(snapshot.waybills.filter((bill) => bill.status !== '已完成').length) : item.key === 'tasks' ? num(k.activeTasks) : num(k.alerts)
    ctx.fillStyle = '#10384c'; ctx.fillRect(x + 4, y + 4, tw - 8, th - 8)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#9fc3cf'; ctx.font = '22px sans-serif'; ctx.fillText(item.label, x + 20, y + 40)
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 60px sans-serif'; ctx.fillText(`${value}${item.unit}`, x + 20, y + 106)
    ctx.fillStyle = '#d5af62'; ctx.font = '18px sans-serif'; ctx.fillText(`${item.sub} · ${VIS2B_LABELS.simulated}`, x + 20, y + th - 18)
  })
  ctx.restore()
}

// 展示墙展龛与接待铭牌：静态说明（不含任何运行数据），仍标注「示意」。
const NICHES = Object.freeze([
  Object.freeze({ title: 'W1 智慧云仓', sub: '高位存储 · 穿梭系统', icon: 'rack' }),
  Object.freeze({ title: 'W2 订单周转', sub: '分拣 · 复核 · 包装', icon: 'boxes' }),
  Object.freeze({ title: 'W3 集货配送', sub: '集货 · 装车 · 配送', icon: 'truck' }),
  Object.freeze({ title: '设备与维护', sub: '点检 · 保养 · 备件', icon: 'gear' }),
  Object.freeze({ title: '访客与展示', sub: '服务中心 · 方案介绍', icon: 'people' }),
])
export function drawShowcaseAtlas(ctx, width, height) {
  const tw = width / NICHES.length
  ctx.save()
  NICHES.forEach((item, i) => {
    const x = i * tw
    ctx.fillStyle = '#123446'; ctx.fillRect(x + 6, 6, tw - 12, height - 12); ctx.strokeStyle = '#d5af62'; ctx.lineWidth = 4; ctx.strokeRect(x + 10, 10, tw - 20, height - 20)
    ctx.strokeStyle = '#7fc4d6'; ctx.fillStyle = '#7fc4d6'; ctx.lineWidth = 6
    const cx = x + tw / 2, cy = height * 0.4
    if (item.icon === 'rack') { for (const dx of [-70, 0, 70]) ctx.strokeRect(cx + dx - 6, cy - 70, 12, 140); for (const dy of [-35, 5, 45]) ctx.strokeRect(cx - 76, cy + dy, 152, 8) }
    else if (item.icon === 'boxes') { for (const [dx, dy] of [[-50, -40], [10, -40], [-50, 20], [10, 20]]) ctx.strokeRect(cx + dx, cy + dy, 50, 50) }
    else if (item.icon === 'truck') { ctx.strokeRect(cx - 80, cy - 40, 100, 70); ctx.strokeRect(cx + 20, cy - 20, 55, 50); for (const dx of [-50, 40]) { ctx.beginPath(); ctx.arc(cx + dx, cy + 40, 14, 0, Math.PI * 2); ctx.fill() } }
    else if (item.icon === 'gear') { ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.stroke(); for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.moveTo(cx + Math.cos(a * Math.PI / 4) * 36, cy + Math.sin(a * Math.PI / 4) * 36); ctx.lineTo(cx + Math.cos(a * Math.PI / 4) * 56, cy + Math.sin(a * Math.PI / 4) * 56); ctx.stroke() } }
    else { ctx.beginPath(); ctx.arc(cx - 28, cy - 22, 22, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 34, cy - 14, 18, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(cx - 60, cy + 12, 70, 44); ctx.strokeRect(cx + 16, cy + 18, 54, 38) }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 38px sans-serif'; ctx.fillText(item.title, cx, height * 0.76)
    ctx.fillStyle = '#9fc3cf'; ctx.font = '26px sans-serif'; ctx.fillText(item.sub, cx, height * 0.86); ctx.fillStyle = '#d5af62'; ctx.font = '22px sans-serif'; ctx.fillText('示意', cx, height * 0.94)
  })
  ctx.restore()
}
export function drawReceptionPlate(ctx, width, height) {
  ctx.save(); ctx.fillStyle = '#d5af62'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#2a3338'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = 'bold 84px sans-serif'; ctx.fillText('DR 仓配服务中心', width / 2, height * 0.38); ctx.font = '52px sans-serif'; ctx.fillText('访客接待 · 示意', width / 2, height * 0.72); ctx.restore()
}

// ——————————————————— 实例化辅助 ———————————————————
function createBatch(THREE, name, material, geometry, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity)); mesh.name = name; mesh.count = 0
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(), color = new THREE.Color()
  return {
    mesh,
    add(x, y, z, sx, sy, sz, hex, rotY = 0) {
      if (mesh.count >= mesh.instanceMatrix.count) throw new Error(`${name} 实例容量不足`)
      quaternion.setFromEuler(euler.set(0, rotY, 0)); matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz))
      mesh.setMatrixAt(mesh.count, matrix); mesh.setColorAt(mesh.count, color.setHex(hex)); mesh.count++
    },
    finish() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingBox?.(); mesh.computeBoundingSphere?.() },
  }
}

const zoneOf = (zones, id) => { const zone = zones.find((item) => item.id === id); if (!zone) throw new Error(`布局里没有区域 ${id}`); return zone }

export function buildVis2DispatchSuite({ THREE, root, layout, quality, canvasTex, snapshot = null } = {}) {
  if (typeof canvasTex !== 'function') throw new Error('需要宿主提供 canvasTex(w, h, draw)')
  const low = quality?.tier === 'low', D = VIS2B_DIMENSIONS, C = VIS2B_COLORS, zones = layout?.zones || []
  const control = zoneOf(zones, 'dispatch'), visitor = zoneOf(zones, 'visitor'), showcase = zoneOf(zones, 'showcase')
  const group = new THREE.Group(); group.name = 'vis2-dispatch-suite'; group.userData.vis2 = 'dispatch-suite'
  const structure = createBatch(THREE, 'vis2b-structure', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.15 }), new THREE.BoxGeometry(1, 1, 1), 700)
  const round = createBatch(THREE, 'vis2b-round', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 }), new THREE.CylinderGeometry(0.5, 0.5, 1, low ? 10 : 18), 40)
  const foliage = createBatch(THREE, 'vis2b-foliage', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, flatShading: true }), new THREE.IcosahedronGeometry(0.5, low ? 0 : 1), 60)
  const glow = createBatch(THREE, 'vis2b-glow', new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), new THREE.BoxGeometry(1, 1, 1), 60)
  const glass = createBatch(THREE, 'vis2b-glass', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), new THREE.BoxGeometry(1, 1, 1), 24)
  glow.mesh.userData.dynamic = true; glass.mesh.userData.dynamic = true // 不让 campus registry 把它们并进统一材质 / .46 透明批次
  const regions = { control: null, reception: null, showcase: null }
  const track = (name, x0, x1, z0, z1) => { const r = regions[name] || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; regions[name] = { x0: Math.min(r.x0, x0), x1: Math.max(r.x1, x1), z0: Math.min(r.z0, z0), z1: Math.max(r.z1, z1) } }
  const box = (region, x, y, z, sx, sy, sz, hex, rotY = 0) => { structure.add(x, y, z, sx, sy, sz, hex, rotY); const hx = (Math.abs(Math.cos(rotY)) * sx + Math.abs(Math.sin(rotY)) * sz) / 2, hz = (Math.abs(Math.sin(rotY)) * sx + Math.abs(Math.cos(rotY)) * sz) / 2; track(region, x - hx, x + hx, z - hz, z + hz) }
  const cyl = (region, x, y, z, d, h, hex) => { round.add(x, y, z, d, h, d, hex); track(region, x - d / 2, x + d / 2, z - d / 2, z + d / 2) }
  const leaf = (region, x, y, z, d, hex = C.leaf) => { foliage.add(x, y, z, d, d * 0.9, d, hex); track(region, x - d / 2, x + d / 2, z - d / 2, z + d / 2) }
  const glowBox = (region, x, y, z, sx, sy, sz, hex) => { glow.add(x, y, z, sx, sy, sz, hex); track(region, x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2) }
  const pane = (region, x, y, z, sx, sy, sz) => { glass.add(x, y, z, sx, sy, sz, C.glass); track(region, x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2) }

  // ——— 中控室（区域 dispatch：x −168…−154，z 0…16）：大屏在西墙，四席面向大屏，仓储在东侧（玻璃外）———
  const cz = (control.z0 + control.z1) / 2, wallX = control.x0 + 0.25, deskX = control.x0 + 8.2, seatX = deskX + 1.15
  const eastX = control.x1 - 0.3, zMin = control.z0 + 0.3, zMax = control.z1 - 0.3, H = D.roomHeight
  // 后墙（暖白）+ 左右木格栅吸音板 + 大屏边框 + 灯带
  box('control', wallX, H / 2, cz, 0.2, H, zMax - zMin, C.wall)
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) box('control', wallX + 0.16, 1.9, cz + side * (4.1 + i * 0.28), 0.06, 3.2, 0.16, i % 2 ? C.oak : C.oakDark)
  const sc = D.screen, bezel = 0.1
  box('control', wallX + 0.17, sc.centerY, cz, 0.08, sc.height + bezel * 2, sc.width + bezel * 2, C.graphite)
  glowBox('control', wallX + 0.12, sc.centerY + sc.height / 2 + 0.3, cz, 0.06, 0.05, sc.width + 0.6, C.warm) // 屏幕上方暖色灯带
  glowBox('control', wallX + 0.12, 0.4, cz, 0.06, 0.04, zMax - zMin - 0.6, C.warm) // 踢脚暖光
  // 玻璃围合：细框（立柱 + 上下横框）+ 通透玻璃；南墙留 1.6 m 门洞，东墙面向仓储
  const frame = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2)), dx = (x1 - x0) / n, dz = (z1 - z0) / n, yaw = Math.atan2(-(z1 - z0), x1 - x0)
    box('control', (x0 + x1) / 2, 0.04, (z0 + z1) / 2, len, 0.08, 0.08, C.graphite, yaw); box('control', (x0 + x1) / 2, H - 0.04, (z0 + z1) / 2, len, 0.08, 0.08, C.graphite, yaw)
    for (let i = 0; i <= n; i++) box('control', x0 + dx * i, H / 2, z0 + dz * i, D.postSize, H, D.postSize, C.graphite)
    for (let i = 0; i < n; i++) pane('control', x0 + dx * (i + 0.5), H / 2, z0 + dz * (i + 0.5), Math.abs(dz) < 1e-6 ? Math.abs(dx) - 0.04 : D.glassThickness, H - 0.2, Math.abs(dz) < 1e-6 ? D.glassThickness : Math.abs(dz) - 0.04)
  }
  frame(eastX, zMin, eastX, zMax) // 东：面向仓储
  frame(wallX + 0.1, zMin, eastX, zMin) // 北
  frame(wallX + 0.1, zMax, eastX - 5.6, zMax); frame(eastX - 3.6, zMax, eastX, zMax) // 南（门洞在 eastX−5.6…−3.6，宽 2.0 m；服务通道从南侧进入）
  // 单排四席直线控制台：一条连续长桌（暖白台面 + 橡木前沿 + 深色裙板 + 线槽）
  const dk = D.desk, deskZ0 = cz - dk.length / 2
  box('control', deskX, dk.height - dk.topThickness / 2, cz, dk.depth, dk.topThickness, dk.length, C.desk)
  box('control', deskX + dk.depth / 2 - 0.02, dk.height - dk.topThickness - 0.03, cz, 0.04, 0.06, dk.length, C.oak)
  box('control', deskX - dk.depth / 2 + 0.06, (dk.height - dk.topThickness) / 2, cz, 0.04, dk.height - dk.topThickness, dk.length - 0.2, C.graphite)
  for (let i = 0; i <= 4; i++) box('control', deskX, (dk.height - dk.topThickness) / 2, deskZ0 + 0.1 + (i * (dk.length - 0.2)) / 4, dk.depth - 0.1, dk.height - dk.topThickness, 0.05, C.graphite)
  box('control', deskX - 0.18, dk.height + 0.01, cz, 0.08, 0.02, dk.length - 0.4, C.steel)
  // 椅子 ×4（朝向西侧大屏，各带轻微确定性的转角）
  const seatZs = Array.from({ length: D.seats }, (_, i) => cz + (i - (D.seats - 1) / 2) * D.seatPitch), yaws = [0.12, -0.08, 0.05, -0.14]
  const rot = (lx, lz, yaw) => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)]
  seatZs.forEach((z, i) => {
    const part = (lx, y, lz, sx, sy, sz, hex) => { const [ox, oz] = rot(lx, lz, yaws[i]); box('control', seatX + ox, y, z + oz, sx, sy, sz, hex, yaws[i]) }
    part(0, 0.46, 0, 0.52, 0.08, 0.5, C.chairSeat); part(0.27, 0.8, 0, 0.07, 0.58, 0.46, C.chairSeat); part(0.3, 1.14, 0, 0.06, 0.16, 0.3, C.chairSeat)
    part(0, 0.24, 0, 0.07, 0.4, 0.07, C.chairFrame); part(0, 0.06, 0, 0.64, 0.05, 0.07, C.chairFrame); part(0, 0.06, 0, 0.07, 0.05, 0.64, C.chairFrame)
    for (const s of [-1, 1]) part(-0.02, 0.62, s * 0.28, 0.36, 0.035, 0.05, C.chairFrame)
  })
  // 桌面显示器：每席双屏（合并为一个带图集 UV 的几何，1 个 draw call），支架与底座进结构批次
  const mon = D.monitor, tileW = D.deskTile.width, tileH = D.deskTile.height
  const deskTexture = canvasTex(tileW * 2, tileH * 2, (ctx, w, h) => drawDeskAtlas(ctx, w, h, snapshot))
  const positions = [], uvs = [], indices = []
  seatZs.forEach((z, seat) => {
    const u0 = (seat % 2) / 2, v0 = 1 - (Math.floor(seat / 2) + 1) / 2
    for (const side of [-1, 1]) {
      const cx = deskX + 0.12, cy = dk.height + 0.3, cz2 = z + side * 0.33, yaw = side * 0.14
      const base = positions.length / 3, hw = mon.width / 2, hh = mon.height / 2
      for (const [px, py, tu, tv] of [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]]) {
        const wx = cx - 0.02 - Math.sin(yaw) * px, wz = cz2 + Math.cos(yaw) * px
        positions.push(wx, cy + py, wz); uvs.push(u0 + tu * 0.5, v0 + tv * 0.5)
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
      // 屏幕法线朝东（+x，面向操作员）；这里的顶点绕过了旋转，只做轻微内扣
      box('control', cx + 0.03, cy, cz2, 0.03, mon.height + 0.04, mon.width + 0.04, C.graphite, yaw)
      box('control', cx + 0.1, dk.height + 0.09, cz2, 0.04, 0.16, 0.06, C.graphite); box('control', cx + 0.1, dk.height + 0.015, cz2, 0.2, 0.025, 0.2, C.graphite)
    }
  })
  const deskGeometry = new THREE.BufferGeometry(); deskGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); deskGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); deskGeometry.setIndex(indices); deskGeometry.computeVertexNormals(); deskGeometry.computeBoundingBox(); deskGeometry.computeBoundingSphere()
  const deskMaterial = new THREE.MeshBasicMaterial({ map: deskTexture, toneMapped: false, side: THREE.DoubleSide })
  const deskScreens = new THREE.Mesh(deskGeometry, deskMaterial); deskScreens.name = 'vis2b-desk-screens'
  // 大屏：与画布同比例的平面，朝东
  const wallTexture = canvasTex(sc.canvas.width, sc.canvas.height, (ctx, w, h) => drawDispatchWall(ctx, w, h, snapshot))
  const wallMaterial = new THREE.MeshBasicMaterial({ map: wallTexture, toneMapped: false })
  const wallScreen = new THREE.Mesh(new THREE.PlaneGeometry(sc.width, sc.height), wallMaterial); wallScreen.name = 'vis2b-wall-screen'
  wallScreen.position.set(wallX + 0.215, sc.centerY, cz); wallScreen.rotation.y = Math.PI / 2
  // 吊顶暖光灯带（三条沿 x 的发光条，作为「建筑化照明」，不新增真实灯源）
  for (const dz of [-4.6, 0, 4.6]) glowBox('control', control.x0 + 7.5, H - 0.08, cz + dz, 9, 0.04, 0.12, C.warm)
  // 室内绿植（靠东南角）
  for (const [lx, lz] of [[eastX - 1.2, zMin + 1.0], [eastX - 1.2, zMax - 1.0]]) { cyl('control', lx, 0.3, lz, 0.5, 0.6, C.pot); leaf('control', lx, 0.95, lz, 0.9); leaf('control', lx + 0.08, 1.35, lz - 0.05, 0.6) }

  // ——— 访客接待区（区域 visitor：x −168…−154，z 20…30）———
  const vx = (visitor.x0 + visitor.x1) / 2, deskRZ = visitor.z0 + 4.2
  box('reception', vx, 1.05 / 2, deskRZ, 4.6, 1.05, 0.7, C.stone)
  box('reception', vx, 1.07, deskRZ, 4.7, 0.05, 0.8, C.desk)
  for (let i = 0; i < 18; i++) box('reception', vx - 2.0 + i * 0.235, 0.52, deskRZ + 0.37, 0.12, 1.0, 0.04, i % 2 ? C.oak : C.oakDark)
  glowBox('reception', vx, 0.12, deskRZ + 0.39, 4.5, 0.03, 0.03, C.warm)
  box('reception', vx, 0.6, deskRZ - 0.5, 3.6, 0.04, 0.6, C.oak) // 内侧工作台
  box('reception', vx, 1.9, deskRZ - 1.5, 4.8, 3.2, 0.14, C.wall) // 背景墙
  box('reception', vx, 2.9, deskRZ - 1.42, 2.8, 0.5, 0.03, C.gold) // 金色铭牌底（文字另画）
  for (const s of [-1, 1]) { box('reception', vx + s * 0.8, 0.5, deskRZ - 0.95, 0.5, 0.06, 0.5, C.chairSeat); box('reception', vx + s * 0.8, 0.8, deskRZ - 1.15, 0.5, 0.55, 0.06, C.chairSeat); cyl('reception', vx + s * 0.8, 0.25, deskRZ - 0.95, 0.08, 0.5, C.chairFrame) }
  // 休闲区：两张沙发 + 圆几 + 绿植
  for (const [sx2, sz2, yaw] of [[visitor.x0 + 2.4, visitor.z1 - 2.2, 0], [visitor.x0 + 5.2, visitor.z1 - 2.2, 0]]) {
    box('reception', sx2, 0.28, sz2, 2.0, 0.42, 0.9, C.sofa, yaw); box('reception', sx2, 0.62, sz2 + 0.4, 2.0, 0.5, 0.18, C.sofa, yaw); for (const s of [-1, 1]) box('reception', sx2 + s * 0.95, 0.42, sz2, 0.12, 0.3, 0.9, C.sofa)
  }
  cyl('reception', visitor.x0 + 3.8, 0.19, visitor.z1 - 4.2, 0.9, 0.04, C.oak); cyl('reception', visitor.x0 + 3.8, 0.1, visitor.z1 - 4.2, 0.12, 0.2, C.graphite)
  for (const [px, pz] of [[visitor.x0 + 0.8, visitor.z0 + 0.8], [visitor.x1 - 0.8, visitor.z1 - 1.0], [vx + 3.0, deskRZ - 1.0]]) { cyl('reception', px, 0.3, pz, 0.5, 0.6, C.pot); leaf('reception', px, 0.95, pz, 0.9); leaf('reception', px, 1.4, pz, 0.6) }

  // ——— 服务中心展示区（区域 showcase：x −154…−130，z 20…30）：北墙展示墙 + 中央展示台 ———
  const sx = (showcase.x0 + showcase.x1) / 2, wallZ = showcase.z0 + 0.35, nichePositions = []
  box('showcase', sx, H / 2 - 0.4, wallZ, 18.5, H - 0.8, 0.2, C.wall)
  for (let i = 0; i < 36; i++) box('showcase', sx - 8.9 + i * 0.5, 1.0, wallZ + 0.13, 0.22, 2.0, 0.05, i % 2 ? C.oak : C.oakDark) // 木格栅护墙
  for (let i = 0; i < 5; i++) {
    const nx = sx - 7.2 + i * 3.6
    glowBox('showcase', nx, 2.35, wallZ + 0.14, 2.6, 1.7, 0.04, C.niche) // 背光底板（其上贴展龛画面）
    nichePositions.push([nx, 2.35, wallZ + 0.17])
    for (const [dx, dz2, w, h2] of [[0, 0.86, 2.74, 0.06], [0, -0.86, 2.74, 0.06], [1.34, 0, 0.06, 1.78], [-1.34, 0, 0.06, 1.78]]) box('showcase', nx + dx, 2.35 + dz2, wallZ + 0.17, w, h2, 0.04, C.gold)
    box('showcase', nx, 0.55, wallZ + 0.5, 1.6, 0.08, 0.5, C.stone); box('showcase', nx, 0.3, wallZ + 0.5, 1.5, 0.5, 0.42, C.oakDark)
  }
  glowBox('showcase', sx, H - 1.1, wallZ + 0.2, 17, 0.04, 0.1, C.warm)
  // 中央展示台：长台 + 仓配园区缩微模型（盒体示意）
  const tableZ = showcase.z0 + 5.2
  box('showcase', sx, 0.45, tableZ, 5.0, 0.9, 1.6, C.stone); box('showcase', sx, 0.93, tableZ, 5.1, 0.05, 1.7, C.desk)
  box('showcase', sx, 1.0, tableZ, 4.4, 0.04, 1.2, C.graphite)
  box('showcase', sx - 0.4, 1.12, tableZ, 2.6, 0.2, 0.7, C.wall); box('showcase', sx + 1.7, 1.1, tableZ, 0.8, 0.16, 0.7, C.wall)
  for (let i = 0; i < 4; i++) box('showcase', sx - 1.4 + i * 0.6, 1.3, tableZ, 0.06, 0.2, 0.62, 0x2f6fa8)
  for (const [px, pz] of [[showcase.x0 + 1.0, showcase.z0 + 1.2], [showcase.x1 - 1.0, showcase.z0 + 1.2], [showcase.x0 + 1.0, showcase.z1 - 1.0], [showcase.x1 - 1.0, showcase.z1 - 1.0]]) { cyl('showcase', px, 0.3, pz, 0.5, 0.6, C.pot); leaf('showcase', px, 0.95, pz, 0.9); leaf('showcase', px - 0.05, 1.4, pz, 0.6) }

  for (const batch of [structure, round, foliage, glow, glass]) { batch.finish(); group.add(batch.mesh) }
  // 展龛画面（5 张合并为 1 个几何，图集 UV）与接待铭牌（1 个平面）
  const nichePos = [], nicheUv = [], nicheIdx = []
  nichePositions.forEach(([nx, ny, nz], i) => { const base = nichePos.length / 3, hw = 1.2, hh = 0.8, u0 = i / NICHES.length, u1 = (i + 1) / NICHES.length
    for (const [px, py, u, v] of [[-hw, -hh, u0, 0], [hw, -hh, u1, 0], [hw, hh, u1, 1], [-hw, hh, u0, 1]]) { nichePos.push(nx + px, ny + py, nz); nicheUv.push(u, v) }
    nicheIdx.push(base, base + 1, base + 2, base, base + 2, base + 3); track('showcase', nx - hw, nx + hw, nz - 0.01, nz + 0.01) })
  const nicheTexture = canvasTex(2560, 384, (ctx, w, h) => drawShowcaseAtlas(ctx, w, h)), nicheGeometry = new THREE.BufferGeometry()
  nicheGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nichePos, 3)); nicheGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(nicheUv, 2)); nicheGeometry.setIndex(nicheIdx); nicheGeometry.computeVertexNormals(); nicheGeometry.computeBoundingSphere()
  const nicheMaterial = new THREE.MeshBasicMaterial({ map: nicheTexture, toneMapped: false }), niches = new THREE.Mesh(nicheGeometry, nicheMaterial); niches.name = 'vis2b-showcase-panels'
  const plateTexture = canvasTex(1024, 256, (ctx, w, h) => drawReceptionPlate(ctx, w, h)), plateMaterial = new THREE.MeshBasicMaterial({ map: plateTexture, toneMapped: false })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), plateMaterial); plate.name = 'vis2b-reception-plate'; plate.position.set(vx, 2.9, deskRZ - 1.4); track('reception', vx - 1.4, vx + 1.4, deskRZ - 1.41, deskRZ - 1.39)
  plate.rotation.y = 0
  group.add(deskScreens, wallScreen, niches, plate)
  root.add(group)

  let disposed = false, version = snapshot?.generatedAt ?? null, redraws = 0
  const redraw = (next) => {
    for (const [texture, draw, w, h] of [[wallTexture, drawDispatchWall, sc.canvas.width, sc.canvas.height], [deskTexture, drawDeskAtlas, tileW * 2, tileH * 2]]) {
      const ctx = texture.image?.getContext?.('2d'); if (!ctx) continue
      draw(ctx, w, h, next); texture.needsUpdate = true
    }
    redraws++
  }
  const update = (next) => {
    if (disposed) return false
    const nextVersion = next?.generatedAt ?? null
    if (nextVersion !== null && nextVersion === version) return false // 版本未变：不重绘、不上传纹理
    version = nextVersion; snapshot = next ?? null; redraw(snapshot); return true
  }
  const triangleCount = () => [structure, round, foliage, glow, glass].reduce((t, b) => t + b.mesh.count * (b.mesh.geometry.index ? b.mesh.geometry.index.count : b.mesh.geometry.attributes.position.count) / 3, 0) + indices.length / 3 + nicheIdx.length / 3 + 4
  const summary = () => ({ module: 'vis2-dispatch-suite', preview: '组件预览，尚未正式接入', quality: low ? 'low' : 'high', hasSnapshot: !!snapshot, snapshotVersion: version, redraws,
    seats: D.seats, seatZ: seatZs.map((z) => +z.toFixed(3)), deskLength: D.desk.length, regions: JSON.parse(JSON.stringify(regions)), screen: { width: sc.width, height: sc.height, ratio: +(sc.width / sc.height).toFixed(3), canvas: sc.canvas }, label: VIS2B_LABELS.simulated,
    instances: { structure: structure.mesh.count, round: round.mesh.count, foliage: foliage.mesh.count, glow: glow.mesh.count, glass: glass.mesh.count }, drawCalls: 9, triangles: Math.round(triangleCount()), replaces: VIS2B_REPLACES.map((item) => item.legacy) })
  const dispose = () => {
    if (disposed) return; disposed = true
    group.removeFromParent()
    for (const batch of [structure, round, foliage, glow, glass]) { batch.mesh.geometry.dispose(); batch.mesh.material.dispose(); batch.mesh.dispose?.() }
    deskGeometry.dispose(); deskMaterial.dispose(); deskTexture.dispose?.(); wallScreen.geometry.dispose(); wallMaterial.dispose(); wallTexture.dispose?.()
    nicheGeometry.dispose(); nicheMaterial.dispose(); nicheTexture.dispose?.(); plate.geometry.dispose(); plateMaterial.dispose(); plateTexture.dispose?.()
  }
  return { group, summary, update, dispose }
}
