import fs from 'node:fs'
import path from 'node:path'
import { WH_R1_DATA } from '../wh-r1/data.js'
import { WH_R1_PARKING_BAYS, WH_R1_ANNEX, WH_R1_I7_ROWS, whR1VehicleForSite } from '../wh-r1-site-plan.js'

const OUT = process.env.MOTION_EVIDENCE_DIR || path.resolve('E:/VirtualAIOffice/review-artifacts/WH-R1-MOTION-R2-01')
fs.mkdirSync(OUT, { recursive: true })
const M = Object.freeze({ tractorLength: 4.65, tractorWheelbase: 3.3, kingpinToRearAxle: 7.7, trailerLength: 13.6, width: 2.55, height: 4, totalLength: 16.5, outerRadius: 12.5, innerRadius: 5.3, articulationLimit: 70, sampleStepM: .25 })
const rad = d => d * Math.PI / 180
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
const normAngle = a => Math.atan2(Math.sin(a), Math.cos(a))
const round = n => Number(n.toFixed(3))

function box(cx, cy, length, width, yawDeg = 0, id = 'obstacle', source = 'registered') {
  const yaw = rad(yawDeg), ux = [Math.cos(yaw), Math.sin(yaw)], uy = [-Math.sin(yaw), Math.cos(yaw)]
  const hx = length / 2, hy = width / 2
  return { id, source, corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [cx + ux[0] * x * hx + uy[0] * y * hy, cy + ux[1] * x * hx + uy[1] * y * hy]) }
}
function wallBox(e) {
  if (e.geometry?.points?.length === 2) {
    const [a, b] = e.geometry.points
    return box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dist(a, b), e.geometry.thickness ?? e.widthM, angleOf(a, b) * 180 / Math.PI, e.id, 'site_wall')
  }
  return box(e.xM, e.yM, e.lengthM, e.widthM, e.yawDeg, e.id, 'site_geometry')
}
function project(poly, axis) { const v = poly.map(p => p[0] * axis[0] + p[1] * axis[1]); return [Math.min(...v), Math.max(...v)] }
function axes(poly) { return poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; const e = [q[0] - p[0], q[1] - p[1]]; const n = [-e[1], e[0]], l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l] }) }
function signedPolyDistance(a, b) {
  let separating = Infinity, overlap = Infinity
  for (const axis of [...axes(a), ...axes(b)]) {
    const [amin, amax] = project(a, axis), [bmin, bmax] = project(b, axis)
    const gap = Math.max(bmin - amax, amin - bmax)
    if (a?.[0]?.[0] === 131.275 && b?.[0]?.[0] === 153.55) console.log('AX', b.id, b.source, axis, amin, amax, bmin, bmax, gap)
    if (gap > 0) separating = Math.min(separating, gap)
    else overlap = Math.min(overlap, -gap)
  }
  return separating < Infinity ? separating : -overlap
}
function smoothPolyline(points, step = M.sampleStepM) {
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], n = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let j = 0; j < n; j++) out.push(lerp(a, b, j / n))
  }
  out.push(points.at(-1)); return out
}

// SITE's labelled street logistics gate is the only entry. Every segment stays in the
// expanded external yard; the old WH-14-D-001 interior connection is deliberately excluded.
const SITE_GATE = [154, 6]
const WAIT = [140, 6]
function vehicleSpecForBay(bay) {
  if (bay.id.startsWith('WH-01-')) return { kind: 'semitrailer', articulated: true, xM: bay.xM, yM: bay.yM, yawDeg: bay.yawDeg, lengthM: M.totalLength, widthM: M.width, heightM: M.height }
  const row = whR1VehicleForSite(bay)
  const type = row.displayVehicleType
  return { kind: type, articulated: false, xM: row.xM, yM: row.yM, yawDeg: row.yawDeg, lengthM: row.lengthM, widthM: row.widthM, heightM: row.heightM, outerRadiusM: type === 'delivery-train' ? 7 : 4 }
}
function candidatePath(bay) {
  const vehicle = vehicleSpecForBay(bay)
  if (bay.id.startsWith('WH-01-')) {
    const northApproach = [bay.xM, 70]
    return smoothPolyline([SITE_GATE, WAIT, [130, 6], [130, 70], northApproach, [bay.xM, bay.yM]])
  }
  return smoothPolyline([SITE_GATE, WAIT, [130, 6], [130, vehicle.yM], [vehicle.xM, vehicle.yM]])
}
function poseFor(pathPoints, i, vehicle) {
  const point = pathPoints[i], j = Math.max(0, i - Math.ceil(7.7 / M.sampleStepM))
  const before = pathPoints[Math.max(0, i - 1)], after = pathPoints[Math.min(pathPoints.length - 1, i + 1)]
  const theta = angleOf(before, after), trailerTheta = angleOf(pathPoints[j], point)
  if (!vehicle.articulated) {
    return { vehicle: box(point[0], point[1], vehicle.lengthM, vehicle.widthM, theta * 180 / Math.PI, 'vehicle', 'swept_vehicle'), articulationDeg: 0, center: point, thetaDeg: theta * 180 / Math.PI }
  }
  const articulation = clamp(normAngle(theta - trailerTheta) * 180 / Math.PI, -M.articulationLimit, M.articulationLimit)
  const forward = [-Math.cos(theta), -Math.sin(theta)]
  const kingpin = [point[0] + forward[0] * (M.trailerLength / 2), point[1] + forward[1] * (M.trailerLength / 2)]
  const tractor = [kingpin[0] - forward[0] * (M.tractorLength / 2), kingpin[1] - forward[1] * (M.tractorLength / 2)]
  return { trailer: box(point[0], point[1], M.trailerLength, M.width, theta * 180 / Math.PI, 'trailer', 'swept_vehicle'), tractor: box(tractor[0], tractor[1], M.tractorLength, M.width, theta * 180 / Math.PI, 'tractor', 'swept_vehicle'), articulationDeg: articulation, center: point, thetaDeg: theta * 180 / Math.PI }
}
const inExpandedSite = e => Number.isFinite(e.xM) && e.xM >= -6 && e.xM <= 160 && e.yM >= -12 && e.yM <= 104
const I7_IDS = new Set(WH_R1_I7_ROWS.map(row => row.id))
function obstacleSet(target, occupied) {
  const out = []
  const siteCategories = new Set(['隔离栏杆', '连续花池', '冠幅', '盆器', '树干', '长椅', '入口标识', '小汽车占位'])
  for (const e of WH_R1_DATA.elements) {
    // Interior racks, desks and screens cannot be hit by an external-yard route.
    // Keep the registered shell walls and the site-facing landscape/vehicle proxies.
    if (I7_IDS.has(e.id) || e.collisionRole !== 'physical_proxy' || e.category === '厢式货车' || !e.lengthM || !e.widthM || !inExpandedSite(e)) continue
    if (!(e.category === '墙体' || siteCategories.has(e.category))) continue
    out.push(e.geometry?.points ? wallBox(e) : box(e.xM, e.yM, e.lengthM, e.widthM, e.yawDeg, e.id, 'registered_site_geometry'))
  }
  for (const wall of WH_R1_ANNEX.walls) out.push(box(wall.xM, wall.yM, wall.lengthM, wall.widthM, wall.yawDeg, wall.id, 'site_annex_wall'))
  for (const door of WH_R1_ANNEX.doors) if (door.id !== target.doorId) out.push(box(door.xM, door.yM, door.lengthM, door.widthM, door.yawDeg, door.id, 'site_annex_door_unknown'))
  for (const row of WH_R1_I7_ROWS) if (row.collisionRole === 'physical_proxy' && row.lengthM && row.widthM) out.push(box(row.xM, row.yM, row.lengthM, row.widthM, row.yawDeg, row.id, 'site_i7_geometry'))
  for (const bay of WH_R1_PARKING_BAYS) if (occupied.has(bay.id) && bay.id !== target.id) { const v = vehicleSpecForBay(bay); out.push(box(v.xM, v.yM, v.lengthM, v.widthM, v.yawDeg, bay.id, 'adjacent_occupied_vehicle')) }
  return out
}
function sweptUnion(poses) {
  return poses.flatMap((pose, sample) => {
    if (pose.vehicle) return [{ sample, part: 'vehicle', polygon: pose.vehicle.corners.map(([x, y]) => [round(x), round(y)]) }]
    return [
      { sample, part: 'tractor', polygon: pose.tractor.corners.map(([x, y]) => [round(x), round(y)]) },
      { sample, part: 'trailer', polygon: pose.trailer.corners.map(([x, y]) => [round(x), round(y)]) },
    ]
  })
}
function measure(target, occupied) {
  const vehicle = vehicleSpecForBay(target), pathPoints = candidatePath(target), poses = pathPoints.map((_, i) => poseFor(pathPoints, i, vehicle)), obs = obstacleSet(target, occupied)
  let min = Infinity, nearest = null, nearestSample = -1, nearestPart = null, maxArt = 0
  for (const [sample, pose] of poses.entries()) {
    maxArt = Math.max(maxArt, Math.abs(pose.articulationDeg))
    for (const part of (pose.vehicle ? [pose.vehicle] : [pose.trailer, pose.tractor])) for (const o of obs) {
      const d = signedPolyDistance(part.corners, o.corners)
      if (d < min) { min = d; nearest = o; nearestSample = sample; nearestPart = part }
    }
  }
  const finiteMin = Number.isFinite(min) ? min : 99.999
  return { vehicle, minClearanceM: round(finiteMin), minClearanceMm: Math.round(finiteMin * 1000), nearestObstacle: nearest ? { id: nearest.id, source: nearest.source } : null, nearestSample, nearestCenter: nearest ? poses[nearestSample].center : null, nearestObstacleCorners: nearest?.corners?.map(([x, y]) => [round(x), round(y)]) ?? null, nearestPartCorners: nearestPart?.corners?.map(([x, y]) => [round(x), round(y)]) ?? null, sweptEnvelope: sweptUnion(poses), obstacles: obs.map(o => ({ id: o.id, source: o.source, polygon: o.corners.map(([x, y]) => [round(x), round(y)]) })), poses: { entry: pathPoints, exit: [...pathPoints].reverse(), all: pathPoints, articulationMaxDeg: round(maxArt) } }
}
function svgFor(bay, result) {
  const w = 900, h = 650, sx = 4.4, ox = 28, oy = 560
  const p = ([x, y]) => `${(ox + x * sx).toFixed(1)},${(oy - y * sx).toFixed(1)}`
  const line = result.poses.all.map(p).join(' ')
  const polygons = result.sweptEnvelope.filter(item => item.sample % 8 === 0).map(item => `<polygon points="${item.polygon.map(p).join(' ')}" fill="${item.part === 'tractor' ? '#ef4444' : '#f97316'}" fill-opacity=".06" stroke="${item.part === 'tractor' ? '#ef4444' : '#f97316'}" stroke-width=".18"/>`).join('')
  const obstacle = result.obstacles.map(o => `<polygon points="${o.polygon.map(p).join(' ')}" fill="${o.source === 'adjacent_occupied_vehicle' ? '#64748b' : '#d7dbe1'}" stroke="#8c96a0" stroke-width=".28"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="18" y="24" font-family="sans-serif" font-size="16" fill="#111">${bay.id} · ${result.minClearanceMm} mm · ${result.status}</text><rect x="${ox}" y="${oy - 48 * sx}" width="${88 * sx}" height="${48 * sx}" fill="#eef0f3" stroke="#66717d" stroke-width="1"/><rect x="${ox + 88 * sx}" y="${oy - 42 * sx}" width="${24 * sx}" height="${30 * sx}" fill="#e8ebef" stroke="#66717d" stroke-width="1"/><g>${obstacle}</g><polyline points="${line}" fill="none" stroke="#2463eb" stroke-width="1.8"/>${polygons}<circle cx="${p(result.poses.all[0]).split(',')[0]}" cy="${p(result.poses.all[0]).split(',')[1]}" r="3" fill="#16a34a"/><circle cx="${p(result.poses.all.at(-1)).split(',')[0]}" cy="${p(result.poses.all.at(-1)).split(',')[1]}" r="3" fill="#7c3aed"/><text x="18" y="625" font-family="sans-serif" font-size="11" fill="#555">blue route · red/orange sampled vehicle union · green SITE gate · source coordinates (m) · step ≤0.25 m</text></svg>`
}

const results = []
for (const bay of WH_R1_PARKING_BAYS) {
  const siblings = new Set(WH_R1_PARKING_BAYS.filter(b => b.id !== bay.id).map(b => b.id))
  const empty = measure(bay, new Set()), occupied = measure(bay, siblings)
  const active = new Set(['WH-01-VH-001', 'WH-01-VH-002', 'WH-06-VH-001', 'WH-06-VH-002']); active.delete(bay.id)
  const simultaneous = measure(bay, active)
  const minClearanceMm = Math.min(empty.minClearanceMm, occupied.minClearanceMm, simultaneous.minClearanceMm)
  const nearest = [empty, occupied, simultaneous].sort((a, b) => a.minClearanceMm - b.minClearanceMm)[0]
  const status = minClearanceMm < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR'
  const scenario = x => ({ minClearanceMm: x.minClearanceMm, nearestObstacle: x.nearestObstacle, nearestSample: x.nearestSample, nearestCenter: x.nearestCenter, nearestObstacleCorners: x.nearestObstacleCorners, nearestPartCorners: x.nearestPartCorners, articulationMaxDeg: x.poses.articulationMaxDeg })
  const result = { bayId: bay.id, doorId: bay.doorId, model: nearest.vehicle, entryPoints: nearest.poses.entry, exitPoints: nearest.poses.exit, sweptEnvelope: nearest.sweptEnvelope, minClearanceMm, minClearanceM: round(minClearanceMm / 1000), status, nearestObstacle: nearest.nearestObstacle, articulationMaxDeg: nearest.poses.articulationMaxDeg, scenarios: { adjacentEmpty: scenario(empty), adjacentOccupied: scenario(occupied), simultaneousM5: scenario(simultaneous) } }
  results.push(result); fs.writeFileSync(path.join(OUT, `${bay.id}.svg`), svgFor(bay, { ...nearest, status }))
}
const by = id => results.find(r => r.bayId === id)
const vh005 = [
  { routeId: 'TR01', bayId: 'WH-01-VH-001', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: by('WH-01-VH-001').minClearanceMm, blocker: 'WH-01-VH-005', status: by('WH-01-VH-001').status },
  { routeId: 'TR02', bayId: 'WH-01-VH-002', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: by('WH-01-VH-002').minClearanceMm, blocker: 'WH-01-VH-005', status: by('WH-01-VH-002').status },
  { routeId: 'TR03', bayId: 'WH-01-VH-003', registeredMinClearanceMm: 350, articulatedModelMinClearanceMm: by('WH-01-VH-003').minClearanceMm, blocker: 'WH-04-LR-006', status: by('WH-01-VH-003').status },
  { routeId: 'TR04', bayId: 'WH-01-VH-004', registeredMinClearanceMm: 115, articulatedModelMinClearanceMm: by('WH-01-VH-004').minClearanceMm, blocker: 'WH-04-CV-001', status: by('WH-01-VH-004').status },
  { routeId: 'VH-005', bayId: 'WH-01-VH-005', registeredMinClearanceMm: -1250, articulatedModelMinClearanceMm: by('WH-01-VH-005').minClearanceMm, blocker: 'VH-005 crosswise occupancy retained', status: by('WH-01-VH-005').status },
]
const receiving = results.filter(r => r.bayId.startsWith('WH-01-') && r.status !== 'BLOCKED').length
const shipping = results.filter(r => r.bayId.startsWith('WH-06-') && r.status !== 'BLOCKED').length
const out = { schema: 'WH-R1-MOTION-STAGE-A/v3', generatedAt: new Date().toISOString(), units: 'source metres; clearance millimetres', assumptions: { model: M, vehicleRule: 'WH-01-VH-001…005 = 6×4 tractor + 13.6 m semitrailer; WH-06-VH-001…002 = whR1VehicleForSite delivery-train; WH-06-VH-003…004 = whR1VehicleForSite delivery-tricycle; train radius 7 m, tricycle radius 4 m', entryGate: SITE_GATE, waitingPoint: WAIT, entranceRule: 'SITE 临街物流出入口 → 东侧外部等待区 → 建筑外调车区；不穿主仓或附建区', doors: 'target door excluded only for final bay; all other doors/door sweeps are UNKNOWN static obstacles', occupancy: 'adjacentEmpty / adjacentOccupied / simultaneousM5 are all measured; status is the minimum over the three', method: 'articulated tractor/trailer or rigid delivery vehicle polygons sampled at ≤0.25 m; sweptEnvelope is the union of each sampled polygon, never a route convex hull; expanded SITE geometry, annex, I7 fixtures and occupied bays included' }, bays: results, vh005Comparison: vh005, feasibility: { receiving, shipping, total: receiving + shipping, stopCondition: receiving < 2 || shipping < 2 || receiving + shipping < 4 } }
fs.writeFileSync(path.join(OUT, 'wh-r1-motion-stage-a.json'), JSON.stringify(out, null, 2))
if (process.env.MOTION_WRITE_REPO !== '0') fs.writeFileSync(path.resolve('office3d/docs/wh-r1-motion-stage-a.json'), JSON.stringify(out, null, 2))
const overallRows = results.map((r, i) => `<text x="20" y="${32 + i * 19}" font-family="sans-serif" font-size="12" fill="${r.status === 'BLOCKED' ? '#b91c1c' : '#166534'}">${r.bayId}  ${r.status}  ${r.minClearanceMm} mm</text>`).join('')
fs.writeFileSync(path.join(OUT, 'overall.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 220"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="20" y="18" font-family="sans-serif" font-size="14" font-weight="700">WH-R1 MOTION R2 · Stage A result</text>${overallRows}<text x="20" y="208" font-family="sans-serif" font-size="10" fill="#555">SITE gate, external yard network, sampled articulated vehicle union; negative clearance = BLOCKED.</text></svg>`)
function entranceSvg(title, moved, low) {
  const w = 900, h = low ? 520 : 650, sx = 6, ox = 55, oy = low ? 390 : 500
  const p = ([x, y]) => `${(ox + x * sx).toFixed(1)},${(oy - y * sx).toFixed(1)}`
  const rows = moved ? [{ id: 'WH-14-BED-001', xM: 154.5, yM: -2, lengthM: 1, widthM: 5, yawDeg: 0 }, { id: 'WH-14-PL-001*', xM: 154, yM: -2, lengthM: 2.6, widthM: 2.6, yawDeg: 0 }, { id: 'WH-14-PL-002*', xM: 154, yM: 14, lengthM: 2.6, widthM: 2.6, yawDeg: 0 }, { id: 'WH-14-GT-001', xM: 158.5, yM: 14.5, lengthM: 6, widthM: .15, yawDeg: 90 }] : [{ id: 'WH-14-BED-001', xM: 154.5, yM: 6, lengthM: 1, widthM: 5, yawDeg: 0 }, { id: 'WH-14-PL-001*', xM: 155, yM: 1, lengthM: 2.6, widthM: 2.6, yawDeg: 0 }, { id: 'WH-14-PL-002*', xM: 155, yM: 11, lengthM: 2.6, widthM: 2.6, yawDeg: 0 }, { id: 'WH-14-GT-001', xM: 158.5, yM: 6, lengthM: 6, widthM: .15, yawDeg: 90 }]
  const obstacle = rows.map(row => { const c = box(row.xM, row.yM, row.lengthM, row.widthM, row.yawDeg); return `<polygon points="${c.corners.map(p).join(' ')}" fill="#d97706" fill-opacity=".72" stroke="#92400e" stroke-width=".45"/><text x="${p([row.xM, row.yM]).split(',')[0]}" y="${p([row.xM, row.yM]).split(',')[1]}" font-size="9" text-anchor="middle" fill="#111">${row.id}</text>` }).join('')
  const lane = box(140, 6, 30, 8, 0)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="20" y="24" font-family="sans-serif" font-size="17" fill="#111">${title} · ${low ? '低机位' : '入口俯视'} · lane width 8 m</text><polygon points="${lane.corners.map(p).join(' ')}" fill="#dbeafe" stroke="#2563eb" stroke-width=".8"/>${obstacle}<circle cx="${p(SITE_GATE).split(',')[0]}" cy="${p(SITE_GATE).split(',')[1]}" r="3" fill="#16a34a"/><text x="${p(SITE_GATE).split(',')[0]}" y="${Number(p(SITE_GATE).split(',')[1]) - 8}" font-size="10" text-anchor="middle">SITE gate</text><text x="20" y="${h - 18}" font-size="11" fill="#555">orange = registered furniture/landscape/turnstile · blue = 8 m two-way truck lane</text></svg>`
}
for (const low of [false, true]) { fs.writeFileSync(path.join(OUT, `entrance-before-${low ? 'low' : 'top'}.svg`), entranceSvg('R3 logistics entrance · before', false, low)); fs.writeFileSync(path.join(OUT, `entrance-after-${low ? 'low' : 'top'}.svg`), entranceSvg('R3 logistics entrance · after', true, low)) }
console.log(JSON.stringify({ feasibility: out.feasibility, table: results.map(r => ({ bayId: r.bayId, status: r.status, minClearanceMm: r.minClearanceMm, nearest: r.nearestObstacle })) }, null, 2))
