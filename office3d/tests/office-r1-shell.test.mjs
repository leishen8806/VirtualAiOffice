import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B, SEATS as LEGACY_SEATS, createOfficeNavigation, resolveOfficeLayout, workHome } from '../office-layout.js'
import { officeSeats } from '../office-v2-modules.js'
import { officeV3Modules, officeV3ModulesFor } from '../office-v3-modules.js'
import { buildR1Shell, r1CornerSpec, r1FrontHeight, r1WallPlan } from '../office-vis2/r1-shell.js'

const R1_SEARCH = '?place=drlife-office&layout=3&align=1&officeSample=1&r1=1'
const r1 = () => resolveOfficeLayout(R1_SEARCH)

test('I2 resolves only the strict sample r1 switch and preserves every other sample entry', () => {
  assert.equal(r1().r1Phase, 'R1')
  assert.deepEqual(r1().seats, {})
  for (const search of ['?layout=3&align=1&officeSample=1', '?layout=3&align=1&officeSample=1&r1=0', '?layout=3&align=1&officeSample=1&r1=1&r1=1']) {
    assert.equal(resolveOfficeLayout(search), LAYOUT_V3_ALIGN_L2B, search)
  }
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=0&r1=1'), LAYOUT_V3_ALIGN)
})

test('I2 excludes the old north garden only for the same strict R1 query', () => {
  const env = readFileSync(new URL('../env.js', import.meta.url), 'utf8')
  assert.match(env, /export const r1EnvironmentRequested = \(search = ''\) => \{[\s\S]*params\.getAll\('layout'\)\.length === 1[\s\S]*params\.getAll\('r1'\)\.length === 1 && params\.get\('r1'\) === '1'[\s\S]*\}/)
  assert.match(env, /if \(!r1Mode\) \{[\s\S]*north-garden-\$\{String\(i \+ 1\)\.padStart\(2,'0'\)\}/)
})

test('I2 retains the old V3 module order and isolates R1 to its one shell slot', () => {
  assert.deepEqual(officeV3Modules.map(([name]) => name), ['shell3', 'furniture3', 'island', 'zones', 'plaza', 'displayDepartments', 'displayStaff'])
  assert.deepEqual(officeV3ModulesFor(LAYOUT_V3_ALIGN_L2B).map(([name]) => name), officeV3Modules.map(([name]) => name))
  assert.deepEqual(officeV3ModulesFor(r1()).map(([name]) => name), ['shell3'])
})

test('I2 R3 provides only stationary navigation and no seats for R1 while freezing L2B navigation', () => {
  const layout = r1(), nav = createOfficeNavigation(layout), home = { x: 1, z: 2 }
  assert.deepEqual(officeSeats(layout), {})
  assert.deepEqual(nav.officeExit(home), [home]); assert.deepEqual(nav.corridorPath(home, { x: 4, z: 5 }), [home])
  assert.deepEqual(nav.loungeTrip(home, { x: 4, z: 5 }), [home]); assert.deepEqual(nav.meetingTrip(home, { x: 4, z: 5 }), [home])
  assert.deepEqual(nav.standAt(home), home); assert.deepEqual(nav.LOUNGE_SEATS, []); assert.deepEqual(nav.consumerQueues, { waiting: [] })
  const frozen = createOfficeNavigation(LAYOUT_V3_ALIGN_L2B), legacyHome = workHome(LAYOUT_V3_ALIGN_L2B.seats.OpsLead)
  const snapshot = { seats: LAYOUT_V3_ALIGN_L2B.seats, entrance: frozen.ENTRANCE, lounge: frozen.LOUNGE_SEATS, queues: frozen.consumerQueues, exit: frozen.officeExit(legacyHome), corridor: frozen.corridorPath(legacyHome, frozen.ENTRANCE.inner), stand: frozen.standAt(legacyHome) }
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), '20225f85b3da10410659dbba819f3465b9db5aa2909b158f70b2725f14a5ba54')
  assert.deepEqual(officeSeats(LAYOUT_V3_ALIGN_L2B), Object.fromEntries(Object.keys(LEGACY_SEATS).map(name => [name, LAYOUT_V3_ALIGN_L2B.seats[name]])))
})

test('I2 R3 selects R1 miniBounds without altering the non-R1 minimap expression', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(app, /const MINI = DR_MODE \? PLACE_MODE\.miniBounds : OFFICE_LAYOUT\.r1Phase === 'R1' \? OFFICE_LAYOUT\.miniBounds : MINI_BOUNDS/)
  assert.deepEqual(r1().miniBounds, { x0: -38, x1: 42, z0: -31, z1: 44 })
})

test('I2 carries all registered wall and face identities through the R1 shell plan', () => {
  const plan = r1WallPlan(r1()), ids = new Set([...plan.straight.map(wall => wall.id), ...plan.front.map(wall => wall.id)])
  assert.equal(ids.size, 42); assert.equal(r1().r1.data.wallFaces.length, 84)
  assert.ok(plan.straight.every(wall => wall.faceIds.length === 2))
  assert.deepEqual(r1CornerSpec.southeast, { center: [24.3, 32.5], radius: 1.5, from: [24.3, 31], to: [25.8, 32.5] })
  assert.deepEqual(r1CornerSpec.southwest, { center: [31.7, 32.5], radius: 1.5, from: [30.2, 32.5], to: [31.7, 31] })
  const door = r1().r1.data.doors.find(value => value.id === '03-D-001')
  assert.ok(Math.abs((door.yM - door.lengthM / 2) - r1CornerSpec.southeast.to[1] - .1) < 1e-9)
})

test('I2 front profile is symmetric, continuous and bounded by the approved heights', () => {
  const walls = r1().r1.data.walls
  for (const x of [0, 3, 6, 12, 18, 21, 24.5, 28, 31.5, 35, 38, 44, 50, 53, 56]) {
    assert.ok(Math.abs(r1FrontHeight(x, walls) - r1FrontHeight(56 - x, walls)) < 1e-9, x)
    assert.ok(r1FrontHeight(x, walls) >= 1.2 && r1FrontHeight(x, walls) <= 4.5, x)
  }
  assert.equal(r1FrontHeight(0, walls), 4.5); assert.equal(r1FrontHeight(56, walls), 4.5)
  assert.equal(r1FrontHeight(21, walls), 1.2); assert.equal(r1FrontHeight(35, walls), 1.2)
})

test('I2 shell marks its identity ledger dynamic so app-wide mergeStatic must leave it addressable', () => {
  const oldDocument = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillText() {}, set fillStyle(_) {}, set font(_) {}, set textAlign(_) {} }) }) }
  try {
    const scene = new THREE.Scene(), root = new THREE.Group(), collisions = []
    scene.add(root)
    const shell = buildR1Shell({ THREE, root, layout: r1(), collision: { add: proxy => collisions.push(proxy), remove() {} } })
    assert.equal(root.children[0].name, 'r1-shell-root')
    assert.equal(root.children[0].userData.dynamic, true)
    assert.equal(shell.wallLedger.wallIds.length, 42); assert.equal(shell.wallLedger.faceIds.length, 84); assert.equal(collisions.length, 39)
    shell.dispose()
  } finally { globalThis.document = oldDocument }
})
