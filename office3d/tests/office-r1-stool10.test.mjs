import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {
  createR1Layout,
  r1ToWorld,
  R1_STOOL_POSITION_OVERRIDES,
  R1_STOOL_WORLD_SHIFT_Z,
  R1_BOARD_TRANSITION_OVERRIDES,
} from '../office-r1-layout.js'
import { R1_PUBLIC_TRANSITIONS } from '../office-r1-navigation.js'
import { r1HighStoolParts } from '../office-vis2/r1-island.js'

const STOOLS = ['10-CH-001', '10-CH-002', '10-CH-003', '10-CH-004', '10-CH-005']
const X = { '10-CH-001': 10.7, '10-CH-002': 12.05, '10-CH-003': 13.4, '10-CH-004': 14.75, '10-CH-005': 16.1 }

test('STOOL10 freezes one shared position offset without mutating registered data', () => {
  const layout = createR1Layout({ candidateC01: false })
  assert.equal(R1_STOOL_WORLD_SHIFT_Z, -.65)
  assert.deepEqual(R1_STOOL_POSITION_OVERRIDES.map(row => row.id), STOOLS)
  for (const id of STOOLS) {
    const registered = layout.data.elements.find(row => row.id === id)
    const placed = layout.elements.find(row => row.id === id)
    assert.equal(registered.yM, 6.25, id)
    assert.equal(placed.yM, 6.9, id)
    assert.equal(placed.xM, X[id], id)
    assert.equal(r1ToWorld(placed.xM, placed.yM).z, 11.1, id)
  }
})

test('STOOL10 transitions and seating use the same shifted world position', () => {
  const layout = createR1Layout({ candidateC01: false })
  for (const id of STOOLS) {
    const row = layout.elements.find(item => item.id === id)
    const world = r1ToWorld(row.xM, row.yM)
    const transition = R1_BOARD_TRANSITION_OVERRIDES.find(item => item.id === id)
    const path = R1_PUBLIC_TRANSITIONS[id]
    assert.deepEqual(path[0], { x: world.x, z: world.z }, id)
    assert.deepEqual(path.at(-1), { x: world.x, z: 11.95 }, id)
    assert.deepEqual(transition.from, [world.x, 10.25], id)
    assert.deepEqual(transition.to, [world.x, 11.95], id)
  }
})

test('STOOL10 shared geometry is a high stool with a footrest', () => {
  const parts = r1HighStoolParts(THREE, .75)
  assert.equal(parts.length, 4)
  assert.ok(parts.some(part => part.geometry.type === 'TorusGeometry'))
  const seat = parts.find(part => part.geometry.type === 'CylinderGeometry')
  assert.equal(seat.position[1], .71)
  assert.equal(seat.tint, '#506a5a')
})
