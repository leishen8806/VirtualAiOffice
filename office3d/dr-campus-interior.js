import { CAMBODIA_CITIES, CAMBODIA_OUTLINE_D, CAMBODIA_ROUTE_PAIRS, MAP_VIEW } from './dr-cambodia-outline.js'
import { deriveKpis } from './dr-console-data.js'
import {
  sharedDemoSnapshotAt,
} from './dr-demo-snapshot.js'
import { controlRoomLiveEnabled } from './dr-control-room-screen.js'

export const SCREEN_REFRESH_MS = 1000
export const DISPATCH_SCREEN_STYLE = Object.freeze({
  panel: '#24485c', mapFill: '#183847', outline: '#8fb4c1', outlineWidth: 4,
  route: '#b7d4e0', routeWidth: 3, label: '#f4f1eb', labelSize: 40,
  node: '#b7d4e0', phnomPenh: '#d5af62', phnomPenhRadius: 14, cityRadius: 7,
})

export const screenSliceAt = elapsedMs => Math.max(
  0,
  Math.floor((Number(elapsedMs) || 0) / SCREEN_REFRESH_MS),
)

export function campusScreenSummary(snapshot) {
  const kpis = deriveKpis(snapshot)
  return Object.freeze({
    kpis: Object.freeze({
      inbound: kpis.inbound,
      outbound: kpis.outbound,
      inTransit: snapshot.waybills.filter(item => item.status !== '已完成').length,
      onTimeRate: kpis.onTimeRate,
    }),
    waybills: Object.freeze(snapshot.waybills.map(item => Object.freeze({
      id: item.id, status: item.status, progress: item.progress,
    }))),
    events: Object.freeze(snapshot.events.slice(-4).map(event => Object.freeze({
      id: event.id, kind: event.kind, zone: event.zone,
    }))),
  })
}

export function campusScreenFrameAt(elapsedMs = 0) {
  const snapshot = sharedDemoSnapshotAt(elapsedMs)
  const nodes = Object.freeze(CAMBODIA_CITIES.map(item => Object.freeze({
    id: item.id, name: item.name, x: item.x / MAP_VIEW.width,
    y: item.y / MAP_VIEW.height, labelX: item.labelX, labelY: item.labelY,
  })))
  const nodeIndex = Object.fromEntries(nodes.map((item, index) => [item.id, index]))
  return Object.freeze({
    timeSlice: screenSliceAt(elapsedMs),
    watermark: '模拟数据 · 示意',
    nodes,
    links: Object.freeze(CAMBODIA_ROUTE_PAIRS.map(([from, to]) =>
      Object.freeze([nodeIndex[from], nodeIndex[to]]),
    )),
    snapshot,
    summary: campusScreenSummary(snapshot),
  })
}

export function screenFrame(seed = 2808, timeSlice = 0) {
  return campusScreenFrameAt(
    Number.isFinite(seed) ? Math.max(0, timeSlice) * SCREEN_REFRESH_MS : 0,
  )
}

const zone = (zones, id) => zones.find(item => item.id === id)
const box = (items, x, y, z, sx, sy, sz, color) => items.push({ x, y, z, sx, sy, sz, color })
const put = (mesh, index, THREE, item) => {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(item.x, item.y, item.z), new THREE.Quaternion(), new THREE.Vector3(item.sx, item.sy, item.sz))
  mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, new THREE.Color(item.color))
}
const quad = (positions, uvs, indices, x, y, z, width, height, u0, u1) => {
  const base = positions.length / 3, left = x - width / 2, right = x + width / 2, bottom = y - height / 2, top = y + height / 2
  positions.push(left, bottom, z, right, bottom, z, right, top, z, left, top, z)
  uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

export function drawCampusDispatchScreen(ctx, width, height, frame) {
  ctx.fillStyle = '#111c25'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = DISPATCH_SCREEN_STYLE.panel; ctx.fillRect(28, 32, 610, 448)
  ctx.strokeStyle = DISPATCH_SCREEN_STYLE.outline; ctx.lineWidth = 4; ctx.strokeRect(28, 32, 610, 448)
  ctx.fillStyle = '#d5af62'; ctx.font = '700 30px sans-serif'; ctx.fillText(frame.watermark, 52, 76)
  const mapX = 58, mapY = 100, mapW = 548, mapH = 286, mapScale = Math.min(mapW / MAP_VIEW.width, mapH / MAP_VIEW.height)
  ctx.save(); ctx.translate(mapX, mapY); ctx.scale(mapScale, mapScale); ctx.fillStyle = DISPATCH_SCREEN_STYLE.mapFill; ctx.strokeStyle = DISPATCH_SCREEN_STYLE.outline; ctx.lineWidth = DISPATCH_SCREEN_STYLE.outlineWidth / mapScale
  const outline = new Path2D(CAMBODIA_OUTLINE_D); ctx.fill(outline); ctx.stroke(outline); ctx.restore()
  ctx.strokeStyle = DISPATCH_SCREEN_STYLE.route; ctx.lineWidth = DISPATCH_SCREEN_STYLE.routeWidth
  for (const [from, to] of frame.links) { const a = frame.nodes[from], b = frame.nodes[to]; ctx.beginPath(); ctx.moveTo(mapX + a.x * MAP_VIEW.width * mapScale, mapY + a.y * MAP_VIEW.height * mapScale); ctx.lineTo(mapX + b.x * MAP_VIEW.width * mapScale, mapY + b.y * MAP_VIEW.height * mapScale); ctx.stroke() }
  ctx.font = `600 ${DISPATCH_SCREEN_STYLE.labelSize}px sans-serif`
  for (const node of frame.nodes) {
    const x = mapX + node.x * MAP_VIEW.width * mapScale, y = mapY + node.y * MAP_VIEW.height * mapScale, phnomPenh = node.id === 'phnom-penh'
    ctx.fillStyle = phnomPenh ? DISPATCH_SCREEN_STYLE.phnomPenh : DISPATCH_SCREEN_STYLE.node
    if (phnomPenh) { ctx.shadowColor = DISPATCH_SCREEN_STYLE.phnomPenh; ctx.shadowBlur = 18 }
    ctx.beginPath(); ctx.arc(x, y, phnomPenh ? DISPATCH_SCREEN_STYLE.phnomPenhRadius : DISPATCH_SCREEN_STYLE.cityRadius, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0; ctx.strokeStyle = DISPATCH_SCREEN_STYLE.mapFill; ctx.lineWidth = 5
    ctx.strokeText(node.name, x + node.labelX * mapScale, y + node.labelY * mapScale)
    ctx.fillStyle = DISPATCH_SCREEN_STYLE.label; ctx.fillText(node.name, x + node.labelX * mapScale, y + node.labelY * mapScale)
  }
  ctx.fillStyle = '#18232b'; ctx.fillRect(674, 32, 322, 448); ctx.strokeStyle = '#d5af62'; ctx.strokeRect(674, 32, 322, 448)
  const { kpis, waybills, events } = frame.summary
  ctx.fillStyle = '#f4f1eb'; ctx.font = '700 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DR 仓配服务中心', 835, 72)
  ctx.fillStyle = '#d5af62'; ctx.font = '600 20px sans-serif'; ctx.fillText('模拟数据 · 示意', 835, 104)
  ctx.textAlign = 'left'; ctx.fillStyle = '#b7d4e0'; ctx.font = '600 20px sans-serif'
  ctx.fillText(`入库 ${kpis.inbound} 托   出库 ${kpis.outbound} 托`, 696, 146)
  ctx.fillText(`在途 ${kpis.inTransit} 单   准时 ${kpis.onTimeRate}%`, 696, 178)
  ctx.fillStyle = '#d5af62'; ctx.font = '700 19px sans-serif'; ctx.fillText('运单摘要', 696, 220)
  ctx.fillStyle = '#f4f1eb'; ctx.font = '500 16px sans-serif'
  waybills.slice(0, 3).forEach((item, index) => {
    ctx.fillText(`${item.id} · ${item.status} · ${item.progress}%`, 696, 250 + index * 28)
  })
  ctx.fillStyle = '#d5af62'; ctx.font = '700 19px sans-serif'; ctx.fillText('最近事件', 696, 350)
  ctx.fillStyle = '#b7d4e0'; ctx.font = '500 16px sans-serif'
  events.toReversed().slice(0, 3).forEach((event, index) => {
    ctx.fillText(`${event.zone} · ${event.kind}`, 696, 380 + index * 28)
  })
}

export function createCampusScreenLive({
  context,
  texture,
  drawStatic,
  isVisible = () => true,
  search = globalThis.location?.search || '',
  now = () => performance.now(),
  schedule = setInterval,
  unschedule = clearInterval,
  documentRef = globalThis.document,
} = {}) {
  let timer = 0
  let desired = false
  let disposed = false
  let accumulated = 0
  let activeSince = 0
  let lastSlice = -1
  let uploads = 0
  let lastSummary = campusScreenSummary(sharedDemoSnapshotAt(0))

  const drawSnapshot = (elapsedMs) => {
    const slice = screenSliceAt(elapsedMs)
    if (slice === lastSlice) return
    const frame = campusScreenFrameAt(elapsedMs)
    drawCampusDispatchScreen(
      context,
      1024,
      512,
      frame,
    )
    lastSummary = frame.summary
    lastSlice = slice
    texture.needsUpdate = true
    uploads += 1
  }
  const pause = () => {
    if (!timer) return
    accumulated += Math.max(0, now() - activeSince)
    unschedule(timer)
    timer = 0
  }
  const tick = () => {
    if (disposed || !desired || documentRef?.hidden || !isVisible()) {
      pause()
      return
    }
    drawSnapshot(accumulated + Math.max(0, now() - activeSince))
  }
  const resume = () => {
    if (
      disposed || !desired || timer || documentRef?.hidden || !isVisible()
    ) return
    activeSince = now()
    drawSnapshot(accumulated)
    timer = schedule(tick, SCREEN_REFRESH_MS)
  }
  const start = () => {
    if (disposed) return
    if (desired) {
      resume()
      return
    }
    desired = true
    accumulated = 0
    lastSlice = -1
    resume()
  }
  const stop = () => {
    desired = false
    if (timer) unschedule(timer)
    timer = 0
    accumulated = 0
    lastSlice = -1
    drawStatic()
    lastSummary = campusScreenSummary(sharedDemoSnapshotAt(0))
    texture.needsUpdate = true
    uploads += 1
  }
  const onVisibility = () => {
    if (documentRef?.hidden) pause()
    else resume()
  }
  documentRef?.addEventListener?.('visibilitychange', onVisibility)
  if (controlRoomLiveEnabled(search)) start()

  return {
    seen() {},
    start,
    stop,
    dispose() {
      if (disposed) return
      desired = false
      if (timer) unschedule(timer)
      timer = 0
      disposed = true
      documentRef?.removeEventListener?.('visibilitychange', onVisibility)
    },
    metrics: () => Object.freeze({
      running: !!timer,
      desired,
      uploads,
      elapsedMs: accumulated + (timer ? Math.max(0, now() - activeSince) : 0),
      summary: lastSummary,
    }),
  }
}

export function buildCampusInterior({
  THREE,
  root,
  canvasTex,
  layout,
  quality,
  search = globalThis.location?.search || '',
  liveOptions = {},
}) {
  const zones = layout.zones, dispatch = zone(zones, 'dispatch'), visitor = zone(zones, 'visitor'), showcase = zone(zones, 'showcase'), office = zone(zones, 'officeMeeting'), maintenance = zone(zones, 'maintenance')
  const props = []
  box(props, -161, .56, 8, 6.4, 1.12, 1.4, 0x344b58); box(props, -161, 1.18, 7.15, 5.8, .08, .32, 0xd5af62)
  box(props, -161, .5, 25.8, 7.2, 1, 1.2, 0x405867); box(props, -164, .55, 22.2, 3.1, .7, 1.25, 0x708997); box(props, -158, .55, 22.2, 3.1, .7, 1.25, 0x708997)
  box(props, -142, .55, 25, 4.8, 1.1, 3.6, 0x4a5e69); box(props, -142, 1.3, 25, 2.8, .18, 1.5, 0xd5af62)
  for (const x of [-126, -118, -110]) box(props, x, .55, 23.2, 3.8, 1.1, 1.8, 0x53626a)
  box(props, -117, .62, 27.4, 7.2, 1.2, 2.4, 0x405867); box(props, -92, .12, 25, 9.6, .24, 4.8, 0x26333a); box(props, -92, 1.05, 25, 1.7, 2.1, .34, 0x6da2bd)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .18 })
  const propsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, props.length)
  propsMesh.name = 'campus-interior-static'; propsMesh.receiveShadow = false; props.forEach((item, index) => put(propsMesh, index, THREE, item)); propsMesh.instanceMatrix.needsUpdate = true; propsMesh.instanceColor.needsUpdate = true; root.add(propsMesh)
  let texture
  let screenContext = null
  const drawStatic = () => drawCampusDispatchScreen(
    screenContext,
    1024,
    512,
    screenFrame(2808, 0),
  )
  texture = canvasTex(1024, 512, (ctx, width, height) => {
    screenContext = ctx
    drawCampusDispatchScreen(ctx, width, height, screenFrame(2808, 0))
  })
  const positions = [], uvs = [], indices = []
  quad(positions, uvs, indices, (dispatch.x0 + dispatch.x1) / 2, 3.15, dispatch.z0 + .16, 11.6, 5.8, 0, .64)
  quad(positions, uvs, indices, (showcase.x0 + showcase.x1) / 2, 3.15, showcase.z0 + .16, 12.8, 5.8, .66, 1)
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeBoundingSphere()
  const screen = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }))
  screen.name = 'campus-dispatch-simulation'
  const liveScreen = createCampusScreenLive({
    context: screenContext,
    texture,
    drawStatic,
    isVisible: () => root.visible !== false,
    search,
    ...liveOptions,
  })
  screen.userData.dynamic = liveScreen.metrics().desired
  screen.onBeforeRender = () => liveScreen.seen()
  root.add(screen)
  root.userData.campusDispatchLive = liveScreen
  return {
    root,
    start: () => liveScreen.start(),
    stop: () => liveScreen.stop(),
    liveMetrics: () => liveScreen.metrics(),
    dispose() {
      liveScreen.dispose()
      delete root.userData.campusDispatchLive
      texture.dispose()
      geometry.dispose()
      material.dispose()
      propsMesh.geometry.dispose()
      screen.material.dispose()
    },
  }
}
