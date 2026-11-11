import { createLive2Simulation, LIVE2_STAGE_CONFIG, LIVE2_STAGES } from './live2-sim.js'
import { LIVE3_BELT_LENGTH, LIVE3_BELT_TOP, LIVE3_STATIONS, live3BeltPoint } from './live3-stations.js'

export const LIVE3_SCALE_HOLD_MS = 1500
const BELT_M_PER_SECOND = 2
const OUTBOUND_BELT_M_PER_SECOND = 1
const ORDER_INTERVAL_MS = 900
const QUALITY_HEADWAY_MS = 1800
export const LIVE3_DEMO_WARMUP_MS = 125000
export const live3DemonstrationSlot = id => /^WH-03-RK-01-W-B0[1-3]-L01-P0[12]$/.test(id)
const scaleDistance = LIVE3_STATIONS[1].beltDistanceM
const exceptionDistance = LIVE3_STATIONS[2].beltDistanceM
const travelMs = distance => distance / BELT_M_PER_SECOND * 1000
const qualityTravelMs = travelMs(exceptionDistance)
const stageConfig = {
  ...LIVE2_STAGE_CONFIG,
  quality: { workers: 7, durationMs: qualityTravelMs + LIVE3_SCALE_HOLD_MS, startGapMs: QUALITY_HEADWAY_MS, jitter: false },
  putaway: { workers: 2, durationMs: 3500, jitter: false },
  retrieve: { workers: 4, durationMs: 6500, jitter: false },
  conveyor: { workers: 64, durationMs: LIVE3_BELT_LENGTH / OUTBOUND_BELT_M_PER_SECOND * 1000, startGapMs: 1500, jitter: false },
  packing: { workers: 2, durationMs: 3600, jitter: false },
  staging: { workers: 5, durationMs: 7800, jitter: false },
}

export function live3ConveyorPose(task, nowMs) {
  const elapsed = Math.max(0, nowMs - task.startedAt)
  if (task.stage === 'conveyor') {
    const distance = elapsed * OUTBOUND_BELT_M_PER_SECOND / 1000
    const onPlate = Math.abs(distance - scaleDistance) < .275 + .11
    const point = live3BeltPoint(distance, LIVE3_BELT_TOP + (onPlate ? .03 : 0))
    const offset = .16 * Math.max(0, Math.min(1, (24 - distance) / 2))
    return { ...point, z: point.z + offset, action: 'conveyor' }
  }
  if (task.stage !== 'quality') return null
  const scaleArrivalMs = travelMs(scaleDistance)
  const heldMs = Math.max(0, Math.min(LIVE3_SCALE_HOLD_MS, elapsed - scaleArrivalMs))
  const distance = Math.min(exceptionDistance, (elapsed - heldMs) * BELT_M_PER_SECOND / 1000)
  const weighing = elapsed >= scaleArrivalMs && elapsed < scaleArrivalMs + LIVE3_SCALE_HOLD_MS
  const onPlate = Math.abs(distance - scaleDistance) < .275 + .11
  const scanning = Math.abs(distance - LIVE3_STATIONS[0].beltDistanceM) <= .45
  const point = live3BeltPoint(distance, LIVE3_BELT_TOP + (onPlate ? .03 : 0))
  return { ...point, z: point.z - .16, action: weighing ? 'weigh' : scanning ? 'scan' : 'conveyor' }
}

export function live3Board(state) {
  return {
    opening: state.initialOnHand,
    inbound: state.counters.received,
    outbound: state.counters.shipped,
    inventory: state.onHand,
    exceptions: state.counters.exceptions,
    averageProcessingMs: state.averageProcessingMs,
    active: Object.fromEntries(LIVE2_STAGES.map(stage => [stage, state.stageStats[stage].active])),
  }
}

export const LIVE3_WORKER_ASSIGNMENTS = Object.freeze({
  arrival: Object.freeze(['lead-1']),
  quality: Object.freeze(['receiving-2', 'receiving-1']),
  putaway: Object.freeze(['picking-2']),
  retrieve: Object.freeze(['picking-1']),
  picking: Object.freeze(['picking-1']),
  conveyor: Object.freeze([]),
  packing: Object.freeze(['packing-1', 'packing-2']),
  staging: Object.freeze(['shipping-1']),
})

export function createLive3StageA(options = {}) {
  const base = createLive2Simulation({ stageConfig, multiplier: 1, alternateKinds: true, orderIntervalMs: ORDER_INTERVAL_MS, preferSlot: live3DemonstrationSlot, ...options })
  const baseSnapshot = base.snapshot
  const snapshot = () => {
    const state = baseSnapshot()
    const tasks = state.tasks.map(task => ({ ...task, workerIds: LIVE3_WORKER_ASSIGNMENTS[task.stage] || [] }))
    return Object.freeze({ ...state, tasks, workerAssignments: LIVE3_WORKER_ASSIGNMENTS, stages: LIVE2_STAGES })
  }
  return { ...base, advance(realMs) { base.advance(realMs); return snapshot() }, snapshot }
}
