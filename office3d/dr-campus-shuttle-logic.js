const TYPES = new Set(['shuttle_move', 'shuttle_pick', 'shuttle_put'])
const idOk = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const clamp = value => Math.max(0, Math.min(1, value))
export const SHUTTLE_MAX_LIFT = .12

export function shuttlePlan(layout) {
  const strip = layout?.shuttle
  if (!strip || ![strip.x0, strip.x1, strip.z0, strip.z1].every(Number.isFinite)) throw new Error('Invalid shuttle strip')
  const centerX = (strip.x0 + strip.x1) / 2
  const z0 = strip.z0 + 1.15, z1 = strip.z1 - 1.15
  if (strip.x1 - strip.x0 < 3 || z1 - z0 < 8) throw new Error('Shuttle strip too small')
  return Object.freeze({
    aisleId: 'demo-shuttle-aisle',
    strip: Object.freeze({ ...strip }),
    centerX,
    rails: Object.freeze([centerX - .7, centerX + .7]),
    path: Object.freeze({ z0, z1 }),
    slots: Object.freeze([
      Object.freeze({ id: 'slot-a', x: centerX, z: z0 }),
      Object.freeze({ id: 'slot-b', x: centerX, z: (z0 + z1) / 2 }),
      Object.freeze({ id: 'slot-c', x: centerX, z: z1 }),
    ]),
  })
}

export function shuttleCycle(slice) {
  const routes = [[0, 1], [2, 0], [1, 2]]
  const normalized = Math.max(0, Math.floor(Number.isFinite(slice) ? slice : 0))
  const [source, target] = routes[normalized % routes.length]
  return Object.freeze({ slice: normalized, source, target })
}

export function createDemoShuttleEventSource({ now, seed = 1212, plan } = {}) {
  if (!plan?.aisleId || !Array.isArray(plan.slots)) throw new Error('Shuttle plan required')
  const listeners = new Set(), emitted = new Set()
  const cycleMs = 16000
  const snapshot = () => {
    const value = typeof now === 'function' ? now() : now
    const time = Math.max(0, Number.isFinite(value) ? value : 0)
    const slice = Math.floor(time / cycleMs), start = slice * cycleMs
    const route = shuttleCycle(slice + (seed >>> 0) % 3)
    const source = plan.slots[route.source], target = plan.slots[route.target]
    const events = [
      { id: `demo-shuttle-source-${slice}`, type: 'shuttle_move', at: start, aisleId: plan.aisleId, slotId: source.id },
      { id: `demo-shuttle-pick-${slice}`, type: 'shuttle_pick', at: start + 3000, aisleId: plan.aisleId, slotId: source.id },
      { id: `demo-shuttle-target-${slice}`, type: 'shuttle_move', at: start + 5200, aisleId: plan.aisleId, slotId: target.id },
      { id: `demo-shuttle-put-${slice}`, type: 'shuttle_put', at: start + 11800, aisleId: plan.aisleId, slotId: target.id },
    ].filter(event => event.at <= time)
    return Object.freeze({ synthetic: true, at: time, slice, events: Object.freeze(events) })
  }
  return Object.freeze({
    snapshot,
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    advance() {
      const current = snapshot()
      for (const event of current.events) if (!emitted.has(event.id)) {
        emitted.add(event.id)
        for (const callback of listeners) { try { callback({ ...event }) } catch {} }
      }
      while (emitted.size > 200) emitted.delete(emitted.values().next().value)
      return current
    },
  })
}

export function confirmedShuttleEvents(events, time, plan) {
  const ids = new Set(), slots = new Set(plan?.slots?.map(slot => slot.id) || [])
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event || !idOk(event.id) || ids.has(event.id) || !TYPES.has(event.type) ||
        !Number.isFinite(event.at) || event.at < 0 || event.at > time ||
        event.aisleId !== plan?.aisleId || !slots.has(event.slotId)) return false
    ids.add(event.id)
    return true
  }).map(event => ({ ...event }))
}

export function initialShuttleState(plan) {
  return Object.freeze({
    aisleId: plan.aisleId,
    position: plan.slots[0].z,
    target: plan.slots[0].z,
    movingFrom: plan.slots[0].z,
    movingAt: 0,
    carrying: false,
    occupied: Object.freeze([true, false, true]),
    lift: 0,
    status: 'idle',
    lastAt: 0,
  })
}

export function applyShuttleEvent(state, event, plan) {
  const index = plan.slots.findIndex(slot => slot.id === event.slotId)
  if (index < 0) return state
  const occupied = [...state.occupied]
  if (event.type === 'shuttle_move') return Object.freeze({
    ...state, movingFrom: state.position, target: plan.slots[index].z, movingAt: event.at,
    status: state.carrying ? 'delivery' : 'pickup', lastAt: event.at,
  })
  if (event.type === 'shuttle_pick' && !state.carrying && occupied[index]) {
    occupied[index] = false
    return Object.freeze({ ...state, position: plan.slots[index].z, target: plan.slots[index].z,
      carrying: true, occupied: Object.freeze(occupied), status: 'pickup', lastAt: event.at })
  }
  if (event.type === 'shuttle_put' && state.carrying && !occupied[index]) {
    occupied[index] = true
    return Object.freeze({ ...state, position: plan.slots[index].z, target: plan.slots[index].z,
      carrying: false, occupied: Object.freeze(occupied), status: 'idle', lastAt: event.at })
  }
  return state
}

export function shuttleFrame(state, time) {
  const now = Math.max(state.lastAt, Number.isFinite(time) ? time : state.lastAt)
  const move = clamp((now - state.movingAt) / 2200)
  const eased = move * move * (3 - 2 * move)
  const position = state.movingFrom + (state.target - state.movingFrom) * eased
  let lift = state.carrying ? SHUTTLE_MAX_LIFT : 0
  if (state.status === 'pickup' && state.carrying) lift = SHUTTLE_MAX_LIFT * clamp((now - state.lastAt) / 600)
  if (state.status === 'idle' && !state.carrying) lift = SHUTTLE_MAX_LIFT * (1 - clamp((now - state.lastAt) / 600))
  return Object.freeze({ position, lift, carrying: state.carrying, occupied: [...state.occupied], status: state.status })
}

export function palletCount(frame) {
  return frame.occupied.filter(Boolean).length + (frame.carrying ? 1 : 0)
}
