import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V2, LAYOUT_V1, roomSegments } from '../office-layout.js'
import { barSpec, barGaps } from '../office-bar-geometry.js'
import * as logic from '../display-staff-logic.mjs'
import * as browser from '../display-staff-logic.js'
import { buildDisplayStaff } from '../display-staff.js'
import { buildDisplayDepartments } from '../display-departments.js'
import { buildDisplayMarket } from '../display-market.js'
import { buildDisplayService } from '../display-service.js'
import { buildDisplayAftersales } from '../display-aftersales.js'
import { buildDisplayMarketing } from '../display-marketing.js'
import { displayAtlas } from '../display-staff-mesh.js'
import { buildOfficeBar } from '../office-bar.js'

const roster = logic.displayRoster(LAYOUT_V2)
const routes = new Map(roster.map(p => [p.id, logic.displayRoute(LAYOUT_V2, p)]))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const contains = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1
const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

function canvasTexFixture() {
  const calls = []
  const canvasTex = (w, h, draw, repeat, srgb = true) => {
    const operations = [], contexts = [], sizes = []
    const ctx = {
      fillRect(...args) { operations.push(['fillRect', ...args]) },
      fillText(...args) { operations.push(['fillText', ...args]) },
    }
    for (const key of ['font', 'fillStyle', 'textAlign']) Object.defineProperty(ctx, key, {
      set(value) { operations.push([key, value]) },
    })
    const canvas = { getContext(kind) { contexts.push(kind); assert.equal(kind, '2d'); return ctx } }
    for (const key of ['width', 'height']) Object.defineProperty(canvas, key, {
      get() { return key === 'width' ? w : h },
      set(value) { sizes.push([key, value]) },
    })
    canvas.width = w; canvas.height = h
    draw(canvas.getContext('2d'), w, h)
    const texture = { image: canvas, colorSpace: srgb ? THREE.SRGBColorSpace : '', anisotropy: 16,
      dispose() { this.disposed = true } }
    calls.push({ w, h, operations, contexts, sizes, texture })
    return texture
  }
  return { canvasTex, calls }
}

test('atlas accepts faithful ctx-width-height canvasTex contract and draws department labels', () => {
  const f = canvasTexFixture()
  const texture = displayAtlas(THREE, [['市场部', '展示部门 · 模拟角色'], ['客服部', '展示部门 · 模拟角色']], f.canvasTex)
  const call = f.calls[0]
  assert.equal(texture, call.texture)
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
  assert.deepEqual(call.contexts, ['2d'])
  assert.deepEqual(call.sizes, [['width', 1024], ['height', 256]])
  assert.deepEqual(call.operations.find(op => op[0] === 'fillRect'), ['fillRect', 0, 0, 1024, 256])
  assert.deepEqual(call.operations.filter(op => op[0] === 'fillText').map(op => op.slice(1)), [
    ['市场部', 512, 50], ['展示部门 · 模拟角色', 512, 98],
    ['客服部', 512, 178], ['展示部门 · 模拟角色', 512, 226],
  ])
  assert.ok(call.operations.some(op => op[0] === 'font'))
  assert.ok(call.operations.some(op => op[0] === 'fillStyle'))
})

test('faithful canvasTex builds departments, twelve staff and bar; low staff creates nothing', () => {
  const f = canvasTexFixture(), root = new THREE.Group()
  const departments = buildDisplayDepartments({ THREE, root, layout: LAYOUT_V2, canvasTex: f.canvasTex })
  assert.equal(departments.summary().desks, 12)
  assert.equal(departments.summary().calls, 1)
  assert.deepEqual(f.calls[0].operations.filter(op => op[0] === 'fillText').map(op => op[1]),
    ['市场部', '展示部门 · 模拟角色', '客服部', '展示部门 · 模拟角色',
      '售后部', '展示部门 · 模拟角色', '营销部', '展示部门 · 模拟角色'])
  const staff = buildDisplayStaff({ THREE, root, layout: LAYOUT_V2, config: { enabled: true }, canvasTex: f.canvasTex })
  assert.equal(staff.summary().failure, null)
  assert.equal(staff.summary().count, 12)
  assert.equal(staff.summary().calls, 2)
  assert.equal(staff.positions().length, 12)
  assert.equal(f.calls[1].w, 256); assert.equal(f.calls[1].h, 128)
  assert.ok(f.calls[1].operations.some(op => op[0] === 'fillText' && op[1] === '模拟'))
  const before = f.calls.length
  const low = buildDisplayStaff({ THREE, root, layout: LAYOUT_V2, config: { enabled: true }, low: true, canvasTex: f.canvasTex })
  assert.equal(low.summary().failure, null)
  assert.equal(low.summary().count, 0); assert.equal(low.summary().calls, 0)
  assert.equal(low.root.children.length, 0); assert.equal(f.calls.length, before)
  for (const tier of [false, true]) {
    const bar = buildOfficeBar({ THREE, root, layout: LAYOUT_V2, low: tier, canvasTex: f.canvasTex })
    assert.equal(bar.summary().calls, tier ? 1 : 3)
    assert.equal(f.calls.length, before) // 吧台接收依赖但未绘制任何 canvas 纹理。
    bar.dispose()
  }
  staff.dispose(); low.dispose(); departments.dispose()
  assert.equal(root.children.length, 0)
  assert.ok(f.calls.every(call => call.texture.disposed === true))
})

test('atlas without canvasTex or document returns null without throwing', () => {
  assert.equal(typeof document, 'undefined')
  assert.equal(displayAtlas(THREE, [['模拟']]), null)
})

test('display flag requires literal true, invalid/missing JSON stays off, URL opt-in is explicit', () => {
  for (const value of [null, undefined, {}, '', '{broken', { enabled: false }, { enabled: 1 }, { enabled: 'true' }]) assert.equal(logic.displayConfig(value).enabled, false)
  assert.equal(logic.displayConfig('{"enabled":true}').enabled, true)
  for (const url of ['', '?display=0', '?display=true', '?display=1&display=1']) assert.equal(logic.displayConfig(null, url).enabled, false)
  assert.equal(logic.displayConfig(null, '?display=1').enabled, true)
  assert.deepEqual(JSON.parse(source('tests/fixtures/disabled-features/display-staff.json')), { enabled: false, countPerDepartment: 3 })
})
test('12 synthetic identities, three per rev2 department, no layout1 roster, no input mutation', () => {
  assert.equal(roster.length, 12); assert.equal(new Set(roster.map(p => p.id)).size, 12)
  for (const id of logic.DISPLAY_DEPARTMENTS) assert.equal(roster.filter(p => p.department === id).length, 3)
  for (const p of roster) {
    assert.match(p.id, /^sim-/); assert.match(p.label, /^模拟 [1-3]$/); assert.equal(p.synthetic, true)
    assert.ok(contains(LAYOUT_V2.regions.find(r => r.id === p.department), p.home))
    const seat = LAYOUT_V2.displaySeats.find(s => `sim-${s.id}` === p.id)
    assert.deepEqual(p.desk, { x: seat.x, z: seat.z })
  }
  assert.deepEqual(logic.displayRoster(LAYOUT_V1), [])
  assert.equal(browser.displaySchedule, logic.displaySchedule)
  assert.equal(Object.isFrozen(LAYOUT_V2), true)
})
test('route samples avoid other rooms, own desks/other chairs, bar stools/sofas, and door wall segments', () => {
  const obstacles = logic.displayBarObstacles(LAYOUT_V2)
  for (const p of roster) {
    const route = routes.get(p.id), room = LAYOUT_V2.regions.find(r => r.id === p.department)
    const furniture = logic.displayFurnitureBounds(LAYOUT_V2).filter(b => b.id !== `${p.id}-chair`)
    for (let i = 1; i < route.go.length; i++) {
      const a = route.go[i - 1], b = route.go[i], count = Math.ceil(distance(a, b) / .025)
      for (let j = 0; j <= count; j++) {
        const point = { x: a.x + (b.x - a.x) * j / count, z: a.z + (b.z - a.z) * j / count }
        assert.equal(LAYOUT_V2.regions.some(r => r.id !== p.department && contains(r, point)), false, `${p.id}: forbidden region`)
        assert.equal([...obstacles, ...furniture].some(o => logic.displayObstacleHit(point, o)), false, `${p.id}: furniture`)
        for (const wall of roomSegments(room)) {
          const vertical = ['west', 'east'].includes(wall.side)
          const box = vertical ? { x0: (wall.side === 'west' ? room.x0 : room.x1) - .06, x1: (wall.side === 'west' ? room.x0 : room.x1) + .06, z0: wall.lo, z1: wall.hi }
            : { x0: wall.lo, x1: wall.hi, z0: (wall.side === 'north' ? room.z0 : room.z1) - .06, z1: (wall.side === 'north' ? room.z0 : room.z1) + .06 }
          assert.equal(logic.displayObstacleHit(point, box), false, `${p.id}: wall`)
        }
      }
    }
    assert.deepEqual(route.back, route.go.toReversed())
    assert.ok(route.durationMs < 100000)
    assert.equal(route.gapAccess, false)
    assert.equal(route.reason, 'O5_GAP_ROUTE_NOT_CONNECTED')
    const spec = barSpec(LAYOUT_V2), gap = barGaps(LAYOUT_V2).find(g => g.side === route.side)
    assert.equal(route.go.at(-1).z, (gap.z0 + gap.z1) / 2)
    assert.ok(distance(route.go.at(-1), spec.center) >= spec.ring.r0)
  }
})
test('schedule deterministic across dates/hours/seeds with 0-2 visits each and non-overlapping side reservations', () => {
  const before = JSON.stringify(roster)
  for (let hour = 0; hour < 72; hour++) {
    const a = logic.displaySchedule(roster, routes, hour, 2707), b = logic.displaySchedule(roster, routes, hour, 2707)
    assert.deepEqual(a, b)
    for (const p of roster) assert.ok(a.filter(t => t.id === p.id).length <= 2)
    for (const side of ['east', 'west']) {
      const trips = a.filter(t => t.side === side)
      for (let i = 1; i < trips.length; i++) assert.ok(trips[i].start >= trips[i - 1].end)
    }
    assert.ok(a.every(t => t.start >= hour * 3600000 && t.end < (hour + 1) * 3600000))
  }
  assert.equal(JSON.stringify(roster), before)
})
test('200 display-only seeds complete round trips, max two walkers, no overlap; not the integrated 37-person T16b', () => {
  let visits = 0, maxWalking = 0, minGap = Infinity
  for (let seed = 1; seed <= 200; seed++) {
    const schedule = logic.displaySchedule(roster, routes, seed % 24, seed)
    visits += schedule.length
    for (const t of schedule) {
      const end = logic.displayFrame(roster, routes, schedule, t.end).find(p => p.id === t.id)
      assert.equal(end.state, 'seated')
      assert.equal(end.x, roster.find(p => p.id === t.id).home.x)
      assert.equal(end.z, roster.find(p => p.id === t.id).home.z)
    }
    for (let at = seed % 24 * 3600000; at < (seed % 24 + 1) * 3600000; at += 1000) {
      const frame = logic.displayFrame(roster, routes, schedule, at)
      const moving = frame.filter(p => p.state !== 'seated')
      maxWalking = Math.max(maxWalking, moving.filter(p => p.state !== 'resting').length)
      assert.ok(moving.length <= 2)
      if (moving.length === 2) minGap = Math.min(minGap, distance(...moving))
      assert.ok(frame.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)))
    }
  }
  assert.ok(minGap >= .52, `minimum simulated pedestrian gap ${minGap}`)
  console.log('O7_DISPLAY_STRESS ' + JSON.stringify({ seeds: 200, visits, maxWalking, minGap, integratedT16b: false }))
})
test('seek-safe outbound/rest/return frames and low tier fully static', () => {
  const schedule = logic.displaySchedule(roster, routes, 0), t = schedule[0], plan = routes.get(t.id)
  const at = t.start + plan.length / 1.4 * 1000 + 1000
  const frame = logic.displayFrame(roster, routes, schedule, at)
  assert.equal(frame.find(p => p.id === t.id).state, 'resting')
  assert.deepEqual(logic.displayFrame(roster, routes, schedule, at), frame)
  assert.ok(logic.displayFrame(roster, routes, schedule, at, true).every(p => p.state === 'seated'))
})
test('real Three.js staff default creates no meshes, high 12 actors <=2 calls, hot toggle and disposal', () => {
  const root = new THREE.Group()
  let time = 0
  const staff = buildDisplayStaff({ THREE, root, layout: LAYOUT_V2, now: () => time })
  assert.equal(staff.summary().count, 0); assert.equal(staff.root.children.length, 0)
  staff.setEnabled('true'); assert.equal(staff.summary().count, 0)
  staff.setEnabled(true)
  assert.equal(staff.summary().failure, null)
  assert.equal(staff.summary().count, 12); assert.equal(staff.summary().calls, 2)
  assert.ok(staff.summary().triangles <= 24000)
  time = 30000; staff.update()
  assert.equal(staff.positions().length, 12)
  staff.setLow(true); assert.equal(staff.summary().count, 0); assert.equal(staff.summary().calls, 0)
  staff.setLow(false); assert.equal(staff.summary().count, 12)
  staff.setEnabled(false); assert.equal(staff.root.children.length, 0)
  staff.setEnabled(true); assert.equal(staff.root.children.length, 2)
  staff.dispose(); staff.dispose(); assert.equal(root.children.length, 0)
})
test('clock failures isolated to display meshes, no shared material mutation', () => {
  const root = new THREE.Group(), staff = buildDisplayStaff({ THREE, root, layout: LAYOUT_V2, config: { enabled: true }, now: () => NaN })
  assert.equal(staff.summary().failure, 'DISPLAY_UNAVAILABLE')
  assert.equal(staff.summary().count, 0); staff.dispose()
  const failedAtlas = buildDisplayStaff({ THREE, root, layout: LAYOUT_V2, config: { enabled: true }, canvasTex() { throw new Error('atlas unavailable') } })
  assert.equal(failedAtlas.summary().failure, 'DISPLAY_UNAVAILABLE')
  assert.equal(failedAtlas.root.children.length, 0); failedAtlas.dispose()
})
test('four furniture factories and aggregate preserve 12 desks/signs, single batch low/high, no lights', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), value = buildDisplayDepartments({ THREE, root, layout: LAYOUT_V2, low })
    assert.equal(value.summary().desks, 12); assert.equal(value.summary().calls, 1)
    assert.ok(value.summary().triangles <= (low ? 2000 : 9000))
    assert.ok(value.regions.every(r => r.kind === '展示区域' && r.description === '展示部门 · 模拟角色'))
    value.dispose(); value.dispose(); assert.equal(root.children.length, 0)
  }
  for (const build of [buildDisplayMarket, buildDisplayService, buildDisplayAftersales, buildDisplayMarketing]) {
    const value = build({ THREE, root: new THREE.Group(), layout: LAYOUT_V2 })
    assert.equal(value.summary().departments, 1); assert.equal(value.summary().desks, 3); value.dispose()
  }
})
test('static isolation, zero business/network calls, office tokens and shared bar contract', () => {
  for (const file of ['display-staff.js', 'display-staff-logic.js', 'display-staff-logic.mjs', 'display-staff-mesh.js', 'display-departments.js',
    'display-market.js', 'display-service.js', 'display-aftersales.js', 'display-marketing.js', 'display-staff-preview.html', 'display-staff-preview.js']) {
    assert.doesNotMatch(source(file), /\bfetch\s*\(|Math\.random|Date\.now|innerHTML|dr-campus|dr-console|Paperclip|\/state|\/act\b|director\.js|app\.js/)
  }
  assert.doesNotMatch(source('display-staff-logic.js'), /THREE|document|window|performance/)
  assert.match(source('display-staff-logic.js'), /office-bar-geometry\.js/)
  assert.match(source('display-staff.js'), /office-theme-v2\.js/)
  assert.match(source('display-departments.js'), /office-theme-v2\.js/)
  assert.doesNotMatch(source('display-staff.js') + source('display-departments.js'), /new THREE\.\w*Light/)
  assert.match(source('display-staff-preview.js'), /document\.hidden/)
})
