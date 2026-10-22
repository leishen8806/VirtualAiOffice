import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DR_CAMPUS_GEO, OFFICE_GEO } from './office-geo.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MAX_BYTES = 400 * 1024
const CONTROL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/g
const TEXT_KEYS = new Set(['attribution', 'source', 'name', 'nameKm', 'label'])
const JSON_TYPE = 'application/json; charset=utf-8'
const SERVICE_UNAVAILABLE_MESSAGE = '地图数据暂不可用'
const MAP_ORIGIN = Object.freeze({ lat: 11.57, lon: 104.905 })
const METERS_PER_DEG_LAT = 110540
const METERS_PER_DEG_LON = 111320 * Math.cos(MAP_ORIGIN.lat * Math.PI / 180)

const clone = (value) => JSON.parse(JSON.stringify(value))
const strongEtag = (body) => `"${crypto.createHash('sha256').update(body).digest('hex')}"`

class TownMapJsonError extends Error {}
class TownMapValidationError extends Error {}

function sanitizeText(value) {
  if (typeof value !== 'string') return ''
  return Array.from(value.replace(CONTROL_RE, '')).slice(0, 80).join('')
}

function sanitizeValue(key, value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue('', item))
  if (!value || typeof value !== 'object') return TEXT_KEYS.has(key) ? sanitizeText(value) : value
  const out = {}
  for (const [childKey, childValue] of Object.entries(value)) out[childKey] = sanitizeValue(childKey, childValue)
  return out
}

function geoPoint(geo) {
  return [
    (geo.lon - MAP_ORIGIN.lon) * METERS_PER_DEG_LON,
    (geo.lat - MAP_ORIGIN.lat) * METERS_PER_DEG_LAT,
  ]
}

function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function placeKhan(layers, point) {
  return layers.khans.find((khan) => khan.rings.some((ring) => pointInRing(point, ring)))?.name || '未知'
}

function placeLandmark(data, { id, geo, type, name, note }) {
  const point = geoPoint(geo)
  return {
    id,
    name: name ?? geo.name,
    ...(geo.address ? { address: geo.address } : {}),
    note: note ?? geo.note,
    lat: geo.lat,
    lon: geo.lon,
    khan: placeKhan(data.layers, point),
    type,
    point,
  }
}

function addPlaceLandmarks(data) {
  return {
    ...data,
    layers: {
      ...data.layers,
      landmarks: [
        ...data.layers.landmarks,
        placeLandmark(data, {
          id: 'office-zixu-workshop',
          geo: OFFICE_GEO,
          type: 'office',
          name: '智序工场·办公室',
          note: `${OFFICE_GEO.note}；示意位置`,
        }),
        placeLandmark(data, {
          id: 'dr-logistics-campus',
          geo: DR_CAMPUS_GEO,
          type: 'logistics-center',
          name: 'DR 仓配服务中心',
          note: DR_CAMPUS_GEO.note,
        }),
      ],
    },
  }
}

function redactOfficeDetails(data) {
  const placeIds = new Set(['office-zixu-workshop', 'dr-logistics-campus'])
  return {
    ...data,
    layers: {
      ...data.layers,
      landmarks: data.layers.landmarks.map((item) => placeIds.has(item.id)
        ? {
            ...item,
            address: undefined,
            lat: undefined,
            lon: undefined,
            point: Array.isArray(item.point) ? item.point.map((value) => Math.round(value / 500) * 500) : undefined,
            note: item.id === 'office-zixu-workshop' ? '示意位置' : '粗化位置',
          }
        : item),
    },
  }
}

function validateTownMap(data, size) {
  if (size > MAX_BYTES) throw new TownMapValidationError('地图数据过大')
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TownMapValidationError('地图数据格式不对')
  if (typeof data.attribution !== 'string' || !data.attribution.includes('OpenStreetMap contributors') || !data.attribution.includes('ODbL')) throw new TownMapValidationError('地图署名不完整')
  if (!data.layers || typeof data.layers !== 'object' || Array.isArray(data.layers)) throw new TownMapValidationError('地图图层缺失')
  for (const key of ['khans', 'roads', 'water', 'landmarks']) if (!Array.isArray(data.layers[key])) throw new TownMapValidationError(`地图图层缺少 ${key}`)
}

function noBodyHeaders(headers) {
  const copy = { ...headers }
  delete copy['Content-Length']
  return copy
}

function errorResponse(method) {
  const body = JSON.stringify({ error: SERVICE_UNAVAILABLE_MESSAGE })
  const headers = {
    'Content-Type': JSON_TYPE,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Length': String(Buffer.byteLength(body)),
  }
  return { status: 503, headers, body: method === 'HEAD' ? '' : body }
}

function ifNoneMatchHit(raw, etag) {
  if (!raw) return false
  return String(raw).split(',').map((item) => item.trim()).includes(etag)
}

function classifyLoadFailure(error) {
  if (error instanceof TownMapJsonError) return 'JSON 无效'
  if (error instanceof TownMapValidationError) return '校验失败'
  if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '文件不存在'
  if (['EISDIR', 'EACCES', 'EPERM'].includes(error?.code)) return '文件不可读'
  return '校验失败'
}

export function loadTownMap({ file = path.join(HERE, 'town-map.json'), log = () => {} } = {}) {
  let loaded = null
  try {
    const raw = fs.readFileSync(file)
    let parsed
    try {
      parsed = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new TownMapJsonError('地图数据不是合法 JSON')
    }
    validateTownMap(parsed, raw.byteLength)
    const sourceData = path.resolve(file) === path.join(HERE, 'town-map.json') ? addPlaceLandmarks(parsed) : parsed
    const data = sanitizeValue('', sourceData)
    const body = JSON.stringify(data)
    const etag = strongEtag(body)
    loaded = {
      data,
      body,
      etag,
      headers: {
        'Content-Type': JSON_TYPE,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300',
        ETag: etag,
        'Content-Length': String(Buffer.byteLength(body)),
      },
    }
  } catch (error) {
    log(`[town-map] 加载失败：${classifyLoadFailure(error)}`)
    return {
      ready() { return false },
      view() { return null },
      handle({ method = 'GET' } = {}) { return errorResponse(method) },
    }
  }
  return {
    ready() { return true },
    view() { return clone(loaded.data) },
    handle({ method = 'GET', ifNoneMatch = '', redactOffice = false } = {}) {
      if (!['GET', 'HEAD'].includes(method)) return { status: 405, headers: { Allow: 'GET, HEAD' }, body: '' }
      const view = redactOffice ? redactOfficeDetails(loaded.data) : loaded.data
      const body = redactOffice ? JSON.stringify(view) : loaded.body
      const etag = redactOffice ? strongEtag(body) : loaded.etag
      const headers = redactOffice ? { ...loaded.headers, ETag: etag, 'Content-Length': String(Buffer.byteLength(body)) } : loaded.headers
      if (ifNoneMatchHit(ifNoneMatch, etag)) return { status: 304, headers: noBodyHeaders(headers), body: '' }
      return { status: 200, headers, body: method === 'HEAD' ? '' : body }
    },
  }
}
