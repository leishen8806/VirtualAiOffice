import test from 'node:test'
import assert from 'node:assert/strict'
import { R1_DATA } from '../office-r1/data.js'
import { createR1Layout, R1_BOARD_FACING_OVERRIDES } from '../office-r1-layout.js'

const rawOf = id => R1_DATA.elements.find(row => row.id === id)

test('BENCH plaza benches are turned to face the plaza ring, with the exact MOVE R5 position exception, through a frozen board table', () => {
  assert.ok(Object.isFrozen(R1_BOARD_FACING_OVERRIDES))
  assert.deepEqual(R1_BOARD_FACING_OVERRIDES.map(entry => entry.id).sort(), ['14-BN-001', '14-BN-002', '14-BN-003', '14-BN-004'])
  assert.equal(R1_BOARD_FACING_OVERRIDES.find(e => e.id === '14-BN-003').to.xM, 48.5)
  assert.match(R1_BOARD_FACING_OVERRIDES.find(e => e.id === '14-BN-003').reason, /长椅与花境重叠，向西平移/)
  const layout = createR1Layout(), center = R1_DATA.plaza.center_m
  for (const entry of R1_BOARD_FACING_OVERRIDES) {
    const raw = rawOf(entry.id), row = layout.elements.find(item => item.id === entry.id)
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.from) && Object.isFrozen(entry.to), entry.id)
    assert.equal(entry.date, '2026-10-29')
    for (const key of Object.keys(entry.from)) assert.deepEqual(entry.from[key], raw[key], `${entry.id}.${key}`)
    // Same footprint; only BN-003 has the board-approved westward translation.
    for (const key of ['xM', 'yM', 'zM', 'lengthM', 'widthM', 'heightM']) assert.equal(row[key], key === 'xM' && entry.id === '14-BN-003' ? raw[key] - .5 : raw[key], `${entry.id}.${key}`)
    assert.equal(((row.yawDeg - raw.yawDeg) % 360 + 360) % 360, 180, entry.id)
    // The seat now faces the plaza centre.
    const to = [center[0] - row.xM, center[1] - row.yM]
    assert.ok(row.facingLocal[0] * to[0] + row.facingLocal[1] * to[1] > 0, `${entry.id} faces the plaza`)
  }
})
