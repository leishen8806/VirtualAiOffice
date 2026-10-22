export const MAP_VIEW = Object.freeze({ width: 520, height: 270, padding: 24 })

const GEO = Object.freeze({ lon0: 104.95, lat0: 12.55, lonMin: 102.3, lonMax: 107.6, latMin: 10.4, latMax: 14.7 })
const cosLat0 = Math.cos(GEO.lat0 * Math.PI / 180)
const raw = (lon, lat) => [(lon - GEO.lon0) * cosLat0, -(lat - GEO.lat0)]
const corners = [raw(GEO.lonMin, GEO.latMin), raw(GEO.lonMax, GEO.latMax)]
const spanX = corners[1][0] - corners[0][0], spanY = corners[0][1] - corners[1][1]
const scale = Math.min((MAP_VIEW.width - MAP_VIEW.padding * 2) / spanX, (MAP_VIEW.height - MAP_VIEW.padding * 2) / spanY)
const offsetX = (MAP_VIEW.width - spanX * scale) / 2 - corners[0][0] * scale
const offsetY = (MAP_VIEW.height - spanY * scale) / 2 - corners[1][1] * scale

export const projectLonLat = (lon, lat) => Object.freeze({ x: (raw(lon, lat)[0] * scale + offsetX), y: (raw(lon, lat)[1] * scale + offsetY) })

const OUTLINE_ANCHORS = [
  [102.35, 13.56], [102.72, 14.12], [103.15, 14.30], [103.65, 14.36], [104.05, 14.40], [104.40, 14.66],
  [104.75, 14.55], [105.10, 14.39], [105.55, 14.37], [105.95, 14.10], [106.28, 13.78], [106.52, 13.45],
  [106.72, 13.12], [107.05, 12.82], [107.38, 12.42], [107.55, 12.05], [107.43, 11.70], [107.35, 11.38],
  [107.08, 10.90], [106.70, 10.65], [106.35, 10.62], [105.95, 10.86], [105.55, 10.90], [105.25, 10.92],
  [104.95, 10.70], [104.63, 10.46], [104.30, 10.52], [104.02, 10.44], [103.72, 10.62], [103.45, 10.80],
  [103.18, 11.05], [103.02, 11.42], [102.72, 11.82], [102.47, 12.32], [102.38, 12.92],
]

export const CAMBODIA_OUTLINE_GEO = Object.freeze(OUTLINE_ANCHORS.flatMap((point, index) => {
  const next = OUTLINE_ANCHORS[(index + 1) % OUTLINE_ANCHORS.length]
  return [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]]
}).map(Object.freeze))

const city = (id, name, lat, lon, labelX = 10, labelY = -8) => Object.freeze({ id, name, lat, lon, ...projectLonLat(lon, lat), labelX, labelY })
export const CAMBODIA_CITIES = Object.freeze([
  city('phnom-penh', '金边', 11.556, 104.928, 12, 5),
  city('siem-reap', '暹粒', 13.367, 103.845, 10, -8),
  city('battambang', '马德望', 13.096, 103.202, -54, 16),
  city('poipet', '波贝', 13.652, 102.565, 10, -7),
  city('sihanoukville', '西哈努克港', 10.609, 103.530, -72, -9),
  city('kampot', '贡布', 10.610, 104.182, 10, 17),
  city('kampong-cham', '磅湛', 11.993, 105.464, 10, -8),
  city('kratie', '桔井', 12.488, 106.019, 10, -8),
])

export const CAMBODIA_ROUTE_PAIRS = Object.freeze(CAMBODIA_CITIES.slice(1).map(item => Object.freeze(['phnom-penh', item.id])))
const outlinePoints = CAMBODIA_OUTLINE_GEO.map(([lon, lat]) => projectLonLat(lon, lat))
export const CAMBODIA_OUTLINE_D = `${outlinePoints.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join('')}Z`
