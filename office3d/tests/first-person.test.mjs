import test from 'node:test'
import assert from 'node:assert/strict'
import { createFirstPerson, FIRST_PERSON_EYE_HEIGHT } from '../first-person.js'

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
