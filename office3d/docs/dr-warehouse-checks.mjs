import { readFileSync } from 'node:fs'
import {
  CAMPUS_PAVING,
  CORRIDOR_X,
  CROSS_Z,
  DOCK,
  ENVELOPE,
  FOYER_ITEMS,
  FOYER_TARGETS,
  LOGISTICS_GATE_ZONE,
  MINI_BOUNDS,
  PARKING,
  PLAZA,
  REGION_FOCUS,
  SEATS,
  SERVICE_PASSAGE,
  WAITING_SEATS,
  WAREHOUSE,
  WAREHOUSE_FOCUS,
  WAREHOUSE_ITEMS,
  WEST_WALK,
  corridorPath,
  foyerTrip,
  plazaTrip,
  workHome,
} from '../office-layout.js'
import { CAT_DESTINATIONS, catRoamPoints, catRoute } from '../cat-play.js'

const warehouse = { ...WAREHOUSE }
const warehouseItems = WAREHOUSE_ITEMS.map(item => ({ ...item, center: { ...item.center }, size: { ...item.size } }))
if (process.env.DR_WAREHOUSE_CHECK_MUTATE === 'shallow') warehouse.z1 = 28.5
if (process.env.DR_WAREHOUSE_CHECK_MUTATE === 'overlap') {
  Object.assign(warehouseItems[0], { x0: PLAZA.x0 + 1, x1: PLAZA.x0 + 5, z0: 18, z1: 23 })
}

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}
const overlap = (a, b, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad
const halfGrid = value => Number.isFinite(value) && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
const pointIn = (p, b, pad = 0) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad
const segmentHits = (a, b, obstacle, pad = 0.3) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1))
  for (let i = 0; i <= steps; i++) if (pointIn({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, obstacle, pad)) return true
  return false
}
const routeHits = points => points?.some((p, i) => i && segmentHits(points[i - 1], p, warehouse))

const numericGeometry = [warehouse, DOCK, PARKING, WEST_WALK, SERVICE_PASSAGE, CAMPUS_PAVING, LOGISTICS_GATE_ZONE, MINI_BOUNDS]
  .flatMap(item => ['x0', 'x1', 'z0', 'z1'].map(key => item[key]))
  .concat(warehouseItems.flatMap(item => [item.x0, item.x1, item.z0, item.z1, item.center.x, item.center.z, item.size.x, item.size.z, item.yaw]))
  .filter(Number.isFinite)
check('all proposed coordinates use the 0.5 m grid', numericGeometry.every(halfGrid))
const warehouseWidth = warehouse.x1 - warehouse.x0, warehouseDepth = warehouse.z1 - warehouse.z0
const dockWidth = DOCK.x1 - DOCK.x0, dockDepth = DOCK.z1 - DOCK.z0
const parkingWidth = PARKING.x1 - PARKING.x0, parkingDepth = PARKING.z1 - PARKING.z0
check('warehouse footprint is at least 28 × 12 m and 336 m²', warehouseWidth >= 28 && warehouseDepth >= 12 && warehouseWidth * warehouseDepth >= 336, `${warehouseWidth} × ${warehouseDepth} m = ${warehouseWidth * warehouseDepth} m²`)
check('dock remains at least 28 × 2.5 m and 70 m²', dockWidth >= 28 && dockDepth >= 2.5 && dockWidth * dockDepth >= 70, `${dockWidth * dockDepth} m²`)
check('parking remains at least 28 × 4 m and 112 m²', parkingWidth >= 28 && parkingDepth >= 4 && parkingWidth * parkingDepth >= 112, `${parkingWidth * parkingDepth} m²`)
check('warehouse is west of plaza with 4 m clearance', PLAZA.x0 - warehouse.x1 >= 4, `${PLAZA.x0 - warehouse.x1} m`)
check('warehouse is south of foyer with 4 m clearance', warehouse.z0 - ENVELOPE.z1 >= 4, `${warehouse.z0 - ENVELOPE.z1} m`)
check('west pedestrian passage stays at least 4 m wide', WEST_WALK.x1 - WEST_WALK.x0 >= 4, `${WEST_WALK.x1 - WEST_WALK.x0} m`)
check('service passage stays at least 4 m deep', SERVICE_PASSAGE.z1 - SERVICE_PASSAGE.z0 >= 4, `${SERVICE_PASSAGE.z1 - SERVICE_PASSAGE.z0} m`)

const requiredKeys = ['id', 'name', 'x0', 'x1', 'z0', 'z1', 'center', 'size', 'yaw', 'blocksFloor', 'personAccessible']
check('every item has the complete planning contract', warehouseItems.every(item => requiredKeys.every(key => key in item) && item.personAccessible === false))
check('no proposed item occupies the existing plaza', warehouseItems.every(item => !overlap(item, PLAZA)))
check('no proposed item occupies the current office or foyer envelope', warehouseItems.every(item => !overlap(item, ENVELOPE)))
const blocking = warehouseItems.filter(item => item.blocksFloor)
const pairConflict = blocking.flatMap((item, i) => blocking.slice(i + 1).filter(other => overlap(item, other)).map(other => `${item.id}/${other.id}`))
check('blocking items do not overlap each other', pairConflict.length === 0, pairConflict.join(', '))

const existingItemsInStudyArea = FOYER_ITEMS.filter(item => overlap(item, { x0: -46, x1: -10, z0: 14, z1: 36 }))
check('existing foyer items only touch, but do not enter, the warehouse site', existingItemsInStudyArea.every(item => !overlap(item, { x0: -46, x1: -14, z0: 17, z1: 35 })), existingItemsInStudyArea.map(item => item.id).join(', ') || 'none')
check('waiting seats remain outside the warehouse site', WAITING_SEATS.every(point => !pointIn(point, { x0: -46, x1: -14, z0: 17, z1: PARKING.z1 })))

// Reproduce app.js seed=11 and every rnd() call before env.js creates the ten landmark palms.
const seededRandom = () => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function generatedPalms() {
  const rnd = seededRandom()
  const skip = count => { for (let i = 0; i < count; i++) rnd() }
  skip(81000) // grass, paving and asphalt noise
  skip(24 * 21 + 16 * 19 + 14 * 21 + 48 + 144 + 121) // trees, planters, facade and city
  skip(4 * (3500 * 5 + 40 * 4)) // four landmark stone textures
  for (let i = 0; i < 30; i++) { // landmark island trees: two coordinates, then optional size/y
    const x = (rnd() - 0.5) * 240, z = (rnd() - 0.5) * 200
    if ((Math.abs(x) < 64 && Math.abs(z) < 56) || Math.abs(x) < 12) continue
    skip(2)
  }
  skip(18 * 3) // Wat Phnom greenery
  return [[-28, 18], [28, 18], [-30, -16], [30, -16], [-46, 30], [46, 30], [-12, 30], [12, 30], [-44, -30], [44, -30]].map(([baseX, baseZ]) => {
    const palm = { baseX, baseZ, x: baseX + rnd(), z: baseZ + rnd(), h: 8 + rnd() * 4 }
    palm.alreadyRemoved = (baseX === -28 && baseZ === 18) || (baseZ === 30 && [-12, 12].includes(baseX))
    skip(14)
    return palm
  })
}
const envSource = readFileSync(new URL('../env.js', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
check('current seed and palm generation rules match the reproduced sequence', /let s = 11/.test(appSource) && /\[-28, 18\].*\[-46, 30\].*\[-12, 30\]/s.test(envSource) && /scene\.remove\(tree\)/.test(envSource))
const palms = generatedPalms(), plannedRemoval = new Set(['-46,30'])
const palmsInPaving = palms.filter(palm => pointIn(palm, CAMPUS_PAVING) || (palm.x === CAMPUS_PAVING.x0 || palm.z === CAMPUS_PAVING.z0))
const residualPalms = palmsInPaving.filter(palm => !palm.alreadyRemoved && !plannedRemoval.has(`${palm.baseX},${palm.baseZ}`))
check('expanded campus paving has no residual palm points after planned removals', residualPalms.length === 0, palmsInPaving.map(p => `(${p.x.toFixed(3)},${p.z.toFixed(3)})${p.alreadyRemoved ? ':existing' : ':planned'}`).join(', '))

const targets = Object.keys(FOYER_TARGETS)
let personSegments = 0
let personConflict = null
for (const [agent, seat] of Object.entries(SEATS)) {
  const home = workHome(seat)
  for (const target of targets) for (const route of [foyerTrip(home, target), plazaTrip(home, target)]) {
    personSegments += Math.max(0, route.length - 1)
    if (!personConflict && routeHits(route)) personConflict = `${agent}/${target}`
  }
}
check('all current foyerTrip/plazaTrip route segments avoid the warehouse', !personConflict, `${personSegments} segments`)

const catPoints = [...catRoamPoints(), ...Object.values(CAT_DESTINATIONS)]
let catSegments = 0
let catConflict = null
for (let i = 0; i < catPoints.length; i++) {
  const route = catRoute(catPoints[i], catPoints[(i + 1) % catPoints.length])
  catSegments += Math.max(0, (route?.length || 0) - 1)
  if (!route || routeHits([catPoints[i], ...route])) { catConflict = `route-${i}`; break }
}
check('sampled current cat public routes avoid the warehouse', !catConflict, `${catSegments} segments`)

const corridorProbe = corridorPath({ x: ENVELOPE.x0, z: CROSS_Z }, { x: CORRIDOR_X, z: 12 })
check('current corridorPath remains north of the warehouse', !routeHits([{ x: ENVELOPE.x0, z: CROSS_Z }, ...corridorProbe]))
check('proposed minimap contains the complete new paving with 2 m margin', MINI_BOUNDS.x0 <= CAMPUS_PAVING.x0 - 2 && MINI_BOUNDS.z1 >= CAMPUS_PAVING.z1 + 2, `x0=${MINI_BOUNDS.x0}, z1=${MINI_BOUNDS.z1}`)
check('warehouse focus points at the proposed building', pointIn({ x: WAREHOUSE_FOCUS.t[0], z: WAREHOUSE_FOCUS.t[2] }, warehouse))
check('existing plaza focus remains unchanged and outside warehouse', REGION_FOCUS.plaza?.t?.[0] === CORRIDOR_X && !pointIn({ x: REGION_FOCUS.plaza.t[0], z: REGION_FOCUS.plaza.t[2] }, warehouse))

console.log(`SUMMARY items=${warehouseItems.length} personSegments=${personSegments} catSegments=${catSegments} conflicts=${failures.length} result=${failures.length ? 'FAIL' : 'PASS'}`)
if (failures.length) process.exitCode = 1
