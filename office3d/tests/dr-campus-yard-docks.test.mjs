import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPUS, CAMPUS_BUILDING, CAMPUS_DOCKS, CAMPUS_VEHICLE_ROUTES, CAMPUS_ZONES } from '../office-layout.js'
import { buildCampusShellSpec } from '../dr-campus-shell.js'
import { createCampusYardDockPlan } from '../dr-campus-yard-docks.js'

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const inside = (part, bounds) => part.x0 >= bounds.x0 && part.x1 <= bounds.x1 && part.z0 >= bounds.z0 && part.z1 <= bounds.z1

test('B1 renders eight exterior dock openings instead of the retired three-door shipping plan', () => {
  const plan = createCampusYardDockPlan()
  assert.equal(plan.docks.length, 8)
  assert.equal(plan.docks.filter((dock) => dock.side === 'north').length, 4)
  assert.equal(plan.docks.filter((dock) => dock.side === 'east').length, 4)
  assert.ok(plan.docks.every((dock) => dock.width >= 3.6))
  assert.equal(plan.docks.some((dock) => dock.id === 'shipping-door-3'), false)
  const shell = buildCampusShellSpec()
  for (const dock of plan.docks) assert.equal(shell.filter((part) => part.name.startsWith('campus-wall-')).some((wall) => overlap(wall, dock.bounds)), false, dock.id)
})

test('B1 truck bays and 3.5m working strips are fully inside their owning zones', () => {
  const plan = createCampusYardDockPlan(), zones = new Map(CAMPUS_ZONES.map((zone) => [zone.id, zone]))
  for (const dock of CAMPUS_DOCKS) {
    const zone = zones.get(dock.zone)
    assert.ok(inside(dock.bay, zone), `${dock.id} bay`)
    assert.ok(inside(dock.work, zone), `${dock.id} work`)
    const available = dock.side === 'north' ? zone.z1 - zone.z0 : zone.x1 - zone.x0
    assert.ok(available >= 9 + 3.5, `${dock.id} depth`)
  }
  assert.equal(plan.truck.length, 9)
  assert.equal(plan.truck.width, 2.55)
})

test('receiving uses the north yard, shipping uses Z14, and all routes declare 10m clearance within the expanded campus', () => {
  const byDock = new Map(CAMPUS_VEHICLE_ROUTES.map((route) => [route.dockId, route]))
  assert.equal(byDock.size, 8)
  for (const dock of CAMPUS_DOCKS) {
    const route = byDock.get(dock.id)
    assert.equal(route.entry, dock.side === 'north' ? 'north-yard' : 'Z14')
    assert.equal(route.turningRadius, 10)
    assert.ok(route.points.length >= 5)
    assert.ok(route.points.every(([x, z]) => x >= CAMPUS.x0 && x <= CAMPUS.x1 && z >= CAMPUS.z0 && z <= CAMPUS.z1), dock.id)
  }
  assert.equal(CAMPUS.x1, -65)
  assert.equal(CAMPUS.z0, -33)
  assert.equal(CAMPUS_BUILDING.x1, -80)
  assert.equal(CAMPUS_BUILDING.z0, -18)
})

test('B1 yard plan has guard, zebra crossing, unique bays, and no exterior mark outside the campus', () => {
  const plan = createCampusYardDockPlan()
  assert.equal(plan.crosswalk.length, 7)
  assert.ok(inside(plan.guard, CAMPUS))
  for (const mark of [...plan.bayMarks, ...plan.crosswalk]) assert.ok(inside(mark, CAMPUS), mark.name)
  const bays = plan.bayMarks.filter((mark) => mark.name.startsWith('campus-bay-'))
  for (const [index, bay] of bays.entries()) for (const other of bays.slice(index + 1)) assert.equal(overlap(bay, other), false, `${bay.name}/${other.name}`)
})
