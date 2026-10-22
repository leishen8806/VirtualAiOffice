import { FOYER_QUEUES, FOYER_TARGETS, WAITING_SEATS, foyerReturnTrip, foyerTrip, plazaTrip } from './office-layout.js'

const STAND_DWELL = Object.freeze([90_000, 240_000])
const BRIEF_DWELL = Object.freeze([30_000, 90_000])
const SIT_DWELL = Object.freeze([120_000, 360_000])

const QUEUE_TARGET_META = Object.freeze({
  A1: { region: 'foyer', kind: 'stand', dwell: STAND_DWELL },
  A2: { region: 'foyer', kind: 'stand', dwell: STAND_DWELL },
  desk: { region: 'foyer', kind: 'stand', dwell: BRIEF_DWELL },
  B0: { region: 'plaza', kind: 'stand', dwell: STAND_DWELL },
  B1: { region: 'plaza', kind: 'stand', dwell: STAND_DWELL },
  B2: { region: 'plaza', kind: 'stand', dwell: STAND_DWELL },
  B3: { region: 'plaza', kind: 'stand', dwell: STAND_DWELL },
})

const EXTRA_TARGET_META = Object.freeze({
  waiting_sofa: { region: 'foyer', kind: 'sit', dwell: BRIEF_DWELL },
  b0_table_1: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
  b0_table_2: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
  south_west_bench_1: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
  south_west_bench_2: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
  south_east_bench_1: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
  south_east_bench_2: { region: 'plaza', kind: 'sit', dwell: SIT_DWELL },
})

for (const targetId of Object.keys(QUEUE_TARGET_META)) {
  if (!FOYER_QUEUES[targetId]) throw new Error(`Missing foyer queue: ${targetId}`)
}

for (const targetId of Object.keys(EXTRA_TARGET_META)) {
  if (!FOYER_TARGETS[targetId]) throw new Error(`Missing foyer target: ${targetId}`)
}

const clonePoint = (point) => ({ x: point.x, z: point.z })
const cloneDwell = (dwell) => [dwell[0], dwell[1]]
const isFinitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.z)
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

function dedupeAdjacent(points) {
  const deduped = []
  for (const point of points) {
    if (!isFinitePoint(point)) throw new Error(`Invalid route point: ${JSON.stringify(point)}`)
    if (!deduped.length) {
      deduped.push(clonePoint(point))
      continue
    }
    const prev = deduped.at(-1)
    if (Math.hypot(point.x - prev.x, point.z - prev.z) > 1e-9) deduped.push(clonePoint(point))
  }
  return deduped
}

function replaceGoStand(home, targetId, stand, region) {
  const base = (region === 'plaza' ? plazaTrip : foyerTrip)(home, targetId)
  return dedupeAdjacent([...base.slice(0, -1), stand])
}

function replaceBackStand(home, targetId, stand) {
  const base = foyerReturnTrip(home, targetId)
  return dedupeAdjacent([stand, ...base.slice(1)])
}

export function consumerDeparture(targetId, stand, back) {
  const slots = FOYER_QUEUES[targetId]
  if (!slots?.[1] || !back[1]) return back.map(clonePoint)
  const dx = slots[0].x - slots[1].x, dz = slots[0].z - slots[1].z, length = Math.hypot(dx, dz) || 1
  const forward = { x: dx / length, z: dz / length }
  const towardBack = { x: back[1].x - stand.x, z: back[1].z - stand.z }
  const atHead = Math.hypot(stand.x - slots[0].x, stand.z - slots[0].z) < 0.1
  if (atHead && forward.x * towardBack.x + forward.z * towardBack.z > 0.1) return back.map(clonePoint)
  const joinAt = back.findIndex((point, index) => index > 0 && slots.every(slot => Math.hypot(point.x - slot.x, point.z - slot.z) > 1.4))
  const index = joinAt < 0 ? 1 : joinAt, join = back[index], horizontal = Math.abs(dx) >= Math.abs(dz)
  const side = horizontal
    ? { x: stand.x, z: stand.z + (Math.sign(join.z - stand.z) || -1) * 1.5 }
    : { x: stand.x + (Math.sign(join.x - stand.x) || 1) * 1.5, z: stand.z }
  const bridge = horizontal ? { x: join.x, z: side.z } : { x: side.x, z: join.z }
  return dedupeAdjacent([stand, side, bridge, ...back.slice(index)])
}

export function consumerAdvance(targetId, from, to) {
  const slots = FOYER_QUEUES[targetId]
  if (!slots?.[1] || Math.abs(slots[0].x - slots[1].x) >= Math.abs(slots[0].z - slots[1].z)) return [clonePoint(to)]
  const sideX = from.x + (Math.sign(-from.x) || 1)
  return dedupeAdjacent([{ x: sideX, z: from.z }, { x: sideX, z: to.z }, to])
}

function buildConsumerTargets() {
  const entries = []
  for (const [id, meta] of Object.entries(QUEUE_TARGET_META)) entries.push([id, Object.freeze({ id, region: meta.region, kind: meta.kind, dwell: cloneDwell(meta.dwell) })])
  for (const [id, meta] of Object.entries(EXTRA_TARGET_META)) entries.push([id, Object.freeze({ id, region: meta.region, kind: meta.kind, dwell: cloneDwell(meta.dwell) })])
  return Object.freeze(Object.fromEntries(entries))
}

export const CONSUMER_TARGETS = buildConsumerTargets()

export function createQueueBoard({ queues = FOYER_QUEUES, compact = true } = {}) {
  const slotsByTarget = Object.fromEntries(Object.entries(queues).map(([targetId, points]) => [targetId, Array(points.length).fill(null)]))
  const placements = new Map()

  function join(agentId, targetId) {
    if (!hasOwn(slotsByTarget, targetId)) return { ok: false, reason: 'unknown_target' }
    if (placements.has(agentId)) return { ok: false, reason: 'already_queued' }
    const slots = slotsByTarget[targetId]
    const slot = slots.indexOf(null)
    if (slot === -1) return { ok: false, reason: 'full' }
    slots[slot] = agentId
    placements.set(agentId, { targetId, slot })
    return { ok: true, slot, point: clonePoint(queues[targetId][slot]) }
  }

  function leave(agentId) {
    const placement = placements.get(agentId)
    if (!placement) return { ok: false, advance: [] }
    const { targetId, slot } = placement
    const slots = slotsByTarget[targetId]
    if (compact) { slots.splice(slot, 1); slots.push(null) }
    else slots[slot] = null
    placements.delete(agentId)
    const advance = []
    if (!compact) return { ok: true, targetId, slot, advance }
    for (let next = slot; next < slots.length; next++) {
      const queuedAgentId = slots[next]
      if (!queuedAgentId) continue
      placements.set(queuedAgentId, { targetId, slot: next })
      advance.push({ agentId: queuedAgentId, from: next + 1, to: next, point: clonePoint(queues[targetId][next]) })
    }
    return { ok: true, targetId, slot, advance }
  }

  function head(targetId) {
    if (!hasOwn(slotsByTarget, targetId)) return null
    return slotsByTarget[targetId][0] || null
  }

  function occupancy(targetId) {
    if (!hasOwn(slotsByTarget, targetId)) return 0
    return slotsByTarget[targetId].filter(Boolean).length
  }

  function snapshot() {
    return Object.fromEntries(Object.keys(slotsByTarget).map((targetId) => [targetId, slotsByTarget[targetId].filter(Boolean)]))
  }

  return { join, leave, head, occupancy, snapshot }
}

export const createWaitingBoard = () => createQueueBoard({ queues: { waiting: WAITING_SEATS }, compact: false })

export function waitingPlan({ home, agentId, board }) {
  if (!isFinitePoint(home)) return { ok: false, reason: 'invalid_home' }
  if (typeof agentId !== 'string' || !agentId) return { ok: false, reason: 'invalid_agent' }
  if (!board || typeof board.join !== 'function' || typeof board.leave !== 'function') return { ok: false, reason: 'invalid_board' }
  const joined = board.join(agentId, 'waiting')
  if (!joined.ok) return { ok: false, reason: joined.reason }
  const stand = clonePoint(joined.point), go = replaceGoStand(home, 'waiting_sofa', stand, 'foyer')
  return { ok: true, targetId: 'waiting', go, stand, back: dedupeAdjacent(go.toReversed()), slot: joined.slot, yaw: WAITING_SEATS[joined.slot].yaw }
}

export function visitPlan({ home, targetId, board, agentId }) {
  if (!FOYER_QUEUES[targetId] || !QUEUE_TARGET_META[targetId]) return { ok: false, reason: 'unknown_target' }
  if (!board || typeof board.join !== 'function') throw new Error('visitPlan requires a queue board')
  const joined = board.join(agentId, targetId)
  if (!joined.ok) return { ok: false, reason: joined.reason }
  const stand = clonePoint(joined.point)
  const region = QUEUE_TARGET_META[targetId].region
  const go = replaceGoStand(home, targetId, stand, region)
  const back = replaceBackStand(home, targetId, stand)
  return { ok: true, targetId, go, stand, back, slot: joined.slot }
}

export function dwellMs(targetId, rng) {
  const meta = CONSUMER_TARGETS[targetId]
  if (!meta) throw new Error(`Unknown consumer target: ${targetId}`)
  if (typeof rng !== 'function') throw new Error('dwellMs requires rng')
  const [min, max] = meta.dwell
  const span = max - min + 1
  const value = Math.max(0, Math.min(0.999999999999, Number(rng())))
  return min + Math.floor(value * span)
}
