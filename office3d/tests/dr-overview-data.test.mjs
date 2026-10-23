import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { DR_DATA_STATES, DR_OVERVIEW_SCHEMA, adaptDrOverview, createDemoDrOverview, createDrOverviewAdapter } from '../dr-overview-data.mjs'
import { buildSnapshot } from '../dr-console-data.js'

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/dr-overview-live.json', import.meta.url), 'utf8'))
const now = '2026-10-23T10:01:00.000Z'
const adapter = createDrOverviewAdapter({
  verifyLive: ({ companyId, source, payload }) => companyId === 'company-a' && source.companyId === 'company-a' && payload?.companyId === 'company-a'
    ? { ok: true, companyId: 'company-a', sourceName: 'authorized-read-only-fixture' }
    : { ok: false },
})
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
  const data = live(fixture, { now: '2026-10-23T10:10:00.000Z', maxAgeMs: 120000 })
  assert.equal(data.mode, 'unavailable')
  assert.equal(data.provenance.reason, 'STALE')
  const boundary = live(fixture, { now: '2026-10-23T10:02:00.000Z', maxAgeMs: 120000 })
  assert.equal(boundary.mode, 'live')
  assert.equal(boundary.freshness.ageMs, 120000)
})

test('incomplete facilities, unknown vocabularies, invalid inventory and capacity fail closed', () => {
  assert.equal(live({ ...fixture, warehouses: fixture.warehouses.slice(0, 1) }).provenance.reason, 'FACILITY_COVERAGE_INCOMPLETE')
  assert.equal(live({ ...fixture, warehouses: [...fixture.warehouses, { ...fixture.warehouses[0], id: 'W9' }] }).provenance.reason, 'UNKNOWN_FACILITY_ID')
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
