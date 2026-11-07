import { createR1Navigation } from './office-r1-navigation.js'
import { createOfficeR1Layout } from './office-vis2/r1-site.js'
import { r1ToWorld } from './office-r1-layout.js'

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
const segmentBox = (a, b, box) => {
  const corners = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]]
  const edges = corners.map((p, i) => [p, corners[(i + 1) % corners.length]])
  if (edges.some(([c, d]) => intersects(a, b, c, d)) || pointBox(...a, box) === 0 || pointBox(...b, box) === 0) return 0
  return Math.min(pointBox(...a, box), pointBox(...b, box), ...edges.map(([c, d]) => Math.min(pointBox(...c, { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }), pointBox(...a, { x0: Math.min(c[0], d[0]), x1: Math.max(c[0], d[0]), z0: Math.min(c[1], d[1]), z1: Math.max(c[1], d[1]) }))))
}

const obstacleRowsFor = (data, doorMode) => {
  const rows = data.elements.filter(row => row.lengthM > 0 && row.widthM > 0 && !['门洞/门总成', '门扇'].includes(row.category))
  if (doorMode === 'doorsClosed') return rows.concat((data.doors || []).filter(row => row.lengthM > 0 && row.widthM > 0))
  return rows
}

export function recomputeOfficeR1Routes({ layout = createOfficeR1Layout(), direction = 'forward', doorMode = 'doorsUnknownOpen' } = {}) {
  const data = layout.r1.data
  const boxes = obstacleRowsFor(data, doorMode).map(boxFor)
  return layout.r1.routes.map(route => {
    const forwardPoints = route.points_m.map(worldPoint), points = direction === 'reverse' ? [...forwardPoints].reverse() : forwardPoints, radius = Number(data.bodyProfiles[route.body_profile]?.radius_m || .6)
    let min = Infinity, nearest = null
    const segments = []
    for (let i = 1; i < points.length; i++) for (const box of boxes) {
      const clearance = segmentBox(points[i - 1], points[i], box) - radius
      if (clearance < min) { min = clearance; nearest = box.id }
    }
    for (let i = 1; i < points.length; i++) {
      let segmentMin = Infinity, segmentNearest = null
      for (const box of boxes) {
        const clearance = segmentBox(points[i - 1], points[i], box) - radius
        if (clearance < segmentMin) { segmentMin = clearance; segmentNearest = box.id }
      }
      segments.push({ index: i, start: points[i - 1], end: points[i], minClearanceMm: Number((segmentMin * 1000).toFixed(3)), nearestId: segmentNearest, status: segmentMin < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR' })
    }
    const minClearanceM = Number.isFinite(min) ? Number(min.toFixed(6)) : null
    return { id: route.id, bodyProfile: route.body_profile, direction, doorMode, pointsWorld: points, segments, minClearanceMm: minClearanceM === null ? null : Number((minClearanceM * 1000).toFixed(3)), nearestId: nearest, status: minClearanceM !== null && minClearanceM < 0 ? 'BLOCKED' : 'CONDITIONAL_STATIC_CLEAR', notice: OFFICE_R1_VALIDATION_NOTICE }
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
