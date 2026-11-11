import test from 'node:test'
import assert from 'node:assert/strict'
import { createLive3StageA, LIVE3_DEMO_WARMUP_MS, LIVE3_WORKER_ASSIGNMENTS, live3Board, live3ConveyorPose } from '../wh-r1/live3-stage-a.js'
import { LIVE3_STATIONS, live3BeltPoint, stationPoint } from '../wh-r1/live3-stations.js'
import { createWhR1Navigation } from '../dr-wh-r1-validation.js'
import { WH_R1_STAFF_ROSTER } from '../dr-wh-r1-staff.js'
import { runtimeYawFromFacing, whToWorld } from '../wh-r1-layout.js'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { buildWhR1Live1 } from '../dr-wh-r1-live1.js'
import { buildWhR1Staff } from '../dr-wh-r1-staff.js'
import * as THREE from '../vendor/three/three.module.js'

test('LIVE-3 stage A carries a deterministic waybill through one shared clock', () => {
  const slotIds = WH_R1_DATA.elements.filter(row => row.category === '托位载荷控制体').map(row => row.id)
  const a = createLive3StageA({ seed: 31, slotIds, multiplier: 8 })
  const b = createLive3StageA({ seed: 31, slotIds, multiplier: 8 })
  for (let frame = 0; frame < 600; frame++) { a.advance(100); b.advance(100) }
  const state = a.snapshot()
  assert.deepEqual(state, b.snapshot())
  assert.ok(state.items.some(item => /^DR\d{8}$/.test(item.waybill)))
  assert.ok(state.items.every(item => Number.isInteger(item.weightKg) && item.weightKg >= 1 && item.weightKg <= 30))
  assert.ok(state.items.every(item => ['金边', '暹粒', '西哈努克', '马德望', '贡布', '磅湛'].includes(item.destination)))
  assert.equal(new Set(state.items.map(row => row.waybill)).size, state.items.length)
})

test('LIVE-3 stage A assigns workers by stage and keeps cargo from racing for a slot', () => {
  const sim = createLive3StageA({ seed: 7, multiplier: 12 })
  const initial = sim.snapshot()
  for (const [stage, workers] of Object.entries(LIVE3_WORKER_ASSIGNMENTS)) {
    assert.equal(initial.workerAssignments[stage].length, workers.length)
    assert.ok(workers.every(id => WH_R1_STAFF_ROSTER.some(member => member.id === 'wh-staff-' + id)))
  }
  for (let frame = 0; frame < 600; frame++) {
    const state = sim.advance(100)
    const moving = state.tasks.filter(task => task.status === 'moving')
    assert.equal(new Set(moving.map(task => task.slotId)).size, moving.length)
    assert.ok(moving.every(task => Array.isArray(task.workerIds)))
  }
})

test('LIVE-3 quality exceptions leave the rack slot free and are counted', () => {
  const sim = createLive3StageA({ seed: 99, multiplier: 64 })
  for (let frame = 0; frame < 1800; frame++) sim.advance(100)
  const state = sim.snapshot()
  assert.ok(state.counters.exceptions > 0)
  for (const item of state.items.filter(item => item.stage === 'exception')) assert.equal(item.slotId, null)
})

test('LIVE-3 scale dwell and scan movement come from the same quality task', () => {
  const frames = Array.from({ length: 600 }, (_, frame) =>
    live3ConveyorPose({ stage: 'quality', startedAt: 0 }, frame * 20))
  const dwell = frames.filter(frame => frame.action === 'weigh')
  assert.equal(dwell.length * 20, 1500)
  assert.ok(frames.some(frame => frame.action === 'scan'))
  assert.equal(new Set(dwell.map(frame => frame.x)).size, 1)
  assert.ok(frames.every((frame, i) => i === 0 || frame.x >= frames[i - 1].x))
})

test('LIVE-3 warmed belt keeps boxes spaced and dispatches packing work to distinct benches', () => {
  const sim = createLive3StageA()
  sim.advance(LIVE3_DEMO_WARMUP_MS)
  const start = live3BeltPoint(7), end = live3BeltPoint(16)
  for (let tick = 0; tick < 600; tick++) {
    const state = sim.advance(100)
    const active = state.tasks.filter(task => task.status === 'moving')
    const cargo = active.map(task => live3ConveyorPose(task, state.nowMs)).filter(Boolean)
    const straight = cargo.filter(box => Math.abs(box.z - start.z) < .3 && box.x > start.x && box.x < end.x)
    assert.ok(straight.filter(box => box.action !== 'weigh').length >= 3, state.nowMs)
    for (const [i, box] of cargo.entries()) for (const other of cargo.slice(i + 1)) {
      assert.ok(Math.abs(box.x - other.x) >= .22 || Math.abs(box.z - other.z) >= .22, state.nowMs)
    }
    const assigned = active.filter(task => task.stage === 'packing').map(task => task.workerIndex)
    assert.equal(new Set(assigned).size, assigned.length)
    assert.ok(assigned.every(index => index === 0 || index === 1))
  }
})

test('LIVE-3 runtime suppresses both mannequin meshes and renders simulation boxes at the benches and pallet', () => {
  const root = new THREE.Group()
  const staff = buildWhR1Staff({ THREE, root })
  const live = buildWhR1Live1({ THREE, root, quality: { tier: 'high' } })
  live.bindRuntime({ staff })
  live.onFrame(.1); staff.onFrame(.1)
  assert.equal(staff.summary().placeholderCalls, 0)
  for (const posture of ['standing', 'seated']) assert.equal(root.getObjectByName('wh-r1-staff-placeholder-' + posture).visible, false)
  const mesh = root.getObjectByName('wh-r1-live3-belt-cargo')
  assert.ok(mesh.userData.items.some(box => box.action === 'packing'))
  assert.ok(mesh.userData.items.some(box => box.action === 'staged'))
  const cargo = [...mesh.userData.items, ...mesh.userData.rackCargo]
  assert.equal(new Set(cargo.map(box => box.waybill)).size, cargo.length)
  const actions = new Set()
  for (let i = 0; i < 600; i++) {
    live.onFrame(.1); staff.onFrame(.1)
    for (const member of staff.members) actions.add(member.char.group.userData.live3Action)
  }
  for (const action of ['arrival', 'scan', 'weigh', 'retrieve', 'packing', 'carry', 'stack']) assert.ok(actions.has(action), action)
})

test('LIVE-3 weight label faces the south-side inspection camera', () => {
  const root = new THREE.Group()
  const context = { fillRect() {}, fillText() {} }
  const canvasTex = () => new THREE.CanvasTexture({ getContext: () => context })
  const live = buildWhR1Live1({ THREE, root, quality: { tier: 'high' }, canvasTex })
  const label = root.getObjectByName('wh-r1-live3-weight-label')
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(label.getWorldQuaternion(new THREE.Quaternion()))
  assert.ok(normal.z < -.99)
  live.dispose()
})

test('LIVE-3 board reconciles inventory and active work for 600 ticks', () => {
  const sim = createLive3StageA({ multiplier: 8 })
  for (let frame = 0; frame < 600; frame++) {
    const state = sim.advance(100), board = live3Board(state)
    assert.equal(board.opening + board.inbound - board.outbound, board.inventory)
    assert.equal(board.inventory, state.slots.filter(slot => ['occupied', 'reserved_out'].includes(slot.status)).length)
    assert.equal(board.exceptions, state.items.filter(item => item.stage === 'exception').length)
    for (const stage of Object.keys(board.active)) {
      assert.equal(board.active[stage], state.tasks.filter(item => item.stage === stage && item.status === 'moving').length)
    }
  }
})

test('LIVE-3 retrieves a stored box under its original waybill', () => {
  const sim = createLive3StageA({ seed: 31, slotIds: ['one', 'two'], multiplier: 1,
    orderSource: { next: ({ nowMs }) => ({ kind: 'outbound', orderId: String(nowMs) }) } })
  const seen = new Map()
  let reused = false
  for (let i = 0; i < 350; i++) {
    const state = sim.advance(500)
    for (const item of state.items) {
      if (item.stage === 'stored') seen.set(item.itemId, item.waybill)
      if (item.kind === 'outbound' && seen.has(item.itemId)) {
        assert.equal(item.waybill, seen.get(item.itemId)); reused = true
      }
    }
  }
  assert.ok(reused)
})

const overlaps = (a, b) => {
  if (a.zM + a.h <= b.zM + 1e-6 || b.zM + b.h <= a.zM + 1e-6) return false
  const delta = [b.xM - a.xM, b.yM - a.yM]
  const axes = box => [[Math.cos(box.yaw), Math.sin(box.yaw)], [-Math.sin(box.yaw), Math.cos(box.yaw)]]
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1]
  const radius = (axis, box) => {
    const [u, v] = axes(box)
    return (Math.abs(dot(axis, u)) * box.l + Math.abs(dot(axis, v)) * box.w) / 2
  }
  return [...axes(a), ...axes(b)].every(axis =>
    Math.abs(dot(delta, axis)) < radius(axis, a) + radius(axis, b) - 1e-6)
}

test('R2 demo station solids do not overlap registered physical proxies', () => {
  const obstacles = WH_R1_DATA.elements.filter(row => row.collisionRole === 'physical_proxy')
  for (const station of LIVE3_STATIONS) {
    for (const part of station.parts) {
      const demo = { ...part, xM: station.xM + part.dx, yM: station.yM + part.dy, yaw: 0 }
      for (const row of obstacles) {
        const registered = { ...row, l: row.lengthM, w: row.widthM, h: row.heightM, yaw: row.yawDeg * Math.PI / 180 }
        assert.equal(overlaps(demo, registered), false, station.id + ' / ' + row.id)
      }
    }
  }
})

test('R2 station working side is connected on the existing closed-door grid', () => {
  const nav = createWhR1Navigation()
  const snap = (x, z) => nav.nearestWalkable([x, z])
  const points = LIVE3_STATIONS.map(station => {
    const desired = stationPoint(station, 0, 1.45)
    const point = nav.nearestWalkable([desired.x, desired.z])
    assert.ok(point && Math.hypot(point[0] - desired.x, point[1] - desired.z) < .5, station.id)
    return point
  })
  const [scanner, inspector] = ['wh-staff-receiving-2', 'wh-staff-receiving-1'].map(id => {
    const p = whToWorld(...WH_R1_STAFF_ROSTER.find(row => row.id === id).source)
    return snap(p.x, p.z)
  })
  const pallet = WH_R1_DATA.elements.find(row => row.id === 'WH-02-PAL-001')
  const drop = whToWorld(pallet.xM, pallet.yM)
  const paths = [
    nav.findPath(scanner, points[0]),
    nav.findPath(inspector, points[1]),
    nav.findPath(points[1], points[2]),
    nav.findPath(points[2], snap(drop.x, drop.z)),
  ]
  for (const path of paths) {
    assert.ok(path.length >= 2)
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]]
      for (let step = 0; step <= 10; step++) {
        const x = a[0] + (b[0] - a[0]) * step / 10, z = a[1] + (b[1] - a[1]) * step / 10
        for (const station of LIVE3_STATIONS) for (const part of station.parts) {
          if (part.zM >= 1.75) continue
          const p = stationPoint(station, part.dx, part.dy)
          assert.ok(Math.hypot(Math.max(0, Math.abs(x - p.x) - part.l / 2), Math.max(0, Math.abs(z - p.z) - part.w / 2)) >= .3, station.id)
        }
      }
    }
  }
})

test('R2 packing staff stand on the closed-door grid facing registered benches', () => {
  const nav = createWhR1Navigation()
  for (const member of WH_R1_STAFF_ROSTER.filter(row => row.role === 'packing')) {
    const p = whToWorld(...member.source)
    const table = WH_R1_DATA.elements.find(row => row.id === member.workbench)
    assert.ok(table, member.id)
    const point = nav.nearestWalkable([p.x, p.z])
    assert.ok(point && Math.hypot(point[0] - p.x, point[1] - p.z) < .001, member.id)
    assert.ok(Math.abs(member.source[1] - table.yM) < table.widthM / 2)
    const gap = table.xM - table.lengthM / 2 - member.source[0]
    assert.ok(gap >= .3 && gap <= .81, member.id)
    assert.equal(member.yawDeg, runtimeYawFromFacing(1, 0) * 180 / Math.PI)
    assert.ok(!member.sit)
  }
})
