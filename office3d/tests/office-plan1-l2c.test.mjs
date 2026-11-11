import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { OFFICE_PLAN1_L2, OFFICE_PLAN1_SEATS, officePlan1L2BFacingYaw } from '../office-plan1-layout.js'
import { plan1FurniturePlan } from '../office-vis2/plan1-furniture.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const facingDot = (desk, home, yaw) => -Math.sin(yaw) * (desk.x - home.x) - Math.cos(yaw) * (desk.z - home.z)
const routeRows = layout => {
  const nav = createOfficeNavigation(layout), spec = officeFurnitureV2Spec(layout), rows = []
  for (const [id, data] of Object.entries(layout.seats)) {
    const home = workHome(data), add = (kind, key, route) => rows.push({ id, kind, key, points: route() })
    add('exit', '', () => nav.officeExit(home))
    add('board', '', () => nav.boardTrip(home, layout.boss.stand))
    for (const [name, seat] of Object.entries(layout.seats)) add('office', name, () => nav.officeTrip(home, workHome(seat), workHome(seat)))
    for (const [i, seat] of nav.LOUNGE_SEATS.entries()) add('lounge', String(i), () => nav.loungeTrip(home, seat))
    for (const room of spec.meetings) for (const [i, seat] of room.seats.entries()) add('meeting', `${room.id}:${i}`, () => nav.meetingTrip(home, seat))
    for (const [name, seats] of Object.entries(nav.consumerQueues)) for (const [i, seat] of seats.entries()) add(`consumer-${name}`, String(i), () => nav.consumerTrip(home, name, seat))
  }
  return rows
}
const withoutSeatYaw = seats => Object.fromEntries(Object.entries(seats).map(([id, [region, x, z, yaw, home]]) => [id, [region, x, z, 0, { ...home, yaw: 0 }]]))

test('L2B fixes all 25 real and 35 empty workstation facings without moving furniture or routes', () => {
  const original = LAYOUT_V3_ALIGN_SAMPLE, l2b = LAYOUT_V3_ALIGN_L2B
  const emptySeats = OFFICE_PLAN1_L2.islands.flatMap(island => island.seats.filter(seat => seat.kind === 'empty').map(seat => ({ island, seat })))
  const baselinePlan = plan1FurniturePlan(original), candidatePlan = plan1FurniturePlan(l2b)
  const chairs = new Map(candidatePlan.filter(item => item.kind === 'chair').map(item => [item.id, item]))
  const baselineRows = Object.entries(original.seats).map(([id, data]) => ({ id, desk: { x: data[1], z: data[2] }, home: workHome(data), yaw: workHome(data).yaw }))
  const baselineReversedReal = baselineRows.filter(row => facingDot(row.desk, row.home, row.yaw) < 0)
  const baselineReversedEmpty = emptySeats.filter(({ seat }) => facingDot(seat.deskCenter, seat.home, seat.yawDeg * Math.PI / 180) < 0)

  assert.equal(hash(original.seats), 'ace9a3ceb9b0969c244823f0c66dbf0aedd049966fed28741c0b0001a85b7bbb')
  assert.equal(hash(OFFICE_PLAN1_SEATS), 'ace9a3ceb9b0969c244823f0c66dbf0aedd049966fed28741c0b0001a85b7bbb')
  assert.equal(officePlan1L2BFacingYaw({ ...original, plan1Phase: 'L1' }, Math.PI / 2), Math.PI / 2)
  assert.equal(officePlan1L2BFacingYaw(original, Math.PI / 2), Math.PI / 2)
  assert.equal(Object.keys(l2b.seats).length, 25)
  assert.equal(emptySeats.length, 35)
  assert.equal(baselineReversedReal.length, 14)
  assert.equal(baselineReversedEmpty.length, 24)
  assert.equal(hash(l2b.seats), '61b151046f0c5b428b81b0d7eb0f185cdf6c5452e8862800a8bd5fe717f765b3', 'approved L2B-only workstation-seat hash')
  assert.deepEqual(withoutSeatYaw(l2b.seats), withoutSeatYaw(original.seats), 'all seat fields other than yaw and home.yaw stay identical')

  const expectedRealCorrections = new Set(['OpsLead', 'OpsEngineer', 'QAAutomation', 'Reviewer1', 'Reviewer2', 'SecurityReviewer', 'GoSenior', 'Go1', 'Go2', 'DBEngineer', 'LedgerAuditor', 'ReactSenior', 'React1', 'Localizer'])
  const changedReal = Object.keys(l2b.seats).filter(id => l2b.seats[id][3] !== original.seats[id][3])
  assert.deepEqual(new Set(changedReal), expectedRealCorrections)
  for (const [id, seat] of Object.entries(l2b.seats)) {
    const home = workHome(seat), baseline = original.seats[id], baselineHome = workHome(baseline)
    assert.deepEqual([seat[0], seat[1], seat[2], home.x, home.z], [baseline[0], baseline[1], baseline[2], baselineHome.x, baselineHome.z], `${id} coordinates and identity mapping`)
    assert.equal(facingDot({ x: seat[1], z: seat[2] }, home, home.yaw) > 0, true, `${id} faces its desk`)
    const station = officeFurnitureV2Spec(l2b).workstations.find(row => row.name === id)
    assert.equal(station.chair.yaw, home.yaw, `${id} chair follows corrected home yaw`)
  }

  for (const { island, seat } of emptySeats) {
    const item = chairs.get(`${island.id}-empty-${seat.slot}-chair`)
    assert.ok(item, `${island.id}/${seat.slot} empty chair exists`)
    assert.equal(facingDot(seat.deskCenter, seat.home, item.yaw) > 0, true, `${island.id}/${seat.slot} empty chair faces its desk`)
    const oldYaw = seat.yawDeg * Math.PI / 180
    if (Math.abs(Math.cos(oldYaw)) < 1e-9) assert.equal(item.yaw, -oldYaw, `${island.id}/${seat.slot} only flips horizontal yaw`)
    else assert.equal(item.yaw, oldYaw, `${island.id}/${seat.slot} north/south yaw stays unchanged`)
  }
  const stripItemYaw = items => items.map(({ yaw, ...item }) => item)
  assert.deepEqual(stripItemYaw(candidatePlan), stripItemYaw(baselinePlan), 'empty seat coordinates, IDs, envelopes, desks and all support furniture remain unchanged')

  const routes = routeRows(l2b)
  assert.equal(routes.length, 1825)
  assert.equal(hash(routes), 'a20c937ba2c513f418c57a743dc6475e2a51c44c403314fe22deada9a8c6a48d', 'L2B route keys and every point equal the B3 baseline')
  assert.equal(baselineReversedReal.length + baselineReversedEmpty.length, 38, 'L1/L2 known facing defect stays unchanged at 14 real + 24 empty')
  assert.equal(baselineReversedReal.length, 14, `known L1/L2 real-seat defect: ${baselineReversedReal.map(row => row.id).join(', ')}`)
  assert.equal(baselineReversedEmpty.length, 24, 'known L1/L2 empty-seat defect remains 24 of 35')
  assert.equal(routes.filter(row => row.kind === 'meeting').length, 200)
  assert.equal(routes.filter(row => row.kind !== 'meeting').length, 1625)
})
