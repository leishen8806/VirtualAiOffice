import { WH_R1_CONVEYOR_PATH } from '../dr-wh-r1-workflow.js'
import { WH_R1_PARKING_BAYS, whR1VehicleForSite } from '../wh-r1-site-plan.js'
import { WH_R1_DATA } from './data.js'
import { whToWorld } from '../wh-r1-layout.js'

const STEP_MS = 100
const INBOUND_PERIOD_MS = 12_000
const OUTBOUND_PERIOD_MS = 18_000
const MIN_CLEARANCE_M = .5
const vehicles = WH_R1_DATA.elements
  .map(whR1VehicleForSite)
  .filter(row => row.displayVehicleType === 'semitrailer' || row.displayVehicleType?.startsWith('delivery-'))
const bayById = new Map(WH_R1_PARKING_BAYS.map(row => [row.id, row]))
const firstRoad = WH_R1_CONVEYOR_PATH[0]
const point = (xM, yM) => { const p = whToWorld(xM, yM); return { x: p.x, z: p.z } }
const routeFor = (row, index) => {
  const bay = bayById.get(row.id)
  const start = point(row.xM, row.yM)
  const gate = firstRoad ? { x: firstRoad.x + index * 3.2, z: firstRoad.z + index * 1.4 } : start
  const dock = point(bay.xM, bay.yM)
  return row.displayVehicleType === 'semitrailer'
    ? [gate, dock, dock, gate]
    : [dock, gate]
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const interpolate = (route, t) => {
  const lengths = route.slice(1).map((b, i) => distance(route[i], b)), total = lengths.reduce((a, b) => a + b, 0)
  if (!total) return { ...route[0] }
  let left = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const a = route[i], b = route[i + 1], p = lengths[i] ? left / lengths[i] : 0
      return { x: a.x + (b.x - a.x) * p, z: a.z + (b.z - a.z) * p }
    }
    left -= lengths[i]
  }
  return { ...route.at(-1) }
}

export function createLive3StageB({ nowMs = 0 } = {}) {
  let time = Math.max(0, Number(nowMs) || 0), nextInbound = time, nextOutbound = time + 4_000, sequence = 0
  const active = new Map(), counters = { inbound: 0, outbound: 0 }, routes = new Map(vehicles.map((row, index) => [row.id, routeFor(row, index)]))
  const start = (row, kind) => {
    const route = routes.get(row.id)
    active.set(row.id, { id: row.id, kind, type: row.displayVehicleType, route, progress: 0, status: 'approach', startedAt: time, durationMs: kind === 'inbound' ? 8_000 : 6_000, payload: kind === 'inbound' })
    counters[kind]++
  }
  const complete = row => { row.status = 'departed'; row.progress = 1; row.completedAt = time }
  const advance = realMs => {
    const target = time + Math.max(0, Number(realMs) || 0)
    while (time < target) {
      time = Math.min(target, time + STEP_MS)
      if (time >= nextInbound) {
        const row = vehicles.filter(item => item.displayVehicleType === 'semitrailer').find(item => !active.has(item.id))
        if (row && active.size < 4) start(row, 'inbound')
        nextInbound += INBOUND_PERIOD_MS
      }
      if (time >= nextOutbound) {
        const row = vehicles.find(item => item.displayVehicleType?.startsWith('delivery-') && !active.has(item.id))
        if (row) start(row, 'outbound')
        nextOutbound += OUTBOUND_PERIOD_MS
      }
      for (const row of active.values()) {
        row.progress = Math.min(1, (time - row.startedAt) / row.durationMs)
        row.status = row.progress < .2 ? 'approach' : row.progress < .8 ? 'loading' : 'depart'
        if (row.progress >= 1) complete(row)
      }
      for (const [id, row] of active) if (row.progress >= 1 && time - row.completedAt > 500) active.delete(id)
    }
    return snapshot()
  }
  const snapshot = () => {
    const state = [...active.values()].map(row => ({ ...row, position: interpolate(row.route, row.progress) }))
    let minClearance = Infinity
    for (let i = 0; i < state.length; i++) for (let j = i + 1; j < state.length; j++) minClearance = Math.min(minClearance, distance(state[i].position, state[j].position))
    if (!Number.isFinite(minClearance)) minClearance = 999
    return Object.freeze({ nowMs: time, active: state, counters: { ...counters }, minClearanceM: minClearance, minClearanceOk: minClearance >= MIN_CLEARANCE_M })
  }
  return { advance, snapshot, vehicles, minClearanceM: MIN_CLEARANCE_M }
}

export const live3StageBConstants = Object.freeze({ STEP_MS, INBOUND_PERIOD_MS, OUTBOUND_PERIOD_MS, MIN_CLEARANCE_M })
