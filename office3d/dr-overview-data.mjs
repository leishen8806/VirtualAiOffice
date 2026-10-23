import { buildSnapshot } from './dr-console-data.js'

export const DR_OVERVIEW_SCHEMA = 'DrOverviewData v1'
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

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const finite = (value) => Number.isFinite(value) ? value : null
const nonNegative = (value) => Number.isFinite(value) && value >= 0 ? value : null
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
const rows = (value) => Array.isArray(value) ? value : []
const byId = (items, id) => rows(items).find((item) => item?.id === id) || null

function metric(value, state, source, observedAt, freshness, reason = null) {
  return Object.freeze({ value, state, source, observedAt, freshness, reason })
}

function freshness(observedAt, now, maxAgeMs) {
  if (!observedAt) return Object.freeze({ ageMs: null, stale: true, reason: 'UNKNOWN_TIME' })
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(observedAt))
  return Object.freeze({ ageMs, stale: ageMs > maxAgeMs, reason: ageMs > maxAgeMs ? 'STALE' : null })
}

function unavailable(companyId, reason = 'NO_AUTHORIZED_SOURCE', now = null) {
  const observed = iso(now)
  const quality = freshness(null, observed || new Date(0).toISOString(), 0)
  const empty = (source) => metric(null, 'unavailable', source, null, quality, reason)
  return Object.freeze({
    schemaVersion: DR_OVERVIEW_SCHEMA,
    companyId: text(companyId),
    generatedAt: observed,
    mode: 'unavailable',
    provenance: Object.freeze({ state: 'unavailable', source: 'none', verified: false, reason }),
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

function sourceState(input) {
  const source = input?.source
  if (!isObject(source)) return { state: 'unavailable', reason: 'SOURCE_REQUIRED' }
  if (source.kind === 'demo') return { state: 'demo', reason: null }
  if (source.kind !== 'live') return { state: 'unavailable', reason: 'INVALID_SOURCE_KIND' }
  if (source.authenticated !== true || source.authorized !== true || source.verified !== true) return { state: 'unavailable', reason: 'LIVE_SOURCE_NOT_VERIFIED' }
  if (!text(input.companyId) || source.companyId !== input.companyId) return { state: 'unavailable', reason: 'COMPANY_SCOPE_MISMATCH' }
  if (!iso(source.observedAt)) return { state: 'unavailable', reason: 'UNKNOWN_TIME' }
  return { state: 'live', reason: null }
}

function normalize(input, state, sourceName, observedAt, now, maxAgeMs) {
  const payload = isObject(input.payload) ? input.payload : null
  if (!payload) return unavailable(input.companyId, 'INVALID_PAYLOAD', now)
  const quality = freshness(observedAt, now, maxAgeMs)
  const value = (raw, source, reason = 'INVALID_VALUE') => metric(raw, raw === null ? 'unavailable' : state, source, observedAt, quality, raw === null ? reason : null)
  const facilityRows = FACILITIES.map((facility) => {
    const row = byId(payload.warehouses, facility.id)
    const used = nonNegative(row?.usedSlots), total = nonNegative(row?.totalSlots)
    const utilization = used !== null && total !== null && total > 0 && used <= total ? Math.round(used / total * 1000) / 10 : null
    return Object.freeze({
      ...facility,
      status: value(text(row?.status) || (row ? 'known' : null), sourceName),
      usedSlots: value(used, sourceName), totalSlots: value(total, sourceName),
      utilization: value(utilization, sourceName),
    })
  })
  const categories = rows(payload.inventoryByCategory).map((row) => Object.freeze({
    name: text(row?.name), pallets: value(nonNegative(row?.pallets), sourceName),
    sku: value(nonNegative(row?.sku), sourceName), unit: text(row?.unit),
  })).filter((row) => row.name && row.unit)
  const events = rows(payload.events).map((row) => Object.freeze({
    id: text(row?.id), facilityId: text(row?.zone), kind: text(row?.kind),
    pallets: value(nonNegative(row?.pallets), sourceName), at: nonNegative(row?.at),
  })).filter((row) => row.id && row.facilityId && row.kind)
  const inbound = events.filter((row) => row.kind === '托盘上架').reduce((sum, row) => sum + (row.pallets.value || 0), 0)
  const outbound = events.filter((row) => row.kind === '出库发运').reduce((sum, row) => sum + (row.pallets.value || 0), 0)
  const vehicles = rows(payload.vehicles).map((row) => Object.freeze({
    id: text(row?.id), facilityId: text(row?.zone), inYard: row?.inYard === true,
  })).filter((row) => row.id && row.facilityId)
  const shipments = rows(payload.waybills).map((row) => Object.freeze({
    id: text(row?.id), facilityId: text(row?.zone), status: text(row?.status),
    pallets: value(nonNegative(row?.pallets), sourceName), progress: value(finite(row?.progress) !== null && row.progress >= 0 && row.progress <= 100 ? row.progress : null, sourceName),
    origin: text(row?.from), destination: text(row?.to), eta: text(row?.eta),
  })).filter((row) => row.id && row.facilityId)
  const orders = rows(payload.tasks).map((row) => Object.freeze({
    id: text(row?.id), facilityId: text(row?.zone), status: text(row?.status),
  })).filter((row) => row.id && row.facilityId)
  const equipment = rows(payload.devices).map((row) => {
    const total = nonNegative(row?.total), normal = nonNegative(row?.normal)
    return Object.freeze({ name: text(row?.name), total: value(total, sourceName), normal: value(normal, sourceName),
      unavailable: value(total !== null && normal !== null && normal <= total ? total - normal : null, sourceName) })
  }).filter((row) => row.name)
  const alerts = rows(payload.alerts).map((row) => Object.freeze({ type: text(row?.type), count: value(nonNegative(row?.count), sourceName) })).filter((row) => row.type)
  const totalPallets = nonNegative(payload.pallets)
  const totalUsed = facilityRows.reduce((sum, row) => sum + (row.usedSlots.value || 0), 0)
  const totalSlots = facilityRows.reduce((sum, row) => sum + (row.totalSlots.value || 0), 0)
  return Object.freeze({
    schemaVersion: DR_OVERVIEW_SCHEMA, companyId: text(input.companyId), generatedAt: observedAt, mode: state,
    provenance: Object.freeze({ state, source: sourceName, verified: state === 'live', reason: null }),
    freshness: quality, facilities: Object.freeze(facilityRows),
    inventory: Object.freeze({ totalPallets: value(totalPallets, sourceName), categories: Object.freeze(categories) }),
    activity: Object.freeze({ inboundPallets: value(inbound, sourceName), outboundPallets: value(outbound, sourceName), events: Object.freeze(events) }),
    transport: Object.freeze({ vehiclesInYard: value(vehicles.filter((row) => row.inYard).length, sourceName), vehicles: Object.freeze(vehicles), shipments: Object.freeze(shipments) }),
    work: Object.freeze({ active: value(orders.filter((row) => row.status === '进行中').length, sourceName), pending: value(orders.filter((row) => row.status === '待处理').length, sourceName), orders: Object.freeze(orders) }),
    equipment: Object.freeze(equipment), alerts: Object.freeze({ total: value(alerts.reduce((sum, row) => sum + (row.count.value || 0), 0), sourceName), items: Object.freeze(alerts) }),
    utilization: value(totalSlots > 0 ? Math.round(totalUsed / totalSlots * 1000) / 10 : null, sourceName),
    map: Object.freeze({ ...MAP, state, source: state === 'live' ? 'static-reference' : 'demo-reference', reason: null }),
  })
}

export function adaptDrOverview(input = {}) {
  const now = iso(input.now) || '2026-01-01T00:00:00.000Z'
  const maxAgeMs = Number.isFinite(input.maxAgeMs) && input.maxAgeMs >= 0 ? input.maxAgeMs : 120000
  const state = sourceState(input)
  if (state.state === 'unavailable') return unavailable(input.companyId, state.reason, now)
  const observedAt = state.state === 'live' ? input.source.observedAt : now
  return normalize(input, state.state, input.source.name || state.state, observedAt, now, maxAgeMs)
}

export function createDemoDrOverview({ companyId = 'demo-company', seed = 2808, timeSlice = 0, now = '2026-01-01T00:00:00.000Z' } = {}) {
  return adaptDrOverview({ companyId, payload: buildSnapshot({ seed, timeSlice }), source: { kind: 'demo', name: 'dr-console-deterministic-demo' }, now })
}
