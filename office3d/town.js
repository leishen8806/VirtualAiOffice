import {
  HIDDEN_LANDMARKS,
  collectLabelCandidates,
  displayNameLines,
  drawPlaceBadge,
  fitView,
  hitTest,
  khanNameMeta,
  LABEL_MODE_KEY,
  landmarkNameMeta,
  loadMapWithFallback,
  mapBounds,
  nextLabelFrame,
  PLACE_LANDMARK_IDS,
  resolveLabelPlacement,
  safeReadLabelMode,
  safeWriteLabelMode,
  typeText,
  validateMapData,
  worldToScreen,
  zoomAt,
} from './town-map-core.js'
import { placeNavigation } from './place-bar.js'

const canvas = document.getElementById('townMap')
const ctx = canvas.getContext('2d')
const staticCanvas = document.createElement('canvas')
const staticCtx = staticCanvas.getContext('2d')
const detail = {
  title: document.getElementById('detailTitle'),
  zh: document.getElementById('detailZh'),
  en: document.getElementById('detailEn'),
  km: document.getElementById('detailKm'),
  type: document.getElementById('detailType'),
  khan: document.getElementById('detailKhan'),
  latlon: document.getElementById('detailLatLon'),
}
const perfEl = document.getElementById('perf')
const perfMode = new URLSearchParams(location.search).get('perf') === '1'
const fallbackEl = document.getElementById('mapFallback')
const mapErrorEl = document.getElementById('mapError')
const placeTooltipEl = document.getElementById('placeTooltip')
const zoomStatusEl = document.getElementById('zoomStatus')
const modeButtons = [...document.querySelectorAll('[data-label-mode]')]
const darkQuery = matchMedia('(prefers-color-scheme: dark)')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const PLACE_IDS = PLACE_LANDMARK_IDS
const KHAN_DARK = ['#1d4752', '#513d67', '#25506c', '#614638', '#365746', '#59456d', '#31535e', '#72563b', '#2a5261', '#60425f', '#3d654e', '#6a513b', '#334f71', '#6c4653']
const KHAN_LIGHT = ['#c6ded9', '#dccfea', '#c9dceb', '#ead8ca', '#c9ddd0', '#ddd2eb', '#cadde1', '#e7d7c4', '#c5dce1', '#e0d0e1', '#d0e1cb', '#e6dbc5', '#cbd5ec', '#e5d0d7']
const ROAD_WIDTHS = Object.freeze({ motorway: 4.8, trunk: 3.8, primary: 2.8, secondary: 1.8 })

let data = null
let places = []
let bounds = null
let view = null
let cssWidth = 1
let cssHeight = 1
let dpr = 1
let selected = null
let hoveredPlaceId = ''
let labelMode = safeReadLabelMode()
let staticDirty = true
let scheduled = false
let labelAlphaState = new Map()
const pointers = new Map()
const frameTimes = []
const PLACE_SUMMARY = Object.freeze({
  'office-zixu-workshop': '办公室 · AI 团队指挥中心',
  'dr-logistics-campus': '仓配地点 · 仓配调度中心',
})
const PLACE_RING = Object.freeze({
  'office-zixu-workshop': '#9a6b24',
  'dr-logistics-campus': '#e8832a',
})
const placeLogo = new Image()
let placeLogoState = 'loading'
placeLogo.decoding = 'async'
placeLogo.addEventListener('load', () => {
  placeLogoState = 'ready'
  invalidate(false)
}, { once: true })
placeLogo.addEventListener('error', () => {
  placeLogoState = 'failed'
  invalidate(false)
}, { once: true })
placeLogo.src = '/assets/logo.png'

const theme = () => darkQuery.matches ? {
  bg: '#101922',
  water: 'rgba(73, 146, 179, 0.94)',
  boundary: 'rgba(225, 236, 241, 0.38)',
  road: 'rgba(204, 212, 217, 0.66)',
  roadMajor: 'rgba(245, 214, 148, 0.98)',
  roadCore: 'rgba(255, 241, 199, 0.92)',
  text: '#e8eff2',
  muted: '#a9b8c0',
  outline: '#0d151c',
  gold: '#f2cf78',
  khans: KHAN_DARK,
} : {
  bg: '#edf2f4',
  water: 'rgba(80, 162, 197, 0.88)',
  boundary: 'rgba(45, 66, 76, 0.34)',
  road: 'rgba(86, 101, 108, 0.62)',
  roadMajor: 'rgba(145, 95, 15, 0.9)',
  roadCore: 'rgba(207, 157, 68, 0.84)',
  text: '#20343b',
  muted: '#586c74',
  outline: '#f7fbfc',
  gold: '#8d671f',
  khans: KHAN_LIGHT,
}

function resize() {
  const rect = canvas.getBoundingClientRect()
  cssWidth = Math.max(1, rect.width)
  cssHeight = Math.max(1, rect.height)
  dpr = Math.min(2, devicePixelRatio || 1)
  canvas.width = staticCanvas.width = Math.round(cssWidth * dpr)
  canvas.height = staticCanvas.height = Math.round(cssHeight * dpr)
  if (bounds) {
    const fitted = fitView(bounds, cssWidth, cssHeight)
    view = view ? { ...view, baseScale: fitted.baseScale } : fitted
  }
  staticDirty = true
  invalidate(true)
}

const screen = ([x, y]) => worldToScreen({ x, y }, view, cssWidth, cssHeight)

function pathLine(g, line) {
  if (!line?.length) return
  const first = screen(line[0])
  g.moveTo(first.x, first.y)
  for (let i = 1; i < line.length; i++) {
    const point = screen(line[i])
    g.lineTo(point.x, point.y)
  }
}

function pathRings(g, rings) {
  g.beginPath()
  for (const ring of rings) {
    if (!ring.length) continue
    const first = screen(ring[0])
    g.moveTo(first.x, first.y)
    for (let i = 1; i < ring.length; i++) {
      const point = screen(ring[i])
      g.lineTo(point.x, point.y)
    }
    g.closePath()
  }
}

function drawStatic() {
  const c = theme()
  const g = staticCtx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, staticCanvas.width, staticCanvas.height)
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = c.bg
  g.fillRect(0, 0, cssWidth, cssHeight)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  g.strokeStyle = c.water
  g.lineWidth = Math.max(1.6, 3.4 * Math.min(2.5, Math.max(0.8, view.scale)))
  for (const water of data.layers.water) {
    for (const line of water.lines) {
      g.beginPath()
      pathLine(g, line)
      g.stroke()
    }
  }

  data.layers.khans.forEach((khan, index) => {
    pathRings(g, khan.rings)
    g.fillStyle = c.khans[index % c.khans.length]
    g.fill('evenodd')
    g.strokeStyle = c.boundary
    g.lineWidth = 1.25
    g.stroke()
  })

  for (const road of data.layers.roads) {
    const factor = Math.min(2.6, Math.max(0.92, Math.pow(view.scale, 0.28)))
    const width = (ROAD_WIDTHS[road.type] || 1.4) * factor
    g.beginPath()
    pathLine(g, road.line)
    if (road.type === 'motorway' || road.type === 'trunk' || road.type === 'primary') {
      g.strokeStyle = c.roadMajor
      g.lineWidth = width
      g.stroke()
      g.beginPath()
      pathLine(g, road.line)
      g.strokeStyle = c.roadCore
      g.lineWidth = Math.max(1.1, width * 0.38)
      g.stroke()
    } else {
      g.strokeStyle = c.road
      g.lineWidth = width
      g.stroke()
    }
  }
  staticDirty = false
}

function drawPlaces(g, c) {
  for (const place of places) {
    const point = screen(place.point)
    const color = PLACE_RING[place.id] || c.gold
    const active = hoveredPlaceId === place.id || selected?.item?.id === place.id
    g.save()
    g.translate(point.x, point.y)
    drawPlaceBadge(g, {
      scale: view.scale,
      color,
      active,
      logo: placeLogo,
      logoReady: placeLogoState === 'ready',
    })
    g.restore()
  }
}

function drawLandmarks(g, c) {
  g.fillStyle = c.text
  g.strokeStyle = c.outline
  g.lineWidth = 2
  for (const landmark of data.layers.landmarks) {
    if (PLACE_IDS.includes(landmark.id)) continue
    if (HIDDEN_LANDMARKS.includes(landmark.name)) continue
    if (view.scale < 1.2 && landmark.name !== 'Independence Monument') continue
    const point = screen(landmark.point)
    if (point.x < -12 || point.y < -12 || point.x > cssWidth + 12 || point.y > cssHeight + 12) continue
    g.beginPath()
    g.arc(point.x, point.y, view.scale >= 1.35 ? 3.6 : 2.5, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
}

function labelFont(kind, index) {
  if (kind === 'khan') return index === 0 ? '700 12px "Segoe UI",sans-serif' : '11px "Segoe UI",sans-serif'
  if (kind === 'office' || kind === 'place') return '700 12px "Segoe UI",sans-serif'
  return index === 0 ? '11px "Segoe UI",sans-serif' : '10px "Segoe UI",sans-serif'
}

function measureLabel(text, kind, index) {
  staticCtx.save()
  staticCtx.font = labelFont(kind, index)
  const width = staticCtx.measureText(text).width
  staticCtx.restore()
  return width
}

function drawLabels(g, c) {
  const layout = resolveLabelPlacement(collectLabelCandidates({ data, view, width: cssWidth, height: cssHeight, mode: labelMode, places }), measureLabel)
  const frame = nextLabelFrame(layout, labelAlphaState, reducedMotion.matches)
  labelAlphaState = frame.alphaState
  g.textBaseline = 'top'
  for (const label of frame.draw.filter((item) => item.x + item.w >= 0 && item.y + item.h >= 0 && item.x <= cssWidth && item.y <= cssHeight)) {
    g.save()
    g.globalAlpha = label.alpha
    if (label.kind === 'place') {
      g.fillStyle = 'rgba(255, 252, 245, 0.94)'
      g.strokeStyle = PLACE_RING[label.item?.id] || '#9a6b24'
      g.lineWidth = 1
      g.beginPath()
      g.roundRect(label.x, label.y, label.w, label.h, 7)
      g.fill()
      g.stroke()
    }
    g.strokeStyle = c.outline
    g.lineJoin = 'round'
    g.lineWidth = 4
    let y = label.y + 3
    for (let i = 0; i < label.lines.length; i++) {
      g.font = labelFont(label.kind, i)
      g.fillStyle = label.kind === 'place' ? '#20343b' : label.kind === 'khan' || label.kind === 'office' ? c.text : c.muted
      if (label.kind !== 'place') g.strokeText(label.lines[i], label.x + label.paddingX, y)
      g.fillText(label.lines[i], label.x + label.paddingX, y)
      y += label.lineHeight
    }
    g.restore()
  }
  return frame.animating
}

function drawSelection(g, c) {
  if (!selected) return
  if (PLACE_IDS.includes(selected.item?.id)) return
  g.strokeStyle = c.gold
  g.fillStyle = c.gold
  g.lineWidth = 3
  if (selected.kind === 'khan') {
    pathRings(g, selected.item.rings)
    g.stroke()
    return
  }
  const point = screen(selected.item.point)
  g.beginPath()
  g.arc(point.x, point.y, 13, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.arc(point.x, point.y, 4, 0, Math.PI * 2)
  g.fill()
}

function render() {
  scheduled = false
  if (document.hidden || !data || !view) return
  const started = performance.now()
  const c = theme()
  if (staticDirty) drawStatic()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(staticCanvas, 0, 0)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawPlaces(ctx, c)
  drawLandmarks(ctx, c)
  const animatingLabels = drawLabels(ctx, c)
  drawSelection(ctx, c)
  frameTimes.push(performance.now() - started)
  if (frameTimes.length > 60) frameTimes.shift()
  if (perfMode) {
    perfEl.hidden = false
    perfEl.textContent = `绘制 ${(frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(2)} ms`
  }
  if (animatingLabels) invalidate(false)
}

function invalidate(staticLayer = false) {
  staticDirty ||= staticLayer
  if (!scheduled && !document.hidden) {
    scheduled = true
    requestAnimationFrame(render)
  }
}

function titleOf(meta) {
  return meta.zh || meta.en || meta.km || '–'
}

function detailText(value) {
  return value || '–'
}

function describeKhan(name) {
  return khanNameMeta({ name, nameKm: '' })
}

function updateModeButtons() {
  for (const button of modeButtons) {
    const pressed = button.dataset.labelMode === labelMode
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
  }
}

function setLabelMode(mode) {
  labelMode = safeWriteLabelMode(mode)
  updateModeButtons()
  invalidate(false)
}

function resetView() {
  view = fitView(bounds, cssWidth, cssHeight)
  zoomStatusEl.textContent = '100%'
  invalidate(true)
}

function setZoom(factor, cursor = { x: cssWidth / 2, y: cssHeight / 2 }) {
  view = zoomAt(view, cursor, factor, cssWidth, cssHeight)
  zoomStatusEl.textContent = `${Math.round(view.scale * 100)}%`
  invalidate(true)
}

function setDetail(hit) {
  selected = hit
  if (!hit) {
    detail.title.textContent = '选择一个区或地标'
    detail.zh.textContent = '–'
    detail.en.textContent = '–'
    detail.km.textContent = '–'
    detail.type.textContent = '–'
    detail.khan.textContent = '–'
    detail.latlon.textContent = '–'
    invalidate(false)
    return
  }
  if (hit.kind === 'khan') {
    const meta = khanNameMeta(hit.item)
    detail.title.textContent = titleOf(meta)
    detail.zh.textContent = detailText(meta.zh)
    detail.en.textContent = detailText(meta.en)
    detail.km.textContent = detailText(meta.km)
    detail.type.textContent = '行政区'
    detail.khan.textContent = titleOf(meta)
    detail.latlon.textContent = '–'
  } else {
    const meta = landmarkNameMeta(hit.item)
    const khanMeta = describeKhan(hit.item.khan)
    detail.title.textContent = titleOf(meta)
    detail.zh.textContent = detailText(meta.zh)
    detail.en.textContent = detailText(meta.en)
    detail.km.textContent = detailText(meta.km)
    detail.type.textContent = typeText(hit.item.type)
    detail.khan.textContent = titleOf(khanMeta)
    detail.latlon.textContent = Number.isFinite(hit.item.lat) && Number.isFinite(hit.item.lon) ? `${hit.item.lat.toFixed(6)}, ${hit.item.lon.toFixed(6)}` : '–'
  }
  invalidate(false)
}

function selectAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  const hit = hitTest({ x: clientX - rect.left, y: clientY - rect.top }, data, view, cssWidth, cssHeight)
  setDetail(hit)
  return hit
}

function hidePlaceTooltip() {
  placeTooltipEl.hidden = true
  document.body.dataset.placeHover = 'false'
  if (hoveredPlaceId) {
    hoveredPlaceId = ''
    invalidate(false)
  }
}

function updatePlaceTooltip(event) {
  if (!data || !view || pointers.size) {
    hidePlaceTooltip()
    return
  }
  const rect = canvas.getBoundingClientRect()
  const hit = hitTest({ x: event.clientX - rect.left, y: event.clientY - rect.top }, data, view, cssWidth, cssHeight)
  const summary = hit?.kind === 'landmark' ? PLACE_SUMMARY[hit.item.id] : ''
  if (!summary) {
    hidePlaceTooltip()
    return
  }
  if (hoveredPlaceId !== hit.item.id) {
    hoveredPlaceId = hit.item.id
    invalidate(false)
  }
  placeTooltipEl.textContent = `${hit.item.name}\n${summary}`
  placeTooltipEl.style.left = `${Math.max(12, Math.min(cssWidth - 292, event.clientX + 14))}px`
  placeTooltipEl.style.top = `${Math.max(12, Math.min(cssHeight - 72, event.clientY + 14))}px`
  placeTooltipEl.hidden = false
  document.body.dataset.placeHover = 'true'
}

function navigateToPlace(item) {
  const target = placeNavigation(item.id)
  document.body.dataset.placeTransition = 'true'
  placeTooltipEl.textContent = `正在进入${target.name}…`
  placeTooltipEl.hidden = false
  const wait = reducedMotion.matches ? 0 : 160
  setTimeout(() => location.assign(target.placeHref), wait)
}

canvas.addEventListener('wheel', (event) => {
  event.preventDefault()
  const rect = canvas.getBoundingClientRect()
  setZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, { x: event.clientX - rect.left, y: event.clientY - rect.top })
}, { passive: false })

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY })
  canvas.classList.add('dragging')
  if (pointers.size === 2) {
    const items = [...pointers.values()]
    pointers.pinch = { distance: Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y), view: { ...view } }
  }
})

canvas.addEventListener('pointermove', (event) => {
  const pointer = pointers.get(event.pointerId)
  if (!pointer) return
  const old = { x: pointer.x, y: pointer.y }
  pointer.x = event.clientX
  pointer.y = event.clientY
  if (pointers.size === 1) {
    const dx = pointer.x - old.x
    const dy = pointer.y - old.y
    const unit = view.baseScale * view.scale
    view = { ...view, cx: view.cx - dx / unit * 10, cy: view.cy + dy / unit * 10 }
    invalidate(true)
    return
  }
  if (pointers.size === 2 && pointers.pinch) {
    const items = [...pointers.values()]
    const mid = { x: (items[0].x + items[1].x) / 2, y: (items[0].y + items[1].y) / 2 }
    const rect = canvas.getBoundingClientRect()
    const distance = Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y)
    view = zoomAt(pointers.pinch.view, { x: mid.x - rect.left, y: mid.y - rect.top }, distance / pointers.pinch.distance, cssWidth, cssHeight)
    invalidate(true)
  }
})
canvas.addEventListener('pointermove', updatePlaceTooltip)
canvas.addEventListener('pointerleave', hidePlaceTooltip)

function pointerEnd(event) {
  const pointer = pointers.get(event.pointerId)
  pointers.delete(event.pointerId)
  if (pointers.size < 2) delete pointers.pinch
  if (!pointers.size) canvas.classList.remove('dragging')
  if (!pointers.size && pointer && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) {
    const hit = selectAt(event.clientX, event.clientY)
    if (hit?.kind === 'landmark' && PLACE_IDS.includes(hit.item.id)) navigateToPlace(hit.item)
  }
}

canvas.addEventListener('pointerup', pointerEnd)
canvas.addEventListener('pointercancel', pointerEnd)

canvas.addEventListener('keydown', (event) => {
  const pan = 80 / (view.baseScale * view.scale) * 10
  if (event.key === '+' || event.key === '=') setZoom(1.25)
  else if (event.key === '-') setZoom(0.8)
  else if (event.key === '0') resetView()
  else if (event.key === 'Escape') setDetail(null)
  else if (event.key === 'ArrowLeft') { view.cx -= pan; invalidate(true) }
  else if (event.key === 'ArrowRight') { view.cx += pan; invalidate(true) }
  else if (event.key === 'ArrowUp') { view.cy += pan; invalidate(true) }
  else if (event.key === 'ArrowDown') { view.cy -= pan; invalidate(true) }
  else return
  event.preventDefault()
})

document.getElementById('zoomIn').addEventListener('click', () => setZoom(1.25))
document.getElementById('zoomOut').addEventListener('click', () => setZoom(0.8))
document.getElementById('resetMap').addEventListener('click', resetView)
document.getElementById('reloadMap').addEventListener('click', () => location.reload())
for (const button of modeButtons) button.addEventListener('click', () => setLabelMode(button.dataset.labelMode))
addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(true) })
darkQuery.addEventListener('change', () => invalidate(true))
reducedMotion.addEventListener('change', () => invalidate(false))

updateModeButtons()
perfEl.hidden = !perfMode

try {
  const loaded = await loadMapWithFallback({
    fetchImpl: (url) => fetch(url),
    importImpl: (url) => import(url),
  })
  if (!validateMapData(loaded.data)) throw new Error('地图数据校验失败')
  data = loaded.data
  places = data.layers.landmarks.filter((item) => PLACE_IDS.includes(item.id))
  fallbackEl.hidden = !loaded.usedFallback
  bounds = mapBounds(data.layers.khans)
  resize()
  setDetail(null)
} catch (error) {
  console.error('[town] 地图载入失败', error)
  mapErrorEl.hidden = false
}
