import { whR1VehicleForSite } from '../wh-r1-site-plan.js'
import { WH_R1_DATA } from './data.js'
import { poseOnRoute, routeForVehicle } from './live3-routes.js'

const STEP_MS = 100, INBOUND_PERIOD_MS = 18_000, OUTBOUND_PERIOD_MS = 18_000, MIN_CLEARANCE_M = .5
const vehicles = WH_R1_DATA.elements.map(whR1VehicleForSite).filter(row => row.displayVehicleType === 'semitrailer' || row.displayVehicleType?.startsWith('delivery-'))
const routes = new Map(vehicles.map(row => [row.id, routeForVehicle(row)]))
export function createLive3StageB({ nowMs = 0 } = {}) {
  let time = Math.max(0, Number(nowMs) || 0), nextInbound = time, nextOutbound = time + 9_000
  const active = new Map(), counters = { inbound: 0, outbound: 0 }
  const start = (row, kind) => { const route = routes.get(row.id); active.set(row.id, { id: row.id, kind, type: row.displayVehicleType, route: route.points, laneWidthM: route.laneWidthM, turningRadiusM: route.turningRadiusM, progress: 0, reverseAt: kind === 'inbound' ? .4 : -1, status: kind === 'inbound' ? 'approach' : 'loading', startedAt: time, durationMs: kind === 'inbound' ? 15_000 : 12_000 }); counters[kind]++ }
  const spawnClear = route => [...active.values()].every(row => { const p = poseOnRoute(row.route, row.progress, row.status === 'reverse_in'); return Math.hypot(p.x - route.points[0].x, p.z - route.points[0].z) >= 12 })
  const snapshot = () => {
    const activeRows = [...active.values()].map(row => ({ ...row, position: poseOnRoute(row.route, row.progress, row.status === 'reverse_in') }))
    let minClearance = Infinity
    for (let i = 0; i < activeRows.length; i++) for (let j = i + 1; j < activeRows.length; j++) minClearance = Math.min(minClearance, Math.hypot(activeRows[i].position.x - activeRows[j].position.x, activeRows[i].position.z - activeRows[j].position.z))
    if (!Number.isFinite(minClearance)) minClearance = 999
    return Object.freeze({ nowMs: time, active: activeRows, counters: { ...counters }, minClearanceM: minClearance, minClearanceOk: minClearance >= MIN_CLEARANCE_M })
  }
  const advance = realMs => { const target = time + Math.max(0, Number(realMs) || 0); while (time < target) { time = Math.min(target, time + STEP_MS); if (time >= nextInbound && ![...active.values()].some(item => item.kind === 'inbound')) { const row = vehicles.find(item => item.displayVehicleType === 'semitrailer' && !active.has(item.id)), route = row && routes.get(row.id); if (row && spawnClear(route)) nextInbound += INBOUND_PERIOD_MS, start(row, 'inbound') } if (time >= nextOutbound && ![...active.values()].some(item => item.kind === 'outbound')) { const row = vehicles.find(item => item.displayVehicleType?.startsWith('delivery-') && !active.has(item.id)), route = row && routes.get(row.id); if (row && spawnClear(route)) nextOutbound += OUTBOUND_PERIOD_MS, start(row, 'outbound') } for (const row of active.values()) { row.progress = Math.min(1, (time - row.startedAt) / row.durationMs); row.status = row.kind === 'inbound' ? (row.progress < row.reverseAt ? 'approach' : row.progress < .55 ? 'reverse_in' : row.progress < .72 ? 'unloading' : 'depart') : (row.progress < .18 ? 'loading' : 'depart'); if (row.progress === 1 && row.completedAt === undefined) row.completedAt = time } for (const [id, row] of active) if (row.progress === 1 && time - row.completedAt > 500) active.delete(id) } return snapshot() }
  return { advance, snapshot, vehicles, routes, minClearanceM: MIN_CLEARANCE_M }
}
export const live3StageBConstants = Object.freeze({ STEP_MS, INBOUND_PERIOD_MS, OUTBOUND_PERIOD_MS, MIN_CLEARANCE_M })
