import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { DR_DATA_STATES, DR_OVERVIEW_SCHEMA, adaptDrOverview, createDemoDrOverview, createDrOverviewAdapter } from '../dr-overview-data.mjs'
import { buildSnapshot } from '../dr-console-data.js'

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/dr-overview-live.json', import.meta.url), 'utf8'))
const now = '2026-10-23T10:01:00.000Z'
const adapterVerify = ({ companyId, source, payload }) => companyId === 'company-a' && source.companyId === 'company-a' && payload?.companyId === 'company-a'
    ? { ok: true, companyId: 'company-a', sourceName: 'authorized-read-only-fixture' }
    : { ok: false }
const adapter = createDrOverviewAdapter({ verifyLive: adapterVerify })
const live = (payload = fixture, extra = {}) => adapter({
  companyId: 'company-a', payload,
  source: { kind: 'live', name: 'caller-assertion-is-not-trust', companyId: 'company-a', observedAt: fixture.observedAt },
  now, ...extra,
})

test('schema is stable and every published metric declares data state and provenance', () => {
  const data = live()
  assert.equal(data.schemaVersion, DR_OVERVIEW_SCHEMA)
  assert.deepEqual(DR_DATA_STATES, ['live', 'demo', 'unavailable'])
  assert.equal(data.mode, 'live')
  assert.equal(data.provenance.source, 'authorized-read-only-fixture')
  assert.equal(data.provenance.assertedSource, 'caller-assertion-is-not-trust')
  assert.equal(data.provenance.verification, 'injected-authority-context')
  assert.equal(data.facilities.length, 3)
  for (const facility of data.facilities) for (const key of ['status', 'usedSlots', 'totalSlots', 'utilization']) {
    assert.equal(facility[key].state, 'live')
    assert.equal(facility[key].source, 'authorized-read-only-fixture')
    assert.equal(facility[key].observedAt, fixture.observedAt)
  }
  assert.equal(data.inventory.totalPallets.value, 17)
  assert.equal(data.activity.inboundPallets.value, 3)
  assert.equal(data.activity.outboundPallets.value, 2)
  assert.equal(data.transport.vehiclesInYard.value, 1)
  assert.equal(data.work.active.value, 1)
  assert.equal(data.equipment[0].unavailable.value, 1)
  assert.equal(data.map.country, 'Cambodia')
  assert.equal(data.map.state, 'demo')
  assert.equal(data.map.reason, 'STATIC_DEMONSTRATION_MAP')
})

test('missing and partial values remain unavailable instead of becoming demo values', () => {
  const data = live({ ...fixture, pallets: -17, warehouses: [{ id: 'W1', usedSlots: 21, totalSlots: 20 }] })
  assert.equal(data.inventory.totalPallets.state, 'unavailable')
  assert.equal(data.facilities.find((row) => row.id === 'W1').utilization.state, 'unavailable')
  assert.equal(data.facilities.find((row) => row.id === 'W2').usedSlots.state, 'unavailable')
  assert.equal(data.mode, 'unavailable')
})

test('caller assertions never self-authorize live data and trusted scope must cover request source and payload', () => {
  const asserted = adaptDrOverview({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt, authenticated: true, authorized: true, verified: true }, now })
  assert.equal(asserted.mode, 'unavailable')
  assert.equal(asserted.provenance.reason, 'TRUST_CONTEXT_REQUIRED')
  const crossPayload = live({ ...fixture, companyId: 'company-b' })
  assert.equal(crossPayload.mode, 'unavailable')
  assert.equal(crossPayload.provenance.reason, 'COMPANY_SCOPE_MISMATCH')
  const crossSource = live(fixture, { source: { kind: 'live', companyId: 'company-b', observedAt: fixture.observedAt } })
  assert.equal(crossSource.mode, 'unavailable')
  assert.equal(crossSource.provenance.reason, 'COMPANY_SCOPE_MISMATCH')
})

test('demo is deterministic and visibly separate from live and unavailable sources', () => {
  const options = { companyId: 'demo-company', seed: 2808, timeSlice: 5 }
  const first = createDemoDrOverview(options)
  assert.deepEqual(first, createDemoDrOverview(options))
  assert.equal(first.mode, 'demo')
  assert.equal(first.provenance.verified, false)
  assert.equal(first.inventory.totalPallets.state, 'demo')
  assert.equal(first.companyId, 'demo-company')
  assert.match(first.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
  const unavailable = adaptDrOverview({ companyId: 'company-a', payload: buildSnapshot({ seed: 2808, timeSlice: 5 }), source: { kind: 'demo' } })
  assert.equal(unavailable.mode, 'unavailable')
  assert.equal(unavailable.inventory.totalPallets.value, null)
})

test('live time requires explicit clock and rejects future or stale observations', () => {
  const missing = live(fixture, { now: undefined })
  assert.equal(missing.mode, 'unavailable')
  assert.equal(missing.provenance.reason, 'NOW_REQUIRED')
  const invalid = live(fixture, { now: 'not-a-time' })
  assert.equal(invalid.provenance.reason, 'NOW_REQUIRED')
  const future = live(fixture, { source: { kind: 'live', companyId: 'company-a', observedAt: '2026-10-23T10:02:00.000Z' } })
  assert.equal(future.provenance.reason, 'FUTURE_OBSERVATION')
  const strictAge = createDrOverviewAdapter({ maxAgeMs: 1000, maxFutureMs: 5000, verifyLive: adapterVerify })
  const data = strictAge({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now: '2026-10-23T10:10:00.000Z' })
  assert.equal(data.mode, 'unavailable')
  assert.equal(data.provenance.reason, 'STALE')
  const boundaryAdapter = createDrOverviewAdapter({ maxAgeMs: 120000, maxFutureMs: 0, verifyLive: adapterVerify })
  const boundary = boundaryAdapter({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now: '2026-10-23T10:02:00.000Z' })
  assert.equal(boundary.mode, 'live')
  assert.equal(boundary.freshness.ageMs, 120000)
})

test('incomplete facilities, unknown vocabularies, invalid inventory and capacity fail closed', () => {
  assert.equal(live({ ...fixture, warehouses: fixture.warehouses.slice(0, 1) }).provenance.reason, 'FACILITY_COVERAGE_INCOMPLETE')
  assert.equal(live({ ...fixture, warehouses: [...fixture.warehouses, { ...fixture.warehouses[0], id: 'W9' }] }).provenance.reason, 'UNKNOWN_FACILITY_ID')
  assert.equal(live({ ...fixture, warehouses: [fixture.warehouses[0], fixture.warehouses[0], fixture.warehouses[2]] }).provenance.reason, 'DUPLICATE_FACILITY_ID')
  assert.equal(live({ ...fixture, events: [{ ...fixture.events[0], kind: '未知事件' }] }).provenance.reason, 'INVALID_EVENT')
  assert.equal(live({ ...fixture, tasks: [{ ...fixture.tasks[0], status: '未知状态' }] }).provenance.reason, 'INVALID_TASK_STATUS')
  assert.equal(live({ ...fixture, pallets: 18 }).provenance.reason, 'INVENTORY_TOTAL_MISMATCH')
  assert.equal(live({ ...fixture, warehouses: fixture.warehouses.map((row) => row.id === 'W1' ? { ...row, usedSlots: 99 } : row) }).provenance.reason, 'INVALID_FACILITY_CAPACITY')
})

test('critical integrity mutations cannot preserve a live aggregate', () => {
  const mutations = [
    { mutate: (payload) => { payload.warehouses.pop() } },
    { mutate: (payload) => { payload.warehouses[0].totalSlots = 0 } },
    { mutate: (payload) => { payload.inventoryByCategory[0].pallets = -1 } },
    { mutate: (payload) => { payload.events[0].at = 'not-iso' } },
    { mutate: (payload) => { payload.waybills[0].eta = 'not-iso' } },
  ]
  for (const { mutate } of mutations) {
    const payload = structuredClone(fixture)
    mutate(payload)
    assert.equal(live(payload).mode, 'unavailable')
  }
})

test('live requires every mandatory collection and accepts known empty collections only', () => {
  for (const key of ['events', 'tasks', 'waybills', 'vehicles', 'alerts', 'devices']) {
    const missing = structuredClone(fixture)
    delete missing[key]
    assert.equal(live(missing).mode, 'unavailable')
    assert.equal(live({ ...fixture, [key]: null }).mode, 'unavailable')
    assert.equal(live({ ...fixture, [key]: {} }).mode, 'unavailable')
    assert.equal(live({ ...fixture, [key]: 'zero' }).mode, 'unavailable')
  }
  const empty = live({ ...fixture, events: [], tasks: [], waybills: [], vehicles: [], alerts: [], devices: [] })
  assert.equal(empty.mode, 'live')
  assert.equal(empty.transport.vehiclesInYard.value, 0)
  assert.equal(empty.work.pending.value, 0)
  assert.equal(empty.alerts.total.value, 0)
})

test('strict ISO timestamps require timezone and reject invalid calendar values', () => {
  for (const bad of ['1', 'May 5', '2026-10-23T10:00:00', '2026-02-30T10:00:00Z', '2026-10-23T10:00:00+25:00']) {
    assert.equal(live(fixture, { source: { kind: 'live', companyId: 'company-a', observedAt: bad } }).provenance.reason, 'OBSERVED_AT_REQUIRED')
    assert.equal(live({ ...fixture, events: [{ ...fixture.events[0], at: bad }] }).provenance.reason, 'INVALID_EVENT_TIME')
    assert.equal(live({ ...fixture, waybills: [{ ...fixture.waybills[0], eta: bad }] }).provenance.reason, 'INVALID_SHIPMENT')
  }
  const offset = live(fixture, { source: { kind: 'live', companyId: 'company-a', observedAt: '2026-10-23T17:00:00.000+07:00' } })
  assert.equal(offset.mode, 'live')
})

test('adapter configuration rejects invalid thresholds and uses configured future tolerance', () => {
  for (const config of [{ maxAgeMs: -1 }, { maxAgeMs: Infinity }, { maxAgeMs: NaN }, { maxFutureMs: -1 }, { maxFutureMs: '1000' }]) {
    assert.throws(() => createDrOverviewAdapter({ ...config, verifyLive: adapterVerify }), /finite non-negative/)
  }
  const tolerance = createDrOverviewAdapter({ maxAgeMs: 120000, maxFutureMs: 61000, verifyLive: adapterVerify })
  const data = tolerance({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: '2026-10-23T10:02:00.000Z' }, now })
  assert.equal(data.mode, 'live')
})

test('vehicle, counts, category identity and aggregate vocabulary validation fail closed', () => {
  assert.equal(live({ ...fixture, vehicles: [{ ...fixture.vehicles[0], zone: 'W9' }] }).provenance.reason, 'INVALID_VEHICLE')
  assert.equal(live({ ...fixture, vehicles: [{ ...fixture.vehicles[0], inYard: 'true' }] }).provenance.reason, 'INVALID_VEHICLE')
  assert.equal(live({ ...fixture, devices: [{ ...fixture.devices[0], normal: 1.5 }] }).provenance.reason, 'INVALID_EQUIPMENT')
  assert.equal(live({ ...fixture, alerts: [{ ...fixture.alerts[0], count: -1 }] }).provenance.reason, 'INVALID_ALERT')
  assert.equal(live({ ...fixture, inventoryByCategory: [...fixture.inventoryByCategory, { ...fixture.inventoryByCategory[0], pallets: 0, sku: 0 }], pallets: 17 }).provenance.reason, 'INVALID_INVENTORY')
  const pending = live({ ...fixture, tasks: [{ ...fixture.tasks[0], status: '待处理' }] })
  assert.equal(pending.work.pending.value, 1)
  assert.equal(live({ ...fixture, waybills: [{ ...fixture.waybills[0], status: '未知状态' }] }).provenance.reason, 'INVALID_SHIPMENT')
})

test('demo ignores arbitrary payloads and verifier exceptions or promises fail closed', () => {
  const arbitraryDemo = adaptDrOverview({ companyId: 'demo-company', payload: { companyId: 'company-b', warehouses: [] }, seed: 19, timeSlice: 5, source: { kind: 'demo' } })
  const expectedDemo = createDemoDrOverview({ companyId: 'demo-company', seed: 19, timeSlice: 5 })
  assert.equal(arbitraryDemo.mode, 'demo')
  assert.equal(arbitraryDemo.generatedAt, expectedDemo.generatedAt)
  assert.deepEqual(arbitraryDemo.inventory, expectedDemo.inventory)
  assert.deepEqual(arbitraryDemo.transport, expectedDemo.transport)
  const throws = createDrOverviewAdapter({ verifyLive: () => { throw new Error('nope') } })
  assert.equal(throws({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now }).provenance.reason, 'VERIFIER_ERROR')
  const async = createDrOverviewAdapter({ verifyLive: () => Promise.resolve({ ok: true, companyId: 'company-a' }) })
  assert.equal(async({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now }).provenance.reason, 'ASYNC_VERIFIER_UNSUPPORTED')
  const hostileThen = createDrOverviewAdapter({ verifyLive: () => Object.defineProperty({}, 'then', { get: () => { throw new Error('nope') } }) })
  assert.equal(hostileThen({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now }).provenance.reason, 'VERIFIER_ERROR')
  const wrongIdentity = createDrOverviewAdapter({ verifyLive: () => ({ ok: true, companyId: 'company-b' }) })
  assert.equal(wrongIdentity({ companyId: 'company-a', payload: fixture, source: { kind: 'live', companyId: 'company-a', observedAt: fixture.observedAt }, now }).provenance.reason, 'LIVE_SOURCE_NOT_VERIFIED')
})

test('missing facility status remains explicitly unavailable without becoming known', () => {
  const payload = structuredClone(fixture)
  delete payload.warehouses[0].status
  const data = live(payload)
  const w1 = data.facilities.find((row) => row.id === 'W1')
  assert.equal(data.mode, 'live')
  assert.equal(w1.status.state, 'unavailable')
  assert.equal(w1.status.reason, 'STATUS_UNKNOWN')
})

test('adapter does not mutate caller data and accepts existing DR console snapshot as demo only', () => {
  const snapshot = buildSnapshot({ seed: 19, timeSlice: 5 })
  const before = structuredClone(snapshot)
  const data = adaptDrOverview({ companyId: 'demo-company', payload: snapshot, timeSlice: 5, source: { kind: 'demo', name: 'existing-dr-console-snapshot' } })
  assert.deepEqual(snapshot, before)
  assert.equal(data.mode, 'demo')
  assert.equal(data.facilities.find((row) => row.id === 'W1').usedSlots.state, 'demo')
  assert.equal(data.transport.shipments.length, snapshot.waybills.length)
  assert.equal(data.activity.events[0].at.state, 'demo')
  assert.equal(data.transport.shipments[0].eta.state, 'demo')
})
