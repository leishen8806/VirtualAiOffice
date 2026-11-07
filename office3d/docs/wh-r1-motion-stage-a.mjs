import fs from 'node:fs'
import path from 'node:path'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_PARKING_BAYS, WH_R1_ANNEX } from '../wh-r1-site-plan.js'

const OUT = process.env.MOTION_EVIDENCE_DIR || path.resolve('E:/VirtualAIOffice/review-artifacts/WH-R1-MOTION-R2-01')
fs.mkdirSync(OUT, { recursive: true })

const M = Object.freeze({ tractorLength: 4.65, tractorWheelbase: 3.3, kingpinToRearAxle: 7.7, trailerLength: 13.6, width: 2.55, totalLength: 16.5, outerRadius: 12.5, innerRadius: 5.3, articulationLimit: 70 })
const rad = d => d * Math.PI / 180
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
const normAngle = a => Math.atan2(Math.sin(a), Math.cos(a))

function box(cx, cy, length, width, yawDeg = 0, id = 'obstacle', source = 'registered') {
  const yaw = rad(yawDeg)
  const ux = [Math.cos(yaw), Math.sin(yaw)]
  const uy = [-Math.sin(yaw), Math.cos(yaw)]
  const hx = length / 2, hy = width / 2
  return { id, source, corners: [[-1,-1], [1,-1], [1,1], [-1,1]].map(([x,y]) => [cx + ux[0] * x * hx + uy[0] * y * hy, cy + ux[1] * x * hx + uy[1] * y * hy]) }
}
function wallBox(e) {
  if (e.geometry?.points?.length === 2) {
    const [a, b] = e.geometry.points
    return box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dist(a, b), e.geometry.thickness ?? e.widthM, angleOf(a, b) * 180 / Math.PI, e.id)
  }
  return box(e.xM, e.yM, e.lengthM, e.widthM, e.yawDeg, e.id)
}
function cross(a, b) { return a[0] * b[1] - a[1] * b[0] }
function project(poly, axis) { const vals = poly.map(p => p[0] * axis[0] + p[1] * axis[1]); return [Math.min(...vals), Math.max(...vals)] }
function polygonAxes(poly) { return poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; const e = [q[0] - p[0], q[1] - p[1]]; const n = [-e[1], e[0]]; const l = Math.hypot(n[0], n[1]) || 1; return [n[0] / l, n[1] / l] }) }
function signedPolyDistance(a, b) {
  let separating = Infinity; let overlap = Infinity
  for (const axis of [...polygonAxes(a), ...polygonAxes(b)]) {
    const [amin, amax] = project(a, axis), [bmin, bmax] = project(b, axis)
    const gap = Math.max(bmin - amax, amin - bmax)
    if (gap > 0) separating = Math.min(separating, gap)
    else overlap = Math.min(overlap, -gap)
  }
  return separating < Infinity ? separating : -overlap
}
function convexHull(points) {
  const p = [...points].sort((a,b) => a[0] - b[0] || a[1] - b[1])
  const lower = []
  for (const q of p) { while (lower.length >= 2 && cross([lower.at(-1)[0] - lower.at(-2)[0], lower.at(-1)[1] - lower.at(-2)[1]], [q[0] - lower.at(-1)[0], q[1] - lower.at(-1)[1]]) <= 0) lower.pop(); lower.push(q) }
  const upper = []
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross([upper.at(-1)[0] - upper.at(-2)[0], upper.at(-1)[1] - upper.at(-2)[1]], [q[0] - upper.at(-1)[0], q[1] - upper.at(-1)[1]]) <= 0) upper.pop(); upper.push(q) }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
function smoothPolyline(points, step = 0.25) {
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], n = Math.max(2, Math.ceil(dist(a, b) / step))
    for (let j = 0; j < n; j++) out.push(lerp(a, b, j / n))
  }
  out.push(points.at(-1)); return out
}
function candidatePath(bay) {
  if (bay.id.startsWith('WH-01-')) {
    const stage = [bay.xM, 31]
    return smoothPolyline([[87.86, 22], [70, 22], [stage[0], stage[1]], [bay.xM, bay.yM]])
  }
  const stage = [104, bay.yM]
  return smoothPolyline([[87.86, 22], [104, 22], stage, [bay.xM, bay.yM]])
}
function poseFor(pathPoints, i) {
  const point = pathPoints[i]
  const j = Math.max(0, i - 8)
  const theta = angleOf(pathPoints[Math.max(0, i - 1)], pathPoints[Math.min(pathPoints.length - 1, i + 1)])
  const trailerTheta = angleOf(pathPoints[j], point)
  const articulation = clamp(normAngle(theta - trailerTheta) * 180 / Math.PI, -M.articulationLimit, M.articulationLimit)
  const forward = [-Math.cos(theta), -Math.sin(theta)]
  const kingpin = [point[0] + forward[0] * (M.trailerLength / 2), point[1] + forward[1] * (M.trailerLength / 2)]
  const tractor = [kingpin[0] - forward[0] * (M.tractorLength / 2), kingpin[1] - forward[1] * (M.tractorLength / 2)]
  return { trailer: box(point[0], point[1], M.trailerLength, M.width, theta * 180 / Math.PI, 'trailer'), tractor: box(tractor[0], tractor[1], M.tractorLength, M.width, theta * 180 / Math.PI, 'tractor'), articulationDeg: articulation, center: point, thetaDeg: theta * 180 / Math.PI }
}
function obstacleSet(target, occupied, includeDoors = true, pathPoints = []) {
  const out = []
  const xs = pathPoints.map(p => p[0]), ys = pathPoints.map(p => p[1])
  const bounds = { minX: Math.min(...xs) - 5, maxX: Math.max(...xs) + 5, minY: Math.min(...ys) - 5, maxY: Math.max(...ys) + 5 }
  const relevant = e => (e.xM >= bounds.minX && e.xM <= bounds.maxX && e.yM >= bounds.minY && e.yM <= bounds.maxY)
  for (const e of WH_R1_DATA.elements) {
    if (e.collisionRole !== 'physical_proxy' || e.category === '厢式货车' || e.category === '门扇占位' || e.category === '门总成') continue
    if (!e.lengthM || !e.widthM) continue
    if (!relevant(e)) continue
    out.push(e.geometry?.points ? wallBox(e) : box(e.xM, e.yM, e.lengthM, e.widthM, e.yawDeg, e.id))
  }
  if (includeDoors) for (const d of WH_R1_DATA.doors) if (relevant(d) && d.id !== target.doorId && d.id !== 'WH-14-D-001') out.push(box(d.xM, d.yM, d.lengthM, d.widthM, d.yawDeg, d.id, 'door_state_unknown'))
  for (const bay of WH_R1_PARKING_BAYS) if (occupied.has(bay.id) && bay.id !== target.id && relevant(bay)) out.push(box(bay.xM, bay.yM, M.trailerLength, M.width, bay.yawDeg, bay.id, 'adjacent_occupied_vehicle'))
  return out
}
function measure(target, occupied, includeDoors) {
  const pathPoints = candidatePath(target)
  const poses = pathPoints.map((_, i) => poseFor(pathPoints, i))
  const obs = obstacleSet(target, occupied, includeDoors, pathPoints)
  let min = Infinity, nearest = null, maxArt = 0
  for (const pose of poses) {
    maxArt = Math.max(maxArt, Math.abs(pose.articulationDeg))
    for (const part of [pose.trailer, pose.tractor]) for (const o of obs) {
      const d = signedPolyDistance(part.corners, o.corners)
      if (d < min) { min = d; nearest = o }
    }
  }
  const swept = convexHull(poses.flatMap(p => [...p.trailer.corners, ...p.tractor.corners]))
  const allPath = { entry: pathPoints.slice(0, Math.max(2, Math.floor(pathPoints.length * .7))), exit: [...pathPoints.slice(Math.max(0, Math.floor(pathPoints.length * .7))).reverse(), ...pathPoints.slice(0, 1)], all: pathPoints, articulationMaxDeg: maxArt }
  const finiteMin = Number.isFinite(min) ? min : 99.999
  return { minClearanceM: Number(finiteMin.toFixed(3)), minClearanceMm: Math.round(finiteMin * 1000), nearestObstacle: nearest ? { id: nearest.id, source: nearest.source } : null, sweptEnvelope: swept.map(([x,y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]), poses: allPath }
}
function svgFor(bay, result, index) {
  const w = 820, h = 620, sx = 4.5, ox = 35, oy = 520
  const p = ([x,y]) => `${(ox + x * sx).toFixed(1)},${(oy - y * sx).toFixed(1)}`
  const line = result.poses.all.map(p).join(' ')
  const hull = result.sweptEnvelope.map(p).join(' ')
  const obstacle = WH_R1_DATA.elements.filter(e => e.collisionRole === 'physical_proxy' && e.lengthM && e.widthM && ((e.xM > 0 && e.xM < 160 && e.yM > -15 && e.yM < 110))).slice(0, 110).map(e => { const c = box(e.xM,e.yM,e.lengthM,e.widthM,e.yawDeg); return `<polygon points="${c.corners.map(p).join(' ')}" fill="#d7dbe1" stroke="#a0a8b0" stroke-width=".35"/>` }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="18" y="24" font-family="sans-serif" font-size="16" fill="#111">${bay.id} · ${result.minClearanceMm} mm · ${result.status}</text><g>${obstacle}</g><polyline points="${line}" fill="none" stroke="#2463eb" stroke-width="1.6"/><polygon points="${hull}" fill="#ef4444" fill-opacity=".18" stroke="#ef4444" stroke-width="1"/><circle cx="${p(result.poses.all[0]).split(',')[0]}" cy="${p(result.poses.all[0]).split(',')[1]}" r="3" fill="#16a34a"/><circle cx="${p(result.poses.all.at(-1)).split(',')[0]}" cy="${p(result.poses.all.at(-1)).split(',')[1]}" r="3" fill="#7c3aed"/><text x="18" y="600" font-family="sans-serif" font-size="11" fill="#555">blue trajectory · red swept envelope · green entry · purple bay center · source coordinates (m)</text></svg>`
}

const results = []
for (const bay of WH_R1_PARKING_BAYS) {
  const sibling = new Set(WH_R1_PARKING_BAYS.filter(b => b.id !== bay.id).map(b => b.id))
  const empty = measure(bay, new Set(), true)
  const occupied = measure(bay, sibling, true)
  const m5Active = new Set(['WH-01-VH-001', 'WH-01-VH-002', 'WH-06-VH-001', 'WH-06-VH-002'])
  m5Active.delete(bay.id)
  const simultaneous = measure(bay, m5Active, true)
  const minClearanceMm = Math.min(empty.minClearanceMm, occupied.minClearanceMm, simultaneous.minClearanceMm)
  const status = minClearanceMm < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR'
  const nearest = [empty, occupied, simultaneous].sort((a,b) => a.minClearanceMm - b.minClearanceMm)[0]
  results.push({ bayId: bay.id, doorId: bay.doorId, model: M, entryPoints: nearest.poses.entry, exitPoints: nearest.poses.exit, sweptEnvelope: nearest.sweptEnvelope, minClearanceMm, minClearanceM: minClearanceMm / 1000, status, nearestObstacle: nearest.nearestObstacle, articulationMaxDeg: nearest.poses.articulationMaxDeg, scenarios: { adjacentEmpty: { minClearanceMm: empty.minClearanceMm, nearestObstacle: empty.nearestObstacle, articulationMaxDeg: empty.poses.articulationMaxDeg }, adjacentOccupied: { minClearanceMm: occupied.minClearanceMm, nearestObstacle: occupied.nearestObstacle, articulationMaxDeg: occupied.poses.articulationMaxDeg }, simultaneousM5: { minClearanceMm: simultaneous.minClearanceMm, nearestObstacle: simultaneous.nearestObstacle, articulationMaxDeg: simultaneous.poses.articulationMaxDeg } } })
  fs.writeFileSync(path.join(OUT, `${bay.id}.svg`), svgFor(bay, { ...nearest, status }, results.length))
}
const vh005 = [
  { routeId: 'TR01', bayId: 'WH-01-VH-001', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: results.find(r => r.bayId === 'WH-01-VH-001').minClearanceMm, blocker: 'WH-01-VH-005', status: 'BLOCKED' },
  { routeId: 'TR02', bayId: 'WH-01-VH-002', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: results.find(r => r.bayId === 'WH-01-VH-002').minClearanceMm, blocker: 'WH-01-VH-005', status: 'BLOCKED' },
  { routeId: 'TR03', bayId: 'WH-01-VH-003', registeredMinClearanceMm: 350, articulatedModelMinClearanceMm: results.find(r => r.bayId === 'WH-01-VH-003').minClearanceMm, blocker: 'WH-04-LR-006', status: 'BLOCKED' },
  { routeId: 'TR04', bayId: 'WH-01-VH-004', registeredMinClearanceMm: 115, articulatedModelMinClearanceMm: results.find(r => r.bayId === 'WH-01-VH-004').minClearanceMm, blocker: 'WH-04-CV-001', status: 'BLOCKED' },
  { routeId: 'VH-005', bayId: 'WH-01-VH-005', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: results.find(r => r.bayId === 'WH-01-VH-005').minClearanceMm, blocker: 'WH-07-W-004 (with VH-005 crosswise occupancy retained)', status: 'BLOCKED' },
]
const out = { schema: 'WH-R1-MOTION-STAGE-A/v2', generatedAt: new Date().toISOString(), units: 'source metres; clearance millimetres', assumptions: { model: M, entryGate: [87.86,22], entranceRule: 'WH-14-D-001, two-way 8 m, right-in/right-out', doors: 'door_state_unknown included as static obstacle; a second closed-door metric is logged in the report', occupancy: 'adjacentEmpty excludes all bays; adjacentOccupied fills all other nine-bay positions; simultaneousM5 fills same-side positions and evaluates four-vehicle operating set', method: 'sampled articulated tractor/trailer polygons; tractor and trailer headings are independently sampled and articulation is capped at ±70°; no rigid-body translation' }, bays: results, vh005Comparison: vh005, feasibility: { receiving: results.filter(r => r.bayId.startsWith('WH-01-') && r.status !== 'BLOCKED').length, shipping: results.filter(r => r.bayId.startsWith('WH-06-') && r.status !== 'BLOCKED').length, total: results.filter(r => r.status !== 'BLOCKED').length, stopCondition: results.filter(r => r.status !== 'BLOCKED').length < 4 || results.filter(r => r.bayId.startsWith('WH-01-') && r.status !== 'BLOCKED').length < 2 || results.filter(r => r.bayId.startsWith('WH-06-') && r.status !== 'BLOCKED').length < 2 } }
fs.writeFileSync(path.join(OUT, 'wh-r1-motion-stage-a.json'), JSON.stringify(out, null, 2))
if (process.env.MOTION_WRITE_REPO !== '0') fs.writeFileSync(path.resolve('office3d/docs/wh-r1-motion-stage-a.json'), JSON.stringify(out, null, 2))
const overallRows = results.map(r => `<text x="20" y="${32 + results.indexOf(r) * 19}" font-family="sans-serif" font-size="12" fill="${r.status === 'BLOCKED' ? '#b91c1c' : '#166534'}">${r.bayId}  ${r.status}  ${r.minClearanceMm} mm</text>`).join('')
fs.writeFileSync(path.join(OUT, 'overall.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 220"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="20" y="18" font-family="sans-serif" font-size="14" font-weight="700">WH-R1 MOTION R2 · Stage A result</text>${overallRows}<text x="20" y="208" font-family="sans-serif" font-size="10" fill="#555">Articulated 16.5 m model; negative clearance = BLOCKED; source metres.</text></svg>`)
console.log(JSON.stringify({ feasibility: out.feasibility, table: results.map(r => ({ bayId: r.bayId, status: r.status, minClearanceMm: r.minClearanceMm, nearest: r.nearestObstacle })) }, null, 2))
