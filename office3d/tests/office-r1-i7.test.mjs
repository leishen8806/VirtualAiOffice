import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { OFFICE_R1_VALIDATION_NOTICE, recomputeOfficeR1Integrity, recomputeOfficeR1Routes } from '../office-r1-validation.js'
import { buildOfficeR1InspectorIndex } from '../office-vis2/r1-inspector.js'

const layout = createOfficeR1Layout()

test('I7 independently recomputes all 17 R1 routes and derives blocked state from clearance', () => {
  const rows = recomputeOfficeR1Routes({ layout })
  assert.equal(rows.length, 17)
  assert.ok(rows.every(row => row.notice === OFFICE_R1_VALIDATION_NOTICE && Number.isFinite(row.minClearanceMm)))
  assert.ok(rows.some(row => row.status === 'BLOCKED'))
  assert.ok(rows.some(row => row.status === 'CONDITIONAL_STATIC_CLEAR'))
  assert.equal(rows.some(row => row.status === 'PASS'), false)
})

test('I7 keeps the 29 source checks visible while recomputing route checks', () => {
  const result = recomputeOfficeR1Integrity({ layout })
  assert.equal(result.routeCount, 17)
  assert.equal(result.checkCount, 29)
  assert.equal(result.routes.length, 17)
  assert.ok(result.checks.some(row => row.recomputed && row.status === 'BLOCKED'))
  assert.ok(result.checks.some(row => row.status === 'PASS_THROUGH_NOT_RECOMPUTED'))
  assert.equal(result.notice, OFFICE_R1_VALIDATION_NOTICE)
})

test('I7 inspector covers every registered element and has no default picking proxies', () => {
  const index = buildOfficeR1InspectorIndex({ layout })
  assert.equal(index.total, 1132)
  assert.equal(index.coverage, 1132)
  assert.deepEqual(index.missing, [])
  assert.equal(index.records.get('00-D-001').id, '00-D-001')
})

test('I7 UI wiring is R1 guarded, lazy, and uses body-fixed menu', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const modules = readFileSync(new URL('../office-v3-modules.js', import.meta.url), 'utf8')
  assert.match(app, /officeR1ZoneMenu/)
  assert.match(app, /document\.body\.appendChild\(menu\)/)
  assert.match(app, /officeV3\.get\('r1Inspector'\)/)
  assert.match(app, /r1ZonesOverlay/)
  assert.match(modules, /r1Validation/)
  assert.match(modules, /r1Inspector/)
})
