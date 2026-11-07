import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { OFFICE_R1_VALIDATION_NOTICE, compareOfficeR1SelfReport, recomputeOfficeR1Integrity, recomputeOfficeR1Routes } from '../office-r1-validation.js'
import { buildOfficeR1Inspector, buildOfficeR1InspectorIndex } from '../office-vis2/r1-inspector.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { chooseOfficeR1InspectorRect, rectsOverlap } from '../office-r1-ui.js'

const layout = createOfficeR1Layout()

test('I7 independently recomputes all 17 R1 routes and derives blocked state from clearance', () => {
  const rows = recomputeOfficeR1Routes({ layout })
  assert.equal(rows.length, 17)
  assert.ok(rows.every(row => row.notice === OFFICE_R1_VALIDATION_NOTICE && Number.isFinite(row.minClearanceMm)))
  assert.ok(rows.some(row => row.status === 'BLOCKED'))
  assert.ok(rows.some(row => row.status === 'CONDITIONAL_STATIC_CLEAR'))
  assert.equal(rows.some(row => row.status === 'PASS'), false)
})

test('I7 recomputes reverse routes and both door-state scenarios from geometry', () => {
  const forward = recomputeOfficeR1Routes({ layout, direction: 'forward', doorMode: 'doorsUnknownOpen' })
  const reverse = recomputeOfficeR1Routes({ layout, direction: 'reverse', doorMode: 'doorsUnknownOpen' })
  const closed = recomputeOfficeR1Routes({ layout, doorMode: 'doorsClosed' })
  assert.equal(reverse.length, forward.length)
  assert.deepEqual(reverse[0].pointsWorld, [...forward[0].pointsWorld].reverse())
  assert.ok(closed.every(row => row.doorMode === 'doorsClosed'))
  assert.ok(forward.every(row => row.segments.length === row.pointsWorld.length - 1))
  assert.ok(forward.some(row => row.minClearanceMm < 0 && row.status === 'BLOCKED'))
})

test('I7 keeps the 29 source checks visible while recomputing route checks', () => {
  const result = recomputeOfficeR1Integrity({ layout })
  assert.equal(result.routeCount, 17)
  assert.equal(result.checkCount, 29)
  assert.equal(result.routes.length, 17)
  assert.ok(result.checks.some(row => row.recomputed && row.status === 'BLOCKED'))
  assert.ok(result.checks.some(row => row.status === 'PASS_THROUGH_NOT_RECOMPUTED'))
  assert.equal(result.notice, OFFICE_R1_VALIDATION_NOTICE)
  assert.deepEqual(Object.keys(result.scenarios).sort(), ['doorsClosed', 'doorsUnknownOpen'])
  assert.equal(result.reverseRoutes.length, 17)
  assert.equal(result.selfReportComparison.length, 17)
})

test('I7 self-report comparison is derived and reports numeric deltas', () => {
  const result = recomputeOfficeR1Integrity({ layout })
  const compared = compareOfficeR1SelfReport({ recomputed: result.routes, selfReported: result.selfReported })
  assert.equal(compared.length, 17)
  assert.ok(compared.some(row => Number.isFinite(row.deltaMm)))
})

test('I7 inspector covers every registered element and has no default picking proxies', () => {
  const index = buildOfficeR1InspectorIndex({ layout })
  assert.equal(index.total, 1132)
  assert.equal(index.coverage, 1132)
  assert.deepEqual(index.missing, [])
  assert.equal(index.records.get('00-D-001').id, '00-D-001')
})

test('I7 inspector uses oriented ray hits and reports overlap candidates', () => {
  class BoxGeometry { constructor() {} dispose() {} }
  class MeshBasicMaterial { constructor() {} dispose() {} }
  class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; this.position = { set() {} }; this.rotation = { y: 0 }; } removeFromParent() {} }
  const root = { userData: {}, add() {} }
  const THREE = { BoxGeometry, MeshBasicMaterial, Mesh }
  const inspector = buildOfficeR1Inspector({ THREE, root, layout })
  const row = layout.r1.data.elements.find(item => item.id === '00-D-001')
  const p = r1ToWorld(row.xM, row.yM)
  const hit = inspector.pickRay({ origin: { x: p.x, y: row.heightM + 5, z: p.z }, direction: { x: 0, y: -1, z: 0 } })
  assert.equal(hit?.id, row.id)
  assert.ok(hit.pick.candidateCount >= 1)
})

test('I7 UI wiring is R1 guarded, lazy, and uses body-fixed menu', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const modules = readFileSync(new URL('../office-v3-modules.js', import.meta.url), 'utf8')
  assert.match(app, /officeR1ZoneMenu/)
  assert.match(app, /document\.body\.appendChild\(menu\)/)
  assert.match(app, /officeR1ZoneMenu.*menu\.addEventListener\('keydown'/s)
  assert.match(app, /officeV3\.get\('r1Inspector'\)/)
  assert.match(app, /r1ZonesOverlay/)
  assert.match(modules, /r1Validation/)
  assert.match(modules, /r1Inspector/)
})

test('I7 R2-02 zone buttons expose readable names and selecting a zone enables its overlay', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(app, /b\.textContent = `\$\{zone\.id\} · \$\{zone\.name\}`/)
  assert.match(app, /setOverlay\?\.\(true\)/)
  assert.match(html, /\.dock-zone-menu-fixed button \{[^}]*color:#fff4d6/s)
  assert.match(html, /\.dock-zone-menu-fixed button \{[^}]*background:rgba\(255,255,255,\.08\)/s)
})

test('I7 R2-02 inspector placement avoids status, waiting, dock, and detail panels', () => {
  const obstacles = [
    { left: 14, top: 14, right: 600, bottom: 54 },
    { left: 920, top: 76, right: 1266, bottom: 430 },
    { left: 14, top: 70, right: 344, bottom: 360 },
    { left: 14, top: 700, right: 1266, bottom: 786 },
  ]
  const placed = chooseOfficeR1InspectorRect({ viewportWidth: 1280, viewportHeight: 800, panelWidth: 300, panelHeight: 120, obstacles })
  assert.equal(obstacles.some((obstacle) => rectsOverlap(placed, obstacle)), false)
  assert.ok(placed.left >= 0 && placed.top >= 0 && placed.right <= 1280 && placed.bottom <= 800)
})
