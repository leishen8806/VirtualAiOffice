import { createR1Navigation } from './office-r1-navigation.js'
import { createOfficeR1Layout } from './office-vis2/r1-site.js'
import { r1ToWorld } from './office-r1-layout.js'
import { R1_CLUSTER_PLANTS } from './office-vis2/r1-cluster-plan.js'
import { R1_LANDSCAPE } from './office-vis2/r1-landscape-plan.js'
import { R1_DECOR } from './office-vis2/r1-decor.js'

export const OFFICE_R1_VALIDATION_NOTICE = '静态局部几何，不是端到端动态验收'
const finite = value => Number.isFinite(value) ? value : 0
const worldPoint = ([x, y]) => { const p = r1ToWorld(x, y); return [p.x, p.z] }
const boxFor = row => {
  const p = r1ToWorld(row.xM || 0, row.yM || 0), x = p.x, z = p.z
  const length = Math.max(.02, finite(row.lengthM)), width = Math.max(.02, finite(row.widthM))
  const rotated = Math.abs((row.yawDeg || 0) % 180) > 45
  const halfX = (rotated ? width : length) / 2, halfZ = (rotated ? length : width) / 2
  return { id: row.id, x0: x - halfX, x1: x + halfX, z0: z - halfZ, z1: z + halfZ }
}
const pointBox = (x, z, box) => Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1))
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const intersects = (a, b, c, d) => {
  const ab1 = orient(a, b, c), ab2 = orient(a, b, d), cd1 = orient(c, d, a), cd2 = orient(c, d, b)
  return ab1 * ab2 <= 0 && cd1 * cd2 <= 0 && Math.min(a[0], b[0]) <= Math.max(c[0], d[0]) && Math.min(c[0], d[0]) <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= Math.max(c[1], d[1]) && Math.min(c[1], d[1]) <= Math.max(a[1], b[1])
}
const pointSegmentDistance = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
const segmentSegmentDistance = (a, b, c, d) => intersects(a, b, c, d) ? 0 : Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
const segmentBox = (a, b, box) => {
  const corners = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]]
  const edges = corners.map((p, i) => [p, corners[(i + 1) % corners.length]])
  if (edges.some(([c, d]) => intersects(a, b, c, d)) || pointBox(...a, box) === 0 || pointBox(...b, box) === 0) return 0
  return Math.min(...edges.map(([c, d]) => segmentSegmentDistance(a, b, c, d)))
}

const obstacleRowsFor = (data, doorMode) => {
  const rows = data.elements.filter(row => row.lengthM > 0 && row.widthM > 0 && !['门洞/门总成', '门扇'].includes(row.category))
  if (doorMode === 'doorsClosed') return rows.concat((data.doors || []).filter(row => row.lengthM > 0 && row.widthM > 0))
  return rows
}

// Keep the route checker on the same footprint sampling rule used by the foliage tests.
const plantFootprintSamples = (row, step = .05) => {
  if (Number.isFinite(row.r)) return [{ x: row.x, z: row.z, r: row.r }]
  const n = Math.ceil(row.length / step), width = row.wall ? .3 : row.width
  if (!Number.isFinite(row.length) || row.length <= 0 || !Number.isFinite(width) || width <= 0) return []
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = (i / n - .5) * row.length
    if (row.shape === 'arc') { const a = row.startDeg * Math.PI / 180 + (u + row.length / 2) / row.radius; return { x: row.x + row.radius * Math.cos(a), z: row.z + row.radius * Math.sin(a), r: width / 2 } }
    const a = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180
    return { x: row.x + u * Math.cos(a), z: row.z + u * Math.sin(a), r: width / 2 }
  })
}

const plantObstaclesFor = () => {
  const obstacles = []
  for (const row of R1_CLUSTER_PLANTS) for (const sample of plantFootprintSamples(row)) obstacles.push({ id: row.id, x0: sample.x - sample.r, x1: sample.x + sample.r, z0: sample.z - sample.r, z1: sample.z + sample.r })
  for (const row of [...R1_LANDSCAPE.troughs, ...R1_LANDSCAPE.gardens]) for (const sample of plantFootprintSamples(row)) obstacles.push({ id: row.id, x0: sample.x - sample.r, x1: sample.x + sample.r, z0: sample.z - sample.r, z1: sample.z + sample.r })
  return obstacles
}

// These are the measured low (<=2.1 m) model extents after the house FURN_SCALE=2 transform.
// Keeping the certified extents here avoids loading GLB data in the pure route validator.
const DECOR_EXTENTS = Object.freeze({ coatRack: [0.896, 0.268], trashcan: [0.4154, 0.4682], speaker: [0.296, 0.296], lampSquareFloor: [0.24, 0.24], sideTable: [1.0689, 0.44], rugRectangle: [3.14, 1.84] })
const decorObstaclesFor = () => R1_DECOR.filter(row => row.collide).map(row => {
  const world = r1ToWorld(row.xM, row.yM), [width, depth] = DECOR_EXTENTS[row.model] || [0, 0], angle = (row.rotYDeg || 0) * Math.PI / 180
  const halfX = (Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * depth)) / 2
  const halfZ = (Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * depth)) / 2
  return { id: row.id, x0: world.x - halfX, x1: world.x + halfX, z0: world.z - halfZ, z1: world.z + halfZ }
})
const PLANT_OBSTACLES = plantObstaclesFor()
const DECOR_OBSTACLES = decorObstaclesFor()

export function recomputeOfficeR1Routes({ layout = createOfficeR1Layout(), direction = 'forward', doorMode = 'doorsUnknownOpen' } = {}) {
  const data = layout.r1.data
  const boxes = obstacleRowsFor(data, doorMode).map(boxFor)
  const plants = PLANT_OBSTACLES, decor = DECOR_OBSTACLES
  return layout.r1.routes.map(route => {
    const forwardPoints = route.points_m.map(worldPoint), points = direction === 'reverse' ? [...forwardPoints].reverse() : forwardPoints, radius = Number(data.bodyProfiles[route.body_profile]?.radius_m || .6)
    let min = Infinity, nearest = null, plantMin = Infinity, nearestPlant = null, decorMin = Infinity, nearestDecor = null
    const segments = []
    for (let i = 1; i < points.length; i++) for (const box of boxes) {
      const clearance = segmentBox(points[i - 1], points[i], box) - radius
      if (clearance < min) { min = clearance; nearest = box.id }
    }
    for (let i = 1; i < points.length; i++) {
      for (const obstacle of plants) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .3; if (clearance < plantMin) { plantMin = clearance; nearestPlant = obstacle.id } }
      for (const obstacle of decor) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .6; if (clearance < decorMin) { decorMin = clearance; nearestDecor = obstacle.id } }
    }
    for (let i = 1; i < points.length; i++) {
      let segmentMin = Infinity, segmentNearest = null
      for (const box of boxes) {
        const clearance = segmentBox(points[i - 1], points[i], box) - radius
        if (clearance < segmentMin) { segmentMin = clearance; segmentNearest = box.id }
      }
      let segmentPlant = Infinity, segmentPlantId = null, segmentDecor = Infinity, segmentDecorId = null
      for (const obstacle of plants) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .3; if (clearance < segmentPlant) { segmentPlant = clearance; segmentPlantId = obstacle.id } }
      for (const obstacle of decor) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .6; if (clearance < segmentDecor) { segmentDecor = clearance; segmentDecorId = obstacle.id } }
      const worst = Math.min(segmentMin, segmentPlant, segmentDecor)
      segments.push({ index: i, start: points[i - 1], end: points[i], minClearanceMm: Number((segmentMin * 1000).toFixed(3)), nearestId: segmentNearest, plantClearanceMm: Number((segmentPlant * 1000).toFixed(3)), nearestPlantId: segmentPlantId, decorClearanceMm: Number((segmentDecor * 1000).toFixed(3)), nearestDecorId: segmentDecorId, status: worst < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR' })
    }
    const minClearanceM = Number.isFinite(min) ? Number(min.toFixed(6)) : null
    const worst = Math.min(min, plantMin, decorMin)
    return { id: route.id, bodyProfile: route.body_profile, direction, doorMode, pointsWorld: points, segments, minClearanceMm: minClearanceM === null ? null : Number((minClearanceM * 1000).toFixed(3)), nearestId: nearest, plantClearanceMm: Number((plantMin * 1000).toFixed(3)), nearestPlantId: nearestPlant, decorClearanceMm: Number((decorMin * 1000).toFixed(3)), nearestDecorId: nearestDecor, status: worst < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR', notice: OFFICE_R1_VALIDATION_NOTICE }
  })
}

export function compareOfficeR1SelfReport({ recomputed = [], selfReported = [] } = {}) {
  const byId = new Map(recomputed.map(row => [row.id, row]))
  return selfReported.map(row => {
    const actual = byId.get(row.id)
    return { id: row.id, statedStatus: row.status ?? null, statedMinClearanceMm: row.minimum_margin_mm ?? null, recomputedStatus: actual?.status ?? 'NOT_RECOMPUTED', recomputedMinClearanceMm: actual?.minClearanceMm ?? null, deltaMm: actual && Number.isFinite(row.minimum_margin_mm) && Number.isFinite(actual.minClearanceMm) ? Number((actual.minClearanceMm - row.minimum_margin_mm).toFixed(3)) : null }
  })
}

export function recomputeOfficeR1Integrity({ layout = createOfficeR1Layout(), doorMode = 'doorsUnknownOpen' } = {}) {
  const data = layout.r1.data, routes = recomputeOfficeR1Routes({ layout, doorMode }), reverseRoutes = recomputeOfficeR1Routes({ layout, direction: 'reverse', doorMode }), scenarios = { doorsClosed: recomputeOfficeR1Routes({ layout, doorMode: 'doorsClosed' }), doorsUnknownOpen: recomputeOfficeR1Routes({ layout, doorMode: 'doorsUnknownOpen' }) }, byRoute = new Map(routes.map(row => [row.id, row]))
  const checks = data.checks.map(check => {
    if (check.id === 'element_identity') return { id: check.id, status: new Set(data.elements.map(row => row.id)).size === data.elements.length ? 'PASS' : 'BLOCKED', recomputed: true, elementCount: data.elements.length }
    const routeId = String(check.id).replace(/^route:/, '')
    const route = byRoute.get(routeId)
    return route ? { id: check.id, status: route.status === 'BLOCKED' ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR', minClearanceMm: route.minClearanceMm, nearestId: route.nearestId, recomputed: true } : { id: check.id, status: 'PASS_THROUGH_NOT_RECOMPUTED', recomputed: false }
  })
  const selfReported = data.routeReports.map(row => ({ id: row.id, status: row.status, minimum_margin_mm: row.minimum_margin_mm ?? null }))
  return { notice: OFFICE_R1_VALIDATION_NOTICE, routeCount: routes.length, checkCount: checks.length, doorMode, routes, reverseRoutes, scenarios, checks, selfReported, selfReportComparison: compareOfficeR1SelfReport({ recomputed: routes, selfReported }) }
}

export function buildOfficeR1Validation({ root, layout = createOfficeR1Layout() } = {}) {
  const navigation = createR1Navigation(layout), validation = recomputeOfficeR1Integrity({ layout })
  if (root) { root.userData.officeR1Validation = { notice: OFFICE_R1_VALIDATION_NOTICE, routeCount: validation.routeCount, checkCount: validation.checkCount, lazy: true }; root.userData.noMerge = true }
  return { navigation, validation, dispose() {} }
}
