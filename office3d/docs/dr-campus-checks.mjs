import { ENVELOPE, FOYER_ITEMS, PLAZA, WAITING_SEATS } from '../office-layout.js'

const campus = { x0: -174, x1: -72, z0: -26, z1: 42 }
const building = { x0: -168, x1: -80, z0: -18, z1: 30 }
const roadBuffer = { x0: -72, x1: -64, z0: -26, z1: 42 }
const a4Reserve = { x0: 62, x1: 78, z0: -38, z1: -22 }
const zones = [
  ['receiving', -164, -128, -18, -12], ['inspection', -128, -104, -18, -10], ['highRack', -152, -104, -10, 8],
  ['picking', -152, -128, 8, 18], ['packing', -128, -104, 8, 18], ['shipping', -104, -80, -4, 18],
  ['dispatch', -168, -154, 0, 16], ['visitor', -168, -154, 20, 30], ['showcase', -154, -130, 20, 30],
  ['officeMeeting', -130, -104, 20, 30], ['maintenance', -104, -80, 20, 30], ['frontPlaza', -154, -94, 30, 38],
  ['parking', -94, -76, 30, 42], ['logisticsGate', -80, -72, 18, 30],
].map(([id, x0, x1, z0, z1]) => ({ id, x0, x1, z0, z1 }))
const walkable = [
  { id: 'frontWalk', x0: -130, x1: -118, z0: 30, z1: 42 },
  { id: 'publicHall', x0: -168, x1: -104, z0: 24, z1: 30 },
  { id: 'serviceHall', x0: -154, x1: -152, z0: 0, z1: 30 },
]
const flows = [
  { id: 'customer', kind: 'walk', points: [[-124, 42], [-124, 30], [-142, 27], [-117, 27]] },
  { id: 'cargo', kind: 'mark', points: [[-146, -18], [-116, -14], [-128, -1], [-140, 13], [-116, 13], [-92, 8]] },
  { id: 'platform', kind: 'walk', points: [[-166, 25], [-153, 25], [-153, 10], [-153, 25], [-117, 25]] },
]
// `env.js` 固定近景树、棕榈名义点和道路均在该园区以东；施工仍须复核远景实例。
const knownTreeKeepOuts = [
  { x0: -57, x1: -53, z0: -40, z1: 48 }, { x0: -48, x1: -44, z0: 28, z1: 32 },
  { x0: -30, x1: -26, z0: 16, z1: 20 }, { x0: -14, x1: -10, z0: 28, z1: 32 },
]

const mutate = process.env.DR_CAMPUS_CHECK_MUTATE || ''
if (mutate === 'overlap') zones.find(zone => zone.id === 'packing').x0 = -140
if (mutate === 'shallow') campus.x1 = -66

const failures = []
const pass = (ok, message) => { if (ok) console.log(`PASS ${message}`); else { failures.push(message); console.error(`FAIL ${message}`) } }
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1
const area = box => (box.x1 - box.x0) * (box.z1 - box.z0)
const grid = value => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
const pointIn = (point, box) => point[0] >= box.x0 && point[0] <= box.x1 && point[1] >= box.z0 && point[1] <= box.z1
const samples = (a, b) => {
  const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4) + 1
  return Array.from({ length: count }, (_, index) => [a[0] + (b[0] - a[0]) * index / (count - 1), a[1] + (b[1] - a[1]) * index / (count - 1)])
}

pass(area(campus) >= 6500 && campus.x1 <= -72, 'recommended campus stays west of the road and meets the 6500 m² area floor')
pass(area(building) >= 4000 && inside(building, campus), 'single service-centre building stays inside campus and meets the 4000 m² floor')
pass(zones.every(zone => inside(zone, campus)), 'all planned zones stay inside the campus envelope')
const duplicate = zones.length !== new Set(zones.map(zone => zone.id)).size
const conflicts = zones.flatMap((zone, index) => zones.slice(index + 1).filter(other => overlaps(zone, other)).map(other => `${zone.id}/${other.id}`))
pass(!duplicate && conflicts.length === 0, `zones are unique and non-overlapping${conflicts.length ? `: ${conflicts.join(',')}` : ''}`)
pass(roadBuffer.x0 === campus.x1 && roadBuffer.x1 - roadBuffer.x0 >= 8, 'an eight-metre road buffer remains between campus and west road')
pass(walkable.every(path => !zones.some(zone => overlaps(path, zone) && !['visitor', 'showcase', 'officeMeeting', 'frontPlaza'].includes(zone.id))), 'reserved pedestrian walks avoid logistics work zones')
for (const flow of flows) {
  const connected = flow.points.length >= 2 && flow.points.every(point => pointIn(point, campus))
  pass(connected, `${flow.id} flow is connected inside campus`)
  if (flow.kind === 'walk') {
    const legal = flow.points.slice(0, -1).every((point, index) => samples(point, flow.points[index + 1]).every(sample => walkable.some(path => pointIn(sample, path))))
    pass(legal, `${flow.id} walk segments stay in declared passable space`)
  }
}
const protectedAreas = [ENVELOPE, PLAZA, ...FOYER_ITEMS, ...WAITING_SEATS.map(seat => ({ x0: seat.x - .25, x1: seat.x + .25, z0: seat.z - .25, z1: seat.z + .25 })), a4Reserve, ...knownTreeKeepOuts]
pass(protectedAreas.every(area => !overlaps(campus, area)), 'campus does not collide with office, plaza, foyer, waiting seats, A4 reserve or known fixed trees')
const numbers = [campus, building, roadBuffer, ...zones, ...walkable, ...flows.flatMap(flow => flow.points.map(([x, z]) => ({ x0: x, x1: x, z0: z, z1: z })))]
pass(numbers.flatMap(box => [box.x0, box.x1, box.z0, box.z1]).every(grid), 'all campus geometry and flow points use the 0.5 m grid')
console.log(`SUMMARY campus=${area(campus)} building=${area(building)} zones=${zones.length} flows=${flows.length} failures=${failures.length} result=${failures.length ? 'FAIL' : 'PASS'}`)
if (failures.length) process.exitCode = 1
