import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WH_R1_ASSIGNMENT, WH_R1_DATA } from '../wh-r1/data.js'
import { runtimeYawFromFacing, whElementWorld, whToWorld, whZoneToWorld } from '../wh-r1-layout.js'

const repo = fileURLToPath(new URL('../', import.meta.url))
const categories = category => WH_R1_DATA.elements.filter(row => row.category === category).length
const assertRequiredRows = (rows, fields, label) => {
  assert.ok(Array.isArray(rows), `${label} is an array`)
  for (const [index, row] of rows.entries()) for (const field of fields) assert.notEqual(row[field], undefined, `${label}[${index}].${field}`)
}

test('I1 freezes the four WH-R1 source hashes and source counts', () => {
  const manifest = JSON.parse(readFileSync(new URL('../wh-r1/MANIFEST.json', import.meta.url)))
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.sources).map(([key, value]) => [key, value.sha256])), {
    model: 'c2c99e6fb0b80befab718401b683223009f811d5e1931c9e852dba07f398ab45',
    register: '7ae852a6a2a8920b3e198e1dee72d6f3b8dd1697dd32b80e824e7854d37356af',
    elements: '6f3e61a8a36bd01438a399e855b31e693c45ab43b4d65a9402b0ec0864a84d75',
    checks: '714a3734dd0bbbec9c0137577ad7758fa3402f2cad718c0a61914491209737ef',
  })
  assert.deepEqual(manifest.counts, { elements: 1244, unknown: 235, walls: 34, wallFaces: 68, doors: 19, doorLeaves: 19, zones: 14, racks: 4, routes: 12, passageChecks: 18, integrityChecks: 22, arithmeticChecks: 18, assignments: 1244 })
  assert.equal(WH_R1_DATA.unknownComponents.length, 235)
  for (const [category, count] of Object.entries(WH_R1_DATA.metadata.counts)) assert.equal(categories(category), count, category)
  assert.equal(categories('椅子') + categories('休闲椅'), 44)
  assert.equal(categories('绿植总成'), 34); assert.equal(categories('盆器'), 34); assert.equal(categories('树干'), 34); assert.equal(categories('冠幅'), 34)
  assert.equal(categories('连续花池'), 7); assert.equal(categories('长椅'), 4); assert.equal(categories('高位货架总成'), 4); assert.equal(categories('托位载荷控制体'), 192)
  assert.equal(categories('输送线模块'), 10); assert.equal(categories('待解决交叉点'), 3)
})

test('I1 converts WH-R1 metres and millimetres once, retaining zone dimensions', () => {
  assert.deepEqual(whToWorld(0, 0), { x: -168, z: 30 })
  assert.deepEqual(whToWorld(4, 47.86), { x: -164, z: -17.86 })
  assert.deepEqual(whToWorld(58.4, 33.5), { x: -109.6, z: -3.5 })
  assert.deepEqual(whToWorld(15, 39), { x: -153, z: -9 })
  assert.deepEqual(whZoneToWorld([0, 30, 30, 48]), [-168, -138, -18, 0])
  for (const zone of WH_R1_DATA.zones) {
    const [x0, y0, x1, y1] = zone.sourceBboxM, [worldX0, worldX1, worldZ0, worldZ1] = zone.worldBboxXZ
    assert.ok(Math.abs((worldX1 - worldX0) - (x1 - x0)) < 1e-6, zone.id)
    assert.ok(Math.abs((worldZ1 - worldZ0) - (y1 - y0)) < 1e-6, zone.id)
  }
  for (const element of WH_R1_DATA.elements) {
    const point = whElementWorld(element)
    assert.ok(point.x >= -174 && point.x <= -72, element.id)
    assert.ok(point.z >= -26 && point.z <= 42, element.id)
  }
  assert.equal(runtimeYawFromFacing(0, -1), 0)
})

test('I2 step 0 preserves all 68 WH-R1 wall-face identities and centreline offsets', () => {
  const faces = WH_R1_DATA.wallFaces, walls = new Map(WH_R1_DATA.walls.map(wall => [wall.id, wall]))
  const distance = ([x0, y0], [x1, y1]) => Math.hypot(x1 - x0, y1 - y0)
  assert.equal(faces.length, 68); assert.equal(new Set(faces.map(face => face.id)).size, 68)
  for (const face of faces) {
    const wall = walls.get(face.wallId)
    assert.ok(wall, face.id)
    assert.ok(Math.abs(face.lengthM - distance(face.centrelineStartM, face.centrelineEndM)) < 1e-6, face.id)
    assert.ok(Math.abs(face.heightM - wall.heightM) < 1e-6, face.id); assert.ok(Math.abs(face.thicknessM - wall.widthM) < 1e-6, face.id)
    assert.ok(Math.abs(distance(face.centrelineStartM, face.faceStartM) - face.thicknessM / 2) < 1e-6, face.id)
    assert.ok(Math.abs(distance(face.centrelineEndM, face.faceEndM) - face.thicknessM / 2) < 1e-6, face.id)
  }
  for (const wall of WH_R1_DATA.walls) assert.deepEqual(faces.filter(face => face.wallId === wall.id).map(face => face.side).sort(), ['A', 'B'], wall.id)
  assert.deepEqual(faces.find(face => face.id === 'WH-00-W-001-A'), {
    id: 'WH-00-W-001-A', wallId: 'WH-00-W-001', side: 'A', lengthM: 2.06, heightM: 4.5, thicknessM: 0.28,
    centrelineStartM: [0.14, 47.86], centrelineEndM: [2.2, 47.86], faceStartM: [0.14, 48], faceEndM: [2.2, 48],
    grossRectAreaM2: 9.27, openingsAreaM2: 0, axisCoordinateStatus: 'START_END_FIELDS_ARE_WALL_CENTRELINE',
    areaStatus: 'CANDIDATE_SEGMENT_RECTANGLE_EXCLUDING_SEPARATE_DOOR_OPENINGS; RETURNS_AND_HEADS_UNKNOWN', source: '原图室外+远端空间边界', status: 'PROPOSED', notes: '仅本墙段主平面，不含门洞侧壁、压顶、踢脚和节点；门头另列未知。',
  })
})

test('I2 step 0 requires fields on every WH-R1 data row', () => {
  const elementFields = ['id', 'parentId', 'category', 'regionId', 'xM', 'yM', 'zM', 'lengthM', 'widthM', 'heightM', 'yawDeg', 'facingLocal', 'collisionRole', 'status', 'unknown', 'designAssumption', 'sourceTag', 'geometry']
  assertRequiredRows(WH_R1_DATA.elements, elementFields, 'elements')
  assertRequiredRows(WH_R1_DATA.walls, elementFields, 'walls')
  assertRequiredRows(WH_R1_DATA.doors, elementFields, 'doors')
  assertRequiredRows(WH_R1_DATA.wallFaces, ['id', 'wallId', 'side', 'lengthM', 'heightM', 'thicknessM', 'centrelineStartM', 'centrelineEndM', 'faceStartM', 'faceEndM', 'grossRectAreaM2', 'openingsAreaM2', 'axisCoordinateStatus', 'areaStatus', 'source', 'status', 'notes'], 'wallFaces')
  assertRequiredRows(WH_R1_DATA.zones, ['id', 'businessId', 'name', 'sourceBboxM', 'worldBboxXZ'], 'zones')
  assertRequiredRows(WH_R1_DATA.racks, ['id', 'bays', 'levels', 'faces', 'pallets_per_cell', 'candidate_slots'], 'racks')
  assertRequiredRows(WH_R1_DATA.routes, ['id', 'name', 'mode', 'points', 'radius_m', 'z_span'], 'routes')
  assertRequiredRows(WH_R1_DATA.passageChecks, ['id', 'name', 'required_mm', 'available_mm', 'margin_mm', 'status'], 'passageChecks')
  assertRequiredRows(WH_R1_DATA.bodyProfiles, ['id', 'width_mm', 'depth_mm', 'height_mm'], 'bodyProfiles')
  assertRequiredRows(WH_R1_DATA.unknownComponents, ['id', 'parentId', 'category', 'reason', 'status'], 'unknownComponents')
  assertRequiredRows(WH_R1_ASSIGNMENT, ['id', 'card'], 'assignments')
  assertRequiredRows(WH_R1_DATA.integrityAudit.integrity, ['name', 'detail', 'status'], 'integrityChecks')
  assertRequiredRows(WH_R1_DATA.integrityAudit.arithmeticChecks, ['id', 'meaning', 'recomputed_required_mm', 'recomputed_margin_mm', 'status'], 'arithmeticChecks')
  assertRequiredRows(WH_R1_DATA.integrityAudit.capacity, ['id', 'registered_positions', 'formula_positions', 'status'], 'capacityChecks')
  assertRequiredRows(WH_R1_DATA.integrityAudit.routes, ['id', 'name', 'mode', 'points_m', 'status'], 'routeChecks')
  assertRequiredRows(WH_R1_DATA.integrityAudit.expectedJunctions, ['a', 'b', 'categories', 'status'], 'junctionChecks')
  assertRequiredRows(WH_R1_DATA.integrityAudit.physicalProxyOverlapReview, ['a', 'b', 'categories', 'status'], 'physicalProxyOverlapReview')
  assertRequiredRows(WH_R1_DATA.integrityAudit.occupiedEnvelopeOverlapReview, ['a', 'b', 'categories', 'status'], 'occupiedEnvelopeOverlapReview')
  assertRequiredRows(WH_R1_DATA.integrityAudit.zoneBoundaryReview, ['id', 'zone', 'category', 'zone_bbox_m', 'bbox_m', 'status'], 'zoneBoundaryReview')
  assert.ok(WH_R1_DATA.metadata.revision); assert.ok(WH_R1_DATA.metadata.status); assert.ok(WH_R1_DATA.metadata.coordinate)
  assert.notEqual(WH_R1_DATA.integrityAudit.derivedDimensions, undefined); assertRequiredRows(WH_R1_DATA.integrityAudit.limitations.map((text, index) => ({ index, text })), ['index', 'text'], 'limitations')
})

test('I1 preserves door labels, the two check collections and I8 audit inputs', () => {
  const tags = rows => rows.map(row => row.sourceTag)
  assert.deepEqual(tags(WH_R1_DATA.doors.filter(row => row.regionId === '01')), ['01', '02', '02', '02', '04'])
  assert.deepEqual(tags(WH_R1_DATA.doors.filter(row => row.regionId === '06')), ['05', '06', 'UNKNOWN', '08'])
  assert.equal(WH_R1_DATA.passageChecks.length, 18)
  assert.deepEqual(WH_R1_DATA.passageChecks.slice(0, 3).map(row => row.id), ['H01', 'H02', 'H03'])
  const audit = WH_R1_DATA.integrityAudit
  assert.equal(audit.integrity.length, 22); assert.ok(audit.integrity.every(row => row.status === 'PASS'))
  assert.equal(audit.arithmeticChecks.length, 18); assert.equal(audit.capacity.length, 4); assert.equal(audit.routes.length, 12)
  assert.deepEqual(audit.derivedDimensions, { rack_aisles_mm: [3600.0000000000073, 3600, 3600], guard_local_gap_mm: [3300.000000000007, 3300, 3300], rear_cross_aisle_mm: 2769.999999999996, roof_strip_bottom_mm: 4540, highest_load_mm: 4250, top_load_to_roof_strip_mm: 290 })
  assert.equal(audit.physicalProxyOverlapReview.length, 1); assert.equal(audit.occupiedEnvelopeOverlapReview.length, 2); assert.equal(audit.limitations.length, 11)
})

test('I1 assigns every record once to I2 through I7 and leaves runtime modules isolated', () => {
  assert.equal(WH_R1_ASSIGNMENT.length, 1244)
  assert.equal(new Set(WH_R1_ASSIGNMENT.map(row => row.id)).size, 1244)
  assert.deepEqual([...new Set(WH_R1_ASSIGNMENT.map(row => row.card))].sort(), ['I2', 'I3', 'I4', 'I5', 'I6', 'I7'])
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)])
  const allowedRuntime = new Set(['dr-campus-registry.js', 'dr-campus-shell.js', 'dr-place-view.js', 'place-mode.js'])
  const references = []
  for (const file of walk(repo).filter(file => /\.(?:js|mjs)$/.test(file.replaceAll('/', '\\')))) {
    const path = relative(repo, file).replaceAll('\\', '/')
    if (!readFileSync(file, 'utf8').includes('wh-r1')) continue
    if (path.startsWith('tests/')) continue
    references.push(path)
    assert.ok(path.startsWith('wh-r1/') || path === 'wh-r1-layout.js' || allowedRuntime.has(path) || /^dr-wh-r1-[^/]+\.js$/.test(path), path)
  }
  assert.deepEqual(references.sort(), ['dr-campus-registry.js', 'dr-campus-shell.js', 'dr-place-view.js', 'dr-wh-r1-racks.js', 'dr-wh-r1-shell.js', 'dr-wh-r1-workflow.js', 'dr-wh-r1-zones.js', 'place-mode.js', 'wh-r1-layout.js'])
})
