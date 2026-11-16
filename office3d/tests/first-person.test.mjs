import test from 'node:test'
import assert from 'node:assert/strict'
import { createFirstPerson, FIRST_PERSON_EYE_HEIGHT } from '../first-person.js'
import { LAYOUT_V3 } from '../office-layout.js'

const collision = (blocked = []) => ({ navigationHit: (x, z) => blocked.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) })
test('first person stays in bounds and slides along a blocker', () => {
  const first = createFirstPerson({ bounds: { x0: 0, x1: 10, z0: 0, z1: 10 }, collision: collision([{ x0: 5, x1: 6, z0: 4, z1: 6 }]) })
  first.enter({ x: 4.6, z: 4.2 }); first.move({ forward: 1, right: 1 }, .1)
  assert.ok(first.state.x < 5); assert.ok(first.state.z > 4.2)
  first.move({ forward: -1 }, 9); assert.ok(first.state.z >= .28)
})
test('first person restores the prior camera state and uses human eye height', () => {
  const first = createFirstPerson({ bounds: { x0: 0, x1: 10, z0: 0, z1: 10 }, collision: collision() })
  const restore = { az: 1 }; first.enter({ x: 2, z: 2, restore })
  assert.equal(FIRST_PERSON_EYE_HEIGHT, 1.6); assert.equal(first.state.active, true); assert.equal(first.exit(), restore); assert.equal(first.state.active, false)
})
test('first person uses the real office envelope and does not cross a layout region wall', () => {
  const wall = LAYOUT_V3.regions[0]
  const first = createFirstPerson({ bounds: LAYOUT_V3.envelope, collision: { navigationHit: (x, z, radius) => x >= wall.x0 - radius && x <= wall.x1 + radius && z >= wall.z0 - radius && z <= wall.z1 + radius } })
  first.enter({ x: wall.x1 + .8, z: (wall.z0 + wall.z1) / 2, yaw: Math.PI / 2 })
  first.move({ forward: 1 }, .1)
  assert.ok(first.state.x >= wall.x1 - .28)
  assert.ok(first.state.x >= LAYOUT_V3.envelope.x0 + .28 && first.state.x <= LAYOUT_V3.envelope.x1 - .28)
})

test('first person wall, doorway, boundary and diagonal slide use real layout coordinates', () => {
  const room = LAYOUT_V3.regions.find((item) => item.id === 'review')
  assert.ok(room)
  const door = room.doors.find((item) => item.side === 'east')
  assert.ok(door)
  const wall = (x, z, radius = .28) => {
    const insideDoor = Math.abs(z - door.at) <= door.width / 2 + radius
    return x >= room.x1 - radius && x <= room.x1 + radius && !insideDoor
  }
  const walk = (first, input, steps = 20) => { for (let i = 0; i < steps; i++) first.move(input, .1) }
  const first = createFirstPerson({ bounds: LAYOUT_V3.envelope, collision: { navigationHit: wall } })
  first.enter({ x: room.x1 - .8, z: room.z0 + 1.1, yaw: Math.PI / 2 })
  walk(first, { forward: 1 })
  assert.ok(first.state.x <= room.x1 - .28, 'the wall stops the player before the east boundary')

  first.enter({ x: room.x1 - .8, z: door.at, yaw: Math.PI / 2 })
  walk(first, { forward: 1 })
  assert.ok(first.state.x > room.x1, 'the doorway remains traversable')

  first.enter({ x: 0, z: LAYOUT_V3.envelope.z1 - .8, yaw: 0 })
  walk(first, { forward: 1 })
  assert.ok(Math.abs(first.state.z - (LAYOUT_V3.envelope.z1 - .28)) < 1e-9, 'the site boundary clamps movement')

  first.enter({ x: room.x1 - .8, z: room.z0 + 1.1, yaw: Math.PI / 2 })
  const beforeZ = first.state.z
  walk(first, { forward: 1, right: 1 })
  assert.ok(first.state.x <= room.x1 - .28)
  assert.notEqual(first.state.z, beforeZ, 'a diagonal move slides along the wall')
})
