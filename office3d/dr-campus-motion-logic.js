import { CAMPUS_DOCKS, CAMPUS_VEHICLE_ROUTES } from './office-layout.js'

const clamp = value => Math.max(0, Math.min(1, value))
const zone = (layout, name) => layout.zones.find(row => row.id === name)
const point = (x, z, pauseMs = 1200) => ({ x, z, pauseMs })
export function forkliftPath(layout) {
  const area = zone(layout, 'highRack'), x0 = area.x0 + 6, x1 = area.x1 - 10.4
  return [point(x0, area.z0 - 1.5), point(x1, area.z0 - 1.5), point(x1, area.z1 + 1.5), point(x0, area.z1 + 1.5), point(x0, area.z0 - 1.5)]
}
export function truckPlan(layout) {
  const docks = layout.docks || CAMPUS_DOCKS, routes = layout.vehicleRoutes || CAMPUS_VEHICLE_ROUTES
  return docks.map((dock) => {
    const route = routes.find((item) => item.dockId === dock.id)
    const parked = dock.side === 'north'
      ? point((dock.bay.x0 + dock.bay.x1) / 2, (dock.bay.z0 + dock.bay.z1) / 2, 0)
      : point((dock.bay.x0 + dock.bay.x1) / 2, (dock.bay.z0 + dock.bay.z1) / 2, 0)
    const entry = route ? point(...route.points[0], 0) : parked
    return Object.freeze({ id: dock.id, side: dock.side, route: Object.freeze(route?.points.map((item) => point(...item, 0)) || [entry, parked]), parked, entry })
  })
}
export function conveyorLoop(layout) {
  const picking = zone(layout, 'picking'), packing = zone(layout, 'packing')
  return [3, 6].map(offset => [point(picking.x1 - 6, picking.z0 + offset, 0), point(packing.x0 + 8, packing.z0 + offset, 0),
    point(packing.x0 + 8, packing.z0 + offset + .9, 0), point(picking.x1 - 6, picking.z0 + offset + .9, 0), point(picking.x1 - 6, picking.z0 + offset, 0)])
}
export function phaseAt(timeMs, seed = 2606) {
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0, slice = Math.floor(time / 12000)
  const hash = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0
  return { slice, phase: time % 12000 / 12000, dockIndex: hash % CAMPUS_DOCKS.length }
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
export function routePointAt(path, progress) {
  const segments = path.slice(0, -1).map((from, index) => {
    const to = path[index + 1], length = Math.hypot(to.x - from.x, to.z - from.z)
    return { from, to, length }
  }).filter((segment) => segment.length > 0)
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  if (!total) return { x: path[0]?.x || 0, z: path[0]?.z || 0, angle: 0 }
  let distance = Math.max(0, Math.min(1, progress)) * total
  for (const segment of segments) {
    if (distance <= segment.length) {
      const t = distance / segment.length
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        z: segment.from.z + (segment.to.z - segment.from.z) * t,
        angle: Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z),
      }
    }
    distance -= segment.length
  }
  const last = segments.at(-1)
  return { x: last.to.x, z: last.to.z, angle: Math.atan2(last.to.x - last.from.x, last.to.z - last.from.z) }
}
export function createDemoCampusEventSource({ now, seed = 2606 } = {}) {
  const listeners = new Set(), emitted = new Set()
  const snapshot = () => {
    const time = typeof now === 'function' ? now() : now, phase = phaseAt(time, seed), at = phase.slice * 12000
    return { synthetic: true, at: Math.max(0, Number.isFinite(time) ? time : 0), slice: phase.slice, events: [
      { id: `demo-truck-arrive-${phase.slice}`, type: 'truck_arrive', at, dockId: CAMPUS_DOCKS[phase.dockIndex % CAMPUS_DOCKS.length].id },
      { id: `demo-truck-depart-${phase.slice}`, type: 'truck_depart', at: at + 8000, dockId: CAMPUS_DOCKS[phase.dockIndex % CAMPUS_DOCKS.length].id },
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
