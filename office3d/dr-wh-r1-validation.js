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

const physicalBoxes = (data, scene = 'source') => {
  const boxes = data.elements.filter(row => row.collisionRole === 'physical_proxy').map(boxFor)
  if (scene === 'approved') {
    boxes.push(...WH_R1_PARKING_BAYS.map(boxFor))
    boxes.push(...WH_R1_ANNEX.walls.map(boxFor), ...WH_R1_ANNEX.doors.map(boxFor))
  }
  return boxes
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
      nearestId: nearest, status: route.status || 'CONDITIONAL_STATIC_CLEAR',
      selfReported: reported ? { status: reported.status, min_clearance_mm: reported.min_clearance_mm, notes: reported.notes } : null,
      notice: WH_R1_VALIDATION_NOTICE,
    }
  })
}

export function recomputeWhR1Integrity({ data = WH_R1_DATA, scene = 'approved' } = {}) {
  const audit = data.integrityAudit || {}
  return {
    scene, notice: WH_R1_VALIDATION_NOTICE,
    integrity: (audit.integrity || []).map(row => ({ ...row, sourceStatus: row.status })),
    arithmeticChecks: (audit.arithmeticChecks || []).map(row => ({ ...row, sourceStatus: row.status })),
    h01_h03: data.passageChecks.slice(0, 3).map(row => ({ ...row })),
    routes: recomputeWhR1Routes({ data, scene }),
  }
}

function key(x, z) { return `${x},${z}` }

export function createWhR1Navigation({ data = WH_R1_DATA, bounds = WH_R1_SITE, cellSize = .6, radius = .3 } = {}) {
  const width = Math.ceil((bounds.x1 - bounds.x0) / cellSize), height = Math.ceil((bounds.z1 - bounds.z0) / cellSize)
  const blocked = new Set()
  for (const box of physicalBoxes(data, 'approved')) {
    const x0 = Math.max(0, Math.floor((box.x0 - radius - bounds.x0) / cellSize)), x1 = Math.min(width - 1, Math.ceil((box.x1 + radius - bounds.x0) / cellSize))
    const z0 = Math.max(0, Math.floor((box.z0 - radius - bounds.z0) / cellSize)), z1 = Math.min(height - 1, Math.ceil((box.z1 + radius - bounds.z0) / cellSize))
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) blocked.add(key(x, z))
  }
  const cellOf = ([x, z]) => [Math.max(0, Math.min(width - 1, Math.floor((x - bounds.x0) / cellSize))), Math.max(0, Math.min(height - 1, Math.floor((z - bounds.z0) / cellSize)))]
  const centerOf = ([x, z]) => [bounds.x0 + (x + .5) * cellSize, bounds.z0 + (z + .5) * cellSize]
  const isWalkable = (x, z) => x >= 0 && z >= 0 && x < width && z < height && !blocked.has(key(x, z))
  const findPath = (start, goal) => {
    const s = cellOf(start), g = cellOf(goal), sk = key(...s), gk = key(...g)
    if (!isWalkable(...s) || !isWalkable(...g)) return []
    const open = [s], came = new Map(), gScore = new Map([[sk, 0]])
    const h = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
    while (open.length) {
      let at = 0; for (let i = 1; i < open.length; i++) if ((gScore.get(key(...open[i])) || Infinity) + h(open[i], g) < (gScore.get(key(...open[at])) || Infinity) + h(open[at], g)) at = i
      const current = open.splice(at, 1)[0], ck = key(...current)
      if (ck === gk) { const out = [current]; let cursor = ck; while (came.has(cursor)) { const prev = came.get(cursor); out.unshift(prev); cursor = key(...prev) } return out.map(centerOf) }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = [current[0] + dx, current[1] + dz]; if (!isWalkable(...next)) continue
        const nk = key(...next), score = (gScore.get(ck) || Infinity) + Math.hypot(dx, dz)
        if (score < (gScore.get(nk) || Infinity)) { came.set(nk, current); gScore.set(nk, score); if (!open.some(item => item[0] === next[0] && item[1] === next[1])) open.push(next) }
      }
    }
    return []
  }
  return { bounds, cellSize, radius, width, height, blockedCells: blocked.size, isWalkable, findPath, pathLength: points => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0) }
}

export function buildWhR1Validation({ root } = {}) {
  const navigation = createWhR1Navigation()
  const validation = recomputeWhR1Integrity()
  if (root) { root.userData.whR1Validation = { notice: WH_R1_VALIDATION_NOTICE, lazy: true, routeCount: validation.routes.length, integrityCount: validation.integrity.length, hCount: validation.h01_h03.length }; root.userData.noMerge = true }
  return { navigation, validation, dispose() {} }
}
