import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { createDirector } from '../director.js'
import { createQueueBoard } from '../foyer-paths.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'

for (const mode of ['six-enter', 'three-in-three-out']) test(`6m doorway ${mode}: 12 queue orders at both qualities preserve clearance and finish`, () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), world = createFurnitureCollision()
    const shell = buildOfficeAlignedShell({ THREE, root, layout, low, collision: world, search: '?officeSample=1' })
    const bodies = world.stats().bodies
    try {
      for (let rotation = 0; rotation < 6; rotation++) for (const reverse of [false, true]) {
        const lanes = [.5, 2, 3.5], points = Array.from({ length: 6 }, (_, i) => {
          if (mode === 'six-enter') return { from: { x: lanes[i % 3], z: i < 3 ? 13.3 : 15.2 }, to: { x: lanes[i % 3], z: i < 3 ? 10.2 : 11.4 } }
          const x = lanes[Math.floor(i / 2)]
          return i % 2 ? { from: { x, z: 10.2 }, to: { x, z: 15.2 } } : { from: { x, z: 14 }, to: { x, z: 11.4 } }
        })
        const order = Array.from({ length: 6 }, (_, i) => (i + rotation) % 6); if (reverse) order.reverse()
        const actors = points.map((p, i) => {
          const group = new THREE.Group(); group.position.set(p.from.x, 0, p.from.z)
          return { id: `actor-${i}`, name: `actor-${i}`, home: { ...p.from, yaw: 0 }, waits: [], act: null, char: { group, pose: { sit: 0, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } } }
        })
        const views = new Map(order.map(i => [actors[i].id, actors[i]]))
        const board = createQueueBoard({ queues: Object.fromEntries(points.map((p, i) => ['door-' + i, [{ ...p.to, yaw: p.from.z > p.to.z ? 0 : Math.PI }]])) })
        const director = createDirector({ views, board: {}, layout, furnitureCollision: world, layer: null, project: null })
        try {
          for (const i of order) {
            const v = actors[i], targetId = 'door-' + i, joined = board.join(v.id, targetId)
            assert.equal(director.visitConsumer(v, { ok: true, targetId, go: [points[i].from, points[i].to], stand: joined.point, slot: joined.slot }, { board, agentId: v.id, dwellMs: 600000 }), true)
          }
          let crossing = false, settled = false
          for (let frame = 0; frame < 1800; frame++) {
            director.update(1 / 60)
            const walkers = actors.filter(v => ['rise', 'walk'].includes(v.act?.phase))
            assert.ok(walkers.length <= 3, 'existing concurrency limit remains in force')
            if (walkers.some(v => actors.indexOf(v) % 2) && walkers.some(v => !(actors.indexOf(v) % 2))) crossing = true
            for (let i = 0; i < actors.length; i++) {
              const p = actors[i].char.group.position
              assert.equal(!!world.hit(p.x, p.z), false)
              for (let j = i + 1; j < actors.length; j++) assert.ok(Math.hypot(p.x - actors[j].char.group.position.x, p.z - actors[j].char.group.position.z) >= PERSON_GAP - 1e-6)
            }
            if (actors.every(v => v.visiting?.phase === 'dwell')) { settled = true; break }
          }
          assert.ok(settled, `${mode}, rotation ${rotation}, reverse ${reverse} must finish within 30 simulated seconds`)
          if (mode !== 'six-enter') assert.ok(crossing, 'both directions must actually move, not merely finish serially')
          for (const [i, v] of actors.entries()) assert.ok(Math.hypot(v.char.group.position.x - points[i].to.x, v.char.group.position.z - points[i].to.z) < .01)
          const stats = director.stats(); assert.deepEqual([stats.timeouts, stats.abandons, stats.visitAborts], [0, 0, 0])
        } finally { for (const v of actors) director.cancelVisit(v, null, true) }
        assert.equal(director.stats().visits, 0); assert.equal(world.stats().bodies, bodies)
      }
    } finally { shell.dispose() }
    assert.equal(world.stats().bodies, 0); assert.equal(root.children.length, 0)
  }
})
