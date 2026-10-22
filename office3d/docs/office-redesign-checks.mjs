import {
  BOARD_TABLE, BOSS, CORRIDORS, ENTRANCE, ENVELOPE, FOYER_ITEMS, FOYER_ZONES,
  LOUNGE_AREA, MEETING_ROOMS, MINI_BOUNDS, OFFICE_ROOMS, PLAZA, RECEPTION, SEATS,
} from '../office-layout.js'

const AXIS_X = 2
const PERSON_GAP = 0.52
const requiredIds = ['product', 'eng', 'quality', 'drlife', 'board', 'kb', 'ops', 'review', 'plan', 'market', 'marketing', 'service', 'aftersales']
const realSeatRegions = Object.fromEntries(Object.entries(SEATS).map(([name, [region]]) => [name, region]))
const envelope = { x0: -34, x1: 38, z0: -18, z1: 16 }
const regions = [
  ['market', '市场部', -34, -28, -18, -9, -31, 'south'], ['board', '董事会', -27.5, -17, -18, -9, -22.5, 'south'],
  ['review', '评审室 A', -16.5, -8.5, -18, -9, -12.5, 'south'], ['plan', '计划室 B', -8, -3, -18, -9, -5.5, 'south'],
  ['product', '产品与设计', 7, 16, -18, -9, 11.5, 'south'], ['eng', '工程办公室', 16.5, 28, -18, -9, 22.5, 'south'],
  ['kb', '知识中心', 28.5, 33, -18, -9, 30.5, 'south'], ['service', '客服部', 33.5, 38, -18, -9, 35.5, 'south'],
  ['aftersales', '售后部', -34, -28, 7, 13, -31, 'north'], ['ops', '运维办公室', -27.5, -18, 7, 13, -22.5, 'north'],
  ['quality', '质量与安全', -17.5, -5, 7, 13, -11.5, 'north'], ['drlife', 'Dr.life+ 工作室', 9, 27, 7, 13, 24, 'north'],
  ['marketing', '营销部', 27.5, 38, 7, 13, 32.5, 'north'],
].map(([id, name, x0, x1, z0, z1, doorAt, doorSide]) => ({ id, name, x0, x1, z0, z1, doors: [{ at: doorAt, side: doorSide, width: 1.5 }] }))

const seats = {
  Lead: ['product', 8.5, -15.5], PM: ['product', 12, -15.5], Architect: ['product', 8.5, -12], UIUX: ['product', 12, -12],
  FrontendSenior: ['eng', 19, -15.5], Frontend1: ['eng', 22.5, -15.5], Frontend2: ['eng', 26, -15.5],
  BackendSenior: ['eng', 19, -12], Backend1: ['eng', 22.5, -12], Backend2: ['eng', 26, -12],
  QAAutomation: ['quality', -15.5, 9], Reviewer1: ['quality', -12, 9], Reviewer2: ['quality', -8.5, 9], SecurityReviewer: ['quality', -6, 9],
  GoSenior: ['drlife', 11.5, 8.5], Go1: ['drlife', 15, 8.5], Go2: ['drlife', 18.5, 8.5], DBEngineer: ['drlife', 22, 8.5],
  LedgerAuditor: ['drlife', 11.5, 11.5], ReactSenior: ['drlife', 15, 11.5], React1: ['drlife', 18.5, 11.5], Localizer: ['drlife', 22, 11.5],
  OpsLead: ['ops', -25, 9], OpsEngineer: ['ops', -21, 9], KnowledgeKeeper: ['kb', 30.5, -14],
}
const displaySeats = [
  ['market-1', 'market', -32, -15], ['market-2', 'market', -31, -12.5], ['market-3', 'market', -29.5, -15],
  ['service-1', 'service', 35, -15], ['service-2', 'service', 36, -12.5], ['service-3', 'service', 34, -12.5],
  ['aftersales-1', 'aftersales', -32, 9], ['aftersales-2', 'aftersales', -30, 11], ['aftersales-3', 'aftersales', -29.5, 9],
  ['marketing-1', 'marketing', 29.5, 9], ['marketing-2', 'marketing', 32.5, 11], ['marketing-3', 'marketing', 35.5, 9],
].map(([id, region, x, z]) => ({ id, region, x, z }))

const corridors = [
  { id: 'northAxis', x0: 0, x1: 4, z0: -18, z1: -8 }, { id: 'southAxis', x0: 0, x1: 4, z0: 6, z1: 16 },
  { id: 'northHall', x0: -34, x1: 38, z0: -9, z1: -7 }, { id: 'southHall', x0: -34, x1: 38, z0: 5, z1: 7 },
]
const portals = [{ id: 'northPortal', x0: 0, x1: 4, z0: -9, z1: -8 }, { id: 'southPortal', x0: 0, x1: 4, z0: 6, z1: 7 }]
const bar = { cx: 2, cz: -1, radius: 3.5, diameter: 7, gaps: [{ side: 'east', width: 1.5 }, { side: 'west', width: 1.5 }], segments: 12, seats: 10 }
const ring = { inner: 6, outer: 8, minWidth: 2 }
const reception = { x: 2, z: 14.5, width: 5.5, z0: 13.5, z1: 15 }
const graphEdges = [
  ['northAxis', 'northPortal'], ['northPortal', 'ring'], ['southAxis', 'southPortal'], ['southPortal', 'ring'],
  ['ring', 'northHall'], ['ring', 'southHall'], ['southAxis', 'reception'], ['reception', 'exit'], ['ring', 'lounge'],
  ...regions.map(r => [r.id, r.z1 <= -9 ? 'northHall' : 'southHall']),
]

const mutate = process.env.OFFICE_REDESIGN_CHECK_MUTATE || ''
if (mutate === 'overlap') regions.find(r => r.id === 'service').x0 = 32
if (mutate === 'lostid') regions.splice(regions.findIndex(r => r.id === 'market'), 1)
if (mutate === 'blocked') graphEdges.splice(0, graphEdges.length, ...graphEdges.filter(([a, b]) => a !== 'exit' && b !== 'exit'))
if (mutate === 'spine') { const spine = corridors.find(c => c.id === 'southAxis'); spine.x0 = 9; spine.x1 = 13 }
if (mutate === 'asym') bar.cx = 3

const failures = []
const pass = (ok, message) => { if (ok) console.log(`PASS ${message}`); else { failures.push(message); console.error(`FAIL ${message}`) } }
const overlap = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.z1, b.z1) > Math.max(a.z0, b.z0)
const inside = (p, r, margin = 0) => Boolean(r && p.x >= r.x0 + margin && p.x <= r.x1 - margin && p.z >= r.z0 + margin && p.z <= r.z1 - margin)
const onGrid = value => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
const width = r => Math.min(r.x1 - r.x0, r.z1 - r.z0)
const regionById = id => regions.find(r => r.id === id)
const seatBounds = (x, z) => ({ x0: x - .85, x1: x + .85, z0: z - .425, z1: z + 1.3 })

pass(requiredIds.every(id => regionById(id)) && new Set(regions.map(r => r.id)).size === regions.length, 'all existing and display region ids are present and unique')
const regionPairs = []
for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) if (overlap(regions[i], regions[j])) regionPairs.push(`${regions[i].id}/${regions[j].id}`)
pass(regionPairs.length === 0, `regions do not overlap${regionPairs.length ? `: ${regionPairs.join(',')}` : ''}`)
pass(regions.every(r => inside({ x: r.x0, z: r.z0 }, envelope) && inside({ x: r.x1, z: r.z1 }, envelope)), 'all regions stay inside the recommended envelope')
pass((envelope.x0 + envelope.x1) / 2 === AXIS_X && bar.cx === AXIS_X && reception.x === AXIS_X, 'building, bar and reception are centered on the entrance axis')
pass(Object.keys(seats).length === 25 && Object.keys(realSeatRegions).length === 25, 'the real workstation count remains 25')
pass(Object.entries(seats).every(([name, [region, x, z]]) => realSeatRegions[name] === region && inside({ x, z }, regionById(region), .25)), 'all real people keep their region mapping and sit inside it')
pass(displaySeats.length === 12 && displaySeats.every(s => inside(s, regionById(s.region), .25)), '12 display-only people sit inside their own display departments')
pass(corridors.every(c => width(c) >= 2) && portals.every(c => c.x1 - c.x0 >= 4), 'declared corridors are at least 2 m and axis portals are at least 4 m wide')
pass(regions.every(r => r.doors.every(d => d.width >= 1.2)), 'every room door is at least 1.2 m wide')
const drlifeDoor = regionById('drlife').doors[0]
pass(drlifeDoor.at === 24 && drlifeDoor.side === 'north' && drlifeDoor.width === 1.5, 'Dr.life north door follows the O4 ruling at x=24')
const drlifeApproach = { x0: drlifeDoor.at - drlifeDoor.width / 2, x1: drlifeDoor.at + drlifeDoor.width / 2, z0: 7, z1: 8.2 }
pass(Object.values(seats).filter(([region]) => region === 'drlife').every(([, x, z]) => !overlap({ x0: x - .7, x1: x + .7, z0: z - .35, z1: z + 1.3 }, drlifeApproach)), 'Dr.life doorway retains 1.2 m clear approach with every desk unchanged')
pass(bar.gaps.length >= 2 && bar.gaps.every(g => g.width >= 1.2) && bar.segments === 12, 'the circular bar has 12 collision segments and two 1.2 m openings')
pass(ring.outer - ring.inner >= ring.minWidth && ring.minWidth >= 1.2, 'the pedestrian ring keeps its planned 2 m clear width')

const corridorConflicts = corridors.flatMap(c => regions.filter(r => overlap(c, r)).map(r => `${c.id}/${r.id}`))
pass(corridorConflicts.length === 0, `declared corridors and spine do not overlap any region${corridorConflicts.length ? `: ${corridorConflicts.join(',')}` : ''}`)
const seatFailures = Object.entries(seats).flatMap(([name, [, x, z]]) => {
  const bounds = seatBounds(x, z), region = regionById(seats[name][0])
  return !inside({ x: bounds.x0, z: bounds.z0 }, region) || !inside({ x: bounds.x1, z: bounds.z1 }, region) ? [name] : []
})
pass(seatFailures.length === 0, `desk and chair envelopes remain inside their rooms${seatFailures.length ? `: ${seatFailures.join(',')}` : ''}`)
const seatPairs = Object.entries(seats).flatMap(([name, [region, x, z]], i, all) => all.slice(i + 1).flatMap(([other, [otherRegion, ox, oz]]) => region === otherRegion && Math.hypot(x - ox, z - oz) < 2.5 ? [`${name}/${other}`] : []))
pass(seatPairs.length === 0, `real workstations in the same room retain at least 2.5 m center separation${seatPairs.length ? `: ${seatPairs.join(',')}` : ''}`)
pass(PERSON_GAP === .52, 'the layout keeps the current 0.52 m person-gap contract')

const numbers = [envelope.x0, envelope.x1, envelope.z0, envelope.z1, bar.cx, bar.cz, bar.radius, reception.x, reception.z, ...regions.flatMap(r => [r.x0, r.x1, r.z0, r.z1, ...r.doors.flatMap(d => [d.at, d.width])]), ...Object.values(seats).flatMap(([, x, z]) => [x, z]), ...displaySeats.flatMap(s => [s.x, s.z]), ...corridors.flatMap(c => [c.x0, c.x1, c.z0, c.z1])]
pass(numbers.every(onGrid), 'all planned geometry uses the 0.5 m grid')
pass(!overlap(envelope, PLAZA), 'the expanded office envelope does not enter the existing DR plaza')

const adjacency = new Map()
for (const [a, b] of graphEdges) { if (!adjacency.has(a)) adjacency.set(a, []); if (!adjacency.has(b)) adjacency.set(b, []); adjacency.get(a).push(b); adjacency.get(b).push(a) }
function reachable(from, target) { const queue = [from], seen = new Set(queue); while (queue.length) { const at = queue.shift(); if (at === target) return true; for (const next of adjacency.get(at) || []) if (!seen.has(next)) { seen.add(next); queue.push(next) } } return false }
const targets = ['reception', 'review', 'plan', 'lounge', 'exit']
const unreachable = Object.entries(seats).flatMap(([name, [region]]) => targets.filter(target => !reachable(region, target)).map(target => `${name}->${target}`))
pass(unreachable.length === 0, `every real workstation reaches reception, both meeting rooms, lounge and exit${unreachable.length ? `: ${unreachable.slice(0, 5).join(',')}` : ''}`)
const displayUnreachable = displaySeats.filter(s => !reachable(s.region, 'lounge')).map(s => s.id)
pass(displayUnreachable.length === 0, `every display workstation reaches the circular bar${displayUnreachable.length ? `: ${displayUnreachable.join(',')}` : ''}`)

const currentSnapshot = { envelope: ENVELOPE, corridors: CORRIDORS, rooms: OFFICE_ROOMS, seats: SEATS, boss: BOSS, boardTable: BOARD_TABLE, meetingRooms: MEETING_ROOMS, reception: RECEPTION, entrance: ENTRANCE, foyerZones: FOYER_ZONES, foyerItems: FOYER_ITEMS, lounge: LOUNGE_AREA, plaza: PLAZA, minimap: MINI_BOUNDS }
if (process.env.OFFICE_REDESIGN_SNAPSHOT === '1') console.log(`CURRENT_SNAPSHOT ${JSON.stringify(currentSnapshot)}`)
console.log(`SUMMARY currentRooms=${OFFICE_ROOMS.length} currentSeats=${Object.keys(SEATS).length} plannedRegions=${regions.length} plannedSeats=${Object.keys(seats).length} displaySeats=${displaySeats.length} failures=${failures.length} result=${failures.length ? 'FAIL' : 'PASS'}`)
if (failures.length) process.exitCode = 1
