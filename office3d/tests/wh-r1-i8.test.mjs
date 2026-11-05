import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WH_R1_ASSIGNMENT, WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_SITE, WH_R1_ZONES } from '../dr-wh-r1-zones.js'
import { WH_R1_VALIDATION_NOTICE, createWhR1Navigation, recomputeWhR1Integrity, recomputeWhR1Routes } from '../dr-wh-r1-validation.js'
import { buildWhR1InspectorIndex } from '../dr-wh-r1-inspector.js'

test('I8 preserves the source audit while independently recomputing all routes and checks', () => {
  const result = recomputeWhR1Integrity()
  assert.equal(result.routes.length, 12)
  assert.equal(result.integrity.length, 22)
  assert.equal(result.arithmeticChecks.length, 18)
  assert.deepEqual(result.h01_h03.map(row => row.id), ['H01', 'H02', 'H03'])
  assert.equal(result.notice, WH_R1_VALIDATION_NOTICE)
  assert.deepEqual(result.routes.map(row => row.id), WH_R1_DATA.routes.map(row => row.id))
  assert.deepEqual(result.routes.map(row => row.selfReported?.status), WH_R1_DATA.integrityAudit.routes.map(row => row.status))
  assert.ok(result.routes.every(row => row.scene === 'approved'))
})

test('I8 navigation is a WH-R1-only testable grid with body-radius inflation', () => {
  const navigation = createWhR1Navigation({ cellSize: .6, radius: .3 })
  assert.equal(navigation.cellSize, .6)
  assert.equal(navigation.radius, .3)
  assert.ok(navigation.width > 100 && navigation.height > 100)
  const start = [WH_R1_SITE.x0 + 2, WH_R1_SITE.z0 + 2], end = [WH_R1_SITE.x1 - 2, WH_R1_SITE.z1 - 2]
  assert.equal(typeof navigation.isWalkable, 'function')
  assert.equal(typeof navigation.findPath, 'function')
  assert.ok(Array.isArray(navigation.findPath(start, end)))
  assert.equal(navigation.pathLength([]), 0)
})

test('I8 inspector covers every registered record and stays lazy by default', () => {
  const index = buildWhR1InspectorIndex()
  assert.equal(index.total, 1244)
  assert.equal(index.coverage, 1244)
  assert.deepEqual(index.missing, [])
  assert.equal(index.assigned.get('WH-00-CTL-001'), 'I2')
  assert.equal(index.records.get('WH-00-CTL-001').id, 'WH-00-CTL-001')
})

test('I8 registry and dock wiring remain guarded to WH-R1', () => {
  const registry = readFileSync(new URL('../dr-campus-registry.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(registry, /wh-r1-validation/)
  assert.match(registry, /wh-r1-inspector/)
  assert.match(app, /if \(PLACE_MODE\.whr1\)/)
  assert.match(app, /仓配分区/)
  assert.match(app, /PLACE_MODE\.zones/)
  assert.ok(WH_R1_ZONES.length === 14)
})

test('I8 route recomputation keeps original self-reported data separate', () => {
  const source = recomputeWhR1Routes({ scene: 'source' })
  const approved = recomputeWhR1Routes({ scene: 'approved' })
  assert.equal(source.length, 12)
  assert.equal(approved.length, 12)
  assert.equal(source[0].selfReported.status, approved[0].selfReported.status)
  assert.notEqual(source[0].scene, approved[0].scene)
  assert.ok(source.every(row => row.notice.includes('不是完整动线')))
})

