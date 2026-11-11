import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { officePlan1InnerWalls } from '../office-plan1-layout.js'
import { plan1FurniturePlan } from '../office-vis2/plan1-furniture.js'

const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === 'three'
    ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true }
    : next(specifier, context)
} })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

const chairBounds = (assets, seat) => {
  const chair = placeFurniture(assets, 'chairModernCushion', seat.x, seat.z, { scale: 1, rotY: seat.yaw + Math.PI })
  chair.group.scale.set(.62 / chair.size.x, 1.04 / chair.size.y, .6 / chair.size.z)
  chair.group.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(chair.group)
}
const tableBounds = (assets, room) => {
  const table = placeFurniture(assets, 'table', room.x, room.z, { scale: 1 })
  table.group.scale.set(1 / table.size.x, .76 / table.size.y, 1 / table.size.z)
  table.group.updateMatrixWorld(true)
  const result = new THREE.Box3().setFromObject(table.group)
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(room.w / 2, room.w / 2, .055, 32))
  disk.position.set(room.x, .79, room.z); disk.updateMatrixWorld(true)
  return result.expandByObject(disk)
}
const rect = (id, x, z, w, d, extra = {}) => ({ id, ...extra, bounds: { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 } })
const pointSegmentDistance = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz
  const t = d2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / d2)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz)
}
const segmentDistance = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const on = (p, q, r) => q.x >= Math.min(p.x, r.x) - 1e-9 && q.x <= Math.max(p.x, r.x) + 1e-9 && q.z >= Math.min(p.z, r.z) - 1e-9 && q.z <= Math.max(p.z, r.z) + 1e-9
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  if (abC * abD < 0 && cdA * cdB < 0 || Math.abs(abC) < 1e-9 && on(a, c, b) || Math.abs(abD) < 1e-9 && on(a, d, b) || Math.abs(cdA) < 1e-9 && on(c, a, d) || Math.abs(cdB) < 1e-9 && on(c, b, d)) return 0
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
}
const segmentBoxDistance = (a, b, box) => {
  const inside = p => p.x >= box.x0 && p.x <= box.x1 && p.z >= box.z0 && p.z <= box.z1
  if (inside(a) || inside(b)) return 0
  const corners = [{ x: box.x0, z: box.z0 }, { x: box.x1, z: box.z0 }, { x: box.x1, z: box.z1 }, { x: box.x0, z: box.z1 }]
  return Math.min(...corners.map((point, i) => segmentDistance(a, b, point, corners[(i + 1) % 4])))
}
const segmentCircleDistance = (a, b, circle) => pointSegmentDistance(circle, a, b) - circle.radius
const boxGap = (a, b) => {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x)
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
  return Math.hypot(dx, dz)
}
const routesFor = layout => {
  const nav = createOfficeNavigation(layout), spec = officeFurnitureV2Spec(layout), routes = []
  for (const [id, seat] of Object.entries(layout.seats)) {
    const home = workHome(seat), add = (kind, key, target, run, targetOwner = null) => routes.push({ id, kind, key, target, targetOwner, points: run() })
    add('exit', '', null, () => nav.officeExit(home))
    add('board', '', null, () => nav.boardTrip(home, layout.boss.stand))
    for (const [name, target] of Object.entries(layout.seats)) add('office', name, workHome(target), () => nav.officeTrip(home, workHome(target), workHome(target)), name)
    for (const [index, target] of nav.LOUNGE_SEATS.entries()) add('lounge', String(index), target, () => nav.loungeTrip(home, target))
    for (const room of spec.meetings) for (const [index, target] of room.seats.entries()) add('meeting', `${room.id}:${index}`, target, () => nav.meetingTrip(home, target))
    for (const [name, targets] of Object.entries(nav.consumerQueues)) for (const [index, target] of targets.entries()) add(`consumer-${name}`, String(index), target, () => nav.consumerTrip(home, name, target))
  }
  return routes
}

test('OFFICE-L2 R6: real furniture Box3 clearance, wall whitelist and all 1,825 routes', async (t) => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, spec = officeFurnitureV2Spec(layout), models = {}
  for (const name of ['chairModernCushion', 'table']) {
    const bytes = fs.readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
    models[name] = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
  }
  const assets = { furn: models }, roomResults = []
  const meetingBoxes = new Map(), tableCircles = []
  for (const room of spec.meetings) {
    const seats = room.seats, table = tableBounds(assets, room), chairs = seats.map(seat => chairBounds(assets, seat))
    const region = layout.regions.find(item => item.id === room.region), wallGap = Math.min(...chairs.flatMap(box => [box.min.x - region.x0, region.x1 - box.max.x, box.min.z - region.z0, region.z1 - box.max.z]))
    assert.equal(seats.length, 4, `${room.id}: seat count`)
    assert.ok(Math.abs(room.w - (room.id === 'A' ? 1.2 : 1)) < 1e-9, `${room.id}: approved diameter`)
    assert.ok(Math.abs(Math.hypot(seats[0].x - room.x, seats[0].z - room.z) - (room.id === 'A' ? .96 : .86)) < 1e-9, `${room.id}: approved seat radius`)
    for (const [index, box] of chairs.entries()) {
      const gap = boxGap(table, box)
      assert.ok(gap >= .03 - 1e-6, `${room.id}/${index}: table-to-chair gap ${gap.toFixed(4)}m`)
      assert.ok(gap > 0, `${room.id}/${index}: chair intersects table Box3`)
      for (let other = 0; other < index; other++) assert.ok(boxGap(box, chairs[other]) > 0, `${room.id}/${index}: chairs intersect`)
      meetingBoxes.set(`${room.id}:${index}`, box)
    }
    assert.ok(Math.abs(wallGap - .63) < .015, `${room.id}: outer chair-to-wall gap ${wallGap.toFixed(3)}m`)
    tableCircles.push({ room: room.id, x: room.x, z: room.z, radius: room.w / 2 })
    roomResults.push({ room: room.id, diameter: room.w, seats: seats.map(({ x, z, yaw }) => ({ x, z, yaw })), minTableChairGap: Math.min(...chairs.map(box => boxGap(table, box))), minChairWallGap: wallGap })
  }
  assert.equal(spec.meetings.reduce((sum, room) => sum + room.seats.length, 0), 8)
  const routes = routesFor(layout)
  assert.equal(routes.length, 1825)
  const l2Furniture = plan1FurniturePlan(layout), items = [...l2Furniture]
  for (const [owner, seat] of Object.entries(layout.seats)) {
    const [, x, z, yaw, home] = seat
    const deskW = Math.abs(Math.cos(yaw)) * 1.4 + Math.abs(Math.sin(yaw)) * .7
    const deskD = Math.abs(Math.sin(yaw)) * 1.4 + Math.abs(Math.cos(yaw)) * .7
    items.push(rect(`${owner}-desk`, x, z, deskW, deskD, { owner }), rect(`${owner}-chair`, home.x, home.z, .62, .62, { owner }))
  }
  items.push(rect('board-table', spec.board.x, spec.board.z, spec.board.w, spec.board.d))
  for (const room of spec.meetings) items.push(rect(`meeting-${room.id}`, room.x, room.z, room.w, room.d))
  const walls = officePlan1InnerWalls(layout).filter(wall => wall.a && wall.b)
  const issues = [], wallIssues = []
  for (const route of routes) {
    assert.ok(route.points.length && route.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)), `${route.id}/${route.kind}/${route.key}: finite`)
    if (route.kind === 'meeting') {
      const region = layout.regions.find(item => item.id === (route.target.room === 'A' ? 'review' : 'plan'))
      const door = region.doors[0], inside = { x: region.x1 - .6, z: door.at }
      assert.ok(route.points.some(p => p.x === inside.x && p.z === inside.z), `${route.id}/${route.key}: enters intended door`)
    }
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i]
      for (const item of items) {
        if (item.owner && (item.owner === route.id || item.owner === route.targetOwner)) continue
        const gap = segmentBoxDistance(a, b, item.bounds)
        if (gap < .28 - 1e-6) issues.push({ route: `${route.id}/${route.kind}/${route.key}`, obstacle: item.id, gap, segment: [a, b] })
      }
      for (const circle of tableCircles) { const gap = segmentCircleDistance(a, b, circle); if (gap < .28 - 1e-6) issues.push({ route: `${route.id}/${route.kind}/${route.key}`, obstacle: `meeting-${circle.room}-table`, gap, segment: [a, b] }) }
      for (const [key, box] of meetingBoxes) {
        if (route.kind === 'meeting' && route.target.room === key.split(':')[0] && route.target.x === spec.meetings.find(m => m.id === route.target.room).seats[Number(key.split(':')[1])].x && route.target.z === spec.meetings.find(m => m.id === route.target.room).seats[Number(key.split(':')[1])].z) continue
        const gap = segmentBoxDistance(a, b, { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z })
        if (gap < .28 - 1e-6) issues.push({ route: `${route.id}/${route.kind}/${route.key}`, obstacle: `meeting-chair-${key}`, gap, segment: [a, b] })
      }
      for (const wall of walls) {
        const gap = segmentDistance(a, b, wall.a, wall.b)
        if (gap < .28 - 1e-6) wallIssues.push({ route: `${route.id}/${route.kind}/${route.key}`, obstacle: `wall-${wall.room?.id || wall.side}`, gap, segment: [a, b] })
      }
    }
  }
  const baseline = structuredClone(layout); baseline.plan1Phase = 'L1'
  const before = routesFor(baseline), afterByKey = new Map(routes.map(route => [`${route.id}/${route.kind}/${route.key}`, route]))
  assert.equal(before.length, routes.length)
  const changed = before.filter(route => JSON.stringify(route.points) !== JSON.stringify(afterByKey.get(`${route.id}/${route.kind}/${route.key}`).points))
  const changedByKind = changed.reduce((counts, route) => ({ ...counts, [route.kind]: (counts[route.kind] || 0) + 1 }), {})
  const examples = Object.fromEntries([...new Set(changed.map(route => route.kind))].map(kind => {
    const base = changed.find(route => route.kind === kind), next = afterByKey.get(`${base.id}/${base.kind}/${base.key}`)
    const furniture = [
      ...l2Furniture.flatMap(item => base.points.slice(1).map((point, index) => ({ id: item.id, bounds: item.bounds, gap: segmentBoxDistance(base.points[index], point, item.bounds) }))),
      ...[...meetingBoxes].flatMap(([id, box]) => base.points.slice(1).map((point, index) => ({ id: `meeting-chair-${id}`, bounds: { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }, gap: segmentBoxDistance(base.points[index], point, { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }) }))),
      ...tableCircles.flatMap(circle => base.points.slice(1).map((point, index) => ({ id: `meeting-${circle.room}-table`, bounds: { x: circle.x, z: circle.z, radius: circle.radius }, gap: segmentCircleDistance(base.points[index], point, circle) }))),
    ].filter(hit => hit.gap < .28 - 1e-6)
    return [kind, { route: `${base.id}/${base.kind}/${base.key}`, baseline: base.points, L2: next.points, furniture }]
  }))
  for (const [kind, example] of Object.entries(examples)) if (kind !== 'exit') assert.ok(example.furniture.length, `${kind}: changed route must be attributable to L2 furniture`)
  const exits = Object.keys(layout.seats).map(id => {
    const L1 = before.find(route => route.id === id && route.kind === 'exit').points.at(-1), L2 = afterByKey.get(`${id}/exit/`).points.at(-1)
    return { id, L1, L2, same: JSON.stringify(L1) === JSON.stringify(L2), distance: Math.hypot(L2.x - workHome(layout.seats[id]).x, L2.z - workHome(layout.seats[id]).z) }
  })
  for (const exit of exits) assert.equal(exit.same, !['PM', 'Frontend1', 'BackendSenior', 'UIUX'].includes(exit.id), `${exit.id}: R6 exit distance`)
  const exceptionEvidence = [
    ['PM', 'OpsLead/office/PM', 'Frontend1-chair'], ['Frontend1', 'OpsLead/office/Frontend1', 'PM-chair'],
    ['BackendSenior', 'OpsLead/office/BackendSenior', 'UIUX-chair'], ['UIUX', 'OpsLead/office/UIUX', 'BackendSenior-chair'],
  ].map(([seat, key, obstacle]) => {
    const item = items.find(candidate => candidate.id === obstacle), bounds = item.bounds
    const routeGap = route => Math.min(...route.points.slice(1).map((point, index) => segmentBoxDistance(route.points[index], point, bounds)))
    const beforeRoute = before.find(route => `${route.id}/${route.kind}/${route.key}` === key), afterRoute = afterByKey.get(key)
    return { seat, route: key, obstacle, bounds, baseline115Gap: routeGap(beforeRoute), L2Gap06: routeGap(afterRoute) }
  })
  for (const evidence of exceptionEvidence) {
    assert.ok(evidence.baseline115Gap < .28 - 1e-6, `${evidence.seat}: 1.15m failure evidence`)
    assert.ok(evidence.L2Gap06 >= .28 - 1e-6, `${evidence.seat}: reduced distance clearance`)
  }
  const changedByFamily = { exit: changedByKind.exit || 0, board: changedByKind.board || 0, office: changedByKind.office || 0, lounge: changedByKind.lounge || 0, meeting: changedByKind.meeting || 0, consumer: Object.entries(changedByKind).filter(([kind]) => kind.startsWith('consumer-')).reduce((sum, [, count]) => sum + count, 0) }
  const representativeKinds = ['exit', 'board', 'office', 'lounge', 'meeting', 'consumer-A1']
  const representatives = Object.fromEntries(representativeKinds.map(kind => [kind, { ...examples[kind], furniture: examples[kind].furniture.slice(0, 1) }]))
  console.log(JSON.stringify({ routeCount: routes.length, changedRoutes: changed.length, changedByKind, changedByFamily, representatives, exits, exceptionEvidence, rooms: roomResults }))
  const issueCounts = issues.reduce((counts, issue) => ({ ...counts, [issue.obstacle]: (counts[issue.obstacle] || 0) + 1 }), {})
  assert.equal(issues.length, 0, JSON.stringify({ count: issues.length, issueCounts, examples: issues.slice(0, 12) }, null, 2))
  const wallKey = issue => JSON.stringify([issue.route, issue.obstacle, issue.segment])
  const expectedWalls = Object.keys(layout.seats).flatMap(id => [
    { route: `${id}/board/`, obstacle: 'wall-board', gap: .1, segment: [{ x: -7.2, z: -10.3 }, { x: -13.3, z: -10.3 }] },
    { route: `${id}/consumer-A2/2`, obstacle: 'wall-coffee', gap: .2, segment: [{ x: -7.45, z: 9.2 }, { x: -7.2, z: 9.2 }] },
    { route: `${id}/consumer-B1/3`, obstacle: 'wall-foyer', gap: Math.sqrt(.05), segment: [{ x: 8.5, z: 18.75 }, { x: 8.5, z: 18 }] },
  ])
  const baselineWalls = []
  for (const route of before) for (let i = 1; i < route.points.length; i++) for (const wall of walls) {
    const gap = segmentDistance(route.points[i - 1], route.points[i], wall.a, wall.b)
    if (gap < .28 - 1e-6) baselineWalls.push({ route: `${route.id}/${route.kind}/${route.key}`, obstacle: `wall-${wall.room?.id || wall.side}`, gap, segment: [route.points[i - 1], route.points[i]] })
  }
  for (const set of [baselineWalls, wallIssues]) {
    assert.equal(set.length, expectedWalls.length, 'known L1 wall limitations only')
    const actual = new Map(set.map(issue => [wallKey(issue), issue]))
    assert.equal(actual.size, expectedWalls.length, 'wall route key and segment are unique')
    for (const expected of expectedWalls) assert.ok(Math.abs(actual.get(wallKey(expected))?.gap - expected.gap) < 1e-9, `wall whitelist mismatch: ${wallKey(expected)}`)
  }
  for (const room of spec.meetings) models.chairModernCushion.traverse(object => { if (object.isMesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose() } })
})
