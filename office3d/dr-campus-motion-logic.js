const clamp = value => Math.max(0, Math.min(1, value))
const zone = (layout, name) => layout.zones.find(row => row.id === name)
const point = (x, z, pauseMs = 1200) => ({ x, z, pauseMs })
export function forkliftPath(layout) {
  const area = zone(layout, 'highRack'), x0 = area.x0 + 14, x1 = area.x0 + 17
  return [point(x0, area.z0 + 1), point(x1, area.z0 + 1), point(x1, area.z1 - 1), point(x0, area.z1 - 1), point(x0, area.z0 + 1)]
}
export function truckPlan(layout) {
  const receiving = zone(layout, 'receiving'), shipping = zone(layout, 'shipping')
  const dock = (id, x, z, dx, dz) => ({ id, parked: point(x, z, 0), entry: point(x + dx, z + dz, 0) })
  return [dock('demo-receive-1', receiving.x0 + 6, receiving.z0 - 3.8, 0, -2),
    dock('demo-receive-2', receiving.x0 + 15, receiving.z0 - 3.8, 0, -2), dock('demo-ship-1', shipping.x1 - 6, shipping.z0 + 7, 3.8, 0)]
}
export function conveyorLoop(layout) {
  const picking = zone(layout, 'picking'), packing = zone(layout, 'packing')
  return [3, 6].map(offset => [point(picking.x1 - 6, picking.z0 + offset, 0), point(packing.x0 + 8, packing.z0 + offset, 0),
    point(packing.x0 + 8, packing.z0 + offset + .9, 0), point(picking.x1 - 6, picking.z0 + offset + .9, 0), point(picking.x1 - 6, picking.z0 + offset, 0)])
}
export function phaseAt(timeMs, seed = 2606) {
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0, slice = Math.floor(time / 12000)
  const hash = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0
  return { slice, phase: time % 12000 / 12000, dockIndex: hash % 3 }
}
export function pathPoint(path, elapsed, speed = 2) {
  const segments = path.slice(0, -1).map((from, index) => {
    const to = path[index + 1], duration = Math.hypot(to.x - from.x, to.z - from.z) / speed * 1000
    return { from, to, duration, total: from.pauseMs + duration }
  })
  let time = Math.max(0, elapsed) % segments.reduce((sum, row) => sum + row.total, 0)
  for (const row of segments) {
    if (time <= row.total) {
      const t = clamp((time - row.from.pauseMs) / row.duration)
      return { x: row.from.x + (row.to.x - row.from.x) * t, z: row.from.z + (row.to.z - row.from.z) * t, angle: Math.atan2(row.to.x - row.from.x, row.to.z - row.from.z) }
    }
    time -= row.total
  }
  return { ...path[0], angle: 0 }
}
export function createDemoCampusEventSource({ now, seed = 2606 } = {}) {
  const listeners = new Set(), emitted = new Set()
  const snapshot = () => {
    const time = typeof now === 'function' ? now() : now, phase = phaseAt(time, seed), at = phase.slice * 12000
    return { synthetic: true, at: Math.max(0, Number.isFinite(time) ? time : 0), slice: phase.slice, events: [
      { id: `demo-truck-arrive-${phase.slice}`, type: 'truck_arrive', at, dockId: ['demo-receive-1', 'demo-receive-2', 'demo-ship-1'][phase.dockIndex] },
      { id: `demo-truck-depart-${phase.slice}`, type: 'truck_depart', at: at + 8000, dockId: ['demo-receive-1', 'demo-receive-2', 'demo-ship-1'][phase.dockIndex] },
      { id: `demo-forklift-${phase.slice}`, type: 'forklift_move', at, dockId: 'demo-aisle', index: 0 },
      { id: `demo-conveyor-${phase.slice}`, type: 'conveyor_tick', at, dockId: 'demo-packing', index: 0 },
    ].filter(event => event.at <= time) }
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
export function createMotionClock() {
  let last = null, elapsed = 0
  return Object.freeze({
    update(time, allowed) {
      if (!Number.isFinite(time)) return elapsed
      if (last !== null && allowed) elapsed += Math.max(0, Math.min(100, time - last))
      last = time
      return elapsed
    },
    reset() { last = null },
    value: () => elapsed,
  })
}
export function confirmedEvents(events, time) {
  const ids = new Set()
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event || typeof event.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(event.id) || ids.has(event.id) ||
        (event.dockId !== undefined && (typeof event.dockId !== 'string' || !event.dockId || event.dockId.length > 128)) ||
        (['truck_arrive', 'truck_depart'].includes(event.type) && !event.dockId) ||
        !Number.isFinite(event.at) || event.at < 0 || event.at > time ||
        !['truck_arrive', 'truck_depart', 'forklift_move', 'conveyor_tick'].includes(event.type)) return false
    ids.add(event.id)
    return true
  }).map(event => ({ ...event }))
}
