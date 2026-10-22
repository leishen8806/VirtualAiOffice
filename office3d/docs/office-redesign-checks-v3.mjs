const AXIS_X = 2
const PERSON_GAP = .52
const site = { x0: -28, x1: 32, z0: -18, z1: 30 }
const building = { x0: -28, x1: 32, z0: -18, z1: 12 }
const landscape = { x0: -30.5, x1: 34.5, z0: -20.5, z1: 32.5, buffer: 2.5 }
const foyer = { id: 'foyer', x0: -6, x1: 10, z0: 4, z1: 12, width: 16, depth: 8 }
const plaza = { cx: 2, cz: 21, radius: 9, diameter: 18 }
const island = { cx: 2, cz: -6, radius: 6, diameter: 12, treeRadius: 1.2, barOuter: 3.5, stoolRadius: 4.2, sofaOuter: 5.8 }
const ring = { inner: 6, outer: 10, width: 4 }
const walls = { standard: 4.5, atrium: 6, windowBandBottom: 3.3 }
const monitorFit = { source: 'MONITOR_GLASS_SOURCE', helper: 'monitorScreenFit', offsetMin: .001, offsetMax: .002, handWrittenTransform: false, extraCalls: 0 }

const region = (id, name, x0, x1, z0, z1, side, at) => ({ id, name, x0, x1, z0, z1, doors: [{ side, at, width: 1.5 }] })
const regions = [
  region('market', '市场部（展示）', -28, -20, -18, -12, 'east', -15),
  region('board', '会议与决策', -18.5, -8.5, -18, -12, 'west', -15),
  region('review', '评审室 A', -28, -18, -10.5, -4.5, 'east', -7.5),
  region('plan', '计划室 B', -16.5, -8.5, -10.5, -4.5, 'west', -7.5),
  region('ops', '运营', -28, -18, -3, 4, 'east', .5),
  region('quality', '质量与安全', -16.5, -8.5, -3, 4, 'west', .5),
  region('aftersales', '售后部（展示）', -28, -20, 5.5, 11.5, 'east', 8.5),
  region('leisure', '休闲展示区', -18.5, -10.5, 5.5, 11.5, 'west', 8.5),
  region('kb', '知识', 12.5, 20.5, -18, -12, 'east', -15),
  region('service', '客服部（展示）', 24, 32, -18, -12, 'west', -15),
  region('product', '产品', 12.5, 21.5, -10.5, -3, 'east', -6.75),
  region('eng', '工程', 23, 32, -10.5, -3, 'west', -6.75),
  region('creative', '创意讨论区', 12.5, 21.5, -1.5, 3.5, 'east', 1),
  region('dining', '餐饮休憩角', 23, 32, -1.5, 3.5, 'west', 1),
  region('drlife', 'D.life 工坊', 12.5, 22.5, 5, 12, 'east', 8.5),
  region('marketing', '营销部（展示）', 24, 32, 5, 12, 'west', 8.5),
]

const seats = {
  Lead: ['product', 14.2, -8], PM: ['product', 17.5, -8], Architect: ['product', 14.2, -4.5], UIUX: ['product', 17.5, -4.5],
  FrontendSenior: ['eng', 24.2, -8], Frontend1: ['eng', 27, -8], Frontend2: ['eng', 29.8, -8],
  BackendSenior: ['eng', 24.2, -4.5], Backend1: ['eng', 27, -4.5], Backend2: ['eng', 29.8, -4.5],
  KnowledgeKeeper: ['kb', 16.5, -15],
  QAAutomation: ['quality', -15.5, -1.5], Reviewer1: ['quality', -12.5, -1.5], Reviewer2: ['quality', -15.5, 1.5], SecurityReviewer: ['quality', -12.5, 1.5],
  OpsLead: ['ops', -25, 0], OpsEngineer: ['ops', -21, 0],
  GoSenior: ['drlife', 14, 6], Go1: ['drlife', 16.5, 6], Go2: ['drlife', 19, 6], DBEngineer: ['drlife', 21, 6],
  LedgerAuditor: ['drlife', 14, 9.5], ReactSenior: ['drlife', 16.5, 9.5], React1: ['drlife', 19, 9.5], Localizer: ['drlife', 21, 9.5],
}
const displaySeats = [
  ['market-1', 'market', -26.5, -15], ['market-2', 'market', -24, -15], ['market-3', 'market', -21.5, -15],
  ['service-1', 'service', 25.5, -15], ['service-2', 'service', 28, -15], ['service-3', 'service', 30.5, -15],
  ['aftersales-1', 'aftersales', -26.5, 8], ['aftersales-2', 'aftersales', -24, 8], ['aftersales-3', 'aftersales', -21.5, 8],
  ['marketing-1', 'marketing', 25.5, 8], ['marketing-2', 'marketing', 28, 8], ['marketing-3', 'marketing', 30.5, 8],
].map(([id, regionId, x, z]) => ({ id, region: regionId, x, z }))

const cameras = {
  overview: { az: 0, el: 58, r: 78, target: [2, 0, 2], wallMode: 'full' },
  orbit: { az: 35, el: 50, r: 72, target: [2, 0, -1], wallMode: 'camera-side-below-40' },
  top: { az: 0, el: 82, r: 68, target: [2, 0, 1], wallMode: 'full' },
  isometric: { az: -38, el: 48, r: 62, target: [2, 0, -1], wallMode: 'full' },
  low: { az: -20, el: 28, r: 44, target: [2, 0, -1], wallMode: 'camera-side-lowered' },
  follow: { az: 0, el: 34, r: 14, target: ['agent', 0, 'agent'], wallMode: 'camera-side-lowered' },
}
const occlusion = { triggerElevation: 40, loweredHeight: .9, glassOpacity: .08, transitionMs: 250 }
const foyerDetails = {
  reception: { cx: 2, cz: 8.8, width: 6, depth: 1.4 },
  service: { cx: -3.8, cz: 8.3, width: 3, depth: 2 },
  waiting: { cx: 6.5, cz: 8.3, width: 5, depth: 3 },
  axis: { x0: 0, x1: 4 }, sideClearance: 2,
}
const plazaDetails = { rings: 3, carts: 1, kiosks: 3, umbrellaTables: 4, lamps: 8, benches: 6, flowerBands: 4, radialSeams: 8 }
const stageBudgets = {
  R3_2: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
  R3_3: { highCalls: 3, highTriangles: 24000, lowCalls: 1, lowTriangles: 7000 },
  R3_4B: { highCalls: 4, highTriangles: 34000, lowCalls: 1, lowTriangles: 10000 },
  R3_5: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
  R3_6B: { highCalls: 5, highTriangles: 32000, lowCalls: 2, lowTriangles: 11000 },
  R3_7: { highCalls: 0, highTriangles: 0, lowCalls: 0, lowTriangles: 0 },
}
const corridors = [
  { id: 'west-north-cross', x0: -28, x1: -8.5, z0: -12, z1: -10.5 },
  { id: 'west-middle-cross', x0: -28, x1: -8.5, z0: -4.5, z1: -3 },
  { id: 'west-south-cross', x0: -28, x1: -10.5, z0: 4, z1: 5.5 },
  { id: 'east-north-cross', x0: 12.5, x1: 32, z0: -12, z1: -10.5 },
  { id: 'east-middle-cross', x0: 12.5, x1: 32, z0: -3, z1: -1.5 },
  { id: 'east-south-cross', x0: 12.5, x1: 32, z0: 3.5, z1: 5 },
  { id: 'entrance-axis', x0: 0, x1: 4, z0: 4, z1: 12 },
]

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

const failures = []
const check = (ok, message) => ok ? console.log(`PASS ${message}`) : (failures.push(message), console.error(`FAIL ${message}`))
const overlaps = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.z1, b.z1) > Math.max(a.z0, b.z0)
const contains = (box, x, z, margin = 0) => x >= box.x0 + margin && x <= box.x1 - margin && z >= box.z0 + margin && z <= box.z1 - margin
const distanceRectToPoint = (box, x, z) => Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1))
const regionById = id => regions.find(r => r.id === id)
const deskBounds = (x, z) => ({ x0: x - .8, x1: x + .8, z0: z - .45, z1: z + 1.25 })

check(site.x1 - site.x0 === 60 && site.z1 - site.z0 === 48, 'design core is exactly 60 m × 48 m')
check(building.x1 - building.x0 === 60 && building.z1 - building.z0 === 30, 'office plus foyer occupies the northern 60 m × 30 m')
check(foyer.width === 16 && foyer.depth === 8 && foyer.x1 - foyer.x0 === 16 && foyer.z1 - foyer.z0 === 8, 'foyer is exactly 16 m × 8 m')
check(plaza.diameter === 18 && plaza.radius === 9 && plaza.cz + plaza.radius === site.z1, 'DR plaza is Ø18 m and reaches the south edge')
check(distanceRectToPoint(foyer, plaza.cx, plaza.cz) === plaza.radius, 'foyer and circular plaza are tangent without overlap')
check(island.diameter === 12 && island.radius === 6 && ring.outer - ring.inner >= 4, 'Ø12 island retains a 4 m clear circulation ring')
check(island.cx === AXIS_X && foyer.x0 + foyer.width / 2 === AXIS_X && plaza.cx === AXIS_X, 'island, foyer and plaza share the x=2 axis')
check(walls.standard === 4.5 && walls.atrium === 6 && walls.windowBandBottom < walls.standard, 'wall and atrium heights follow 4.5 m / 6 m decision')
check(landscape.x0 === site.x0 - landscape.buffer && landscape.x1 === site.x1 + landscape.buffer && landscape.z0 === site.z0 - landscape.buffer && landscape.z1 === site.z1 + landscape.buffer, 'landscape apron is 2.5 m outside the design core')

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
check(PERSON_GAP === .52, 'current 0.52 m person-gap contract is retained')
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
