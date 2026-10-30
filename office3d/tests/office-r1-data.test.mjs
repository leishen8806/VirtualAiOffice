import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { C01_DELTA, R1_DATA } from '../office-r1/data.js'
import { createR1Layout, R1_BACKWALL, R1_BOARD_ADDED_ELEMENTS, R1_BOARD_FACING_OVERRIDES, R1_BOARD_OVERRIDES, R1_BOARD_TRUNK_OVERRIDES, R1_PLANT_POSITION_OVERRIDES, R1_GATE, r1ElementWorld, r1ToWorld, runtimeYawFromFacing } from '../office-r1-layout.js'

const repo = fileURLToPath(new URL('../', import.meta.url))
const world = (x, z) => ({ x, z })
const same = (actual, expected) => assert.deepEqual(actual, expected)

test('I1 freezes the R1 register, topology, mappings, routes and check inputs', () => {
  const manifest = JSON.parse(readFileSync(new URL('../office-r1/MANIFEST.json', import.meta.url)))
  assert.deepEqual(Object.fromEntries(['r1Model', 'r1Register', 'r1Walls', 'c01Model', 'c01Register'].map(key => [key, manifest.sources[key].sha256])), {
    r1Model: '2bcb1fbca9e1bdc1d9b65804c75b10f767665afba7a0e07a33263ffb6ea7438b',
    r1Register: '1358d23f0f33f38de6887de86557395615938a2b32b3adb915babedcd1c93350',
    r1Walls: '9c43e7b53c7d01150bdb747a1717d18bc176f47bdec6e1ae988ec576e55b9f4d',
    c01Model: '926554077c81b21e97fe8c4cd93d190434449cdd1fba597d3e6b8cc83efe4d70',
    c01Register: '54aae1f8d4491c55731143afc832c6dc4d7b8a3cbe7a193e0d9e43ca54599d49',
  })
  assert.deepEqual(manifest.counts, { elements: 1132, unknown: 463, walls: 42, wallFaces: 84, doors: 13, doorLeaves: 26, zones: 14, routes: 17, routeReports: 17, checks: 29, localChecks: 9, bodyProfiles: 2, doorTargetFrames: 26, doorStateConditions: 39, businessIds: 25, c01ElementDelta: 141, c01WorkstationDelta: 11 })
  assert.equal(R1_DATA.unknownComponents.length, 463)
  assert.equal(R1_DATA.workstations.filter(row => row.group === 'ops').length, 6)
  assert.equal(R1_DATA.workstations.filter(row => row.group === 'product').length, 11)
  assert.equal(R1_DATA.workstations.filter(row => row.group === 'drlife').length, 8)
  const categories = count => R1_DATA.elements.filter(row => row.category === count).length
  assert.equal(categories('办公桌'), 78); assert.equal(categories('办公椅'), 78)
  assert.equal(categories('椅子'), 57); assert.equal(categories('吧凳'), 19)
  assert.equal(categories('显示器'), 78); assert.equal(categories('端柜'), 32); assert.equal(categories('桌间屏风'), 16)
  assert.equal(categories('会议桌'), 1); assert.equal(categories('圆桌'), 12); assert.equal(categories('植物总成'), 46); assert.equal(categories('连续花境'), 6)
})

test('I1 preserves 84 source wall faces with their parent identity and dimensions', () => {
  const wallIds = new Set(R1_DATA.walls.map(row => row.id)), faces = R1_DATA.wallFaces
  assert.equal(faces.length, 84); assert.equal(new Set(faces.map(face => face.id)).size, 84)
  for (const face of faces) {
    assert.ok(wallIds.has(face.wallId), face.id)
    assert.ok(Number.isFinite(face.lengthM) && Number.isFinite(face.heightM) && Number.isFinite(face.thicknessM), face.id)
  }
  for (const wallId of wallIds) assert.deepEqual(faces.filter(face => face.wallId === wallId).map(face => face.side).sort(), ['A', 'B'], wallId)
  assert.deepEqual(faces.find(face => face.id === '00-W-001-A'), { id: '00-W-001-A', wallId: '00-W-001', side: 'A', lengthM: 39.39697, heightM: 4.5, thicknessM: .2, openingAreaM2: 0, startM: [0, 3.60303], endM: [0, 43], source: 'R1候选几何；非实测', status: 'PROPOSED' })
})

test('I1 converts millimetres and zone axes once, with source-width/depth invariants', () => {
  same(r1ToWorld(28, 22.1), world(2, -4.1))
  same(r1ToWorld(28, -10), world(2, 28))
  same(r1ElementWorld({ xM: 4.75, yM: 12.6, zM: 0 }), { x: -21.25, z: 5.4, y: 0 })
  const wall = R1_DATA.walls.find(row => row.id === '00-W-002')
  const rear = wall.geometry.points.find(([x, y]) => x === 56 && y === 43)
  same(r1ToWorld(...rear), world(30, -25))
  for (const zone of R1_DATA.zones) {
    const [x0, y0, x1, y1] = zone.sourceBboxM
    const [worldX0, worldX1, worldZ0, worldZ1] = zone.worldBboxXZ
    assert.ok(Math.abs((worldX1 - worldX0) - (x1 - x0)) < 1e-6, zone.id)
    assert.ok(Math.abs((worldZ1 - worldZ0) - (y1 - y0)) < 1e-6, zone.id)
  }
  for (const row of R1_DATA.elements) {
    const point = r1ElementWorld(row)
    assert.ok(point.x >= -32 && point.x <= 36, row.id)
    assert.ok(point.z >= -25 && point.z <= 38, row.id)
  }
  assert.equal(runtimeYawFromFacing(0, -1), 0)
})

test('I1 exposes the approved C-01 delta behind a single default-on candidate switch', () => {
  const r1 = createR1Layout({ candidateC01: false }), candidate = createR1Layout()
  assert.equal(candidate.candidateC01, true); assert.equal(r1.candidateC01, false)
  // I6C：董事会批准的 24 条位置偏离不受 candidateC01 开关影响，所以期望值是「登记值 + 偏离表」而不是裸登记值；
  // BACKWALL：再叠上大门抬高的 2 条门扇高度偏离，并在尾部接上两樘新门的 4 片门扇；长椅转向表一并计入。
  // R2：董事会新增件（新增表 R1_BOARD_ADDED_ELEMENTS）再接在门扇之后，同样不受开关影响。
  // 仍然是对全部 1136 + 新增条逐值深比较，强度不变（偏离表本身由 office-r1-plaza-fan.test.mjs 的 I6C-1、
  // office-r1-bench-facing.test.mjs 与 office-r1-backwall.test.mjs 的 BW-4 / BW-7 单独锁住，
  // 新增表由 office-r1-shelf.test.mjs 的 FD-6 锁住）。
  // TRUNK：再叠上室内 35 株绿植的树干直径偏离（表本身由 office-r1-trunk.test.mjs 的 TK-2 锁住）。
  const boardPatch = new Map([...R1_BOARD_OVERRIDES, ...R1_BOARD_FACING_OVERRIDES].map(entry => [entry.id, entry.to]))
  const gatePatch = new Map(R1_GATE.leafIds.map(id => [id, { heightM: R1_GATE.heightM }]))
  const trunkPatch = new Map(R1_BOARD_TRUNK_OVERRIDES.map(entry => [entry.id, entry.to]))
  assert.equal(trunkPatch.size, 35)
  // LOOK R3 freezes 35 plant moves; children receive exactly their parent's translation.
  const plants = new Map(R1_PLANT_POSITION_OVERRIDES.map(p => [p.id,p]))
  assert.equal(plants.size,35)
  const patch = row => { const p=plants.get(row.id)||plants.get(row.parentId), base=boardPatch.get(row.id)||gatePatch.get(row.id)||trunkPatch.get(row.id); return p?{...base,xM:Number((row.xM+p.to.xM-p.from.xM).toFixed(6)),yM:Number((row.yM+p.to.yM-p.from.yM).toFixed(6))}:base }
  assert.deepEqual(r1.elements, [...R1_DATA.elements.map(row => patch(row) ? { ...row, ...patch(row) } : row), ...R1_BACKWALL.leaves, ...R1_BOARD_ADDED_ELEMENTS])
  assert.equal(r1.elements.length, R1_DATA.elements.length + 4 + R1_BOARD_ADDED_ELEMENTS.length)
  assert.deepEqual(r1.workstations, R1_DATA.workstations)
  assert.deepEqual(r1.routes, candidate.routes)
  assert.deepEqual({ barEntryClearMm: r1.controls.barEntryClearMm, productSideClearMm: r1.controls.productSideClearMm, productBetweenColumnsMm: r1.controls.productBetweenColumnsMm }, { barEntryClearMm: 1200, productSideClearMm: 1250, productBetweenColumnsMm: 1400 })
  assert.deepEqual({ barEntryClearMm: candidate.controls.barEntryClearMm, productSideClearMm: candidate.controls.productSideClearMm, productBetweenColumnsMm: candidate.controls.productBetweenColumnsMm }, { barEntryClearMm: 1500, productSideClearMm: 1340, productBetweenColumnsMm: 1340 })
  assert.equal(C01_DELTA.elements.length, 141); assert.equal(C01_DELTA.workstations.length, 11)
  assert.ok(C01_DELTA.elements.every(row => row.id === '07-BAR-001' || row.base.regionId === '04'))
  assert.ok(C01_DELTA.workstations.every(row => row.base.zone === '04'))
  assert.equal(candidate.elements.filter((row, index) => JSON.stringify(row) !== JSON.stringify(r1.elements[index])).length, 141)
  assert.equal(candidate.workstations.filter((row, index) => JSON.stringify(row) !== JSON.stringify(r1.workstations[index])).length, 11)
})

test('I1 retains clearance parameters needed to compare future route recomputation', () => {
  assert.deepEqual(R1_DATA.bodyProfiles, { H2: { radius_m: .6, height_m: 2.1, rect_mm: [700, 600, 1900] }, H3: { radius_m: .8, height_m: 2.1, rect_mm: [1000, 800, 1900] } })
  assert.equal(R1_DATA.routes.length, 17); assert.equal(R1_DATA.routeReports.length, 17); assert.equal(R1_DATA.checks.length, 29); assert.equal(R1_DATA.localChecks.length, 9)
  const entry = R1_DATA.routeReports.find(route => route.id === 'entry_left')
  assert.equal(entry.status, 'CONDITIONAL_PASS'); assert.equal(entry.minimum_margin_mm, 499.9999999999979); assert.equal(entry.nearest_obstacle.id, '11-D-001:target_frame_a')
  assert.deepEqual(R1_DATA.checks.find(check => check.id === 'element_identity'), { duplicate_ids: [], element_count: 1132, id: 'element_identity', invalid_id_indices: [], orphan_ids: [], parent_cycles: [], status: 'PASS', unique_ids: 1132 })
  assert.equal(R1_DATA.localChecks.find(check => check.id === 'product_side_clear_mm').actual_minimum_mm, 1250)
  assert.equal(R1_DATA.doorTargetFrames.length, 26); assert.equal(R1_DATA.doorTargetFrames[0].clear_target_m, 6.8)
  assert.equal(R1_DATA.doorStateConditions.length, 39); assert.equal(R1_DATA.doorStateConditions[0].open_motion, 'NOT_RUN')
})

test('R1 runtime bridges are explicit and all other runtime modules stay isolated from the offline data module', () => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)])
  const approved = new Set(['office-layout.js', 'office-layout-v3-scene.js', 'office-v3-modules.js', 'office-vis2/r1-site.js', 'office-vis2/r1-shell.js', 'office-vis2/r1-zones.js', 'office-vis2/r1-furniture.js', 'office-vis2/r1-island.js', 'office-vis2/r1-plants.js', 'office-vis2/r1-doors.js', 'office-vis2/r1-lounge.js', 'tests/office-r1-data.test.mjs'])
  for (const file of walk(repo).filter(file => /\\.(?:js|mjs)$/.test(file.replaceAll('/', '\\')))) {
    const repoFile = relative(repo, file).replaceAll('\\', '/')
    if (repoFile.startsWith('office-r1/') || repoFile === 'tests/office-r1-data.test.mjs') continue
    const importsR1 = readFileSync(file, 'utf8').includes('office-r1')
    assert.ok(!importsR1 || approved.has(repoFile), repoFile)
  }
})

// MOVE R5 changes one coordinate in the existing four-entry bench table; no new data rows.
test('MOVE R5 bench override count and exact positional exception remain frozen', () => {
  assert.equal(R1_BOARD_FACING_OVERRIDES.length, 4)
  assert.deepEqual(R1_BOARD_FACING_OVERRIDES.filter(e => 'xM' in e.to).map(e => [e.id, e.from.xM, e.to.xM]), [['14-BN-003', 49, 48.5]])
})
