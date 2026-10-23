import {
  CAMBODIA_CITIES,
  CAMBODIA_OUTLINE_GEO,
  CAMBODIA_ROUTE_PAIRS,
  MAP_VIEW,
  projectLonLat,
} from './dr-cambodia-outline.js'
import { buildSnapshot, deriveKpis } from './dr-console-data.js'
import { demoSnapshotAt } from './dr-console-demo.js'

export const CONTROL_ROOM_LIVE_INTERVAL_MS = 1000
export const CONTROL_ROOM_BASE_SNAPSHOT = Object.freeze(
  buildSnapshot({ seed: 2808, timeSlice: 5 }),
)

const text = (value, fallback = '–') => {
  const output = String(value ?? '').trim()
  return output || fallback
}
const compact = (value, limit = 18) => {
  const output = Array.from(text(value))
  return output.length > limit
    ? `${output.slice(0, limit - 1).join('')}…`
    : output.join('')
}

export function controlRoomLiveEnabled(search = '') {
  const values = new URLSearchParams(String(search || '')).getAll(
    'controlRoomLive',
  )
  return values.length === 1 && values[0] === '1'
}

export function controlRoomSnapshotAt(elapsedMs) {
  return demoSnapshotAt(CONTROL_ROOM_BASE_SNAPSHOT, elapsedMs)
}

function drawMap(ctx, x, y, width, height) {
  ctx.save()
  ctx.translate(x, y)
  const scale = Math.min(width / MAP_VIEW.width, height / MAP_VIEW.height)
  const offsetX = (width - MAP_VIEW.width * scale) / 2
  const offsetY = (height - MAP_VIEW.height * scale) / 2
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  const outline = CAMBODIA_OUTLINE_GEO.map(([lon, lat]) =>
    projectLonLat(lon, lat),
  )
  ctx.beginPath()
  outline.forEach((point, index) => {
    if (index) ctx.lineTo(point.x, point.y)
    else ctx.moveTo(point.x, point.y)
  })
  ctx.closePath()
  ctx.fillStyle = '#123446'
  ctx.fill()
  ctx.strokeStyle = '#8fb4c1'
  ctx.lineWidth = 3 / scale
  ctx.stroke()

  const byId = Object.fromEntries(
    CAMBODIA_CITIES.map((city) => [city.id, city]),
  )
  ctx.strokeStyle = '#5f8fa4'
  ctx.lineWidth = 1.8 / scale
  for (const [from, to] of CAMBODIA_ROUTE_PAIRS) {
    const a = byId[from]
    const b = byId[to]
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  for (const city of CAMBODIA_CITIES) {
    const hub = city.id === 'phnom-penh'
    ctx.fillStyle = hub ? '#f1c766' : '#8fb4c1'
    ctx.beginPath()
    ctx.arc(city.x, city.y, hub ? 9 : 4, 0, Math.PI * 2)
    ctx.fill()
    if (hub) {
      ctx.fillStyle = '#f4f1eb'
      ctx.font = '700 17px sans-serif'
      ctx.fillText('金边枢纽', city.x + 13, city.y + 5)
    }
  }
  ctx.restore()
}

function drawCard(ctx, x, y, width, label, value, unit = '') {
  ctx.fillStyle = '#102735'
  ctx.fillRect(x, y, width, 70)
  ctx.fillStyle = '#8fb4c1'
  ctx.font = '600 15px sans-serif'
  ctx.fillText(label, x + 14, y + 23)
  ctx.fillStyle = '#f4f1eb'
  ctx.font = '700 25px sans-serif'
  ctx.fillText(`${text(value)}${unit}`, x + 14, y + 54)
}

export function controlRoomScreenSummary(snapshot) {
  const kpis = deriveKpis(snapshot)
  return Object.freeze({
    generatedAt: snapshot.generatedAt,
    kpis: Object.freeze({
      inbound: kpis.inbound,
      outbound: kpis.outbound,
      inTransit: snapshot.waybills.filter(
        (item) => item.status !== '已完成',
      ).length,
      onTimeRate: kpis.onTimeRate,
    }),
    waybills: Object.freeze(
      snapshot.waybills.map((item) =>
        Object.freeze({
          id: item.id,
          status: item.status,
          progress: item.progress,
        }),
      ),
    ),
    events: Object.freeze(
      snapshot.events.slice(-4).map((event) =>
        Object.freeze({
          id: event.id,
          kind: event.kind,
          zone: event.zone,
        }),
      ),
    ),
  })
}

export function drawControlRoomLiveScreen(
  ctx,
  snapshot,
  width = 1200,
  height = 520,
) {
  const summary = controlRoomScreenSummary(snapshot)
  ctx.fillStyle = '#071521'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#24485c'
  ctx.fillRect(18, 18, width - 36, height - 36)
  ctx.strokeStyle = '#8fb4c1'
  ctx.lineWidth = 4
  ctx.strokeRect(18, 18, width - 36, height - 36)
  ctx.fillStyle = '#f4f1eb'
  ctx.font = '700 27px sans-serif'
  ctx.fillText('DR 仓配服务中心 · 动态调度摘要', 38, 50)
  ctx.fillStyle = '#d5af62'
  ctx.font = '600 17px sans-serif'
  ctx.fillText('模拟数据 · 示意', width - 190, 50)

  const cardWidth = 145
  drawCard(ctx, 38, 70, cardWidth, '入库', summary.kpis.inbound, ' 托')
  drawCard(ctx, 38, 150, cardWidth, '出库', summary.kpis.outbound, ' 托')
  drawCard(ctx, 38, 230, cardWidth, '在途', summary.kpis.inTransit, ' 单')
  drawCard(ctx, 38, 310, cardWidth, '准时率', summary.kpis.onTimeRate, '%')

  ctx.fillStyle = '#193c4d'
  ctx.fillRect(200, 70, 430, height - 100)
  drawMap(ctx, 218, 88, 394, 214)
  ctx.fillStyle = '#b7d4e0'
  ctx.font = '600 15px sans-serif'
  ctx.fillText('运单摘要', 218, 330)
  snapshot.waybills.slice(0, 3).forEach((item, index) => {
    const y = 356 + index * 39
    ctx.fillStyle = '#102735'
    ctx.fillRect(218, y - 20, 394, 31)
    ctx.fillStyle = '#f4f1eb'
    ctx.font = '600 14px sans-serif'
    ctx.fillText(
      `${compact(item.id, 14)}  ${compact(item.to, 6)}  ${text(item.progress)}%`,
      230,
      y,
    )
  })

  const rightX = 650
  ctx.fillStyle = '#102735'
  ctx.fillRect(rightX, 70, width - rightX - 38, height - 100)
  ctx.fillStyle = '#f4f1eb'
  ctx.font = '700 18px sans-serif'
  ctx.fillText('最近事件', rightX + 18, 102)
  const events = snapshot.events.slice(-4).toReversed()
  events.forEach((event, index) => {
    const y = 142 + index * 76
    ctx.fillStyle = index % 2 ? '#173342' : '#193c4d'
    ctx.fillRect(rightX + 16, y - 24, width - rightX - 70, 60)
    ctx.fillStyle = '#d5af62'
    ctx.font = '700 15px sans-serif'
    ctx.fillText(
      `${text(event.zone)} · ${compact(event.kind, 12)}`,
      rightX + 30,
      y,
    )
    ctx.fillStyle = '#b7d4e0'
    ctx.font = '500 13px sans-serif'
    ctx.fillText(compact(event.detail, 28), rightX + 30, y + 23)
  })
}

function snapshotSignature(snapshot) {
  return JSON.stringify({
    generatedAt: snapshot.generatedAt,
    waybills: snapshot.waybills,
    tasks: snapshot.tasks,
    events: snapshot.events,
  })
}

export function createControlRoomLiveScreen({
  context,
  texture,
  drawStatic,
  snapshotProvider = controlRoomSnapshotAt,
  width = 1200,
  height = 520,
  intervalMs = CONTROL_ROOM_LIVE_INTERVAL_MS,
  now = () => performance.now(),
  schedule = setInterval,
  unschedule = clearInterval,
  documentRef = globalThis.document,
  isVisible = () => true,
  warn = (...args) => console.warn(...args),
} = {}) {
  let provider = snapshotProvider
  let timer = 0
  let desired = false
  let disposed = false
  let failed = false
  let warned = false
  let accumulated = 0
  let activeSince = 0
  let lastElapsed = 0
  let lastSummary = null
  let signature = ''
  let uploads = 0

  const upload = () => {
    texture.needsUpdate = true
    uploads += 1
  }
  const fallback = (error) => {
    failed = true
    if (!warned) {
      warned = true
      warn('[dr-control-room] 动态摘要降级为静态画面', error)
    }
    desired = false
    if (timer) unschedule(timer)
    timer = 0
    drawStatic(context, width, height)
    signature = ''
    upload()
  }
  const render = () => {
    if (disposed || !desired) return
    if (!isVisible()) {
      pause()
      return
    }
    try {
      const elapsed = accumulated + Math.max(0, now() - activeSince)
      const snapshot = provider(elapsed)
      const nextSignature = snapshotSignature(snapshot)
      if (nextSignature === signature) return
      drawControlRoomLiveScreen(context, snapshot, width, height)
      lastElapsed = elapsed
      lastSummary = controlRoomScreenSummary(snapshot)
      signature = nextSignature
      upload()
    } catch (error) {
      fallback(error)
    }
  }
  const pause = () => {
    if (!timer) return
    accumulated += Math.max(0, now() - activeSince)
    unschedule(timer)
    timer = 0
  }
  const resume = () => {
    if (
      disposed ||
      !desired ||
      timer ||
      documentRef?.hidden ||
      !isVisible()
    ) {
      return
    }
    activeSince = now()
    render()
    if (desired) timer = schedule(render, intervalMs)
  }
  const start = () => {
    if (disposed || failed) return
    if (desired) {
      resume()
      return
    }
    desired = true
    accumulated = 0
    signature = ''
    resume()
  }
  const stop = () => {
    if (disposed || (!desired && !timer)) return
    desired = false
    if (timer) unschedule(timer)
    timer = 0
    accumulated = 0
    signature = ''
    drawStatic(context, width, height)
    upload()
  }
  const setDemo = (nextProvider) => {
    if (typeof nextProvider !== 'function') {
      fallback(new TypeError('snapshotProvider must be a function'))
      return
    }
    provider = nextProvider
    failed = false
    signature = ''
    if (desired) render()
  }
  const onVisibility = () => {
    if (documentRef.hidden) pause()
    else resume()
  }
  documentRef?.addEventListener?.('visibilitychange', onVisibility)

  return {
    start,
    stop,
    setDemo,
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
      intervalMs,
      elapsedMs: lastElapsed,
      summary: lastSummary,
    }),
  }
}
