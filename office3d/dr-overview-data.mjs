import { buildSnapshot } from './dr-console-data.js'

export const DR_OVERVIEW_SCHEMA = 'DrOverviewData v2'
export const DR_DATA_STATES = Object.freeze(['live', 'demo', 'unavailable'])

const FACILITIES = Object.freeze([
  Object.freeze({ id: 'W1', name: '智慧云仓' }),
  Object.freeze({ id: 'W2', name: '订单周转中心' }),
  Object.freeze({ id: 'W3', name: '集货物流中心' }),
])

const MAP = Object.freeze({
  country: 'Cambodia',
  hubs: Object.freeze([
    Object.freeze({ id: 'PHNOM_PENH', name: '金边', lng: 104.9282, lat: 11.5564 }),
    Object.freeze({ id: 'SIEM_REAP', name: '暹粒', lng: 103.856, lat: 13.3671 }),
    Object.freeze({ id: 'BATTAMBANG', name: '马德望', lng: 103.2022, lat: 13.0957 }),
    Object.freeze({ id: 'SIHANOUKVILLE', name: '西哈努克', lng: 103.5234, lat: 10.6273 }),
    Object.freeze({ id: 'POIPET', name: '波贝', lng: 102.565, lat: 13.658 }),
  ]),
  disclaimer: '路线与地点仅用于演示，不表示实时车辆位置或业务记录。',
})

export const DR_FACILITY_IDS = Object.freeze(FACILITIES.map(({ id }) => id))
export const DR_EVENT_KINDS = Object.freeze(['托盘上架', '分拣复核完成', '区内移动', '出库发运', '车辆进场登记', '月台占用'])
export const DR_TASK_STATUSES = Object.freeze(['进行中', '待处理', '已完成', '阻塞', '已取消'])
export const DR_SHIPMENT_STATUSES = Object.freeze(['装车中', '等待月台', '运输中', '已完成', '异常'])
const DEMO_COMPANY_RE = /^demo-[a-z0-9-]+$/i
const DEMO_EPOCH_MS = Date.parse('2026-01-01T00:00:00.000Z')

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const nonNegative = (value) => Number.isFinite(value) && value >= 0 ? value : null
const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0 ? value : null
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const rows = (value) => Array.isArray(value) ? value : []
const REQUIRED_COLLECTIONS = Object.freeze(['events', 'tasks', 'waybills', 'vehicles', 'alerts', 'devices'])
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

function iso(value) {
  if (typeof value !== 'string') return null
  const match = value.match(ISO_RE)
  if (!match || !Number.isFinite(Date.parse(value))) return null
  const [, year, month, day, hour, minute, second, , zone] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null
  if (zone !== 'Z') {
    const [, zoneHour, zoneMinute] = zone.match(/[+-](\d{2}):(\d{2})/)
    if (Number(zoneHour) > 23 || Number(zoneMinute) > 59) return null
  }
  return value
}

function validDuration(value) {
  return Number.isFinite(value) && value >= 0
}

function metric(value, state, source, observedAt, freshness, reason = null) {
  return Object.freeze({ value, state, source, observedAt, freshness, reason })
}

function freshness(observedAt, now, maxAgeMs, maxFutureMs) {
  if (!observedAt) return Object.freeze({ ageMs: null, stale: true, reason: 'UNKNOWN_TIME' })
  const ageMs = Date.parse(now) - Date.parse(observedAt)
  if (ageMs < -maxFutureMs) return Object.freeze({ ageMs, stale: true, reason: 'FUTURE_OBSERVATION' })
  if (ageMs > maxAgeMs) return Object.freeze({ ageMs, stale: true, reason: 'STALE' })
  return Object.freeze({ ageMs, stale: false, reason: null })
}

function unavailable(companyId, reason = 'NO_AUTHORIZED_SOURCE', now = null) {
  const observed = iso(now)
  const quality = freshness(null, observed || '1970-01-01T00:00:00.000Z', 0, 0)
  const empty = (source) => metric(null, 'unavailable', source, null, quality, reason)
  return Object.freeze({
    schemaVersion: DR_OVERVIEW_SCHEMA,
    companyId: text(companyId),
    generatedAt: observed,
    mode: 'unavailable',
    provenance: Object.freeze({ state: 'unavailable', source: 'none', assertedSource: null, verified: false, verification: 'none', reason }),
    freshness: quality,
    facilities: Object.freeze(FACILITIES.map((facility) => Object.freeze({
      ...facility, status: empty('facility-status'), usedSlots: empty('facility-capacity'),
      totalSlots: empty('facility-capacity'), utilization: empty('facility-capacity'),
    }))),
    inventory: Object.freeze({ totalPallets: empty('inventory'), categories: Object.freeze([]) }),
    activity: Object.freeze({ inboundPallets: empty('events'), outboundPallets: empty('events'), events: Object.freeze([]) }),
    transport: Object.freeze({ vehiclesInYard: empty('vehicles'), vehicles: Object.freeze([]), shipments: Object.freeze([]) }),
    work: Object.freeze({ active: empty('tasks'), pending: empty('tasks'), orders: Object.freeze([]) }),
    equipment: Object.freeze([]),
    alerts: Object.freeze({ total: empty('alerts'), items: Object.freeze([]) }),
    utilization: empty('facility-capacity'),
    map: Object.freeze({ ...MAP, state: 'unavailable', source: 'map-static', reason }),
  })
}

function demoTime(timeSlice) {
  const slice = Number.isFinite(timeSlice) && timeSlice >= 0 ? timeSlice : 0
  return new Date(DEMO_EPOCH_MS + Math.floor(slice) * 10_000).toISOString()
}

function validFacilityRows(payload) {
  const list = rows(payload.warehouses)
  const ids = list.map((row) => text(row?.id))
  if (ids.some((id) => !DR_FACILITY_IDS.includes(id))) return 'UNKNOWN_FACILITY_ID'
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_FACILITY_ID'
  if (ids.length !== DR_FACILITY_IDS.length || DR_FACILITY_IDS.some((id) => !ids.includes(id))) return 'FACILITY_COVERAGE_INCOMPLETE'
  for (const row of list) {
    if (nonNegativeInteger(row.usedSlots) === null || nonNegativeInteger(row.totalSlots) === null || row.totalSlots <= 0 || row.usedSlots > row.totalSlots) return 'INVALID_FACILITY_CAPACITY'
  }
  return null
}

function validPayload(payload, state) {
  if (!isObject(payload)) return 'INVALID_PAYLOAD'
  for (const key of REQUIRED_COLLECTIONS) if (!Array.isArray(payload[key])) return `INVALID_${key.toUpperCase()}_COLLECTION`
  const facilities = validFacilityRows(payload)
  if (facilities) return facilities
  const categories = rows(payload.inventoryByCategory)
  const categoryKeys = categories.map((row) => `${text(row?.name) || ''}\u0000${text(row?.unit) || ''}`)
  if (!categories.length || new Set(categoryKeys).size !== categoryKeys.length ||
    categories.some((row) => !text(row?.name) || !text(row?.unit) || nonNegativeInteger(row?.pallets) === null || nonNegativeInteger(row?.sku) === null)) return 'INVALID_INVENTORY'
  const categoryPallets = categories.reduce((sum, row) => sum + row.pallets, 0)
  if (nonNegativeInteger(payload.pallets) === null || payload.pallets !== categoryPallets) return 'INVENTORY_TOTAL_MISMATCH'
  for (const event of rows(payload.events)) {
    if (!text(event?.id) || !DR_FACILITY_IDS.includes(event?.zone) || !DR_EVENT_KINDS.includes(event?.kind) || nonNegativeInteger(event?.pallets) === null) return 'INVALID_EVENT'
    if (state === 'live' && !iso(event.at)) return 'INVALID_EVENT_TIME'
  }
  for (const task of rows(payload.tasks)) if (!text(task?.id) || !DR_FACILITY_IDS.includes(task?.zone) || !DR_TASK_STATUSES.includes(task?.status)) return 'INVALID_TASK_STATUS'
  for (const shipment of rows(payload.waybills)) {
    if (!text(shipment?.id) || !DR_FACILITY_IDS.includes(shipment?.zone) || !DR_SHIPMENT_STATUSES.includes(shipment?.status) ||
      nonNegativeInteger(shipment?.pallets) === null || !Number.isFinite(shipment?.progress) || shipment.progress < 0 || shipment.progress > 100 ||
      (state === 'live' && !iso(shipment?.eta))) return 'INVALID_SHIPMENT'
  }
  for (const vehicle of rows(payload.vehicles)) {
    const plannedDemoRoute = state === 'demo' && vehicle?.inYard === false && text(vehicle?.zone) === '计划路线'
    if (!text(vehicle?.id) || (!plannedDemoRoute && !DR_FACILITY_IDS.includes(vehicle?.zone)) || typeof vehicle?.inYard !== 'boolean') return 'INVALID_VEHICLE'
  }
  for (const device of rows(payload.devices)) if (!text(device?.name) || nonNegativeInteger(device?.total) === null || nonNegativeInteger(device?.normal) === null || device.normal > device.total) return 'INVALID_EQUIPMENT'
  if (rows(payload.alerts).some((row) => !text(row?.type) || nonNegativeInteger(row?.count) === null)) return 'INVALID_ALERT'
  return null
}

function normalize(payload, { companyId, state, sourceName, assertedSource, observedAt, now, maxAgeMs, maxFutureMs }) {
  const quality = freshness(observedAt, now, maxAgeMs, maxFutureMs)
  const value = (raw, source, reason = 'INVALID_VALUE') => metric(raw, raw === null ? 'unavailable' : state, source, observedAt, quality, raw === null ? reason : null)
  const facilities = new Map(rows(payload.warehouses).map((row) => [row.id, row]))
  const facilityRows = FACILITIES.map((facility) => {
    const row = facilities.get(facility.id)
    const utilization = Math.round(row.usedSlots / row.totalSlots * 1000) / 10
    return Object.freeze({ ...facility, status: value(text(row.status), sourceName, 'STATUS_UNKNOWN'), usedSlots: value(row.usedSlots, sourceName), totalSlots: value(row.totalSlots, sourceName), utilization: value(utilization, sourceName) })
  })
  const categories = rows(payload.inventoryByCategory).map((row) => Object.freeze({ name: row.name, pallets: value(row.pallets, sourceName), sku: value(row.sku, sourceName), unit: row.unit }))
  const events = rows(payload.events).map((row, index) => Object.freeze({
    id: row.id, facilityId: row.zone, kind: row.kind, pallets: value(row.pallets, sourceName),
    at: value(state === 'demo' ? new Date(Date.parse(observedAt) + index * 1000).toISOString() : row.at, sourceName),
  }))
  const inbound = events.filter((row) => row.kind === '托盘上架').reduce((sum, row) => sum + row.pallets.value, 0)
  const outbound = events.filter((row) => row.kind === '出库发运').reduce((sum, row) => sum + row.pallets.value, 0)
  const vehicles = rows(payload.vehicles).map((row) => Object.freeze({ id: text(row?.id), facilityId: text(row?.zone), inYard: row?.inYard === true })).filter((row) => row.id)
  const shipments = rows(payload.waybills).map((row) => Object.freeze({
    id: row.id, facilityId: row.zone, status: row.status, pallets: value(row.pallets, sourceName), progress: value(row.progress, sourceName),
    origin: text(row.from), destination: text(row.to), eta: value(state === 'demo' ? observedAt : row.eta, sourceName),
  }))
  const orders = rows(payload.tasks).map((row) => Object.freeze({ id: row.id, facilityId: row.zone, status: row.status }))
  const equipment = rows(payload.devices).map((row) => Object.freeze({ name: row.name, total: value(row.total, sourceName), normal: value(row.normal, sourceName), unavailable: value(row.total - row.normal, sourceName) }))
  const alerts = rows(payload.alerts).map((row) => Object.freeze({ type: row.type, count: value(row.count, sourceName) }))
  const totalUsed = facilityRows.reduce((sum, row) => sum + row.usedSlots.value, 0)
  const totalSlots = facilityRows.reduce((sum, row) => sum + row.totalSlots.value, 0)
  return Object.freeze({
    schemaVersion: DR_OVERVIEW_SCHEMA, companyId, generatedAt: now, mode: state,
    provenance: Object.freeze({
      state, source: sourceName, assertedSource: assertedSource || null, verified: state === 'live',
      verification: state === 'live' ? 'injected-authority-context' : 'deterministic-demo', reason: null,
    }),
    freshness: quality, facilities: Object.freeze(facilityRows),
    inventory: Object.freeze({ totalPallets: value(payload.pallets, sourceName), categories: Object.freeze(categories) }),
    activity: Object.freeze({ inboundPallets: value(inbound, sourceName), outboundPallets: value(outbound, sourceName), events: Object.freeze(events) }),
    transport: Object.freeze({ vehiclesInYard: value(vehicles.filter((row) => row.inYard).length, sourceName), vehicles: Object.freeze(vehicles), shipments: Object.freeze(shipments) }),
    work: Object.freeze({ active: value(orders.filter((row) => row.status === '进行中').length, sourceName), pending: value(orders.filter((row) => row.status === '待处理').length, sourceName), orders: Object.freeze(orders) }),
    equipment: Object.freeze(equipment), alerts: Object.freeze({ total: value(alerts.reduce((sum, row) => sum + (row.count.value || 0), 0), sourceName), items: Object.freeze(alerts) }),
    utilization: value(totalSlots > 0 ? Math.round(totalUsed / totalSlots * 1000) / 10 : null, sourceName),
    map: Object.freeze({ ...MAP, state: 'demo', source: 'static-demonstration-map', reason: 'STATIC_DEMONSTRATION_MAP' }),
  })
}

export function createDrOverviewAdapter({ verifyLive = null, maxAgeMs = 120000, maxFutureMs = 30000 } = {}) {
  if (!validDuration(maxAgeMs) || !validDuration(maxFutureMs)) throw new TypeError('maxAgeMs and maxFutureMs must be finite non-negative numbers')
  return (input = {}) => {
    const companyId = text(input.companyId)
    const source = isObject(input.source) ? input.source : null
    if (!source) return unavailable(companyId, 'SOURCE_REQUIRED', input.now)
    if (source.kind === 'demo') {
      if (!companyId || !DEMO_COMPANY_RE.test(companyId)) return unavailable(companyId, 'DEMO_COMPANY_REQUIRED', input.now)
      const observedAt = demoTime(input.timeSlice)
      // Demo callers choose only the deterministic seed/timeSlice, never an operational payload.
      const payload = buildSnapshot({ seed: input.seed, timeSlice: input.timeSlice })
      const invalid = validPayload(payload, 'demo')
      return invalid ? unavailable(companyId, invalid, observedAt) : normalize(payload, { companyId, state: 'demo', sourceName: source.name || 'dr-console-deterministic-demo', assertedSource: source.name, observedAt, now: observedAt, maxAgeMs, maxFutureMs })
    }
    if (source.kind !== 'live') return unavailable(companyId, 'INVALID_SOURCE_KIND', input.now)
    if (!iso(input.now)) return unavailable(companyId, 'NOW_REQUIRED', null)
    if (typeof verifyLive !== 'function') return unavailable(companyId, 'TRUST_CONTEXT_REQUIRED', input.now)
    if (!text(source.companyId) || !isObject(input.payload) || text(input.payload.companyId) !== companyId || source.companyId !== companyId) return unavailable(companyId, 'COMPANY_SCOPE_MISMATCH', input.now)
    let trusted
    try {
      trusted = verifyLive(Object.freeze({ companyId, source: Object.freeze({ companyId: text(source.companyId), name: text(source.name), observedAt: iso(source.observedAt) }), payload: input.payload }))
    } catch {
      return unavailable(companyId, 'VERIFIER_ERROR', input.now)
    }
    try {
      if (trusted && typeof trusted.then === 'function') return unavailable(companyId, 'ASYNC_VERIFIER_UNSUPPORTED', input.now)
    } catch {
      return unavailable(companyId, 'VERIFIER_ERROR', input.now)
    }
    if (!isObject(trusted) || trusted.ok !== true || !text(trusted.companyId) || trusted.companyId !== companyId) return unavailable(companyId, 'LIVE_SOURCE_NOT_VERIFIED', input.now)
    const observedAt = iso(source.observedAt)
    if (!observedAt) return unavailable(companyId, 'OBSERVED_AT_REQUIRED', input.now)
    const quality = freshness(observedAt, input.now, maxAgeMs, maxFutureMs)
    if (quality.reason) return unavailable(companyId, quality.reason, input.now)
    const invalid = validPayload(input.payload, 'live')
    return invalid ? unavailable(companyId, invalid, input.now) : normalize(input.payload, { companyId, state: 'live', sourceName: text(trusted.sourceName) || 'authorized-read-only-source', assertedSource: source.name, observedAt, now: input.now, maxAgeMs, maxFutureMs })
  }
}

export const adaptDrOverview = createDrOverviewAdapter()

export function createDemoDrOverview({ companyId = 'demo-company', seed = 2808, timeSlice = 0 } = {}) {
  return adaptDrOverview({ companyId, seed, timeSlice, source: { kind: 'demo', name: 'dr-console-deterministic-demo' } })
}
