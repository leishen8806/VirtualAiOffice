import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'

const VERSION = 'office-r1-i1-r2'
const EXPECTED = Object.freeze({
  r1Model: '2bcb1fbca9e1bdc1d9b65804c75b10f767665afba7a0e07a33263ffb6ea7438b',
  r1Register: '1358d23f0f33f38de6887de86557395615938a2b32b3adb915babedcd1c93350',
  c01Model: '926554077c81b21e97fe8c4cd93d190434449cdd1fba597d3e6b8cc83efe4d70',
  c01Register: '54aae1f8d4491c55731143afc832c6dc4d7b8a3cbe7a193e0d9e43ca54599d49',
  r1Walls: '9c43e7b53c7d01150bdb747a1717d18bc176f47bdec6e1ae988ec576e55b9f4d',
})

const args = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  if (!key?.startsWith('--') || !process.argv[index + 1]) throw new Error('usage: node generate.mjs --r1 <package-root> --c01 <package-root> --out <repo-root>')
  args[key.slice(2)] = process.argv[index + 1]
}
if (!args.r1 || !args.c01 || !args.out) throw new Error('usage: node generate.mjs --r1 <package-root> --c01 <package-root> --out <repo-root>')

const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const sortObject = value => Array.isArray(value) ? value.map(sortObject) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])])) : value
const stable = value => `${JSON.stringify(sortObject(value))}\n`
const number = value => value == null ? null : Number(Number(value).toFixed(6))
const element = row => {
  const yawRad = Number(row.yaw_deg || 0) * Math.PI / 180
  return {
    id: row.id, category: row.category, regionId: row.region_id, parentId: row.parent_id || null,
    xM: number(row.x_mm / 1000), yM: number(row.y_mm / 1000), zM: number(row.z_mm / 1000),
    lengthM: number(row.length_mm / 1000), widthM: number(row.width_mm / 1000), heightM: number(row.height_mm / 1000),
    yawDeg: number(row.yaw_deg), facingLocal: [number(Math.sin(yawRad)), number(-Math.cos(yawRad))],
    status: row.status, unknown: row.status === 'UNKNOWN' || row.dimension_status === 'UNKNOWN',
    geometry: row.category === '墙体' || row.id === '07-BAR-001' ? row.geometry_m : null,
  }
}
const changed = (a, b) => Object.keys(a).some(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
const find = async (root, relative) => join(resolve(root), relative)
const must = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label} hash mismatch: ${actual}`) }

const r1Root = resolve(args.r1), c01Root = resolve(args.c01), outRoot = resolve(args.out)
const files = {
  r1Model: await find(r1Root, 'output/R1_model.json'), r1Register: await find(r1Root, 'output/R1_element_register.json'),
  r1Walls: await find(r1Root, 'output/R1_wall_faces.csv'), r1Elements: await find(r1Root, 'output/R1_elements.csv'),
  r1Mapping: await find(r1Root, 'output/R1_business_id_mapping.csv'), r1Checks: await find(r1Root, 'output/R1_clearance_checks.json'),
  c01Model: await find(c01Root, 'analysis/C01/C01_model.json'), c01Register: await find(c01Root, 'analysis/C01/C01_element_register.json'),
}
for (const key of Object.keys(EXPECTED)) must(await sha256(files[key]), EXPECTED[key], key)
const [model, register, checks, c01Model, c01Register] = await Promise.all([json(files.r1Model), json(files.r1Register), json(files.r1Checks), json(files.c01Model), json(files.c01Register)])
const [wallFaceCsv, elementCsv, mappingCsv] = await Promise.all([readFile(files.r1Walls, 'utf8'), readFile(files.r1Elements, 'utf8'), readFile(files.r1Mapping, 'utf8')])
const csvRows = text => text.trim().split(/\r?\n/).length - 1
const wallFaceCsvRows = text => new Map(text.trim().split(/\r?\n/).slice(1).map(line => {
  const [faceId, wallId, side, lengthMm, heightMm, thicknessMm, openingAreaM2, startXMm, startYMm, endXMm, endYMm] = line.split(',')
  return [faceId, { faceId, wallId, side, lengthMm: Number(lengthMm), heightMm: Number(heightMm), thicknessMm: Number(thicknessMm), openingAreaM2: Number(openingAreaM2), startXMm: Number(startXMm), startYMm: Number(startYMm), endXMm: Number(endXMm), endYMm: Number(endYMm) }]
}))
const elements = register.elements.map(element).sort((a, b) => a.id.localeCompare(b.id))
const c01Elements = new Map(c01Register.elements.map(row => [row.id, element(row)]))
const delta = elements.map(base => ({ id: base.id, base, candidate: c01Elements.get(base.id) })).filter(row => row.candidate && changed(row.base, row.candidate))
const workstations = register.workstations.map(row => ({ ...row, xM: number(row.x_mm / 1000), yM: number(row.y_mm / 1000), chairXM: number(row.chair_x_mm / 1000), chairYM: number(row.chair_y_mm / 1000) })).sort((a, b) => a.business_id.localeCompare(b.business_id))
const c01Workstations = new Map(c01Register.workstations.map(row => [row.business_id, { ...row, xM: number(row.x_mm / 1000), yM: number(row.y_mm / 1000), chairXM: number(row.chair_x_mm / 1000), chairYM: number(row.chair_y_mm / 1000) }]))
const workstationDelta = workstations.map(base => ({ businessId: base.business_id, base, candidate: c01Workstations.get(base.business_id) })).filter(row => changed(row.base, row.candidate))
if (elements.length !== 1132 || register.wall_faces.length !== 84 || model.zones.length !== 14 || model.doors.length !== 13 || Object.keys(model.routes).length !== 17 || checks.checks.length !== 29 || csvRows(wallFaceCsv) !== 84 || csvRows(elementCsv) !== 1132 || csvRows(mappingCsv) !== 25) throw new Error('R1 source count mismatch')
if (register.unresolved_components.length !== 463 || workstations.length !== 25 || delta.length !== 141 || workstationDelta.length !== 11) throw new Error(`C-01 delta mismatch: elements=${delta.length} workstations=${workstationDelta.length}`)
if (!delta.every(row => row.id === '07-BAR-001' || row.base.regionId === '04') || !workstationDelta.every(row => row.base.zone === '04')) throw new Error('C-01 delta escaped approved scope')
const csvFaces = wallFaceCsvRows(wallFaceCsv)
const wallFaces = register.wall_faces.map(row => {
  const csv = csvFaces.get(row.face_id)
  if (!csv || row.wall_id !== csv.wallId || row.side !== csv.side || Number(row.length_mm) !== csv.lengthMm || Number(row.height_mm) !== csv.heightMm || Number(row.thickness_mm) !== csv.thicknessMm || Number(row.opening_area_m2) !== csv.openingAreaM2 || Number(row.start_x_mm) !== csv.startXMm || Number(row.start_y_mm) !== csv.startYMm || Number(row.end_x_mm) !== csv.endXMm || Number(row.end_y_mm) !== csv.endYMm) throw new Error(`wall face CSV mismatch: ${row.face_id}`)
  return { id: row.face_id, wallId: row.wall_id, side: row.side, lengthM: number(row.length_mm / 1000), heightM: number(row.height_mm / 1000), thicknessM: number(row.thickness_mm / 1000), openingAreaM2: row.opening_area_m2, startM: [number(row.start_x_mm / 1000), number(row.start_y_mm / 1000)], endM: [number(row.end_x_mm / 1000), number(row.end_y_mm / 1000)], source: row.source, status: row.status }
})
if (csvFaces.size !== 84 || new Set(wallFaces.map(face => face.id)).size !== 84) throw new Error('wall face CSV identity mismatch')
const routeReports = Object.values(checks.routes).map(({ id, source, status, zone, target, points_m, body_profile, body_radius_m, checked_sweep_radius_m, checked_sweep_diameter_m, height_slice_m, obstacle_count, minimum_margin_mm, nearest_obstacle, collisions, tangent_contacts, zero_installation_allowance, target_width_verified_as_swept_band, target_note, condition }) => ({ id, source, status, zone, target, points_m, body_profile, body_radius_m, checked_sweep_radius_m, checked_sweep_diameter_m, height_slice_m, obstacle_count, minimum_margin_mm, nearest_obstacle, collisions, tangent_contacts, zero_installation_allowance, target_width_verified_as_swept_band, target_note, condition })).sort((a, b) => a.id.localeCompare(b.id))
const data = {
  metadata: { revision: model.metadata.revision, designAssumption: model.metadata.all_dimensions, coordinate: 'world_x = X_m - 26; world_z = 18 - Y_m; world_y = z_mm / 1000' },
  bounds: { x: [-32, 36], z: [-25, 38] }, zones: model.zones.map(zone => ({ ...zone, sourceBboxM: zone.bbox_m, worldBboxXZ: [number(zone.bbox_m[0] - 26), number(zone.bbox_m[2] - 26), number(18 - zone.bbox_m[3]), number(18 - zone.bbox_m[1])] })).sort((a, b) => a.id.localeCompare(b.id)),
  walls: elements.filter(row => row.category === '墙体'),
  wallFaces,
  doors: model.doors.map(element), elements, workstations,
  routes: Object.entries(model.routes).map(([id, route]) => ({ id, ...route })).sort((a, b) => a.id.localeCompare(b.id)),
  routeReports, checks: checks.checks, localChecks: checks.local_checks, bodyProfiles: checks.body_profiles, doorTargetFrames: checks.door_target_frames, doorStateConditions: checks.door_state_conditions,
  unknownComponents: register.unresolved_components.map(({ id, parent_id: parentId, category, status }) => ({ id, parentId, category, status })),
  controls: { ...model.controls, barEntryClearMm: model.central.bar_entry_clear_mm, productSideClearMm: model.checks_inputs.product_side_clear_mm, productBetweenColumnsMm: model.checks_inputs.product_between_columns_mm }, central: model.central, plaza: model.plaza,
}
const candidateControls = { barEntryClearMm: c01Model.central.bar_entry_clear_mm, productSideClearMm: c01Model.checks_inputs.product_side_clear_mm, productBetweenColumnsMm: c01Model.checks_inputs.product_between_columns_mm }
const sourceRows = { r1Model: model.zones.length, r1Register: register.elements.length, r1Walls: csvRows(wallFaceCsv), r1Elements: csvRows(elementCsv), r1Mapping: csvRows(mappingCsv), r1Checks: checks.checks.length, c01Model: c01Model.zones.length, c01Register: c01Register.elements.length }
const manifest = { generatorVersion: VERSION, normalization: 'stable key ordering; LF; numbers rounded to six decimals; source millimetres converted once before world conversion', sources: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, { file: basename(file), sha256: await sha256(file), rows: sourceRows[key] }]))), counts: { elements: elements.length, unknown: register.unresolved_components.length, walls: data.walls.length, wallFaces: wallFaces.length, doors: model.doors.length, doorLeaves: 26, zones: data.zones.length, routes: data.routes.length, routeReports: routeReports.length, checks: data.checks.length, localChecks: data.localChecks.length, bodyProfiles: Object.keys(data.bodyProfiles).length, doorTargetFrames: data.doorTargetFrames.length, doorStateConditions: data.doorStateConditions.length, businessIds: workstations.length, c01ElementDelta: delta.length, c01WorkstationDelta: workstationDelta.length } }
const dataDir = join(outRoot, 'office3d', 'office-r1')
await rm(dataDir, { recursive: true, force: true }); await mkdir(dataDir, { recursive: true })
await writeFile(join(dataDir, 'MANIFEST.json'), stable(manifest))
await writeFile(join(dataDir, 'README.md'), '# OFFICE-R1 数据\n\n由 `node scripts/office-r1/generate.mjs --r1 <R1包根目录> --c01 <C-01包根目录> --out <仓库根目录>` 离线生成。来源均为 DESIGN_ASSUMPTION，不是实测；运行时不读取图纸包。\n')
await writeFile(join(dataDir, 'data.js'), `export const R1_DATA = ${stable(data)}\nexport const C01_DELTA = ${stable({ elements: delta, workstations: workstationDelta, controls: candidateControls })}`)
await writeFile(join(outRoot, 'office3d', 'office-r1-layout.js'), `import { C01_DELTA, R1_DATA } from './office-r1/data.js'\n\nexport const DEFAULT_CANDIDATE_C01 = true\nconst coordinate = value => Number(value.toFixed(6))\nexport const r1ToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM - 26), z: coordinate(18 - yM) })\nexport const r1ElementWorld = row => Object.freeze({ ...r1ToWorld(row.xM, row.yM), y: row.zM })\nexport const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }\nexport function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {\n  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()\n  return Object.freeze({ candidateC01, data: R1_DATA, elements: Object.freeze(R1_DATA.elements.map(item => replacements.get(item.id) || item)), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes: R1_DATA.routes })\n}\n`)
console.log(JSON.stringify({ output: dataDir, bytes: (await readFile(join(dataDir, 'data.js')).then(value => value.byteLength)) + (await readFile(join(dataDir, 'MANIFEST.json')).then(value => value.byteLength)) + (await readFile(join(dataDir, 'README.md')).then(value => value.byteLength)), counts: manifest.counts }, null, 2))
