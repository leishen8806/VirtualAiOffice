import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createClothSpring } from '../cloth-spring.js'

test('mesh collision preserves empty space inside a furniture bounding box', () => {
  const world = createFurnitureCollision(), group = new THREE.Group()
  for (const x of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1))
    leg.position.set(x, 0.75, 0); group.add(leg)
  }
  group.position.set(4, 0, 2); group.rotation.y = Math.PI / 2
  world.add(group, 'desk')
  assert.equal(world.hit(4, 2), null)
  assert.equal(world.hit(4, 3).kind, 'desk')
  assert.equal(world.hit(4, 3, group), null)
})

test('swept capsule cannot tunnel through a thin desk panel at low frame rate', () => {
  const world = createFurnitureCollision()
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 3))
  panel.position.y = 0.8; world.add(panel, 'desk')
  const position = new THREE.Vector3(-2, 0, 0)
  world.move(position, 4, 0)
  assert.ok(position.x <= -0.22, `crossed panel: ${position.x}`)
  assert.equal(world.hit(position.x, position.z), null)
  assert.ok(world.stats().contacts > 0)
})

test('capsule slides along a panel instead of walking in place', () => {
  const world = createFurnitureCollision()
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 8))
  panel.position.y = 0.8; world.add(panel, 'desk')
  const p = new THREE.Vector3(-0.3, 0, 0)
  const distance = world.move(p, 1, 1)
  assert.ok(p.x < -0.22); assert.ok(p.z > 0.9); assert.ok(distance > 0.9)
})

test('route goes around real furniture and completes every swept segment', () => {
  const world = createFurnitureCollision()
  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 2))
  obstacle.position.y = 0.75; world.add(obstacle, 'desk')
  const p = new THREE.Vector3(-2, 0, 0), end = { x: 2, z: 0 }
  const route = world.route(p, end)
  assert.ok(route?.length > 1)
  for (const point of route) {
    world.move(p, point.x - p.x, point.z - p.z)
    assert.ok(Math.hypot(p.x - point.x, p.z - point.z) < 1e-6)
  }
  assert.ok(Math.hypot(p.x - end.x, p.z - end.z) < 1e-6)
})

test('cloth stays pinned and bounded through impulses and frame hitches', () => {
  const cloth = createClothSpring([0, 1, 0.5], [[0, 1], [1, 2]])
  for (let i = 0; i < 400; i++) cloth.update(i % 17 === 0 ? 0.5 : 1 / 60, [500, -500, 200])
  assert.deepEqual([...cloth.offset.slice(0, 3)], [0, 0, 0])
  for (const [i, limit] of [[1, 0.6], [2, 0.3]]) {
    assert.ok(Math.hypot(...cloth.offset.slice(i * 3, i * 3 + 3)) <= limit + 1e-6)
  }
  for (let i = 0; i < 1000; i++) cloth.update(1 / 60, [0, 0, 0])
  assert.ok([...cloth.offset].every(v => Number.isFinite(v) && Math.abs(v) < 1e-5))
})
