import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WH_R1_ASSIGNMENT, WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_SITE, WH_R1_ZONES } from '../dr-wh-r1-zones.js'
import { WH_R1_VALIDATION_NOTICE, createWhR1Navigation, recomputeWhR1Integrity, recomputeWhR1Routes } from '../dr-wh-r1-validation.js'
import { buildWhR1Inspector, buildWhR1InspectorIndex } from '../dr-wh-r1-inspector.js'

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
  assert.equal(result.integrity.filter(row => row.status === 'PASS').length, 22)
  assert.equal(result.arithmeticChecks.length, 18)
  assert.equal(result.arithmeticChecks.find(row => row.id === 'R03').status, 'BLOCKED')
  assert.equal(result.arithmeticChecks.find(row => row.id === 'C01').status, 'PASS_THROUGH_NOT_RECOMPUTED')
  assert.deepEqual(result.h01_h03.map(row => row.status), ['PASS', 'PASS', 'PASS_THROUGH_NOT_RECOMPUTED'])
  assert.equal(result.routes.find(row => row.id === 'P05').status, 'BLOCKED')
  assert.equal(result.routes.find(row => row.id === 'TR01').status, 'BLOCKED')
  assert.equal(result.sceneComparison.length, 12)
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
  assert.equal(navigation.connected, true)
  assert.equal(Object.keys(navigation.reachabilityMatrix.doorsClosed).length, 14)
  assert.equal(Object.keys(navigation.reachabilityMatrix.doorsUnknown).length, 14)
  assert.ok(navigation.unknownDoors.length > 0)
})

test('I8 inspector covers every registered record and stays lazy by default', () => {
  const index = buildWhR1InspectorIndex()
  assert.equal(index.total, 1244)
  assert.equal(index.coverage, 1244)
  assert.deepEqual(index.missing, [])
  assert.equal(index.assigned.get('WH-00-CTL-001'), 'I2')
  assert.equal(index.records.get('WH-00-CTL-001').id, 'WH-00-CTL-001')
  const inspector = buildWhR1Inspector({ data: WH_R1_DATA, assignment: WH_R1_ASSIGNMENT })
  const selected = inspector.selectById('WH-00-CTL-001')
  assert.equal(selected.id, 'WH-00-CTL-001')
  assert.equal(selected.useScope, '00')
  assert.ok(selected.dimensionsM.length > 0)
  assert.equal(inspector.state.enabled, false, 'select without a render root stays lazy')
})

test('I8 registry and dock wiring remain guarded to WH-R1', () => {
  const registry = readFileSync(new URL('../dr-campus-registry.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(registry, /wh-r1-validation/)
  assert.match(registry, /wh-r1-inspector/)
  assert.match(app, /if \(PLACE_MODE\.whr1\)/)
  assert.match(app, /仓配分区/)
  assert.match(app, /PLACE_MODE\.zones/)
  assert.match(app, /showWhR1Inspect/)
  assert.match(app, /zoneOverlay/)
  assert.match(app, /warehouse-zones/)
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
  assert.equal(source.find(row => row.id === 'P05').status, 'BLOCKED')
  assert.equal(approved.find(row => row.id === 'TR02').status, 'BLOCKED')
  assert.ok(source.some(row => row.minClearanceMm !== null))
})

