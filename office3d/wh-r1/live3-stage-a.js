import { createLive2Simulation, LIVE2_STAGE_CONFIG, LIVE2_STAGES } from './live2-sim.js'
import { LIVE3_BELT_LENGTH, LIVE3_BELT_TOP, LIVE3_STATIONS, live3BeltPoint } from './live3-stations.js'

export const LIVE3_SCALE_HOLD_MS = 1500
const BELT_M_PER_SECOND = 2
const scaleDistance = LIVE3_STATIONS[1].beltDistanceM
const exceptionDistance = LIVE3_STATIONS[2].beltDistanceM
const travelMs = distance => distance / BELT_M_PER_SECOND * 1000
const qualityTravelMs = travelMs(exceptionDistance)
const stageConfig = {
  ...LIVE2_STAGE_CONFIG,
  quality: { workers: 1, durationMs: qualityTravelMs + LIVE3_SCALE_HOLD_MS, jitter: false },
  conveyor: { workers: 2, durationMs: travelMs(LIVE3_BELT_LENGTH), jitter: false },
}

export function live3ConveyorPose(task, nowMs) {
  const elapsed = Math.max(0, nowMs - task.startedAt)
  if (task.stage === 'conveyor') {
    return { ...live3BeltPoint(elapsed * BELT_M_PER_SECOND / 1000), action: 'conveyor' }
  }
  if (task.stage !== 'quality') return null
  const scaleArrivalMs = travelMs(scaleDistance)
  const heldMs = Math.max(0, Math.min(LIVE3_SCALE_HOLD_MS, elapsed - scaleArrivalMs))
  const distance = Math.min(exceptionDistance, (elapsed - heldMs) * BELT_M_PER_SECOND / 1000)
  const weighing = elapsed >= scaleArrivalMs && elapsed < scaleArrivalMs + LIVE3_SCALE_HOLD_MS
  const onPlate = Math.abs(distance - scaleDistance) < .275 + .11
  const scanning = Math.abs(distance - LIVE3_STATIONS[0].beltDistanceM) <= .45
  return { ...live3BeltPoint(distance, LIVE3_BELT_TOP + (onPlate ? .03 : 0)), action: weighing ? 'weigh' : scanning ? 'scan' : 'conveyor' }
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
  arrival: Object.freeze(['receiving-1', 'receiving-2']),
  quality: Object.freeze(['quality-1', 'quality-2']),
  putaway: Object.freeze(['putaway-1', 'putaway-2']),
  retrieve: Object.freeze(['picking-1', 'picking-2', 'picking-3', 'picking-4']),
  picking: Object.freeze(['picking-1', 'picking-2', 'picking-3']),
  conveyor: Object.freeze(['packing-1']),
  packing: Object.freeze(['packing-1', 'packing-2', 'packing-3']),
  staging: Object.freeze(['shipping-1', 'shipping-2']),
})

export function createLive3StageA(options = {}) {
  const base = createLive2Simulation({ stageConfig, multiplier: 1, ...options })
  const baseSnapshot = base.snapshot
  const snapshot = () => {
    const state = baseSnapshot()
    const tasks = state.tasks.map(task => ({ ...task, workerIds: LIVE3_WORKER_ASSIGNMENTS[task.stage] || [] }))
    return Object.freeze({ ...state, tasks, workerAssignments: LIVE3_WORKER_ASSIGNMENTS, stages: LIVE2_STAGES })
  }
  return { ...base, advance(realMs) { base.advance(realMs); return snapshot() }, snapshot }
}
