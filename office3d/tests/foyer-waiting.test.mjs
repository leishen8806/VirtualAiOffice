import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { createDirector } from '../director.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { createQueueBoard, createWaitingBoard, visitPlan, waitingPlan } from '../foyer-paths.js'
import {
  CENTRAL_CIRCLE, FOYER_ITEMS, FOYER_QUEUES, FOYER_RECEPTION, MAIN_AISLE, OFFICE_ROOMS, RECEPTION,
  SEATS, WAITING_CAPACITY, WAITING_SEATS, officeExit, roomSegments, workHome,
} from '../office-layout.js'

const DT = 0.2
const NAMES = Object.keys(SEATS)
const TARGETS = Object.keys(FOYER_QUEUES)
const WALLS = OFFICE_ROOMS.flatMap(room => roomSegments(room).map(wall => {
  const vertical = wall.side === 'west' || wall.side === 'east'
  return { ...wall, vertical, edge: vertical ? (wall.side === 'west' ? room.x0 : room.x1) : (wall.side === 'north' ? room.z0 : room.z1) }
}))

function actor(id, home) {
  const group = new THREE.Group(), head = new THREE.Object3D()
  group.position.set(home.x, 0, home.z); group.add(head)
  return { id, name: id, home: { ...home }, stand: { x: home.x + 1, z: home.z }, chair: null, char: { group, body: { head }, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0, yaw: 0, pitch: 0, talk: 0 } }, act: null, waits: [] }
}

function collisionWorld() {
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

function fakeDom() {
  globalThis.document ??= { createElement: () => {
    const parts = new Map()
    return { className: '', innerHTML: '', remove() {}, querySelector(sel) { if (!parts.has(sel)) parts.set(sel, { textContent: '' }); return parts.get(sel) } }
  } }
  return { layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} } }
}

function harness(count = 1) {
  const people = NAMES.slice(0, count).map(name => actor(name, workHome(SEATS[name])))
  const views = new Map(people.map(v => [v.id, v]))
  return { people, views, director: createDirector({ views, board: {}, ...fakeDom(), furnitureCollision: collisionWorld() }) }
}

function crossesWall(a, b) {
  const eps = 1e-7
  for (const wall of WALLS) {
    const av = wall.vertical ? a.x : a.z, bv = wall.vertical ? b.x : b.z
    if ((av - wall.edge) * (bv - wall.edge) >= -eps || Math.abs(bv - av) < eps) continue
    const t = (wall.edge - av) / (bv - av), at = wall.vertical ? a.z + (b.z - a.z) * t : a.x + (b.x - a.x) * t
    if (t > eps && t < 1 - eps && at > wall.lo + eps && at < wall.hi - eps) return true
  }
  return false
}

function pointBlocked(p) {
  const item = FOYER_ITEMS.filter(x => x.blocksFloor).some(r => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)
  const reception = p.x > RECEPTION.x - RECEPTION.width / 2 && p.x < RECEPTION.x + RECEPTION.width / 2 && p.z > RECEPTION.z0 && p.z < RECEPTION.z1
  const circle = Math.hypot(p.x - CENTRAL_CIRCLE.cx, p.z - CENTRAL_CIRCLE.cz) < CENTRAL_CIRCLE.r - 1e-6
  return item || reception || circle || (p.z > 13 && p.z < 16 && (p.x < MAIN_AISLE.x0 || p.x > MAIN_AISLE.x1))
}

function assertRoute(path) {
  for (let i = 1; i < path.length; i++) {
    assert.equal(crossesWall(path[i - 1], path[i]), false)
    const n = Math.ceil(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) * 10) + 1
    for (let j = 0; j < n; j++) assert.equal(pointBlocked({ x: path[i - 1].x + (path[i].x - path[i - 1].x) * j / (n - 1 || 1), z: path[i - 1].z + (path[i].z - path[i - 1].z) * j / (n - 1 || 1) }), false)
  }
}

function run(director, people, done, limit = 6000, audit = false) {
  let wall = false, minGap = Infinity, steps = 0
  for (; steps < limit && !done(); steps++) {
    const before = people.map(v => ({ x: v.char.group.position.x, z: v.char.group.position.z }))
    director.update(DT)
    if (!audit) continue
    for (let i = 0; i < people.length; i++) wall ||= crossesWall(before[i], people[i].char.group.position)
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) minGap = Math.min(minGap, Math.hypot(people[i].char.group.position.x - people[j].char.group.position.x, people[i].char.group.position.z - people[j].char.group.position.z))
  }
  return { steps, wall, minGap }
}

function startWaiting(director, v, plan, board, stay, extra = {}) {
  return director.visitConsumer(v, plan, { mode: 'waiting', board, agentId: v.id, shouldStay: () => stay.value, ...extra })
}

function allHome(people) {
  return people.every(v => Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < 0.02)
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

test('waiting board assigns four fixed seats, rejects fifth and reuses only the released slot', () => {
  const board = createWaitingBoard(), joined = ['a', 'b', 'c', 'd'].map(id => board.join(id, 'waiting'))
  assert.deepEqual(joined.map(x => x.slot), [0, 1, 2, 3])
  assert.deepEqual(board.join('e', 'waiting'), { ok: false, reason: 'full' })
  assert.deepEqual(board.join('a', 'waiting'), { ok: false, reason: 'already_queued' })
  assert.deepEqual(board.join('z', 'unknown'), { ok: false, reason: 'unknown_target' })
  const left = board.leave('b')
  assert.deepEqual(left.advance, [])
  assert.equal(board.join('e', 'waiting').slot, 1)
  assert.equal(board.leave('missing').ok, false)
  for (const id of ['a', 'c', 'd', 'e']) board.leave(id)
  assert.deepEqual(board.snapshot(), { waiting: [] })
})

test('waiting plans from all 25 desks are safe, end at fixed seats and return through the office exit', () => {
  for (const name of NAMES) {
    const home = workHome(SEATS[name]), board = createWaitingBoard(), plan = waitingPlan({ home, agentId: name, board })
    assert.equal(plan.ok, true, name)
    assert.equal(plan.targetId, 'waiting')
    assert.deepEqual(plan.stand, { x: WAITING_SEATS[0].x, z: WAITING_SEATS[0].z })
    assert.equal(plan.yaw, WAITING_SEATS[0].yaw)
    assert.deepEqual(plan.go.at(-1), plan.stand)
    assert.deepEqual(plan.back, plan.go.toReversed())
    assert.deepEqual(plan.back.at(-1), officeExit(home)[0])
    assert.ok(plan.back.some(p => p.x === officeExit(home).at(-1).x && p.z === officeExit(home).at(-1).z))
    assertRoute(plan.go); assertRoute(plan.back)
  }
  assert.deepEqual(waitingPlan({ home: null, agentId: 'x', board: createWaitingBoard() }), { ok: false, reason: 'invalid_home' })
  assert.deepEqual(waitingPlan({ home: { x: 0, z: 0 }, agentId: '', board: createWaitingBoard() }), { ok: false, reason: 'invalid_agent' })
  assert.deepEqual(waitingPlan({ home: { x: 0, z: 0 }, agentId: 'x', board: null }), { ok: false, reason: 'invalid_board' })
})

test('waiting mode requires a real question and otherwise preserves actor state', () => {
  for (const setup of [v => { v.waits = [] }, v => { v.waits = [{ kind: 'review' }] }, v => { v.waits = [{ kind: 'question' }]; v.act = { phase: 'x' } }, v => { v.waits = [{ kind: 'question' }]; v.lounging = {} }, v => { v.waits = [{ kind: 'question' }]; v.away = true }]) {
    const { people: [v], director } = harness(), board = createWaitingBoard(), plan = waitingPlan({ home: v.home, agentId: v.id, board })
    setup(v); const before = { act: v.act, lounging: v.lounging, away: v.away, waits: v.waits }
    assert.equal(startWaiting(director, v, plan, board, { value: true }), false)
    assert.equal(v.visiting, undefined)
    assert.deepEqual({ act: v.act, lounging: v.lounging, away: v.away, waits: v.waits }, before)
    board.leave(v.id)
  }
})

test('question removal returns home with onDone; five minutes does not hit the action watchdog', () => {
  const { people: [v], director } = harness(), board = createWaitingBoard(), plan = waitingPlan({ home: v.home, agentId: v.id, board }), stay = { value: true }
  v.waits = [{ kind: 'question' }]; let done = 0
  assert.equal(startWaiting(director, v, plan, board, stay, { onDone: () => done++ }), true)
  run(director, [v], () => v.visiting?.phase === 'dwell', 3000)
  assert.ok(Math.abs(v.char.group.rotation.y - plan.yaw) < 0.01)
  for (let i = 0; i < 1500; i++) director.update(DT)
  assert.equal(director.stats().timeouts, 0)
  assert.equal(director.stats().visits, 1)
  stay.value = false
  run(director, [v], () => director.stats().visits === 0, 3000)
  assert.equal(done, 1)
  assert.equal(allHome([v]), true)
  assert.deepEqual(board.snapshot(), { waiting: [] })
})

test('ten minute cap and off-duty or event interruption release the waiting seat', () => {
  for (const reason of ['timeout', 'offDuty', 'event']) {
    const { people, director } = harness(reason === 'event' ? 2 : 1), v = people[0], board = createWaitingBoard(), plan = waitingPlan({ home: v.home, agentId: v.id, board }), stay = { value: true }, aborts = []
    v.waits = [{ kind: 'question' }]
    assert.equal(startWaiting(director, v, plan, board, stay, { onAbort: r => aborts.push(r) }), true)
    run(director, people, () => v.visiting?.phase === 'dwell', 3000)
    if (reason === 'timeout') for (let i = 0; i < 3000; i++) director.update(DT)
    else if (reason === 'offDuty') v.leaving = true
    else director.enqueue({ kind: 'speak', from: v.id, at: '2026-10-20T00:00:00Z', text: 'x' })
    run(director, people, () => board.occupancy('waiting') === 0, 20)
    assert.deepEqual(aborts, [reason])
    v.leaving = false
    run(director, people, () => !v.visiting && allHome([v]), 3000)
    assert.deepEqual(board.snapshot(), { waiting: [] })
    director.clear()
  }
})

test('four people wait safely while the fifth stays at the desk', () => {
  const { people, director } = harness(5), board = createWaitingBoard(), stays = people.map(() => ({ value: true }))
  const plans = people.map(v => waitingPlan({ home: v.home, agentId: v.id, board }))
  assert.ok(plans.slice(0, WAITING_CAPACITY).every(plan => plan.ok))
  assert.deepEqual(plans[4], { ok: false, reason: 'full' })
  for (let i = 0; i < WAITING_CAPACITY; i++) { people[i].waits = [{ kind: 'question' }]; assert.equal(startWaiting(director, people[i], plans[i], board, stays[i]), true) }
  const fifthHome = { x: people[4].char.group.position.x, z: people[4].char.group.position.z }
  const arrived = run(director, people, () => people.slice(0, 4).every(v => v.visiting?.phase === 'dwell'), 6000, true)
  assert.equal(arrived.wall, false)
  assert.ok(arrived.minGap >= PERSON_GAP * 0.9, String(arrived.minGap))
  assert.deepEqual({ x: people[4].char.group.position.x, z: people[4].char.group.position.z }, fifthHome)
  for (const stay of stays) stay.value = false
  run(director, people, () => director.stats().visits === 0, 6000)
  assert.equal(allHome(people), true)
})

test('200 fixed seeds mix waiting and consumer visits without timeouts, overlap or leaks', () => {
  const failures = []
  for (let seed = 1; seed <= 200; seed++) {
    const rnd = mulberry32(seed), waitingCount = Math.floor(rnd() * 5), consumerCount = 1 + Math.floor(rnd() * 2), total = waitingCount + consumerCount
    const { people, director } = harness(total), waitingBoard = createWaitingBoard(), consumerBoard = createQueueBoard(), stays = []
    for (let i = 0; i < waitingCount; i++) {
      const stay = { value: true }, plan = waitingPlan({ home: people[i].home, agentId: people[i].id, board: waitingBoard })
      people[i].waits = [{ kind: 'question' }]; stays.push(stay); startWaiting(director, people[i], plan, waitingBoard, stay)
    }
    const targetId = TARGETS[Math.floor(rnd() * TARGETS.length)]
    for (let i = waitingCount; i < total; i++) {
      const plan = visitPlan({ home: people[i].home, targetId, board: consumerBoard, agentId: people[i].id })
      director.visitConsumer(people[i], plan, { board: consumerBoard, agentId: people[i].id, dwellMs: 0 })
    }
    const arrived = run(director, people, () => people.slice(0, waitingCount).every(v => v.visiting?.phase === 'dwell') && people.slice(waitingCount).every(v => !v.visiting), 6000, true)
    for (const stay of stays) stay.value = false
    const returned = run(director, people, () => director.stats().visits === 0 && director.stats().active === 0, 6000, true)
    const leaked = Object.values(waitingBoard.snapshot()).some(x => x.length) || Object.values(consumerBoard.snapshot()).some(x => x.length)
    if (arrived.steps >= 6000 || returned.steps >= 6000 || arrived.wall || returned.wall || leaked || !allHome(people) || director.stats().timeouts) failures.push({ seed, waitingCount, targetId, arrived, returned, leaked, stats: director.stats() })
  }
  assert.deepEqual(failures, [])
})

const S1_5B_DIRECTOR = 'E:/VirtualAIOffice/paperclip-ops/office3d-backup-s1-5b/director.js'
test('static boundary keeps the director delta narrow and app excludes visitors from lounge selection', { skip: existsSync(S1_5B_DIRECTOR) ? false : '本机 office3d-backup-s1-5b 证据不存在（CI 干净机器），跳过静态边界比对' }, async () => {
  const [current, baseline, app] = await Promise.all([
    readFile(new URL('../director.js', import.meta.url), 'utf8'),
    readFile(S1_5B_DIRECTOR, 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
  ])
  const counts = new Map()
  for (const line of baseline.split(/\r?\n/)) counts.set(line, (counts.get(line) || 0) + 1)
  const added = current.split(/\r?\n/).filter(line => { const n = counts.get(line) || 0; if (n) counts.set(line, n - 1); return !n }).join('\n')
  for (const word of ['buy', 'pay', 'purchase', 'wallet', 'balance', 'price', 'innerHTML', 'fetch(', 'Math.random(', 'performance.now(']) assert.equal(added.includes(word), false, word)
  assert.match(app, /function goLounge\([^)]*\)[\s\S]{0,300}v\.visiting/)
  assert.match(app, /const idle =[\s\S]{0,220}!v\.visiting/)
  assert.match(app, /isFreeForChat =[\s\S]{0,220}!v\.visiting/)
  assert.match(app, /!live && v\.visiting\?\.targetId === 'waiting'[\s\S]{0,120}cancelVisit\(v, null, true\)/)
})
