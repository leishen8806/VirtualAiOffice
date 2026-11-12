import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import * as THREE from '../vendor/three/three.module.js'
import { createDirector } from '../director.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { createQueueBoard, visitPlan } from '../foyer-paths.js'
import { FOYER_QUEUES, FOYER_RECEPTION, OFFICE_ROOMS, RECEPTION, SEATS, roomSegments, workHome } from '../office-layout.js'

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
  return { id, name: id, home: { ...home }, stand: { x: home.x + 1, z: home.z }, chair: null, char: { group, body: { head }, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0, yaw: 0, pitch: 0, talk: 0 } }, act: null }
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

function fakeDom() {
  globalThis.document ??= { createElement: () => {
    const parts = new Map()
    return { className: '', innerHTML: '', remove() {}, querySelector(sel) { if (!parts.has(sel)) parts.set(sel, { textContent: '' }); return parts.get(sel) } }
  } }
  return { layer: { appendChild() {} }, project: { tmp: new THREE.Vector3(), fn() {} } }
}

function harness(count = 1) {
  const people = NAMES.slice(0, count).map(name => actor(name, workHome(SEATS[name])))
  const views = new Map(people.map(v => [v.id, v])), dom = fakeDom()
  return { people, views, director: createDirector({ views, board: {}, ...dom, furnitureCollision: wallWorld() }) }
}

function planAll(people, board, targetId) {
  return people.map(v => visitPlan({ home: v.home, targetId, board, agentId: v.id }))
}

function allHome(people) {
  return people.every(v => Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < 0.02)
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

function run(director, people, done, limit = 5000, audit = false, board = null) {
  let minGap = Infinity, wall = false, maxQueue = 0, steps = 0
  for (; steps < limit && !done(); steps++) {
    const before = people.map(v => ({ x: v.char.group.position.x, z: v.char.group.position.z }))
    director.update(DT)
    if (board) maxQueue = Math.max(maxQueue, ...Object.values(board.snapshot()).map(a => a.length))
    if (!audit) continue
    for (let i = 0; i < people.length; i++) wall ||= crossesWall(before[i], people[i].char.group.position)
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const a = people[i].char.group.position, b = people[j].char.group.position
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z))
    }
  }
  return { steps, minGap, wall, maxQueue }
}

function startVisit(director, v, plan, board, dwellMs = 0, callbacks = {}) {
  return director.visitConsumer(v, plan, { board, agentId: v.id, dwellMs, ...callbacks })
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

test('六人同点使用真实家具碰撞，队满拒绝第七人且全部安全返回', () => {
  const { people, director } = harness(7), board = createQueueBoard(), plans = planAll(people, board, 'A1')
  assert.ok(plans.slice(0, 6).every(p => p.ok))
  assert.deepEqual(plans[6], { ok: false, reason: 'full' })
  for (let i = 0; i < 6; i++) assert.equal(startVisit(director, people[i], plans[i], board, 300_000), true)
  const arrived = run(director, people.slice(0, 6), () => people[0].visiting?.phase === 'dwell' && people.slice(0, 6).every((v, i) => !v.act && Math.hypot(v.char.group.position.x - plans[i].stand.x, v.char.group.position.z - plans[i].stand.z) < 0.02), 3000, true, board)
  assert.equal(arrived.wall, false)
  assert.ok(arrived.minGap >= PERSON_GAP * 0.9, String(arrived.minGap))
  assert.deepEqual(board.snapshot().A1, people.slice(0, 6).map(v => v.id))
  assert.equal(director.stats().visits, 6)
  assert.equal(director.stats().timeouts, 0)
  for (const v of people.slice(0, 6)) director.cancelVisit(v)
  run(director, people.slice(0, 6), () => director.stats().visits === 0 && director.stats().active === 0, 3000)
  assert.equal(allHome(people.slice(0, 6)), true)
  assert.deepEqual(board.snapshot().A1, [])
  assert.equal(director.stats().timeouts, 0)
})

test('队首和队中取消会释放槽位并让后续人员短路径前移', () => {
  const { people, director } = harness(4), board = createQueueBoard(), plans = planAll(people, board, 'A2')
  const arrived = []
  for (let i = 0; i < 4; i++) startVisit(director, people[i], plans[i], board, 300_000, { onArrive: () => arrived.push(people[i].id) })
  run(director, people, () => people[0].visiting?.phase === 'dwell' && people.every((v, i) => !v.act && Math.hypot(v.char.group.position.x - plans[i].stand.x, v.char.group.position.z - plans[i].stand.z) < 0.02), 3000)
  assert.equal(director.cancelVisit(people[2], 'middle'), true)
  assert.equal(director.cancelVisit(people[2], 'again'), false)
  run(director, people, () => !people[3].act && people[3].visiting?.phase === 'queued', 800)
  assert.deepEqual(board.snapshot().A2, [people[0].id, people[1].id, people[3].id])
  assert.equal(director.cancelVisit(people[0], 'head'), true)
  run(director, people, () => arrived.includes(people[1].id), 800)
  assert.equal(board.head('A2'), people[1].id)
  for (const v of people) director.cancelVisit(v)
  run(director, people, () => director.stats().visits === 0 && director.stats().active === 0, 3000)
  assert.deepEqual(board.snapshot().A2, [])
  assert.equal(allHome(people), true)
  assert.equal(director.stats().timeouts, 0)
})

test('停留五分钟不触发45秒动作看门狗，结束后正常回工位', () => {
  const { people: [v], director } = harness(), board = createQueueBoard(), [plan] = planAll([v], board, 'desk')
  let arrived = 0, done = 0
  startVisit(director, v, plan, board, 300_000, { onArrive: () => arrived++, onDone: () => done++ })
  run(director, [v], () => arrived === 1, 3000)
  for (let i = 0; i < 1499; i++) director.update(DT)
  assert.equal(director.stats().timeouts, 0)
  assert.equal(director.stats().visits, 1)
  director.update(DT)
  run(director, [v], () => director.stats().visits === 0, 3000)
  assert.equal(done, 1)
  assert.equal(allHome([v]), true)
})

test('路上真实卡死仍由原看门狗复位', () => {
  const v = actor('stuck', { x: 0, z: 0, yaw: 0 }), views = new Map([[v.id, v]])
  const blocked = { move() {}, route() { return null }, seatBody() { return null }, overlaps() { return false } }
  const director = createDirector({ views, board: {}, ...fakeDom(), furnitureCollision: blocked })
  director.travel(v, [{ x: 10, z: 0 }], { x: 10, z: 0, yaw: 0 }, false)
  run(director, [v], () => director.stats().active === 0, 500)
  assert.equal(director.stats().timeouts, 1)
  assert.equal(allHome([v]), true)
})

test('下班、召回和真实事件都会中断访问、释放槽位并回工位', () => {
  for (const reason of ['offDuty', 'recalled', 'event']) {
    const { people, views, director } = harness(reason === 'event' ? 2 : 1), v = people[0], board = createQueueBoard(), [plan] = planAll([v], board, 'B0')
    const aborts = []
    startVisit(director, v, plan, board, 300_000, { onAbort: r => aborts.push(r) })
    run(director, people, () => v.visiting?.phase === 'dwell', 3000)
    if (reason === 'offDuty') v.leaving = true
    else if (reason === 'recalled') v.waits = [{ kind: 'question' }]
    else director.enqueue({ kind: 'speak', from: v.id, at: '2026-10-20T00:00:00Z', text: 'x' })
    director.update(DT)
    assert.equal(board.occupancy('B0'), 0, reason)
    assert.equal(aborts.length, 1, reason)
    if (reason === 'event') assert.equal(v.act?.ev.kind, 'commute')
    if (reason !== 'event') { v.leaving = false; v.waits = [] }
    run(director, people, () => !v.visiting && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < 0.02, 3000)
    assert.equal(allHome([v]), true, reason)
    director.clear()
    assert.equal(views.get(v.id), v)
  }
})

test('休息、离岗、已有动作或已有等待时拒绝且不改访问状态', () => {
  for (const setup of [v => { v.lounging = {} }, v => { v.away = true }, v => { v.act = { phase: 'x' } }, v => { v.waits = [{}] }]) {
    const { people: [v], director } = harness(), board = createQueueBoard(), [plan] = planAll([v], board, 'B1')
    setup(v)
    const before = { act: v.act, lounging: v.lounging, away: v.away, waits: v.waits }
    assert.equal(startVisit(director, v, plan, board, 1000), false)
    assert.equal(v.visiting, undefined)
    assert.deepEqual({ act: v.act, lounging: v.lounging, away: v.away, waits: v.waits }, before)
    board.leave(v.id)
  }
})

test('三进三出重复50次不泄漏槽位或丢人', () => {
  const { people, director } = harness(6)
  for (let round = 0; round < 50; round++) {
    const board = createQueueBoard(), first = planAll(people.slice(0, 3), board, 'B2')
    for (let i = 0; i < 3; i++) startVisit(director, people[i], first[i], board, 300_000)
    run(director, people, () => people[0].visiting?.phase === 'dwell' && people.slice(0, 3).every((v, i) => !v.act && Math.hypot(v.char.group.position.x - first[i].stand.x, v.char.group.position.z - first[i].stand.z) < 0.02), 3000)
    for (let i = 0; i < 3; i++) director.cancelVisit(people[i], 'rotate')
    const next = planAll(people.slice(3), board, 'B2')
    for (let i = 3; i < 6; i++) startVisit(director, people[i], next[i - 3], board, 0)
    run(director, people, () => director.stats().visits === 0 && director.stats().active === 0, 5000)
    assert.equal(allHome(people), true, `round ${round}`)
    assert.ok(Object.values(board.snapshot()).every(items => items.length === 0), `round ${round}`)
  }
  assert.equal(director.stats().timeouts, 0)
})

test('200个固定种子的真实路径访问全部返回且没有超时或槽位泄漏', () => {
  const started = performance.now(), results = []
  for (let seed = 1; seed <= 200; seed++) {
    const rnd = mulberry32(seed), count = 1 + Math.floor(rnd() * 6), target = TARGETS[Math.floor(rnd() * TARGETS.length)]
    const { people, director } = harness(count), board = createQueueBoard(), plans = planAll(people, board, target)
    for (let i = 0; i < people.length; i++) assert.equal(startVisit(director, people[i], plans[i], board, 0), true)
    const runResult = run(director, people, () => director.stats().visits === 0 && director.stats().active === 0, 8000, true, board)
    const stats = director.stats(), leaked = Object.values(board.snapshot()).some(items => items.length)
    results.push({ seed, steps: runResult.steps, wall: runResult.wall, minGap: runResult.minGap, maxQueue: runResult.maxQueue, leaked, home: allHome(people), ...stats })
  }
  const slowest = results.reduce((a, b) => a.steps > b.steps ? a : b)
  const summary = { seeds: 200, ms: Math.round(performance.now() - started), slowestSeed: slowest.seed, slowestSteps: slowest.steps, maxQueue: Math.max(...results.map(r => r.maxQueue)), yields: results.reduce((n, r) => n + r.yields, 0), abandons: results.reduce((n, r) => n + r.abandons, 0), timeouts: results.reduce((n, r) => n + r.timeouts, 0) }
  console.log('S1_4B_STRESS ' + JSON.stringify(summary))
  assert.equal(results.some(r => r.steps >= 8000 || r.wall || r.leaked || !r.home), false, JSON.stringify(results.filter(r => r.steps >= 8000 || r.wall || r.leaked || !r.home)))
  assert.equal(summary.timeouts, 0)
  assert.ok(Math.min(...results.map(r => r.minGap)) >= PERSON_GAP * 0.9)
})

const S1_4B_DIRECTOR = 'E:/VirtualAIOffice/paperclip-ops/office3d-backup-s1-4b/director.js'
test('静态边界：新增代码无禁词且路径模块保持纯净', { skip: existsSync(S1_4B_DIRECTOR) ? false : '本机 office3d-backup-s1-4b 证据不存在（CI 干净机器），跳过静态边界比对' }, async () => {
  const [current, baseline, paths] = await Promise.all([
    readFile(new URL('../director.js', import.meta.url), 'utf8'),
    readFile(S1_4B_DIRECTOR, 'utf8'),
    readFile(new URL('../foyer-paths.js', import.meta.url), 'utf8'),
  ])
  const oldLines = new Set(baseline.split(/\r?\n/)), added = current.split(/\r?\n/).filter(line => !oldLines.has(line)).join('\n')
  for (const word of ['buy', 'pay', 'purchase', 'wallet', 'balance', 'price', 'innerHTML', 'fetch(', 'Math.random(', 'performance.now(']) assert.equal(added.includes(word), false, word)
  for (const word of ['innerHTML', 'fetch(', 'Math.random(', 'performance.now(']) assert.equal(paths.includes(word), false, word)
})
