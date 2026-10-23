import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { DR_DATA_STATES, DR_OVERVIEW_SCHEMA, adaptDrOverview, createDemoDrOverview } from '../dr-overview-data.mjs'
import { buildSnapshot } from '../dr-console-data.js'

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/dr-overview-live.json', import.meta.url), 'utf8'))
const now = '2026-10-23T10:01:00.000Z'
const live = (payload = fixture, extra = {}) => adaptDrOverview({
  companyId: 'company-a', payload,
  source: { kind: 'live', name: 'authorized-read-only-fixture', companyId: 'company-a', authenticated: true, authorized: true, verified: true, observedAt: fixture.observedAt },
  now, ...extra,
})

test('schema is stable and every published metric declares data state and provenance', () => {
  const data = live()
  assert.equal(data.schemaVersion, DR_OVERVIEW_SCHEMA)
  assert.deepEqual(DR_DATA_STATES, ['live', 'demo', 'unavailable'])
  assert.equal(data.mode, 'live')
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
})

test('missing and partial values remain unavailable instead of becoming demo values', () => {
  const data = live({ ...fixture, pallets: -17, warehouses: [{ id: 'W1', usedSlots: 21, totalSlots: 20 }] })
  assert.equal(data.inventory.totalPallets.state, 'unavailable')
  assert.equal(data.facilities.find((row) => row.id === 'W1').utilization.state, 'unavailable')
  assert.equal(data.facilities.find((row) => row.id === 'W2').usedSlots.state, 'unavailable')
  assert.equal(data.mode, 'live')
})

test('only authenticated authorized verified and company-bound live sources may be live', () => {
  for (const source of [
    { kind: 'live', companyId: 'company-a', authenticated: false, authorized: true, verified: true, observedAt: fixture.observedAt },
    { kind: 'live', companyId: 'company-a', authenticated: true, authorized: false, verified: true, observedAt: fixture.observedAt },
    { kind: 'live', companyId: 'company-a', authenticated: true, authorized: true, verified: false, observedAt: fixture.observedAt },
    { kind: 'live', companyId: 'company-b', authenticated: true, authorized: true, verified: true, observedAt: fixture.observedAt },
  ]) {
    const data = adaptDrOverview({ companyId: 'company-a', payload: fixture, source, now })
    assert.equal(data.mode, 'unavailable')
    assert.equal(data.inventory.totalPallets.value, null)
    assert.equal(data.inventory.totalPallets.state, 'unavailable')
  }
})

test('demo is deterministic and visibly separate from live and unavailable sources', () => {
  const options = { companyId: 'demo-company', seed: 2808, timeSlice: 5, now }
  const first = createDemoDrOverview(options)
  assert.deepEqual(first, createDemoDrOverview(options))
  assert.equal(first.mode, 'demo')
  assert.equal(first.provenance.verified, false)
  assert.equal(first.inventory.totalPallets.state, 'demo')
  const unavailable = adaptDrOverview({ companyId: 'demo-company', payload: buildSnapshot({ seed: 2808, timeSlice: 5 }), source: { kind: 'unknown' }, now })
  assert.equal(unavailable.mode, 'unavailable')
  assert.equal(unavailable.inventory.totalPallets.value, null)
})

test('stale timestamps are carried as stale provenance rather than rewritten', () => {
  const data = live(fixture, { now: '2026-10-23T10:10:00.000Z', maxAgeMs: 120000 })
  assert.equal(data.freshness.stale, true)
  assert.equal(data.freshness.reason, 'STALE')
  assert.equal(data.inventory.totalPallets.observedAt, fixture.observedAt)
})

test('adapter does not mutate caller data and accepts existing DR console snapshot shape', () => {
  const snapshot = buildSnapshot({ seed: 19, timeSlice: 5 })
  const before = structuredClone(snapshot)
  const data = adaptDrOverview({
    companyId: 'demo-company', payload: snapshot,
    source: { kind: 'demo', name: 'existing-dr-console-snapshot' }, now,
  })
  assert.deepEqual(snapshot, before)
  assert.equal(data.mode, 'demo')
  assert.equal(data.facilities.find((row) => row.id === 'W1').usedSlots.state, 'demo')
  assert.equal(data.transport.shipments.length, snapshot.waybills.length)
})
