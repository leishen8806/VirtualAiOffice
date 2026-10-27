import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const VERSION = 'wh-r1-i1-r2'
const EXPECTED = Object.freeze({
  model: 'c2c99e6fb0b80befab718401b683223009f811d5e1931c9e852dba07f398ab45',
  register: '7ae852a6a2a8920b3e198e1dee72d6f3b8dd1697dd32b80e824e7854d37356af',
  elements: '6f3e61a8a36bd01438a399e855b31e693c45ab43b4d65a9402b0ec0864a84d75',
  checks: '714a3734dd0bbbec9c0137577ad7758fa3402f2cad718c0a61914491209737ef',
})

const args = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  if (!key?.startsWith('--') || !process.argv[index + 1]) throw new Error('usage: node generate.mjs --source <package-root> --out <repo-root>')
  args[key.slice(2)] = process.argv[index + 1]
}
if (!args.source || !args.out) throw new Error('usage: node generate.mjs --source <package-root> --out <repo-root>')

const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const number = value => value == null ? null : Number(Number(value).toFixed(6))
const sortObject = value => Array.isArray(value) ? value.map(sortObject) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])])) : value
const stable = value => `${JSON.stringify(sortObject(value))}\n`
const csvRows = text => text.trim().split(/\r?\n/).length - 1
const must = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label} hash mismatch: ${actual}`) }
const racks = new Set(['高位货架总成', '货架立柱框占位', '货架格控制体', '托位载荷控制体', '托盘占位子件', '货架横梁占位', '架端防撞占位'])
const shell = new Set(['墙体', '门总成', '门扇占位', '通行控制区', '隔离栏杆', '入口台阶占位'])
const vehicles = new Set(['厢式货车', '搬运设备占位'])
const assignment = row => {
  if (shell.has(row.category)) return 'I2'
  if (racks.has(row.category)) return 'I3'
  if (vehicles.has(row.category)) return 'I5'
  const region = Number(row.region_id)
  if (region >= 1 && region <= 6) return 'I4'
  if (region >= 7 && region <= 11) return 'I6'
  if (region >= 12 && region <= 14) return 'I7'
  throw new Error(`unassigned element: ${row.id} (${row.category}/${row.region_id})`)
}
const compactElement = row => {
  const yawRad = Number(row.yaw_deg || 0) * Math.PI / 180
  return {
    id: row.id, parentId: row.parent_id || null, category: row.category, regionId: row.region_id,
    xM: number(row.x_mm / 1000), yM: number(row.y_mm / 1000), zM: number(row.z_mm / 1000),
    lengthM: number(row.length_mm / 1000), widthM: number(row.width_mm / 1000), heightM: number(row.height_mm / 1000),
    yawDeg: number(row.yaw_deg), facingLocal: [number(Math.sin(yawRad)), number(-Math.cos(yawRad))],
    collisionRole: row.collision_role, status: row.status, unknown: row.status === 'UNKNOWN' || row.dimension_status === 'UNKNOWN',
    designAssumption: String(row.dimension_status || '').includes('DESIGN_ASSUMPTION'), sourceTag: row.source_visible_tag || null,
    geometry: ['墙体', '门总成'].includes(row.category) ? row.geometry_m : null,
  }
}

const sourceRoot = resolve(args.source), outRoot = resolve(args.out)
const files = {
  model: join(sourceRoot, 'output/WH_R1_model.json'),
  register: join(sourceRoot, 'output/WH_R1_element_register.json'),
  elements: join(sourceRoot, 'output/WH_R1_elements.csv'),
  checks: join(sourceRoot, 'validation/WH_R1_checks.json'),
}
for (const [name, expected] of Object.entries(EXPECTED)) must(await sha256(files[name]), expected, name)
const [model, register, checks, elementCsv] = await Promise.all([json(files.model), json(files.register), json(files.checks), readFile(files.elements, 'utf8')])
if (register.elements.length !== 1244 || register.unresolved_components.length !== 235 || register.wall_faces.length !== 68 || model.zones.length !== 14 || model.doors.length !== 19 || model.racks.length !== 4 || model.routes.length !== 12 || model.checks.length !== 18 || checks.integrity.length !== 22 || checks.routes.length !== 12 || checks.arithmetic_checks.length !== 18 || checks.summary.integrity_fail !== 0 || csvRows(elementCsv) !== 1244) throw new Error('WH-R1 source count mismatch')
const elements = register.elements.map(compactElement).sort((a, b) => a.id.localeCompare(b.id))
const categoryCounts = Object.fromEntries([...new Set(elements.map(row => row.category))].sort().map(category => [category, elements.filter(row => row.category === category).length]))
if (JSON.stringify(sortObject(categoryCounts)) !== JSON.stringify(sortObject(model.metadata.counts))) throw new Error('WH-R1 category counts mismatch')
const assignments = register.elements.map(row => ({ id: row.id, card: assignment(row) })).sort((a, b) => a.id.localeCompare(b.id))
if (assignments.length !== 1244 || new Set(assignments.map(row => row.id)).size !== 1244 || new Set(assignments.map(row => row.card)).size !== 6) throw new Error('WH-R1 assignment mismatch')
const data = {
  metadata: { revision: model.metadata.revision, status: model.metadata.status, coordinate: 'world_x = local_x_m - 168; world_y = local_z_mm / 1000; world_z = 30 - local_y_m', counts: model.metadata.counts },
  bounds: { x: [-174, -72], z: [-26, 42] },
  zones: model.zones.map(zone => ({ id: zone.id, businessId: zone.business_id, name: zone.name, sourceBboxM: zone.bbox_m, worldBboxXZ: [number(zone.bbox_m[0] - 168), number(zone.bbox_m[2] - 168), number(30 - zone.bbox_m[3]), number(30 - zone.bbox_m[1])] })).sort((a, b) => a.id.localeCompare(b.id)),
  elements, walls: elements.filter(row => row.category === '墙体'), wallFaces: register.wall_faces.map(({ id, parent_id: parentId, side, status, geometry_m: geometry }) => ({ id, parentId, side, status, geometry })),
  doors: elements.filter(row => row.category === '门总成'), racks: model.racks, routes: model.routes, passageChecks: model.checks, bodyProfiles: model.body_profiles,
  integrityAudit: { integrity: checks.integrity, capacity: checks.capacity, arithmeticChecks: checks.arithmetic_checks, derivedDimensions: checks.derived_dimensions, routes: checks.routes, physicalProxyOverlapReview: checks.physical_proxy_overlap_review, occupiedEnvelopeOverlapReview: checks.occupied_envelope_overlap_review, expectedJunctions: checks.expected_junctions, zoneBoundaryReview: checks.zone_boundary_review, limitations: checks.limitations },
  unknownComponents: register.unresolved_components.map(({ id, parent_id: parentId, category, reason, status }) => ({ id, parentId, category, reason, status })),
}
const sourceRows = { model: model.zones.length, register: register.elements.length, elements: csvRows(elementCsv), checks: checks.integrity.length }
const manifest = { generatorVersion: VERSION, normalization: 'stable key ordering; LF; numbers rounded to six decimals; source millimetres converted once before world conversion', sources: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => [name, { file: basename(file), sha256: await sha256(file), rows: sourceRows[name] }]))), counts: { elements: elements.length, unknown: data.unknownComponents.length, walls: data.walls.length, wallFaces: data.wallFaces.length, doors: data.doors.length, doorLeaves: elements.filter(row => row.category === '门扇占位').length, zones: data.zones.length, racks: data.racks.length, routes: data.routes.length, passageChecks: data.passageChecks.length, integrityChecks: data.integrityAudit.integrity.length, arithmeticChecks: data.integrityAudit.arithmeticChecks.length, assignments: assignments.length } }
const dataDir = join(outRoot, 'office3d', 'wh-r1')
await rm(dataDir, { recursive: true, force: true }); await mkdir(dataDir, { recursive: true })
await writeFile(join(dataDir, 'data.js'), `export const WH_R1_DATA = ${stable(data)}\nexport const WH_R1_ASSIGNMENT = ${stable(assignments)}`)
await writeFile(join(dataDir, '分配表.json'), stable(assignments))
await writeFile(join(dataDir, 'MANIFEST.json'), stable(manifest))
await writeFile(join(dataDir, 'README.md'), '# WH-R1 数据\n\n由 `node scripts/wh-r1/generate.mjs --source <WH-R1包根目录> --out <仓库根目录>` 离线生成。来源均为 DESIGN_ASSUMPTION，非实测；运行时不读取图纸包。\n')
await writeFile(join(outRoot, 'office3d', 'wh-r1-layout.js'), `import { WH_R1_DATA } from './wh-r1/data.js'\n\nconst coordinate = value => Number(value.toFixed(6))\nexport const whToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM - 168), z: coordinate(30 - yM) })\nexport const whElementWorld = row => Object.freeze({ ...whToWorld(row.xM, row.yM), y: row.zM })\n// Input bbox is [x0, y0, x1, y1]; output is [world_x0, world_x1, world_z0, world_z1].\nexport const whZoneToWorld = ([x0, y0, x1, y1]) => Object.freeze([coordinate(x0 - 168), coordinate(x1 - 168), coordinate(30 - y1), coordinate(30 - y0)])\nexport const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }\nexport const createWhR1Layout = () => Object.freeze({ data: WH_R1_DATA, elements: WH_R1_DATA.elements, routes: WH_R1_DATA.routes })\n`)
console.log(JSON.stringify({ output: dataDir, bytes: (await readFile(join(dataDir, 'data.js'))).byteLength + (await readFile(join(dataDir, '分配表.json'))).byteLength + (await readFile(join(dataDir, 'MANIFEST.json'))).byteLength + (await readFile(join(dataDir, 'README.md'))).byteLength, counts: manifest.counts }, null, 2))
