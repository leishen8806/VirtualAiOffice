import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, createOfficeNavigation, roomSegments, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createDirector } from '../director.js'
import { displayRoster, displayRoute, displaySchedule, displayFrame } from '../display-staff-logic.js'
process.once('exit', () => console.log('O6O7_PROCESS_MEMORY ' + JSON.stringify({ file: 'office-display-stress', peakRssMB: process.resourceUsage().maxRSS / 1024, seconds: process.uptime() })))

const nav = createOfficeNavigation(LAYOUT_V2), furniture = officeFurnitureV2Spec(LAYOUT_V2)
const roster = displayRoster(LAYOUT_V2), routes = new Map(roster.map(p => [p.id, displayRoute(LAYOUT_V2, p)]))
const collision = createFurnitureCollision(), chairs = new Map()
const boxes = LAYOUT_V2.regions.flatMap(room => roomSegments(room).map(s => {
  const vertical = s.side === 'west' || s.side === 'east'
  const edge = vertical ? (s.side === 'west' ? room.x0 : room.x1) : (s.side === 'north' ? room.z0 : room.z1)
  return vertical ? { x0: edge - .06, x1: edge + .06, z0: s.lo, z1: s.hi } : { x0: s.lo, x1: s.hi, z0: edge - .06, z1: edge + .06 }
})).concat(LAYOUT_V2.bar.segments, LAYOUT_V2.frontDesk)
function addBox(b, kind) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 1.8, b.z1 - b.z0))
  mesh.position.set((b.x0 + b.x1) / 2, .9, (b.z0 + b.z1) / 2); collision.add(mesh, kind); return mesh
}
boxes.forEach(box => addBox(box, 'officeWall'))
for (const [name, [, x, z]] of Object.entries(LAYOUT_V2.seats)) {
  addBox({ x0: x - .7, x1: x + .7, z0: z - .35, z1: z + .35 }, 'desk')
  chairs.set(name, addBox({ x0: x - .31, x1: x + .31, z0: z + .7, z1: z + 1.3 }, 'chair'))
}
for (const m of furniture.meetings) addBox({ x0: m.x - m.w / 2, x1: m.x + m.w / 2, z0: m.z - m.d / 2, z1: m.z + m.d / 2 }, 'meetingTable')

test('O6O7 integrated T16b 200 seeds report real/display proximity without changing collision parameters', { timeout: 60_000 }, () => {
  const previousDocument = globalThis.document
  globalThis.document ??= { createElement: () => ({ remove() {}, querySelector: () => ({ textContent: '' }) }) }
  const summary = { seeds: 200, realPeople: 25, displayPeople: 12, dt: .1, maxSteps: 6000, minGap: Infinity, overlapSamples: 0, overlapEpisodes: 0, affectedSeeds: 0, maxDisplayWalking: 0, unfinishedSeeds: 0, timeouts: 0, watchdogs: 0, wallCrossings: 0, examples: [] }
  try {
    for (let seed = 1; seed <= 200; seed++) {
      let random = seed
      const rnd = () => { let t = random += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
      const names = Object.keys(LAYOUT_V2.seats)
      for (let i = names.length - 1; i; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]] }
      const all = names.map(id => {
        const home = workHome(LAYOUT_V2.seats[id]), group = new THREE.Group(); group.position.set(home.x, 0, home.z)
        return { id, name: id, home, stand: nav.standAt(home), via: [], chair: chairs.get(id), char: { group, body: { head: new THREE.Object3D() }, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0, yaw: 0, pitch: 0, talk: 0 } }, act: null }
      })
      const director = createDirector({ layout: LAYOUT_V2, views: new Map(all.map(v => [v.id, v])), board: {}, layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} }, furnitureCollision: collision })
      const coffee = nav.COFFEE_SEATS[seed % 10]
      director.travel(all[0], nav.loungeTrip(all[0].home, coffee), coffee, true)
      for (let i = 1; i < 3; i++) { const seat = furniture.meetings[i - 1].seats[seed % furniture.meetings[i - 1].seats.length]; director.travel(all[i], nav.meetingTrip(all[i].home, seat), seat, false) }
      for (let i = 3; i < 12; i++) director.enqueue({ kind: 'dispatch', from: all[i].id, to: all[12 + i % 10].id, at: `2026-10-21T00:00:${String(i).padStart(2, '0')}Z`, text: 'x' })
      const hour = 9 + seed % 8, schedule = displaySchedule(roster, routes, hour, seed), start = hour * 3600000 + seed % 12 * 300000
      const still = new Uint16Array(all.length)
      let previousPairs = new Set(), seedOverlap = false
      for (let step = 0; step < 6000; step++) {
        const before = all.map(v => ({ x: v.char.group.position.x, z: v.char.group.position.z }))
        director.update(.1)
        const frame = displayFrame(roster, routes, schedule, start + step * 100)
        summary.maxDisplayWalking = Math.max(summary.maxDisplayWalking, frame.filter(p => p.state === 'outbound' || p.state === 'returning').length)
        const pairs = new Set()
        for (let i = 0; i < all.length; i++) {
          const real = all[i], p = real.char.group.position, old = before[i], moved = Math.hypot(p.x - old.x, p.z - old.z)
          if (real.act?.phase === 'walk' && moved < 1e-8) still[i]++; else still[i] = 0
          if (still[i] === 80) summary.watchdogs++
          if (moved > .001) for (let j = 1, n = Math.ceil(moved / .05); j <= n; j++) {
            const x = old.x + (p.x - old.x) * j / n, z = old.z + (p.z - old.z) * j / n
            if (boxes.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) { summary.wallCrossings++; break }
          }
          for (const simulated of frame) {
            const gap = Math.hypot(p.x - simulated.x, p.z - simulated.z)
            if (gap < summary.minGap) { summary.minGap = gap; summary.closest = { seed, step, real: real.id, display: simulated.id, realPosition: { x: p.x, z: p.z }, displayPosition: { x: simulated.x, z: simulated.z } } }
            if (gap < .52) {
              const pair = `${real.id}/${simulated.id}`; pairs.add(pair); seedOverlap = true; summary.overlapSamples++
              if (!previousPairs.has(pair)) { summary.overlapEpisodes++; if (summary.examples.length < 12) summary.examples.push({ seed, step, pair, gap, realPosition: { x: p.x, z: p.z }, displayPosition: { x: simulated.x, z: simulated.z } }) }
            }
          }
        }
        previousPairs = pairs
      }
      if (seedOverlap) summary.affectedSeeds++
      const stats = director.stats(); summary.timeouts += stats.timeouts
      if (stats.active || stats.queued) summary.unfinishedSeeds++
    }
    console.log('O6O7_INTEGRATED_T16B ' + JSON.stringify(summary))
    assert.ok(Number.isFinite(summary.minGap)); assert.ok(summary.maxDisplayWalking <= 2)
    assert.equal(summary.unfinishedSeeds, 0); assert.equal(summary.timeouts, 0); assert.equal(summary.watchdogs, 0); assert.equal(summary.wallCrossings, 0)
    // 人物重叠只记录；展示路线/真人调度是否需要协调，由董事会裁决。
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument }
})
