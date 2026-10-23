import { LAYOUT_V3 } from '../office-layout.js'

const data = structuredClone(LAYOUT_V3)
const AXIS_X = data.axis.x
const PERSON_GAP = .52
const site = data.site
const building = data.envelope
const landscape = { ...data.greenBuffer, buffer: data.greenBuffer.width }
const foyer = data.foyer
const plaza = { cx: data.plaza.center.x, cz: data.plaza.center.z, radius: data.plaza.radius, diameter: data.plaza.diameter }
const island = { cx: data.island.center.x, cz: data.island.center.z, ...data.island }
const ring = data.ring
const walls = data.wallHeight
const monitorFit = data.monitorFit
const regions = data.regions
const seats = data.seats
const displaySeats = data.displaySeats
const cameras = data.cameraDefaults
const occlusion = data.wallHeight.occlusion
const foyerDetails = {
  reception: { cx: data.frontDesk.center.x, cz: data.frontDesk.center.z, width: data.frontDesk.x1 - data.frontDesk.x0, depth: data.frontDesk.z1 - data.frontDesk.z0 },
  service: { cx: data.serviceBar.center.x, cz: data.serviceBar.center.z, width: data.serviceBar.x1 - data.serviceBar.x0, depth: data.serviceBar.z1 - data.serviceBar.z0 },
  waiting: { cx: data.waitingArc.center.x, cz: data.waitingArc.center.z, width: data.waitingArc.x1 - data.waitingArc.x0, depth: data.waitingArc.z1 - data.waitingArc.z0 },
  axis: data.passages.entranceAxis, sideClearance: 2,
}
const plazaDetails = { rings: data.plaza.rings, carts: data.plaza.carts.length, kiosks: data.plaza.kiosks.length, umbrellaTables: data.plaza.umbrellaTables.length, lamps: data.plaza.lamps.length, benches: data.plaza.benches.length, flowerBands: data.plaza.flowerBands.length, radialSeams: data.plaza.radialSeams }
const stageBudgets = {
  R3_2: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
  R3_3: { highCalls: 3, highTriangles: 24000, lowCalls: 1, lowTriangles: 7000 },
  R3_4B: { highCalls: 4, highTriangles: 34000, lowCalls: 1, lowTriangles: 10000 },
  R3_5: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
  R3_6B: { highCalls: 5, highTriangles: 32000, lowCalls: 2, lowTriangles: 11000 },
  R3_7: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
}
const corridors = Object.entries(data.corridors).filter(([, corridor]) => 'x0' in corridor).map(([id, corridor]) => ({ id, ...corridor }))

const graphEdges = [
  ...regions.filter(r => r.x1 < AXIS_X).map(r => [r.id, 'westLoop']),
  ...regions.filter(r => r.x0 > AXIS_X).map(r => [r.id, 'eastLoop']),
  ['westLoop', 'ring'], ['eastLoop', 'ring'], ['ring', 'bar'], ['ring', 'foyer'], ['foyer', 'reception'], ['reception', 'exit'],
]

const mutation = process.env.OFFICE_REV3_CHECK_MUTATE || ''
if (mutation === 'overlap') regions.find(r => r.id === 'service').x0 = 19
if (mutation === 'narrow-ring') ring.outer = 9.5
if (mutation === 'delete-door') regions.find(r => r.id === 'plan').doors.length = 0
if (mutation === 'seat-outside') seats.Lead[1] = 40
if (mutation === 'blocked-route') graphEdges.splice(graphEdges.findIndex(([a, b]) => a === 'ring' && b === 'foyer'), 1)
if (mutation === 'plaza-overlap') foyer.z1 = 13
if (mutation === 'structural-grid') regions.find(r => r.id === 'board').doors[0].at = 14.2

const failures = []
const check = (ok, message) => ok ? console.log(`PASS ${message}`) : (failures.push(message), console.error(`FAIL ${message}`))
const overlaps = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.z1, b.z1) > Math.max(a.z0, b.z0)
const contains = (box, x, z, margin = 0) => x >= box.x0 + margin && x <= box.x1 - margin && z >= box.z0 + margin && z <= box.z1 - margin
const distanceRectToPoint = (box, x, z) => Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1))
const regionById = id => regions.find(r => r.id === id)
const deskBounds = (x, z) => ({ x0: x - .8, x1: x + .8, z0: z - .45, z1: z + 1.25 })
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9
const boxValues = box => [box.x0, box.x1, box.z0, box.z1]
const structuralValues = [
  ...boxValues(site), ...boxValues(building), ...boxValues(foyer),
  data.greenBuffer.width, ...boxValues(data.greenBuffer),
  ...regions.flatMap(region => [...boxValues(region), ...region.doors.flatMap(door => [door.at, door.width])]),
  ...Object.values(data.corridors).flatMap(corridor => 'center' in corridor
    ? [corridor.center.x, corridor.center.z, corridor.r0, corridor.r1, corridor.width]
    : [...boxValues(corridor), corridor.width]),
  ...Object.values(data.passages).flatMap(passage => 'center' in passage
    ? [passage.center.x, passage.center.z, passage.r0, passage.r1, passage.width]
    : [...boxValues(passage), passage.width]),
  ...Object.values(data.doors).flatMap(door => [door.x0, door.x1, door.z, door.width]),
  ring.center.x, ring.center.z, ring.inner, ring.outer, ring.width,
  island.center.x, island.center.z, island.radius, island.diameter,
  data.plaza.center.x, data.plaza.center.z, data.plaza.radius, data.plaza.diameter,
  walls.standard, walls.atrium, walls.windowBandBottom,
]
const furnitureValues = [
  ...Object.values(seats).flatMap(([, x, z]) => [x, z]),
  ...displaySeats.flatMap(seat => [seat.x, seat.z]),
  ...data.bar.seats.flatMap(seat => [seat.x, seat.z]),
  ...[data.frontDesk, data.serviceBar, data.waitingArc].flatMap(item => [...boxValues(item), item.center.x, item.center.z]),
  data.boss.desk.x, data.boss.desk.z, data.boss.stand.x, data.boss.stand.z, data.boardTable.x, data.boardTable.z,
  data.island.treeRadius, data.island.barOuter, data.island.stoolRadius, data.island.sofaOuter,
  ...['carts', 'kiosks', 'umbrellaTables', 'lamps', 'benches', 'flowerBands'].flatMap(key => data.plaza[key].flatMap(item => [item.x, item.z])),
]

check(site.x1 - site.x0 === 60 && site.z1 - site.z0 === 48, 'design core is exactly 60 m × 48 m')
check(building.x1 - building.x0 === 60 && building.z1 - building.z0 === 30, 'office plus foyer occupies the northern 60 m × 30 m')
check(foyer.width === 16 && foyer.depth === 8 && foyer.x1 - foyer.x0 === 16 && foyer.z1 - foyer.z0 === 8, 'foyer is exactly 16 m × 8 m')
check(plaza.diameter === 18 && plaza.radius === 9 && plaza.cz + plaza.radius === site.z1, 'DR plaza is Ø18 m and reaches the south edge')
check(distanceRectToPoint(foyer, plaza.cx, plaza.cz) === plaza.radius, 'foyer and circular plaza are tangent without overlap')
check(island.diameter === 12 && island.radius === 6 && ring.outer - ring.inner >= 4, 'Ø12 island retains a 4 m clear circulation ring')
check(island.cx === AXIS_X && foyer.x0 + foyer.width / 2 === AXIS_X && plaza.cx === AXIS_X, 'island, foyer and plaza share the x=2 axis')
check(walls.standard === 4.5 && walls.atrium === 6 && walls.windowBandBottom < walls.standard, 'wall and atrium heights follow 4.5 m / 6 m decision')
check(landscape.x0 === site.x0 - landscape.buffer && landscape.x1 === site.x1 + landscape.buffer && landscape.z0 === site.z0 - landscape.buffer && landscape.z1 === site.z1 + landscape.buffer, 'landscape apron is 2.5 m outside the design core')
check(structuralValues.every(value => onGrid(value, .5)), 'all structural coordinates follow the 0.5 m grid')
check(furnitureValues.every(value => onGrid(value, .1)), 'all furniture, seat and prop coordinates follow the 0.1 m grid')

const requiredRegions = ['market', 'board', 'review', 'plan', 'ops', 'quality', 'aftersales', 'kb', 'service', 'product', 'eng', 'drlife', 'marketing', 'leisure', 'creative', 'dining']
check(requiredRegions.length === 16 && requiredRegions.every(id => regionById(id)) && new Set(regions.map(r => r.id)).size === 16, '13 retained regions and 3 new regions are present once')
const regionOverlaps = []
for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) if (overlaps(regions[i], regions[j])) regionOverlaps.push(`${regions[i].id}/${regions[j].id}`)
check(regionOverlaps.length === 0, `regions do not overlap${regionOverlaps.length ? `: ${regionOverlaps.join(', ')}` : ''}`)
check(regions.every(r => contains(building, r.x0, r.z0) && contains(building, r.x1, r.z1)), 'all regions stay inside the building envelope')
const ringConflicts = regions.filter(r => distanceRectToPoint(r, island.cx, island.cz) < ring.outer).map(r => r.id)
check(ringConflicts.length === 0, `regions do not occupy the 4 m ring${ringConflicts.length ? `: ${ringConflicts.join(', ')}` : ''}`)
check(regions.every(r => r.doors.length && r.doors.every(d => d.width >= 1.5)), 'every region has a door at least 1.5 m wide')
const corridorConflicts = corridors.flatMap(c => regions.filter(r => overlaps(c, r)).map(r => `${c.id}/${r.id}`))
check(corridorConflicts.length === 0, `declared 1.5 m connectors do not overlap regions${corridorConflicts.length ? `: ${corridorConflicts.join(', ')}` : ''}`)
check(corridors.every(c => Math.min(c.x1 - c.x0, c.z1 - c.z0) >= 1.5), 'every rectangular connector is at least 1.5 m wide')

const seatEntries = Object.entries(seats)
check(seatEntries.length === 25, 'real workstation count is exactly 25')
const badRealSeats = seatEntries.filter(([, [id, x, z]]) => {
  const room = regionById(id), box = deskBounds(x, z)
  return !room || !contains(room, box.x0, box.z0) || !contains(room, box.x1, box.z1)
}).map(([name]) => name)
check(badRealSeats.length === 0, `all real desk/chair envelopes stay in their regions${badRealSeats.length ? `: ${badRealSeats.join(', ')}` : ''}`)
check(displaySeats.length === 12 && displaySeats.every(s => contains(regionById(s.region), s.x, s.z, .5)), '12 display seats stay in their display departments')
const personPoints = [
  ...seatEntries.map(([id, [, x, z]]) => ({ id, x, z })),
  ...displaySeats.map(({ id, x, z }) => ({ id, x, z })),
]
let minimumSeatGap = Infinity
for (let i = 0; i < personPoints.length; i++) for (let j = i + 1; j < personPoints.length; j++) minimumSeatGap = Math.min(minimumSeatGap, Math.hypot(personPoints[i].x - personPoints[j].x, personPoints[i].z - personPoints[j].z))
check(PERSON_GAP === .52 && minimumSeatGap >= PERSON_GAP, `current 0.52 m person-gap contract is retained (planned minimum ${minimumSeatGap.toFixed(2)} m)`)
check(monitorFit.source === 'MONITOR_GLASS_SOURCE' && monitorFit.helper === 'monitorScreenFit' && monitorFit.offsetMin === .001 && monitorFit.offsetMax === .002 && !monitorFit.handWrittenTransform && monitorFit.extraCalls === 0, 'rev3 monitor planes reuse measured glass geometry at 1–2 mm offset without extra calls')

const adjacency = new Map()
for (const [a, b] of graphEdges) { if (!adjacency.has(a)) adjacency.set(a, []); if (!adjacency.has(b)) adjacency.set(b, []); adjacency.get(a).push(b); adjacency.get(b).push(a) }
const reachable = (from, to) => { const queue = [from], seen = new Set(queue); while (queue.length) { const at = queue.shift(); if (at === to) return true; for (const next of adjacency.get(at) || []) if (!seen.has(next)) { seen.add(next); queue.push(next) } } return false }
const requiredTargets = ['reception', 'review', 'plan', 'bar', 'exit']
const unreachable = seatEntries.flatMap(([name, [id]]) => requiredTargets.filter(target => !reachable(id, target)).map(target => `${name}->${target}`))
check(unreachable.length === 0, `all real seats reach reception, review, plan, bar and exit${unreachable.length ? `: ${unreachable.slice(0, 8).join(', ')}` : ''}`)
const displayUnreachable = displaySeats.filter(s => !reachable(s.region, 'bar')).map(s => s.id)
check(displayUnreachable.length === 0, `all display seats reach the bar${displayUnreachable.length ? `: ${displayUnreachable.join(', ')}` : ''}`)

check(Object.keys(cameras).length === 6 && Object.values(cameras).every(c => c.el >= 28 && c.el <= 82 && c.r >= 14), 'all six camera modes have rev3 parameters')
check(cameras.low.wallMode === 'camera-side-lowered' && cameras.follow.wallMode === 'camera-side-lowered', 'low and follow cameras use camera-side wall lowering')
check(occlusion.triggerElevation === 40 && occlusion.loweredHeight === .9 && occlusion.glassOpacity === .08 && occlusion.transitionMs === 250, 'wall occlusion thresholds match the plan')
check(foyerDetails.reception.cx === AXIS_X && foyerDetails.reception.width === 6 && foyerDetails.axis.x1 - foyerDetails.axis.x0 === 4 && foyerDetails.sideClearance >= 2, 'foyer furniture preserves its centred desk and 4 m axis')
check(Object.values(plazaDetails).every(Number.isInteger) && plazaDetails.rings === 3 && plazaDetails.carts === 1 && plazaDetails.kiosks === 3 && plazaDetails.umbrellaTables === 4 && plazaDetails.lamps === 8 && plazaDetails.benches === 6, 'plaza pattern and furnishing quantities are fixed and checkable')
const totalBudget = Object.values(stageBudgets).reduce((sum, value) => Object.fromEntries(Object.keys(sum).map(key => [key, sum[key] + value[key]])), { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 })
check(totalBudget.highCalls === 12 && totalBudget.highTriangles === 90000 && totalBudget.lowCalls === 4 && totalBudget.lowTriangles === 28000, 'stage budgets sum to the documented rev3 cumulative limits')

console.log(`SUMMARY regions=${regions.length} realSeats=${seatEntries.length} displaySeats=${displaySeats.length} ringWidth=${ring.outer - ring.inner} failures=${failures.length} result=${failures.length ? 'FAIL' : 'PASS'}`)
if (failures.length) process.exitCode = 1
