import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from '../vendor/three/three.module.js'
import { createDirector } from '../director.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { BOSS, FOYER_RECEPTION, LOUNGE_SEATS, MEETING_SEATS, OFFICE_ROOMS, RECEPTION, SEATS, loungeTrip, meetingTrip, roomSegments, workHome } from '../office-layout.js'

const STEPS = 2500
const SEEDS = 200
const DT = 0.1
const LEGACY = 'E:\\VirtualAIOffice\\paperclip-ops\\office3d-backup-deadlock-fix'
const WALLS = OFFICE_ROOMS.flatMap(room => roomSegments(room).map(wall => {
  const vertical = wall.side === 'west' || wall.side === 'east'
  return { ...wall, vertical, edge: vertical ? (wall.side === 'west' ? room.x0 : room.x1) : (wall.side === 'north' ? room.z0 : room.z1), label: `${room.id}/${wall.side}` }
}))

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

function actor(id, home, board = false) {
  const group = new THREE.Group(), head = new THREE.Object3D()
  group.position.set(home.x, 0, home.z); group.add(head)
  return { id, name: id, home: { ...home }, stand: board ? BOSS.stand : { x: home.x + 1, z: home.z }, via: board ? BOSS.via : [], isBoard: board, chair: null, char: { group, body: { head }, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0, yaw: 0, pitch: 0, talk: 0 } }, act: null }
}

function wallWorld() {
  const world = createFurnitureCollision()
  for (const room of OFFICE_ROOMS) for (const wall of roomSegments(room)) {
    const vertical = wall.side === 'west' || wall.side === 'east', length = wall.hi - wall.lo
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.12 : length, 1.8, vertical ? length : 0.12))
    mesh.position.set(vertical ? (wall.side === 'west' ? room.x0 : room.x1) : (wall.lo + wall.hi) / 2, 0.9,
      vertical ? (wall.lo + wall.hi) / 2 : (wall.side === 'north' ? room.z0 : room.z1))
    world.add(mesh, 'officeWall')
  }
  const reception = new THREE.Mesh(new THREE.BoxGeometry(RECEPTION.width, 1.2, RECEPTION.z1 - RECEPTION.z0))
  reception.position.set(RECEPTION.x, 0.6, (RECEPTION.z0 + RECEPTION.z1) / 2); world.add(reception, 'receptionCounter')
  const serviceDesk = new THREE.Mesh(new THREE.BoxGeometry(FOYER_RECEPTION.x1 - FOYER_RECEPTION.x0, 1.2, FOYER_RECEPTION.z1 - FOYER_RECEPTION.z0))
  serviceDesk.position.set((FOYER_RECEPTION.x0 + FOYER_RECEPTION.x1) / 2, 0.6, (FOYER_RECEPTION.z0 + FOYER_RECEPTION.z1) / 2); world.add(serviceDesk, 'foyer-reception_desk')
  return world
}
const WALL_WORLD = wallWorld()

function fakeDom() {
  globalThis.document ??= { createElement: () => {
    const parts = new Map()
    return { className: '', innerHTML: '', remove() {}, querySelector(sel) { if (!parts.has(sel)) parts.set(sel, { textContent: '' }); return parts.get(sel) } }
  } }
  return { layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} } }
}

function crossesWall(a, b) {
  const eps = 1e-7
  for (const wall of WALLS) {
    const av = wall.vertical ? a.x : a.z, bv = wall.vertical ? b.x : b.z
    if ((av - wall.edge) * (bv - wall.edge) >= -eps || Math.abs(bv - av) < eps) continue
    const t = (wall.edge - av) / (bv - av), at = wall.vertical ? a.z + (b.z - a.z) * t : a.x + (b.x - a.x) * t
    if (t > eps && t < 1 - eps && at > wall.lo + eps && at < wall.hi - eps) return wall.label
  }
  return null
}

function shuffle(values, rnd) {
  for (let i = values.length - 1; i; i--) { const j = Math.floor(rnd() * (i + 1)); [values[i], values[j]] = [values[j], values[i]] }
  return values
}
function pickUnique(values, used, rnd) {
  let index
  do index = Math.floor(rnd() * values.length); while (used.has(index))
  used.add(index)
  return values[index]
}
function createScenario(seed, makeDirector, distinctSeats) {
  const rnd = mulberry32(seed), names = shuffle(Object.keys(SEATS), rnd)
  const views = new Map(names.map(name => [name, actor(name, workHome(SEATS[name]))]))
  const boss = actor('board', { ...BOSS.chair, yaw: 0 }, true), board = { board: boss }
  const { layer, project } = fakeDom(), d = makeDirector({ views, board, layer, project, furnitureCollision: WALL_WORLD })
  const movers = names.slice(0, 12), targets = names.slice(12)
  const usedLounge = new Set(), usedMeeting = new Set()
  for (let i = 0; i < 2; i++) {
    const v = views.get(movers[i]), seat = distinctSeats ? pickUnique(LOUNGE_SEATS, usedLounge, rnd) : LOUNGE_SEATS[Math.floor(rnd() * LOUNGE_SEATS.length)]
    d.travel(v, loungeTrip(v.home, seat), seat, true)
  }
  for (let i = 2; i < 4; i++) {
    const v = views.get(movers[i]), seat = distinctSeats ? pickUnique(MEETING_SEATS, usedMeeting, rnd) : MEETING_SEATS[Math.floor(rnd() * MEETING_SEATS.length)]
    d.travel(v, meetingTrip(v.home, seat), seat, false)
  }
  for (let i = 4; i < 10; i++) {
    const from = movers[i], to = targets[Math.floor(rnd() * targets.length)]
    d.enqueue({ kind: 'dispatch', from, to, at: `2026-10-20T00:00:${String(i).padStart(2, '0')}Z`, text: 'x' })
  }
  d.enqueue({ kind: 'speak', from: movers[10], at: '2026-10-20T00:01:00Z', text: 'x' })
  d.enqueue({ kind: 'dispatch', from: movers[11], to: 'board', at: '2026-10-20T00:01:01Z', text: 'x' })
  return { d, views, board, actors: movers.map(name => views.get(name)) }
}

function runSeed(seed, makeDirector, audit = true, distinctSeats = false) {
  const s = createScenario(seed, makeDirector, distinctSeats), all = s.actors, count = all.length
  const lastX = new Float64Array(count), lastZ = new Float64Array(count), still = new Uint16Array(count)
  const beforeX = new Float64Array(count), beforeZ = new Float64Array(count), priorPhaseT = new Float64Array(count), priorAct = new Array(count), priorPhase = new Array(count)
  for (let i = 0; i < count; i++) { lastX[i] = all[i].char.group.position.x; lastZ[i] = all[i].char.group.position.z }
  let stuck = 0, minGap = Infinity, wall = null, wallDetail = null, step = 0, priorTimeouts = 0
  const stuckDetails = [], timeoutDetails = []
  for (; step < STEPS; step++) {
    if (audit) for (let i = 0; i < count; i++) {
      const v = all[i], p = v.char.group.position
      beforeX[i] = p.x; beforeZ[i] = p.z; priorAct[i] = v.act; priorPhase[i] = v.act?.phase; priorPhaseT[i] = v.act?.phaseT || 0
    }
    s.d.update(DT)
    if (audit) for (let i = 0; i < count; i++) {
      const v = all[i], p = v.char.group.position
      if (!wall && (p.x !== beforeX[i] || p.z !== beforeZ[i])) {
        wall = crossesWall({ x: beforeX[i], z: beforeZ[i] }, p)
        if (wall) wallDetail = { person: v.id, step: step + 1, wall, from: { x: beforeX[i], z: beforeZ[i] }, to: { x: p.x, z: p.z }, phase: priorPhase[i], returningHome: !!priorAct[i]?.returningHome }
      }
      if (v.act?.phase === 'walk' && Math.hypot(p.x - lastX[i], p.z - lastZ[i]) < 1e-8) still[i]++
      else still[i] = 0
      lastX[i] = p.x; lastZ[i] = p.z
      if (still[i] === 80) {
        stuck++
        stuckDetails.push({ person: v.id, step: step + 1, x: Number(p.x.toFixed(3)), z: Number(p.z.toFixed(3)), phase: v.act?.phase,
          waypoint: v.act?.i, point: v.act?.pts?.[v.act?.i], target: v.act?.tgt?.view?.id || null, yields: v.act?.yields,
          yielding: !!v.act?.yielding, yieldBlocker: v.act?.yieldBlocker?.id || null, returningHome: !!v.act?.returningHome })
      }
    }
    const stats = s.d.stats()
    if (audit && (stats.timeouts || 0) > priorTimeouts) {
      for (let i = 0; i < count; i++) if (priorAct[i] && !all[i].act && priorPhaseT[i] >= 44.8) timeoutDetails.push({ person: all[i].id, step: step + 1, phase: priorPhase[i], phaseT: priorPhaseT[i], x: beforeX[i], z: beforeZ[i] })
    }
    priorTimeouts = stats.timeouts || 0
    if (audit) {
      const walking = all.filter(v => v.act?.phase === 'walk')
      for (let i = 0; i < walking.length; i++) for (let j = i + 1; j < walking.length; j++) minGap = Math.min(minGap, walking[i].char.group.position.distanceTo(walking[j].char.group.position))
    }
    if (!stats.active && !stats.queued) break
  }
  const stats = s.d.stats()
  const unfinished = all.filter(v => v.act).map(v => ({ person: v.id, phase: v.act.phase, x: Number(v.char.group.position.x.toFixed(3)), z: Number(v.char.group.position.z.toFixed(3)), target: v.act.tgt?.view?.id || null,
    waypoint: v.act.i, points: v.act.pts?.length, point: v.act.pts?.[v.act.i], yields: v.act.yields, yielding: !!v.act.yielding, returningHome: !!v.act.returningHome, total: Number((v.act.total || 0).toFixed(1)) }))
  return { seed, steps: step + 1, complete: !stats.active && !stats.queued, unfinished, queued: stats.queued, stuck, stuckDetails, timeoutDetails, minGap, wall, wallDetail, yields: stats.yields || 0, timeouts: stats.timeouts || 0, abandons: stats.abandons || 0 }
}

async function legacyDirector() {
  const dir = await mkdtemp(join(tmpdir(), 'vao-deadlock-'))
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  await Promise.all(['director.js', 'pedestrian-traffic.js'].map(file => copyFile(join(LEGACY, file), join(dir, file))))
  await copyFile(join(LEGACY, 'office-layout.js'), join(dir, 'office-layout.js'))
  const mod = await import(pathToFileURL(join(dir, 'director.js')).href + `?v=${Date.now()}`)
  return { createDirector: mod.createDirector, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

for (const seed of [53, 81, 91, 161]) test(`stress regression seed ${seed}`, () => {
  const result = runSeed(seed, createDirector)
  const detail = JSON.stringify({ seed, stuck: result.stuckDetails, timeouts: result.timeoutDetails, wall: result.wall, complete: result.complete, unfinished: result.unfinished, queued: result.queued })
  assert.equal(result.stuck, 0, detail)
  assert.equal(result.timeouts, 0, detail)
  assert.equal(result.wall, null, detail)
  assert.equal(result.complete, true, detail)
})

const fingerprint = r => ({ seed: r.seed, steps: r.steps, complete: r.complete, unfinished: r.unfinished, queued: r.queued, yields: r.yields, timeouts: r.timeouts, abandons: r.abandons })

test('200 fixed seeds complete without deadlock, watchdog, overlap or wall crossing', async (t) => {
  const started = performance.now(), current = [], repeat = []
  for (let seed = 1; seed <= SEEDS; seed++) current.push(runSeed(seed, createDirector, true, true))
  for (let seed = 1; seed <= SEEDS; seed++) repeat.push(runSeed(seed, createDirector, false, true))
  assert.deepEqual(repeat.map(fingerprint), current.map(fingerprint), 'same seed must produce the same result')
  const failures = current.filter(r => r.stuck || r.timeouts)
  console.log('T16c_CURRENT ' + JSON.stringify({ stuckSeeds: current.filter(r => r.stuck).map(r => r.seed), incompleteSeeds: current.filter(r => !r.complete).map(r => r.seed), timeoutSeeds: current.filter(r => r.timeouts).map(r => r.seed), wallSeeds: current.filter(r => r.wall).map(r => r.seed) }))
  if (failures.length) console.log('T16b_DEADLOCKS ' + JSON.stringify(failures))
  assert.equal(current.filter(r => r.stuck).length, 0)
  assert.equal(current.filter(r => !r.complete).length, 0)
  assert.equal(current.reduce((n, r) => n + r.timeouts, 0), 0)
  assert.equal(current.find(r => r.wall)?.wall, undefined)
  assert.ok(Math.min(...current.map(r => r.minGap)) >= PERSON_GAP * 0.9)

  const summary = { seeds: SEEDS, events: SEEDS * 12, averageSteps: current.reduce((n, r) => n + r.steps, 0) / SEEDS, longestSteps: Math.max(...current.map(r => r.steps)), yields: current.reduce((n, r) => n + r.yields, 0), abandons: current.reduce((n, r) => n + r.abandons, 0), timeouts: current.reduce((n, r) => n + r.timeouts, 0), wallCrossings: current.filter(r => r.wall).length, minGap: Math.min(...current.map(r => r.minGap)), ms: performance.now() - started }
  console.log('T16b_STRESS ' + JSON.stringify(summary))
})

test('legacy deadlock-fix backup still regresses on the same seeds', { skip: existsSync(join(LEGACY, 'director.js')) ? false : '本机 office3d-backup-deadlock-fix 证据不存在（CI 干净机器），跳过 legacy 回归对比' }, async (t) => {
  const legacy = await legacyDirector(); t.after(legacy.cleanup)
  const warn = console.warn; console.warn = () => {}
  let old, oldRegression
  try {
    old = Array.from({ length: SEEDS }, (_, i) => runSeed(i + 1, legacy.createDirector, true, true))
    oldRegression = [53, 81, 91, 161].map(seed => runSeed(seed, legacy.createDirector))
  } finally { console.warn = warn }
  const oldFailedSeeds = old.filter(r => r.stuck || !r.complete).map(r => r.seed), oldDeadlocks = oldFailedSeeds.length
  assert.ok(oldDeadlocks >= 1, `legacy scenario is too weak: ${oldDeadlocks} deadlocks`)
  const oldRegressionDetails = oldRegression.map(r => ({ seed: r.seed, stuck: r.stuckDetails, timeouts: r.timeoutDetails, wall: r.wallDetail, complete: r.complete }))
  console.log('T16b_LEGACY ' + JSON.stringify({ oldDeadlocks, oldFailedSeeds, oldRegressionDetails }))
})
