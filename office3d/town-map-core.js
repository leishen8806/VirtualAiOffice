import { DEFAULT_LABEL_MODE, KHAN_NAME_MAP, LABEL_MODES, LANDMARK_NAME_MAP } from './town-names.js'

export const MIN_SCALE = 0.35
export const MAX_SCALE = 8
export const METERS_PER_UNIT = 10
export const HIDDEN_LANDMARKS = Object.freeze(['Baby Mckie Shop', '(stupa)'])
export const LABEL_MODE_KEY = 'town.labelMode'
export const LABEL_FADE_RATE = 0.22
export const LABEL_GAP = 4
export const PLACE_LANDMARK_IDS = Object.freeze(['office-zixu-workshop', 'dr-logistics-campus'])
export const MAJOR_LANDMARKS = Object.freeze([
  'Independence Monument',
  'Royal Palace',
  'Central Market',
  'National Museum of Cambodia',
  'Wat Phnom Pagoda',
  'Phsar Toul Tom Poung',
  'Tuol Sleng Genocide Museum',
  'AEON Mall 1',
  'AEON Mall 2',
  'Phnom Penh',
])
export const LANDMARK_TYPE_TEXT = Object.freeze({
  'amenity:hospital': '医院',
  'amenity:marketplace': '市场',
  'historic:castle': '宫殿',
  'historic:monument': '纪念地标',
  'leisure:stadium': '体育场',
  'railway:station': '火车站',
  'shop:mall': '商场',
  'tourism:attraction': '景点',
  'tourism:museum': '博物馆',
  office: '办公地点',
  'logistics-center': '仓配地点',
})

const TEXT_CONTROL_RE = /[\u0000-\u001f\u007f\u2028\u2029<>]/g
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smooth = (a, b, value) => {
  if (value <= a) return 0
  if (value >= b) return 1
  const t = (value - a) / Math.max(1e-9, b - a)
  return t * t * (3 - 2 * t)
}

export const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export function placeMarkerMetrics(scale, imageWidth = 0, imageHeight = 0) {
  const diameter = 28 + smooth(0.8, 3, clampScale(scale)) * 16
  const maxLogoWidth = diameter * 0.72
  const maxLogoHeight = diameter * 0.55
  const ratio = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1
  const logoWidth = Math.min(maxLogoWidth, maxLogoHeight * ratio)
  const logoHeight = logoWidth / ratio
  return Object.freeze({
    diameter,
    radius: diameter / 2,
    hitRadius: Math.max(32, diameter / 2),
    logoWidth,
    logoHeight,
  })
}

export function drawPlaceBadge(context, {
  scale,
  color,
  active = false,
  logo = null,
  logoReady = false,
} = {}) {
  const metrics = placeMarkerMetrics(scale, logo?.naturalWidth, logo?.naturalHeight)
  context.strokeStyle = color
  context.lineWidth = active ? 3.5 : 2
  context.beginPath()
  context.arc(0, 0, metrics.radius, 0, Math.PI * 2)
  context.fillStyle = '#fbf8f0'
  context.fill()
  context.stroke()
  if (logoReady && logo?.naturalWidth > 0 && logo?.naturalHeight > 0) {
    context.save()
    context.beginPath()
    context.arc(0, 0, Math.max(1, metrics.radius - 3), 0, Math.PI * 2)
    context.clip()
    context.drawImage(logo, -metrics.logoWidth / 2, -metrics.logoHeight / 2, metrics.logoWidth, metrics.logoHeight)
    context.restore()
    return { ...metrics, usedLogo: true }
  }
  context.fillStyle = color
  context.beginPath()
  context.arc(0, 0, 4, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.moveTo(0, -metrics.radius - 6)
  context.lineTo(5, -metrics.radius + 3)
  context.lineTo(-5, -metrics.radius + 3)
  context.closePath()
  context.fill()
  return { ...metrics, usedLogo: false }
}

export function sanitizeText(value, limit = 80) {
  if (typeof value !== 'string') return ''
  return Array.from(value.replace(TEXT_CONTROL_RE, '')).slice(0, limit).join('')
}

export function validateMapData(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    data.layers &&
    Array.isArray(data.layers.khans) &&
    Array.isArray(data.layers.roads) &&
    Array.isArray(data.layers.water) &&
    Array.isArray(data.layers.landmarks) &&
    typeof data.attribution === 'string' &&
    data.attribution.includes('OpenStreetMap contributors') &&
    data.attribution.includes('ODbL')
  )
}

export async function loadMapWithFallback({ fetchImpl, importImpl } = {}) {
  let remoteError = null
  try {
    const response = await fetchImpl('/town/map')
    if (response?.status === 200) {
      const payload = await response.json()
      if (validateMapData(payload)) return { data: payload, usedFallback: false, source: 'api' }
      throw new Error('invalid town map payload')
    }
    throw new Error(`unexpected status ${response?.status}`)
  } catch (error) {
    remoteError = error
  }
  try {
    const local = await importImpl('./town-map-data.js')
    const payload = local?.default ?? local
    if (!validateMapData(payload)) throw new Error('invalid fallback town map payload')
    return { data: payload, usedFallback: true, source: 'local-backup', remoteError }
  } catch (fallbackError) {
    const error = new Error('地图数据未能载入')
    error.remoteError = remoteError
    error.fallbackError = fallbackError
    throw error
  }
}

export function normalizeLabelMode(mode) {
  return LABEL_MODES.includes(mode) ? mode : DEFAULT_LABEL_MODE
}

export function safeReadLabelMode(storage = globalThis.localStorage) {
  try {
    return normalizeLabelMode(storage?.getItem(LABEL_MODE_KEY))
  } catch {
    return DEFAULT_LABEL_MODE
  }
}

export function safeWriteLabelMode(mode, storage = globalThis.localStorage) {
  const next = normalizeLabelMode(mode)
  try {
    storage?.setItem(LABEL_MODE_KEY, next)
  } catch {}
  return next
}

export function mapBounds(khans) {
  const xs = []
  const ys = []
  for (const khan of khans) for (const ring of khan.rings) for (const [x, y] of ring) { xs.push(x); ys.push(y) }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

export function fitView(bounds, width, height, padding = 36) {
  const usableW = Math.max(1, width - padding * 2)
  const usableH = Math.max(1, height - padding * 2)
  const baseScale = Math.min(usableW / ((bounds.x1 - bounds.x0) / METERS_PER_UNIT), usableH / ((bounds.y1 - bounds.y0) / METERS_PER_UNIT))
  return { cx: (bounds.x0 + bounds.x1) / 2, cy: (bounds.y0 + bounds.y1) / 2, scale: 1, baseScale }
}

export const worldToScreen = (point, view, width, height) => ({
  x: width / 2 + (point.x - view.cx) / METERS_PER_UNIT * view.baseScale * view.scale,
  y: height / 2 - (point.y - view.cy) / METERS_PER_UNIT * view.baseScale * view.scale,
})

export const screenToWorld = (point, view, width, height) => ({
  x: view.cx + (point.x - width / 2) / (view.baseScale * view.scale) * METERS_PER_UNIT,
  y: view.cy - (point.y - height / 2) / (view.baseScale * view.scale) * METERS_PER_UNIT,
})

export function zoomAt(view, cursor, factor, width, height) {
  const anchor = screenToWorld(cursor, view, width, height)
  const scale = clampScale(view.scale * factor)
  return {
    cx: anchor.x - (cursor.x - width / 2) / (view.baseScale * scale) * METERS_PER_UNIT,
    cy: anchor.y + (cursor.y - height / 2) / (view.baseScale * scale) * METERS_PER_UNIT,
    scale,
    baseScale: view.baseScale,
  }
}

export function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > point.y) !== (yj > point.y) && point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function hitTest(screenPoint, data, view, width, height, landmarkRadius = 10) {
  const visible = data.layers.landmarks.filter((item) => !HIDDEN_LANDMARKS.includes(item.name))
  for (let i = visible.length - 1; i >= 0; i--) {
    const landmark = visible[i]
    const point = worldToScreen({ x: landmark.point[0], y: landmark.point[1] }, view, width, height)
    const radius = PLACE_LANDMARK_IDS.includes(landmark.id) ? placeMarkerMetrics(view.scale).hitRadius : landmarkRadius
    if (Math.hypot(screenPoint.x - point.x, screenPoint.y - point.y) <= radius) return { kind: 'landmark', item: landmark }
  }
  const world = screenToWorld(screenPoint, view, width, height)
  for (let i = data.layers.khans.length - 1; i >= 0; i--) {
    const khan = data.layers.khans[i]
    if (khan.rings.some((ring) => pointInRing(world, ring))) return { kind: 'khan', item: khan }
  }
  return null
}

export function avoidLabelCollisions(labels, gap = LABEL_GAP) {
  const kept = []
  for (const label of labels) {
    const overlaps = kept.some((item) => label.x < item.x + item.w + gap && item.x < label.x + label.w + gap && label.y < item.y + item.h + gap && item.y < label.y + label.h + gap)
    if (!overlaps) kept.push(label)
  }
  return kept
}

export function typeText(type) {
  return LANDMARK_TYPE_TEXT[type] || '地标'
}

export function khanNameMeta(khan) {
  const entry = KHAN_NAME_MAP[khan?.name] || { zh: '', en: sanitizeText(String(khan?.name || '').replace(/^Khan\s+/, '')) }
  return {
    zh: sanitizeText(entry.zh),
    en: sanitizeText(entry.en),
    km: sanitizeText(khan?.nameKm || ''),
  }
}

export function landmarkNameMeta(landmark) {
  const en = sanitizeText(landmark?.name || '')
  return {
    zh: sanitizeText(LANDMARK_NAME_MAP[landmark?.name] || ''),
    en,
    km: sanitizeText(landmark?.nameKm || ''),
  }
}

export function displayNameLines(meta, mode = DEFAULT_LABEL_MODE) {
  const current = normalizeLabelMode(mode)
  if (current === 'en') return [meta.en || meta.zh || meta.km || '–']
  if (current === 'km') return [meta.km || meta.en || meta.zh || '–']
  if (meta.zh) return meta.en && meta.en !== meta.zh ? [meta.zh, `(${meta.en})`] : [meta.zh]
  return [meta.en || meta.km || '–']
}

export function labelPriority(candidate) {
  if (candidate.kind === 'place') return 5
  if (candidate.kind === 'khan') return 4
  if (candidate.kind === 'office') return 3
  if (candidate.kind === 'landmark-major') return 2
  return 1
}

export function isMajorLandmark(name) {
  return MAJOR_LANDMARKS.includes(name)
}

export function collectLabelCandidates({ data, view, width, height, mode, office, places = [] }) {
  const candidates = []
  for (const khan of data.layers.khans) {
    const point = worldToScreen({ x: khan.center[0], y: khan.center[1] }, view, width, height)
    candidates.push({
      key: `khan:${khan.id}`,
      kind: 'khan',
      lines: displayNameLines(khanNameMeta(khan), mode),
      anchor: point,
      alpha: clamp(1 - smooth(3.1, 4.8, view.scale) * 0.42, 0.58, 1),
      item: khan,
    })
  }
  if (office?.point) {
    const point = worldToScreen({ x: office.point[0], y: office.point[1] }, view, width, height)
    candidates.push({
      key: `office:${office.id || 'office'}`,
      kind: 'office',
      lines: [sanitizeText(office.label || '智序工场')],
      anchor: point,
      alpha: 1,
      item: office,
    })
  }
  for (const place of places) {
    if (!place?.point) continue
    const point = worldToScreen({ x: place.point[0], y: place.point[1] }, view, width, height)
    candidates.push({
      key: `place:${place.id || place.name}`,
      kind: 'place',
      lines: [sanitizeText(place.name || place.label || '地点')],
      anchor: point,
      markerRadius: placeMarkerMetrics(view.scale).radius,
      alpha: 1,
      item: place,
    })
  }
  for (const landmark of data.layers.landmarks) {
    if (places.some((place) => place.id === landmark.id)) continue
    if (HIDDEN_LANDMARKS.includes(landmark.name)) continue
    const major = isMajorLandmark(landmark.name)
    const alpha = major ? smooth(1.2, 1.5, view.scale) : smooth(1.82, 2.18, view.scale)
    if (alpha <= 0) continue
    const point = worldToScreen({ x: landmark.point[0], y: landmark.point[1] }, view, width, height)
    candidates.push({
      key: `landmark:${landmark.id}`,
      kind: major ? 'landmark-major' : 'landmark-minor',
      lines: displayNameLines(landmarkNameMeta(landmark), mode),
      anchor: point,
      alpha,
      item: landmark,
    })
  }
  return candidates.sort((a, b) => labelPriority(b) - labelPriority(a) || b.alpha - a.alpha)
}

export function measureLabelBox(candidate, measureText) {
  const lineHeight = candidate.kind === 'khan' ? 15 : candidate.kind === 'office' || candidate.kind === 'place' ? 14 : 13
  const paddingX = candidate.kind === 'khan' ? 7 : candidate.kind === 'place' ? 8 : 6
  const widths = candidate.lines.map((line, index) => measureText(line, candidate.kind, index))
  const boxWidth = Math.max(...widths, 18) + paddingX * 2
  const boxHeight = candidate.lines.length * lineHeight + 6
  const centered = candidate.kind === 'khan'
  const x = centered ? candidate.anchor.x - boxWidth / 2 : candidate.anchor.x + (candidate.kind === 'place' ? candidate.markerRadius + 6 : 9)
  const y = centered ? candidate.anchor.y - boxHeight / 2 : candidate.anchor.y - boxHeight / 2
  return {
    x,
    y,
    w: boxWidth,
    h: boxHeight,
    lineHeight,
    paddingX,
  }
}

export function resolveLabelPlacement(candidates, measureText, gap = LABEL_GAP) {
  const placed = []
  const hidden = []
  const ordered = [...candidates].sort((a, b) => labelPriority(b) - labelPriority(a) || b.alpha - a.alpha)
  for (const candidate of ordered) {
    const box = measureLabelBox(candidate, measureText)
    const label = { ...candidate, ...box, priority: labelPriority(candidate) }
    const overlaps = placed.some((item) => label.x < item.x + item.w + gap && item.x < label.x + label.w + gap && label.y < item.y + item.h + gap && item.y < label.y + label.h + gap)
    if (overlaps && candidate.kind !== 'place') hidden.push({ ...label, alpha: 0 })
    else placed.push(label)
  }
  return { visible: placed, hidden }
}

export function nextLabelFrame(layout, alphaState = new Map(), reducedMotion = false) {
  const next = new Map(alphaState)
  let animating = false
  const draw = []
  const targets = [...layout.visible, ...layout.hidden]
  for (const label of targets) {
    const current = next.get(label.key) ?? 0
    const target = label.alpha
    const alpha = reducedMotion ? target : current + (target - current) * LABEL_FADE_RATE
    next.set(label.key, alpha)
    if (Math.abs(alpha - target) > 0.02) animating = true
    if (alpha > 0.03) draw.push({ ...label, alpha })
  }
  for (const [key, value] of next.entries()) {
    if (!targets.some((label) => label.key === key)) {
      const alpha = reducedMotion ? 0 : value * (1 - LABEL_FADE_RATE)
      if (alpha <= 0.03) next.delete(key)
      else {
        next.set(key, alpha)
        animating = true
      }
    }
  }
  return { alphaState: next, draw, animating }
}
