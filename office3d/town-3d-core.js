export const MAP_ORIGIN = Object.freeze({ lat: 11.57, lon: 104.905 })
export const METERS_PER_DEG_LAT = 110540
export const METERS_PER_DEG_LON = 111320 * Math.cos(MAP_ORIGIN.lat * Math.PI / 180)

export function geoToWorld(lat, lon, unit = 10) {
  return {
    x: (Number(lon) - MAP_ORIGIN.lon) * METERS_PER_DEG_LON / unit,
    z: -(Number(lat) - MAP_ORIGIN.lat) * METERS_PER_DEG_LAT / unit,
  }
}

export function polygonShape(THREE, item, toPoint) {
  const rings = Array.isArray(item.rings) ? item.rings : [item.geometry || []]
  const outer = rings[0].map(toPoint).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (outer.length < 3) return null
  const shape = new THREE.Shape(outer)
  shape.holes = rings.slice(1).map((ring) => new THREE.Path(ring.map(toPoint)))
  return shape
}

export function polygonWorldPoint(THREE, [lon, lat]) {
  const point = geoToWorld(Number(lat), Number(lon), 10)
  return new THREE.Vector2(point.x, -point.z)
}

const pointInRing = ([x, y], ring) => ring.reduce((inside, point, index) => {
  const previous = ring[(index + ring.length - 1) % ring.length]
  return ((point[1] > y) !== (previous[1] > y)) && x < (previous[0] - point[0]) * (y - point[1]) / (previous[1] - point[1]) + point[0] ? !inside : inside
}, false)

export function waterContainsPoint(point, waters) {
  return waters.some(({ rings = [] }) => rings[0]?.length > 2 && pointInRing(point, rings[0]) && !rings.slice(1).some((ring) => pointInRing(point, ring)))
}

const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (a, b, point) => Math.abs(orientation(a, b, point)) < 1e-12 && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])
const segmentsIntersect = (a, b, c, d) => {
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b)
  return (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
}

export function waterContainsSegment(a, b, waters) {
  return waterContainsPoint(a, waters) || waterContainsPoint(b, waters) || waters.some(({ rings = [] }) => rings[0]?.some((point, index, ring) => segmentsIntersect(a, b, point, ring[(index + 1) % ring.length])))
}

export function defaultBuildingHeight(tags = {}) {
  const levels = Number.parseFloat(tags['building:levels'])
  const parsedHeight = Number.parseFloat(String(tags.height ?? '').replace(/m$/i, ''))
  if (Number.isFinite(parsedHeight) && parsedHeight > 0) return Math.min(90, Math.max(3.2, parsedHeight))
  if (Number.isFinite(levels) && levels > 0) return Math.min(90, Math.max(3.2, levels * 3.2))
  return ['apartments', 'commercial', 'office', 'retail'].includes(tags.building) ? 12 : 6
}

export function qualitySample(buildings, quality = 'high') {
  // Low quality keeps every building footprint; the renderer simplifies each
  // footprint to a box instead of deleting alternating buildings.
  return buildings.map((building) => ({ ...building, simplified: quality === 'low' }))
}

export function chunkPlan(buildings, { grid = 200 } = {}) {
  const chunks = new Map()
  for (const item of buildings) {
    const [x0, z0, x1, z1] = item.bboxWorld
    const key = `${Math.floor(x0 / grid)}:${Math.floor(z0 / grid)}`
    const list = chunks.get(key) || []
    list.push(item)
    chunks.set(key, list)
  }
  return [...chunks.entries()].map(([id, items]) => ({ id, items }))
}

export function roadTier(type = '') {
  if (['motorway', 'trunk', 'primary'].includes(type)) return 'major'
  if (['secondary', 'tertiary'].includes(type)) return 'secondary'
  return 'local'
}

export function groundPlan(buildings, margin = 30) {
  const boxes = buildings.map((item) => item.bboxWorld?.map(Number)).filter((box) => box?.length === 4 && box.every(Number.isFinite))
  if (!boxes.length) return { x: 0, z: 0, width: 1100, depth: 900 }
  const x0 = Math.min(...boxes.map((box) => box[0])), z0 = Math.min(...boxes.map((box) => box[1]))
  const x1 = Math.max(...boxes.map((box) => box[2])), z1 = Math.max(...boxes.map((box) => box[3]))
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0 + margin * 2, depth: z1 - z0 + margin * 2 }
}

export function landmarkProfile(label = '') {
  const value = label.toLowerCase()
  if (/stadium|fc\b/.test(value)) return 'stadium'
  if (/wat\b|pagoda|stupa|palace|monument/.test(value)) return 'spire'
  return 'block'
}
