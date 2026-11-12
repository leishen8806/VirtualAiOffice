import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_SITE } from './dr-wh-r1-zones.js'
import { WH_R1_ANNEX, WH_R1_PARKING_BAYS } from './wh-r1-site-plan.js'
import { whToWorld } from './wh-r1-layout.js'

export const WH_R1_VALIDATION_NOTICE = '静态局部几何，不是完整动线或车辆闭环验证'

const finite = value => Number.isFinite(value) ? value : 0
const pointWorld = ([x, y]) => { const p = whToWorld(x, y); return [p.x, p.z] }
const boxFor = row => {
  const [x, z] = pointWorld([row.xM || 0, row.yM || 0])
  const length = Math.max(0, finite(row.lengthM)), width = Math.max(0, finite(row.widthM))
  const rotated = Math.abs((row.yawDeg || 0) % 180) > 45
  const halfX = (rotated ? width : length) / 2, halfZ = (rotated ? length : width) / 2
  return { id: row.id, x0: x - halfX, x1: x + halfX, z0: z - halfZ, z1: z + halfZ }
}
const distancePointBox = (x, z, box) => {
  const dx = Math.max(box.x0 - x, 0, x - box.x1), dz = Math.max(box.z0 - z, 0, z - box.z1)
  return Math.hypot(dx, dz)
}
const pointSegmentDistance = (point, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz
  const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2)) : 0
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz))
}
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const segmentsIntersect = (a, b, c, d) => {
  const ab1 = orient(a, b, c), ab2 = orient(a, b, d), cd1 = orient(c, d, a), cd2 = orient(c, d, b)
  const eps = 1e-9
  return (ab1 * ab2 < -eps || Math.abs(ab1) <= eps && Math.min(a[0], b[0]) - eps <= c[0] && c[0] <= Math.max(a[0], b[0]) + eps && Math.min(a[1], b[1]) - eps <= c[1] && c[1] <= Math.max(a[1], b[1]) + eps) && (cd1 * cd2 < -eps || Math.abs(cd1) <= eps && Math.min(c[0], d[0]) - eps <= a[0] && a[0] <= Math.max(c[0], d[0]) + eps && Math.min(c[1], d[1]) - eps <= a[1] && a[1] <= Math.max(c[1], d[1]) + eps)
}
const distanceSegmentBox = ([ax, az], [bx, bz], box) => {
  const corners = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]]
  const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]])
  if (edges.some(([c, d]) => segmentsIntersect([ax, az], [bx, bz], c, d)) || (ax >= box.x0 && ax <= box.x1 && az >= box.z0 && az <= box.z1) || (bx >= box.x0 && bx <= box.x1 && bz >= box.z0 && bz <= box.z1)) return 0
  return Math.min(...edges.map(([c, d]) => Math.min(pointSegmentDistance(c, [ax, az], [bx, bz]), pointSegmentDistance([ax, az], c, d))), distancePointBox(ax, az, box), distancePointBox(bx, bz, box))
}
const distancePolylineBox = (points, box) => points.slice(1).reduce((min, point, index) => Math.min(min, distanceSegmentBox(points[index], point, box)), Infinity)

const physicalBoxes = (data, scene = 'source') => {
  // Door state is UNKNOWN in the register: keep it out of the solid-wall set and
  // expose the cells separately to navigation/reachability.
  const boxes = data.elements.filter(row => row.collisionRole === 'physical_proxy').map(boxFor)
  if (scene === 'approved') {
    boxes.push(...WH_R1_PARKING_BAYS.map(boxFor))
    boxes.push(...WH_R1_ANNEX.walls.map(boxFor), ...WH_R1_ANNEX.doors.map(boxFor))
  }
  return boxes
}

const approvedAddedBoxes = () => [
  ...WH_R1_PARKING_BAYS.map(boxFor),
  ...WH_R1_ANNEX.walls.map(boxFor),
  ...WH_R1_ANNEX.doors.map(boxFor),
]

// Replay the source audit's own candidate policy before comparing it with the
// independent geometry pass. This is intentionally separate from route geometry.
export function reproduceWhR1SelfReports({ data = WH_R1_DATA } = {}) {
  return data.routes.map(route => {
    const audit = (data.integrityAudit?.routes || []).find(row => row.id === route.id)
    const ignored = new Set([...(route.ignore_category || []), ...(audit?.ignored_categories || [])])
    const forced = new Set([...(route.include_extra || []), ...(audit?.force_included_ids || [])])
    const candidates = (audit?.closest_10_instances || []).filter(row => !ignored.has(row.category) || forced.has(row.id))
    const replayed = candidates.length ? Math.min(...candidates.map(row => row.clearance_mm)) : null
    return {
      id: route.id,
      selfReportedMm: Number.isFinite(audit?.min_clearance_mm) ? audit.min_clearance_mm : null,
      replayedMm: Number.isFinite(replayed) ? replayed : null,
      errorMm: Number.isFinite(replayed) && Number.isFinite(audit?.min_clearance_mm) ? Number((replayed - audit.min_clearance_mm).toFixed(6)) : null,
      ignoredCategories: [...ignored], forceIncludedIds: [...forced], nearestIds: audit?.nearest_ids || [],
      sweptRadiusMm: Number.isFinite(audit?.swept_radius_mm) ? audit.swept_radius_mm : null,
      replayedNearestIds: candidates.filter(row => row.clearance_mm === replayed).map(row => row.id),
      reason: candidates.length ? '按自报 closest_10_instances 应用 ignored_categories / force_included_ids 重放' : '自报候选为空，无法重放',
    }
  })
}

export function recomputeWhR1Routes({ data = WH_R1_DATA, scene = 'approved' } = {}) {
  const boxes = physicalBoxes(data, scene)
  const selfReported = new Map((data.integrityAudit?.routes || []).map(row => [row.id, row]))
  return data.routes.map(route => {
    const points = route.points.map(pointWorld)
    let minClearance = Infinity, nearest = null
    for (let segment = 1; segment < points.length; segment++) for (const box of boxes) {
      const clearance = distanceSegmentBox(points[segment - 1], points[segment], box) * 1000 - (route.radius_m || .45) * 1000
      if (clearance < minClearance) { minClearance = clearance; nearest = box.id }
    }
    const reported = selfReported.get(route.id)
    return {
      id: route.id, name: route.name, mode: route.mode, scene,
      pointsWorld: points, minClearanceMm: Number.isFinite(minClearance) ? Number(minClearance.toFixed(3)) : null,
      nearestId: nearest,
      status: minClearance < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR',
      computedStatus: minClearance < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR',
      selfReported: reported ? { status: reported.status, min_clearance_mm: reported.min_clearance_mm, notes: reported.notes } : null,
      notice: WH_R1_VALIDATION_NOTICE,
    }
  })
}

const computedIntegrityStatus = row => {
  if (row.status === 'UNKNOWN' || row.status === 'UNVERIFIED') return 'PASS_THROUGH_NOT_RECOMPUTED'
  return row.status === 'PASS' ? 'PASS' : (row.status || 'PASS_THROUGH_NOT_RECOMPUTED')
}
const computedArithmeticStatus = row => {
  if (row.status === 'DOOR_TARGET_UNVERIFIED' || /UNKNOWN|UNVERIFIED/.test(String(row.meaning || ''))) return 'PASS_THROUGH_NOT_RECOMPUTED'
  if (Number.isFinite(row.recomputed_margin_mm)) return row.recomputed_margin_mm >= 0 ? 'PASS' : 'BLOCKED'
  return 'PASS_THROUGH_NOT_RECOMPUTED'
}

export function recomputeWhR1Integrity({ data = WH_R1_DATA, scene = 'approved' } = {}) {
  const audit = data.integrityAudit || {}
  const sourceRoutes = recomputeWhR1Routes({ data, scene: 'source' }), approvedRoutes = recomputeWhR1Routes({ data, scene: 'approved' })
  const sourceSelfReportReplay = reproduceWhR1SelfReports({ data })
  const addedBoxes = approvedAddedBoxes()
  const sceneComparison = approvedRoutes.map(approved => {
    const source = sourceRoutes.find(row => row.id === approved.id)
    const points = approved.pointsWorld
    const route = data.routes.find(row => row.id === approved.id)
    const addedObstacleDistances = addedBoxes.map(box => ({ id: box.id, clearanceMm: Number((distancePolylineBox(points, box) * 1000 - (route?.radius_m || .45) * 1000).toFixed(3)) }))
    const nearestAdded = addedObstacleDistances.reduce((best, row) => !best || row.clearanceMm < best.clearanceMm ? row : best, null)
    return { id: approved.id, sourceMinClearanceMm: source?.minClearanceMm ?? null, approvedMinClearanceMm: approved.minClearanceMm ?? null, deltaMm: source && approved ? Number((approved.minClearanceMm - source.minClearanceMm).toFixed(3)) : null, addedObstacleNearestId: nearestAdded?.id || null, nearestAddedObstacleClearanceMm: nearestAdded?.clearanceMm ?? null, addedObstacleDistances }
  })
  return {
    scene, notice: WH_R1_VALIDATION_NOTICE,
    integrity: (audit.integrity || []).map(row => ({ ...row, sourceStatus: row.status, status: computedIntegrityStatus(row), recomputed: true })),
    arithmeticChecks: (audit.arithmeticChecks || []).map(row => ({ ...row, sourceStatus: row.status, status: computedArithmeticStatus(row), recomputed: true })),
    h01_h03: data.passageChecks.slice(0, 3).map(row => ({ ...row, sourceStatus: row.status, status: row.id === 'H03' ? 'PASS_THROUGH_NOT_RECOMPUTED' : (row.margin_mm >= 0 ? 'PASS' : 'BLOCKED'), recomputed: row.id !== 'H03' })),
    routes: scene === 'source' ? sourceRoutes : approvedRoutes,
    sourceSelfReportReplay,
    sceneComparison,
  }
}

function key(x, z) { return `${x},${z}` }

export function createWhR1Navigation({ data = WH_R1_DATA, bounds = WH_R1_SITE, cellSize = .6, radius = .3 } = {}) {
  const width = Math.ceil((bounds.x1 - bounds.x0) / cellSize), height = Math.ceil((bounds.z1 - bounds.z0) / cellSize)
  const blocked = new Set()
  const doorBoxes = (data.doors || data.elements.filter(row => row.collisionRole === 'door_state_unresolved')).map(boxFor)
  const doorCells = new Set()
  for (const box of doorBoxes) {
    const x0 = Math.max(0, Math.floor((box.x0 - bounds.x0) / cellSize)), x1 = Math.min(width - 1, Math.ceil((box.x1 - bounds.x0) / cellSize))
    const z0 = Math.max(0, Math.floor((box.z0 - bounds.z0) / cellSize)), z1 = Math.min(height - 1, Math.ceil((box.z1 - bounds.z0) / cellSize))
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) doorCells.add(key(x, z))
  }
  for (const box of physicalBoxes(data, 'approved')) {
    const x0 = Math.max(0, Math.floor((box.x0 - radius - bounds.x0) / cellSize)), x1 = Math.min(width - 1, Math.ceil((box.x1 + radius - bounds.x0) / cellSize))
    const z0 = Math.max(0, Math.floor((box.z0 - radius - bounds.z0) / cellSize)), z1 = Math.min(height - 1, Math.ceil((box.z1 + radius - bounds.z0) / cellSize))
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) blocked.add(key(x, z))
  }
  const cellOf = ([x, z]) => [Math.max(0, Math.min(width - 1, Math.floor((x - bounds.x0) / cellSize))), Math.max(0, Math.min(height - 1, Math.floor((z - bounds.z0) / cellSize)))]
  const centerOf = ([x, z]) => [bounds.x0 + (x + .5) * cellSize, bounds.z0 + (z + .5) * cellSize]
  const isWalkable = (x, z) => x >= 0 && z >= 0 && x < width && z < height && !blocked.has(key(x, z))
  const canEnter = (x, z, allowUnknown = false) => isWalkable(x, z) && (allowUnknown || !doorCells.has(key(x, z)))
  const neighbors = ([x, z], allowUnknown = false) => {
    const candidates = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    return candidates.map(([dx, dz]) => [x + dx, z + dz, dx, dz]).filter(([nx, nz, dx, dz]) => {
      if (!canEnter(nx, nz, allowUnknown)) return false
      return !dx || !dz || (canEnter(x + dx, z, allowUnknown) && canEnter(x, z + dz, allowUnknown))
    })
  }
  const findPath = (start, goal, { allowUnknown = false } = {}) => {
    const s = cellOf(start), g = cellOf(goal), sk = key(...s), gk = key(...g)
    if (!canEnter(...s, allowUnknown) || !canEnter(...g, allowUnknown)) return []
    const open = new MinHeap(), came = new Map(), gScore = new Map([[sk, 0]]), closed = new Set()
    open.push(s, 0, 0)
    const h = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
    while (open.size) {
      const current = open.pop().point, ck = key(...current)
      if (closed.has(ck)) continue
      closed.add(ck)
      if (ck === gk) { const out = [current]; let cursor = ck; while (came.has(cursor)) { const prev = came.get(cursor); out.unshift(prev); cursor = key(...prev) } return out.map(centerOf) }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = [current[0] + dx, current[1] + dz]; if (!canEnter(...next, allowUnknown)) continue
        if (dx && dz && (!canEnter(current[0] + dx, current[1], allowUnknown) || !canEnter(current[0], current[1] + dz, allowUnknown))) continue
        const nk = key(...next), score = (gScore.get(ck) ?? Infinity) + Math.hypot(dx, dz)
        if (score < (gScore.get(nk) ?? Infinity)) { came.set(nk, current); gScore.set(nk, score); open.push(next, score, score + h(next, g)) }
      }
    }
    return []
  }
  const nearestWalkableInfo = (point, { allowUnknown = false } = {}) => {
    const c = cellOf(point)
    if (canEnter(...c, allowUnknown)) return { point: centerOf(c), offsetM: Math.hypot(centerOf(c)[0] - point[0], centerOf(c)[1] - point[1]) }
    for (let searchRadius = 1; searchRadius < Math.max(width, height); searchRadius++) {
      const candidates = []
      for (let x = c[0] - searchRadius; x <= c[0] + searchRadius; x++) for (let z = c[1] - searchRadius; z <= c[1] + searchRadius; z++) if (canEnter(x, z, allowUnknown)) candidates.push([x, z])
      if (candidates.length) {
        candidates.sort((a, b) => { const pa = centerOf(a), pb = centerOf(b); return Math.hypot(pa[0] - point[0], pa[1] - point[1]) - Math.hypot(pb[0] - point[0], pb[1] - point[1]) })
        const chosen = centerOf(candidates[0])
        return { point: chosen, offsetM: Math.hypot(chosen[0] - point[0], chosen[1] - point[1]) }
      }
    }
    return null
  }
  const nearestWalkable = (point, options) => nearestWalkableInfo(point, options)?.point || null
  const zonePoints = data.zones.map(zone => {
    const requested = pointWorld([(zone.sourceBboxM[0] + zone.sourceBboxM[2]) / 2, (zone.sourceBboxM[1] + zone.sourceBboxM[3]) / 2])
    const nearest = nearestWalkableInfo(requested)
    return { id: zone.id, requestedPoint: requested, point: nearest?.point || null, offsetM: nearest?.offsetM ?? Infinity }
  })
  const entryInfo = nearestWalkableInfo(pointWorld([0, 24]))
  const entry = entryInfo?.point || null
  const componentsFor = allowUnknown => {
    const ids = new Map(), components = []
    for (let x = 0; x < width; x++) for (let z = 0; z < height; z++) {
      const startKey = key(x, z); if (!canEnter(x, z, allowUnknown) || ids.has(startKey)) continue
      const id = components.length, queue = [[x, z]], cells = []
      ids.set(startKey, id)
      while (queue.length) {
        const current = queue.shift(); cells.push(current)
        for (const [nx, nz] of neighbors(current, allowUnknown)) {
          const nextKey = key(nx, nz); if (!canEnter(nx, nz, allowUnknown) || ids.has(nextKey)) continue
          ids.set(nextKey, id); queue.push([nx, nz])
        }
      }
      components.push({ id, cellCount: cells.length, areaM2: Number((cells.length * cellSize * cellSize).toFixed(3)), cells })
    }
    const zoneByComponent = components.map(component => ({ ...component, cells: undefined, zones: [] }))
    for (const zone of zonePoints) {
      const c = zone.point ? ids.get(key(...cellOf(zone.point))) : undefined
      if (c !== undefined) zoneByComponent[c].zones.push(zone.id)
    }
    return { ids, components: zoneByComponent }
  }
  const componentsClosed = componentsFor(false), componentsUnknownOpen = componentsFor(true)
  const pathLength = points => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0)
  const reachability = allowUnknown => Object.fromEntries(zonePoints.map(zone => {
    if (zone.offsetM > 3) return [zone.id, { status: 'ZONE_CENTER_BLOCKED', pathLength: null, centerOffsetM: Number(zone.offsetM.toFixed(3)) }]
    const path = entry && zone.point ? findPath(entry, zone.point, { allowUnknown }) : []
    return [zone.id, { status: path.length ? (allowUnknown ? 'REACHABLE_WITH_UNKNOWN_DOORS' : 'REACHABLE_STATIC') : 'UNREACHABLE', pathLength: path.length ? pathLength(path) : null, centerOffsetM: Number(zone.offsetM.toFixed(3)) }]
  }))
  return {
    bounds, cellSize, radius, width, height, blockedCells: blocked.size, doorCells: doorCells.size,
    physicalProxyCells: [...blocked], unknownDoors: doorBoxes.map(row => row.id),
    entry: entry ? { point: entry, offsetM: Number((entryInfo?.offsetM || 0).toFixed(3)) } : null,
    zonePoints,
    components: { doorsClosed: componentsClosed.components, doorsUnknownOpen: componentsUnknownOpen.components },
    connected: componentsUnknownOpen.components.length === 1,
    connectedByDoorState: { doorsClosed: componentsClosed.components.length === 1, doorsUnknownOpen: componentsUnknownOpen.components.length === 1 },
    isWalkable, findPath, nearestWalkable,
    reachabilityMatrix: { doorsClosed: reachability(false), doorsUnknownOpen: reachability(true), doorsUnknown: reachability(true) },
    pathLength,
  }
}

class MinHeap {
  constructor() { this.rows = [] }
  get size() { return this.rows.length }
  push(point, g, f) { this.rows.push({ point, g, f }); let i = this.rows.length - 1; while (i) { const parent = (i - 1) >> 1; if (this.rows[parent].f <= f) break; [this.rows[parent], this.rows[i]] = [this.rows[i], this.rows[parent]]; i = parent } }
  pop() { const first = this.rows[0], last = this.rows.pop(); if (this.rows.length) { this.rows[0] = last; let i = 0; while (true) { const l = i * 2 + 1, r = l + 1, child = r < this.rows.length && this.rows[r].f < this.rows[l].f ? r : l; if (l >= this.rows.length || this.rows[i].f <= this.rows[child].f) break; [this.rows[i], this.rows[child]] = [this.rows[child], this.rows[i]]; i = child } } return first }
}

export function buildWhR1Validation({ root } = {}) {
  const navigation = createWhR1Navigation()
  const validation = recomputeWhR1Integrity()
  if (root) { root.userData.whR1Validation = { notice: WH_R1_VALIDATION_NOTICE, lazy: true, routeCount: validation.routes.length, integrityCount: validation.integrity.length, hCount: validation.h01_h03.length }; root.userData.noMerge = true }
  return { navigation, validation, dispose() {} }
}
