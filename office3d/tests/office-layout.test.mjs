import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { RECEPTION, FOYER_RECEPTION, CORRIDOR_X, corridorPath } from '../office-layout.js'
import { OFFICE_ROOMS, roomSegments, officeExit, officeTrip, LOUNGE_AREA, LOUNGE_SEATS, loungeTrip, roomAt, ENTRANCE, FOYER_Z, CORRIDORS, CROSS_Z, SEATS, workHome, MEETING_SEATS, MEETING_ROOMS, meetingTrip, BOSS, LOGO_AREA, MAIN_FLOOR_X0 } from '../office-layout.js'

test('eight-metre entrance stays on the main axis and the lounge moves left clear of it', () => {
  assert.equal(ENTRANCE.x1 - ENTRANCE.x0, 8)
  assert.equal((ENTRANCE.x0 + ENTRANCE.x1) / 2, ENTRANCE.inner.x)
  assert.equal(LOUNGE_AREA.x, -9.5)
  assert.ok(LOUNGE_AREA.x + LOUNGE_AREA.width / 2 <= ENTRANCE.x0 - 3)
})

test('lounge is outside offices and clear of the entrance and main aisle', () => {
  assert.ok(LOUNGE_AREA.x + LOUNGE_AREA.width / 2 < ENTRANCE.x0 - 0.5)
  assert.ok(LOUNGE_AREA.z - LOUNGE_AREA.depth / 2 > FOYER_Z)
  assert.ok(LOUNGE_AREA.z + LOUNGE_AREA.depth / 2 < 13)
  assert.equal(LOUNGE_SEATS.length, 6)
  for (const seat of LOUNGE_SEATS) {
    assert.equal(roomAt(seat), undefined)
    assert.ok(Math.abs(seat.yaw) === Math.PI / 2)
    const route = loungeTrip(workHome(SEATS.Go1), seat)
    assert.deepEqual(route.at(-1), { x: seat.x, z: seat.z })
    assert.equal(route.at(-3).z, LOUNGE_AREA.entryZ)
  }
})

test('central reception detours the main aisle while the foyer service desk stays east', () => {
  assert.deepEqual(RECEPTION, { x: CORRIDOR_X, z: 5.5, width: 5.5, z0: 3.8, z1: 6.5, bypassX: -2 })
  assert.deepEqual(FOYER_RECEPTION, { x0: 8.5, x1: 14.5, z0: 8.5, z1: 9.5 })
  const north = { x: CORRIDOR_X, z: CROSS_Z }, south = ENTRANCE.inner
  for (const [from, to] of [[north, south], [south, north], [{ x: -12, z: CROSS_Z }, south]]) {
    const path = corridorPath(from, to)
    assert.ok(path.some(p => p.x === RECEPTION.bypassX), JSON.stringify(path))
    assert.deepEqual(path.at(-1), to)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      for (let t = 0; t <= 1; t += .05) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
        assert.ok(Math.abs(x - RECEPTION.x) > RECEPTION.width / 2 + .3 || z < RECEPTION.z0 - .3 || z > RECEPTION.z1 + .3)
      }
    }
  }
})

test('restoring the old detour changes no unrelated route output', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const homes = Object.entries(SEATS).map(([name, seat]) => [name, workHome(seat)])
  assert.equal(hash(homes.map(([name, home]) => [name, officeExit(home)])), 'b35fedefe2e08e8a6d0a1da800ffffe37a524cf8226204691a499c30f9e86fa3')
  assert.equal(hash(homes.flatMap(([name, home]) => LOUNGE_SEATS.map((seat, i) => [name, i, loungeTrip(home, seat)]))), '60fe79a525edf3eaf46477465cebd03c3707816945f98b1c035a9652a2416c47')
  assert.equal(hash(homes.flatMap(([name, home]) => MEETING_SEATS.map((seat, i) => [name, i, meetingTrip(home, seat)]))), '2d65234a73518ed9b7f840613f9b8b04ecb2a6d6c83ad8d501c89e283feb8a68')
})

test('all nine rooms have four closed boundaries except their explicit doors', () => {
  assert.equal(OFFICE_ROOMS.length, 9)
  for (const room of OFFICE_ROOMS) for (const side of ['north', 'south', 'east', 'west']) {
    const segments = roomSegments(room).filter(s => s.side === side)
    const width = side === 'east' || side === 'west' ? room.z1 - room.z0 : room.x1 - room.x0
    const doors = room.doors.filter(d => d.side === side)
    const wallLength = segments.reduce((n, s) => n + s.hi - s.lo, 0)
    assert.ok(Math.abs(wallLength + doors.reduce((n, d) => n + (d.width || 2.2), 0) - width) < 1e-8, room.id + side)
    for (const door of doors) for (const s of segments) assert.ok(s.hi <= door.at - (door.width || 2.2) / 2 + 1e-8 || s.lo >= door.at + (door.width || 2.2) / 2 - 1e-8)
  }
})

test('office interiors do not overlap and the main cross corridor remains free', () => {
  for (const a of OFFICE_ROOMS) for (const b of OFFICE_ROOMS) {
    if (a === b) continue
    assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `${a.id}/${b.id}`)
  }
  for (const r of OFFICE_ROOMS) assert.ok(r.z1 + 0.29 < CROSS_Z || r.z0 - 0.29 > CROSS_Z, r.id)
})

test('west offices exit to the public corridor before entering another office', () => {
  const home = workHome(SEATS.OpsLead), target = workHome(SEATS.Reviewer1)
  assert.deepEqual(officeExit(home).at(-1), { x: -28, z: -1 })
  const path = officeTrip(home, target, { x: target.x + 1, z: target.z })
  assert.ok(path.some(p => p.x === -28 && p.z === CROSS_Z - 0.5))
  assert.ok(path.some(p => p.x === -17 && p.z === CROSS_Z - 0.5))
})

test('rooms keep their specified sizes including compact knowledge room and logo setbacks', () => {
  assert.ok(CORRIDORS.horizontal.z1 - CORRIDORS.horizontal.z0 >= 3.2)
  assert.ok(CORRIDORS.vertical.x1 - CORRIDORS.vertical.x0 >= 3.2)
  assert.equal(CORRIDORS.horizontal.z1 - CORRIDORS.horizontal.z0, CORRIDORS.vertical.x1 - CORRIDORS.vertical.x0)
  for (const r of OFFICE_ROOMS) {
    for (const n of [r.x0, r.x1, r.z0, r.z1]) assert.equal(n * 2, Math.round(n * 2), r.id)
    const width = r.id === 'kb' ? 5.5 : r.id === 'eng' ? 9 : ['board', 'drlife'].includes(r.id) ? 16 : 11
    assert.equal(r.x1 - r.x0, width, r.id)
    assert.equal(r.z1 - r.z0, 8, r.id)
    assert.ok(r.doors.length)
    for (const d of r.doors) {
      assert.ok(['north', 'south'].includes(d.side))
      assert.equal(d.at * 2, Math.round(d.at * 2)); assert.equal(d.width * 2, Math.round(d.width * 2))
      assert.ok(d.at - d.width / 2 > r.x0 && d.at + d.width / 2 < r.x1)
      assert.equal(d.side === 'south' ? r.z1 : r.z0, d.side === 'south' ? CORRIDORS.horizontal.z0 : CORRIDORS.horizontal.z1)
    }
  }
})

test('Dr.life+ left and right boundaries align with the boardroom while all eight desks retain clearance', () => {
  const r = OFFICE_ROOMS.find(r => r.id === 'drlife'), b = OFFICE_ROOMS.find(r => r.id === 'board')
  assert.deepEqual([r.x0, r.x1], [b.x0, b.x1])
  assert.equal(r.x0, 6)
  const seats = Object.values(SEATS).filter(s => s[0] === 'drlife')
  assert.equal(seats.length, 8)
  for (const [, x, z] of seats) {
    assert.ok(x - r.x0 >= 2 && r.x1 - x >= 2)
    assert.equal(roomAt({ x: x + 1, z: z + 1 })?.id, 'drlife')
  }
})

test('knowledge room occupies half its former area and retains its workstation and visitor', () => {
  const r = OFFICE_ROOMS.find(r => r.id === 'kb'), h = workHome(SEATS.KnowledgeKeeper)
  assert.equal((r.x1 - r.x0) * (r.z1 - r.z0), 11 * 8 / 2)
  assert.equal(roomAt(h)?.id, 'kb')
  assert.equal(roomAt({ x: h.x + 1, z: h.z })?.id, 'kb')
  assert.equal(MAIN_FLOOR_X0, -22)
})

test('product and engineering move left together to join the knowledge room', () => {
  const get = id => OFFICE_ROOMS.find(r => r.id === id), p = get('product'), e = get('eng')
  assert.equal(p.x0, get('kb').x1)
  assert.equal(e.x0, p.x1)
  assert.deepEqual([p.x0, p.x1, e.x0, e.x1], [-27.5, -16.5, -16.5, -7.5])
  const oldX = { Lead: -20, PM: -17.5, Architect: -15, UIUX: -12.5, FrontendSenior: -9, Frontend1: -6.5, Frontend2: -4.5, BackendSenior: -9, Backend1: -6.5, Backend2: -4.5 }
  for (const [name, x] of Object.entries(oldX)) assert.equal(SEATS[name][1], x - 5.5, name)
})

test('logo reserve is twice the old width and remains clear of rooms and workstation visitors', () => {
  const width = LOGO_AREA.x1 - LOGO_AREA.x0, oldWidth = CORRIDORS.vertical.x1 - CORRIDORS.vertical.x0
  assert.equal(width, oldWidth * 2)
  assert.equal((LOGO_AREA.x0 + LOGO_AREA.x1) / 2, (CORRIDORS.vertical.x0 + CORRIDORS.vertical.x1) / 2)
  assert.equal(LOGO_AREA.z1 - LOGO_AREA.z0, 8)
  for (const r of OFFICE_ROOMS) assert.ok(r.x1 <= LOGO_AREA.x0 || r.x0 >= LOGO_AREA.x1 || r.z1 <= LOGO_AREA.z0 || r.z0 >= LOGO_AREA.z1, r.id)
  for (const [id, x, z] of Object.values(SEATS)) assert.equal(roomAt({ x: x + 1, z: z + 1 })?.id, id)
})

test('25 desks, their chair anchors, 14 meeting seats, and boss anchors belong to their rooms', () => {
  assert.equal(Object.keys(SEATS).length, 25)
  assert.equal(MEETING_SEATS.length, 14)
  for (const [name, data] of Object.entries(SEATS)) {
    const [id, x, z] = data, home = workHome(data)
    assert.equal(roomAt({ x, z })?.id, id, name + ' desk')
    assert.equal(roomAt(home)?.id, id, name + ' chair')
    for (const n of [x, z, home.x, home.z]) assert.equal(n * 2, Math.round(n * 2), name)
  }
  for (const s of MEETING_SEATS) assert.equal(roomAt(s)?.id, MEETING_ROOMS.find(r => r.id === s.room).officeId)
  for (const s of [BOSS.desk, BOSS.chair, BOSS.stand]) assert.equal(roomAt(s)?.id, 'board')
})

function assertNoWallCrossing(start, path, label) {
  for (const end of path) {
    for (const r of OFFICE_ROOMS) for (const wall of roomSegments(r)) {
      const vertical = ['west', 'east'].includes(wall.side)
      const edge = vertical ? (wall.side === 'west' ? r.x0 : r.x1) : (wall.side === 'north' ? r.z0 : r.z1)
      const a = vertical ? start.x : start.z, b = vertical ? end.x : end.z
      if (Math.abs(b - a) < 1e-9) continue
      const t = (edge - a) / (b - a)
      if (t < 0 || t > 1) continue
      const at = vertical ? start.z + t * (end.z - start.z) : start.x + t * (end.x - start.x)
      assert.ok(at < wall.lo || at > wall.hi, `${label}: ${JSON.stringify(start)} → ${JSON.stringify(end)} crosses ${r.id}/${wall.side}`)
    }
    start = end
  }
}

test('entrance to every desk and every pair of desks never crosses a room wall', () => {
  const homes = Object.entries(SEATS).map(([name, seat]) => [name, workHome(seat)])
  for (const [name, home] of homes) {
    assertNoWallCrossing(ENTRANCE.inner, officeTrip(ENTRANCE.inner, home, home), 'entrance/' + name)
    for (const [other, target] of homes) assertNoWallCrossing(home, officeTrip(home, target, { x: target.x + 1, z: target.z }), name + '/' + other)
  }
})

test('all meeting and lounge destinations have wall-safe routes from every desk', () => {
  for (const [name, data] of Object.entries(SEATS)) {
    const home = workHome(data)
    for (const s of MEETING_SEATS) assertNoWallCrossing(home, meetingTrip(home, s), name + '/meeting')
    for (const s of LOUNGE_SEATS) assertNoWallCrossing(home, loungeTrip(home, s), name + '/lounge')
  }
})

test('lounge approach lanes clear occupied seats and meeting aisles clear chair backs', () => {
  for (const s of LOUNGE_SEATS) {
    assert.ok(Math.abs(s.appX - s.x) >= 1)
    for (const other of LOUNGE_SEATS) if (other !== s) assert.ok(Math.hypot(s.x - other.x, s.z - other.z) >= 1)
  }
  for (const s of MEETING_SEATS) {
    const r = MEETING_ROOMS.find(r => r.id === s.room)
    assert.ok(s.viaZ > r.z0 && s.viaZ < r.z1)
    if (Math.abs(s.yaw) !== Math.PI / 2) assert.ok(Math.abs(s.viaZ - s.z) >= 1)
  }
})
