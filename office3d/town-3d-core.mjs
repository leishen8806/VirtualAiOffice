export const MAP_ORIGIN = Object.freeze({ lat: 11.57, lon: 104.905 })
export const METERS_PER_DEG_LAT = 110540
export const METERS_PER_DEG_LON = 111320 * Math.cos(MAP_ORIGIN.lat * Math.PI / 180)

export function geoToWorld(lat, lon, unit = 10) {
  return {
    x: (Number(lon) - MAP_ORIGIN.lon) * METERS_PER_DEG_LON / unit,
    z: -(Number(lat) - MAP_ORIGIN.lat) * METERS_PER_DEG_LAT / unit,
  }
}

export function defaultBuildingHeight(tags = {}) {
  const levels = Number.parseFloat(tags['building:levels'])
  const parsedHeight = Number.parseFloat(String(tags.height ?? '').replace(/m$/i, ''))
  if (Number.isFinite(parsedHeight) && parsedHeight > 0) return Math.min(90, Math.max(3.2, parsedHeight))
  if (Number.isFinite(levels) && levels > 0) return Math.min(90, Math.max(3.2, levels * 3.2))
  return ['apartments', 'commercial', 'office', 'retail'].includes(tags.building) ? 12 : 6
}

export function qualitySample(buildings, quality = 'high') {
  if (quality !== 'low') return buildings
  return buildings.filter((_, index) => index % 2 === 0)
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
