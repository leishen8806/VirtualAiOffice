import test from 'node:test'
import assert from 'node:assert/strict'
import { createLive3Tracking, LIVE3_TRACKING_STATIONS } from '../wh-r1/live3-tracking.js'

test('LIVE3 tracks a simulated waybill across ten stations', () => {
  let state = { nowMs: 2000, items: [{ itemId: 'CARGO-00001', waybill: 'DR00000001', orderId: 'O1', destination: '金边', weightKg: 5, stage: 'packing', createdAt: 0, startedAt: 1000, completeAt: 3000 }] }
  const tracking = createLive3Tracking(() => state)
  const selected = tracking.select('CARGO-00001')
  assert.equal(LIVE3_TRACKING_STATIONS.length, 10)
  assert.equal(selected.station.label, '打包')
  assert.equal(selected.progress, 83)
  assert.equal(selected.elapsedSeconds, 2)
  assert.equal(tracking.follow('CARGO-00001').waybill, 'DR00000001')
  const stages = ['arrival', 'quality', 'putaway', 'retrieve', 'picking', 'conveyor', 'packing', 'staging', 'shipped']
  let previous = 0
  const stationIndexes = [0, 1, 2, 3, 4, 5, 7, 8, 9]
  stages.forEach((stage, index) => {
    state = { nowMs: 4000 + index, items: [{ ...state.items[0], stage, startedAt: 3000, completeAt: 4000 }] }
    const row = tracking.summary().following
    assert.equal(row.stationIndex, stationIndexes[index])
    assert.equal(row.station.label, LIVE3_TRACKING_STATIONS[row.stationIndex].label)
    assert.ok(row.progress >= previous && row.progress <= 100)
    previous = row.progress
  })
  assert.equal(tracking.summary().following.station.label, '出库')
  assert.equal(tracking.summary().following.progress, 100)
})
