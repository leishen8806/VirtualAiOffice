import { createR1Navigation } from './office-r1-navigation.js'
import { createOfficeR1Layout } from './office-vis2/r1-site.js'
import { r1ToWorld } from './office-r1-layout.js'
import { r1DensePlan } from './office-vis2/r1-dense-garden.js'
import { r1LookPlantElements } from './office-vis2/r1-look.js'
import { R1_DECOR } from './office-vis2/r1-decor.js'
import { plantFootprintSamples } from './office-vis2/r1-plant-footprints.js'

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

export const plantObstaclesFor = (layout) => {
  const obstacles = []
  const addFoliage = (row) => plantFootprintSamples(row).forEach(sample => obstacles.push({ id: row.id, kind: 'foliage', x: sample.x, z: sample.z, r: sample.r }))
  const dense = r1DensePlan(layout)
  for (const row of dense.plants) addFoliage(row)
  for (const row of [...dense.troughs, ...dense.gardens]) addFoliage(row)
  for (const row of r1LookPlantElements().filter(item => item.category === '植物总成')) addFoliage({ id: row.id, x: row.xM - 26, z: 18 - row.yM, r: Math.max(row.lengthM, row.widthM) / 2 })
  const allRegistered = [...layout.r1.elements, ...r1LookPlantElements()]
  for (const row of allRegistered.filter(item => item.category === '植物总成' && item.id.match(/^\d{2}-PL-/))) {
    const kin = allRegistered.filter(item => item.id === row.id || item.parentId === row.id)
    const half = Math.max(...kin.map(item => Math.max(item.lengthM || 0, item.widthM || 0) / 2))
    const p = r1ToWorld(row.xM, row.yM)
    obstacles.push({ id: row.id, kind: 'registered', x: p.x, z: p.z, r: half })
  }
  return obstacles
}

// These are the measured low (<=2.1 m) model extents after the house FURN_SCALE=2 transform.
// Keeping the certified extents here avoids loading GLB data in the pure route validator.
export const DECOR_EXTENTS = Object.freeze({ coatRack: [0.896, 0.268], trashcan: [0.4154, 0.4682], speaker: [0.296, 0.296], lampSquareFloor: [0.24, 0.24], sideTable: [1.0689, 0.44], rugRectangle: [3.14, 1.84] })
const decorObstaclesFor = () => R1_DECOR.filter(row => row.collide).map(row => {
  const world = r1ToWorld(row.xM, row.yM), [width, depth] = DECOR_EXTENTS[row.model] || [0, 0], angle = (row.rotYDeg || 0) * Math.PI / 180
  const halfX = (Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * depth)) / 2
  const halfZ = (Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * depth)) / 2
  return { id: row.id, x0: world.x - halfX, x1: world.x + halfX, z0: world.z - halfZ, z1: world.z + halfZ }
})
const DECOR_OBSTACLES = decorObstaclesFor()

export function recomputeOfficeR1Routes({ layout = createOfficeR1Layout(), direction = 'forward', doorMode = 'doorsUnknownOpen' } = {}) {
  const data = layout.r1.data
  const boxes = obstacleRowsFor(data, doorMode).map(boxFor)
  const plants = plantObstaclesFor(layout), decor = DECOR_OBSTACLES
  const plantClearance = (a, b, obstacle) => obstacle.kind === 'registered'
    ? pointSegmentDistance([obstacle.x, obstacle.z], a, b) - obstacle.r - .6
    : pointSegmentDistance([obstacle.x, obstacle.z], a, b) - obstacle.r - .6 - .3
  return layout.r1.routes.map(route => {
    const forwardPoints = route.points_m.map(worldPoint), points = direction === 'reverse' ? [...forwardPoints].reverse() : forwardPoints, radius = Number(data.bodyProfiles[route.body_profile]?.radius_m || .6)
    let min = Infinity, nearest = null, plantMin = Infinity, nearestPlant = null, decorMin = Infinity, nearestDecor = null
    const segments = []
    for (let i = 1; i < points.length; i++) for (const box of boxes) {
      const clearance = segmentBox(points[i - 1], points[i], box) - radius
      if (clearance < min) { min = clearance; nearest = box.id }
    }
    for (let i = 1; i < points.length; i++) {
      for (const obstacle of plants) { const clearance = plantClearance(points[i - 1], points[i], obstacle); if (obstacle.kind !== 'registered' || clearance < 0) if (clearance < plantMin) { plantMin = clearance; nearestPlant = obstacle.id } }
      for (const obstacle of decor) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .6; if (clearance < decorMin) { decorMin = clearance; nearestDecor = obstacle.id } }
    }
    for (let i = 1; i < points.length; i++) {
      let segmentMin = Infinity, segmentNearest = null
      for (const box of boxes) {
        const clearance = segmentBox(points[i - 1], points[i], box) - radius
        if (clearance < segmentMin) { segmentMin = clearance; segmentNearest = box.id }
      }
      let segmentPlant = Infinity, segmentPlantId = null, segmentDecor = Infinity, segmentDecorId = null
      for (const obstacle of plants) { const clearance = plantClearance(points[i - 1], points[i], obstacle); if (obstacle.kind !== 'registered' || clearance < 0) if (clearance < segmentPlant) { segmentPlant = clearance; segmentPlantId = obstacle.id } }
      for (const obstacle of decor) { const clearance = segmentBox(points[i - 1], points[i], obstacle) - .6; if (clearance < segmentDecor) { segmentDecor = clearance; segmentDecorId = obstacle.id } }
      const worst = Math.min(segmentMin, segmentPlant, segmentDecor)
      const metric = plants.find(p => p.id === segmentPlantId)?.kind === 'registered' ? 'registered-low-canopy-vertex-0.6m' : 'foliage-radius-plus-human-0.6m-threshold-0.3m'
      segments.push({ index: i, start: points[i - 1], end: points[i], minClearanceMm: Number((segmentMin * 1000).toFixed(3)), nearestId: segmentNearest, plantClearanceMm: Number((segmentPlant * 1000).toFixed(3)), nearestPlantId: segmentPlantId, plantMetric: metric, decorClearanceMm: Number((segmentDecor * 1000).toFixed(3)), nearestDecorId: segmentDecorId, status: worst < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR' })
    }
    const minClearanceM = Number.isFinite(min) ? Number(min.toFixed(6)) : null
    const worst = Math.min(min, plantMin, decorMin)
    const metric = plants.find(p => p.id === nearestPlant)?.kind === 'registered' ? 'registered-low-canopy-vertex-0.6m' : 'foliage-radius-plus-human-0.6m-threshold-0.3m'
    return { id: route.id, bodyProfile: route.body_profile, direction, doorMode, pointsWorld: points, segments, minClearanceMm: minClearanceM === null ? null : Number((minClearanceM * 1000).toFixed(3)), nearestId: nearest, plantClearanceMm: Number((plantMin * 1000).toFixed(3)), nearestPlantId: nearestPlant, plantMetric: metric, decorClearanceMm: Number((decorMin * 1000).toFixed(3)), nearestDecorId: nearestDecor, status: worst < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR', notice: OFFICE_R1_VALIDATION_NOTICE }
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
