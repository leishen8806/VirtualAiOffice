import { alignZoneObstaclePlan } from './office-vis2/align-zones.js'

// Public circulation only: room interiors and final seat approach remain owned by the director.
export function createV3PublicPath(layout) {
  const pad = .28, center = layout.bar.center, radius = layout.island.radius + pad
  const align = Boolean(layout.publicPathNodes)
  const regionBoxes = align ? layout.regions.filter(region => region.walled) : layout.regions
  const desks = align ? Object.values(layout.seats).map(([, x, z]) => ({ x0: x - .8, x1: x + .8, z0: z - .8, z1: z + .8 })) : []
  const furnishings = align ? alignZoneObstaclePlan(layout).flatMap(({ id, plan }) =>
    plan.placements.map(item => ({ id: `${id}-${item.id}`, ...item.bounds }))) : []
  // 样板咖啡台前另有半径 .42m 的圆桌，通路边界须包含真实桌沿。
  const serviceBounds = align ? { ...layout.serviceBar, z1: Math.max(layout.serviceBar.z1, layout.foyer.z1 - 1.4 + .42) } : layout.serviceBar
  const boxes = [...regionBoxes, layout.frontDesk, serviceBounds, layout.waitingArc].map(b => ({ x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad }))
  const blockers = [...boxes, ...desks, ...furnishings.map(b => ({ x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad }))]
  const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z)
  const inside = (p, b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1
  const valid = p => finite(p) && p.x >= layout.envelope.x0 + pad && p.x <= layout.envelope.x1 - pad && p.z >= layout.envelope.z0 + pad && p.z <= layout.doors.south.z - pad && !blockers.some(b => inside(p, b)) && Math.hypot(p.x - center.x, p.z - center.z) >= radius
  const hitsBox = (a, b, box) => {
    let lo = 0, hi = 1
    for (const axis of ['x', 'z']) {
      const delta = b[axis] - a[axis]
      if (Math.abs(delta) < 1e-10) { if (a[axis] <= box[axis + '0'] || a[axis] >= box[axis + '1']) return false; continue }
      const p = (box[axis + '0'] - a[axis]) / delta, q = (box[axis + '1'] - a[axis]) / delta
      lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q))
      if (lo >= hi) return false
    }
    return hi > 0 && lo < 1
  }
  const clear = (a, b) => {
    if (blockers.some(box => hitsBox(a, b, box))) return false
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
    const t = length2 ? Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.z - a.z) * dz) / length2)) : 0
    return Math.hypot(a.x + t * dx - center.x, a.z + t * dz - center.z) >= radius
  }
  const corners = blockers.flatMap(b => [b.x0 - .02, b.x1 + .02].flatMap(x => [b.z0 - .02, b.z1 + .02].map(z => ({ x, z }))))
  const ringRadius = (layout.ring.inner + layout.ring.outer) / 2
  const ring = Array.from({ length: 48 }, (_, i) => ({ x: center.x + ringRadius * Math.cos(i * Math.PI / 24), z: center.z + ringRadius * Math.sin(i * Math.PI / 24) }))
  const doors = regionBoxes.flatMap(room => room.doors.map(door => {
    if (door.side === 'east') return { x: room.x1 + .75, z: door.at }
    if (door.side === 'west') return { x: room.x0 - .75, z: door.at }
    if (door.side === 'north') return { x: door.at, z: room.z0 - .75 }
    return { x: door.at, z: room.z1 + .75 }
  }))
  const edge = [
    ...[-16, -8, 0, 8].flatMap(z => [{ x: layout.envelope.x0 + pad + .01, z }, { x: layout.envelope.x1 - pad - .01, z }]),
    ...[-24, -16, -8, 0, 8, 11].flatMap(x => [{ x, z: layout.envelope.z0 + pad + .01 }, { x, z: layout.doors.south.z - pad - .01 }]),
  ]
  // Stable V3 retains its exact graph; variants opt into their own junctions.
  const variantNodes = layout.publicPathNodes ? [...doors, ...edge, ...layout.publicPathNodes] : []
  const nodes = [...corners, ...variantNodes, ...ring].filter(valid)
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
  const links = nodes.map((a, i) => nodes.flatMap((b, j) => i !== j && clear(a, b) ? [[j, distance(a, b)]] : []))
  return (from, to) => {
    // Desk and furnishing endpoints are valid actor targets, but the graph must
    // leave them from a nearby clear point before it traverses public space.
    const anchor = (point) => {
      if (valid(point)) return { ...point }
      if (!align) throw new Error(`V3 public route endpoint blocked: ${JSON.stringify({ from, to })}`)
      for (let radius = .25; radius <= 3; radius += .25) for (const [x, z] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
        const candidate = { x: point.x + x * radius, z: point.z + z * radius }
        if (valid(candidate)) return candidate
      }
      throw new Error(`V3 public route endpoint blocked: ${JSON.stringify({ from, to })}`)
    }
    const startPoint = anchor(from), endPoint = anchor(to)
    if (clear(startPoint, endPoint)) return dedupe([{ ...from }, startPoint, endPoint, { ...to }])
    const all = [...nodes, startPoint, endPoint], start = nodes.length, end = start + 1
    const edges = [...links.map(list => [...list]), [], []]
    for (const index of [start, end]) for (let i = 0; i < index; i++) if (clear(all[index], all[i])) { const d = distance(all[index], all[i]); edges[index].push([i, d]); edges[i].push([index, d]) }
    const costs = all.map(() => Infinity), previous = [], visited = new Set(); costs[start] = 0
    while (visited.size < all.length) {
      let current = -1
      for (let i = 0; i < all.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i
      if (current < 0 || !Number.isFinite(costs[current])) break
      if (current === end) {
        const route = []
        for (let i = end; i !== undefined; i = previous[i]) route.unshift({ ...all[i] })
        return dedupe([{ ...from }, ...route, { ...to }])
      }
      visited.add(current)
      for (const [next, length] of edges[current]) if (costs[current] + length < costs[next]) { costs[next] = costs[current] + length; previous[next] = current }
    }
    throw new Error('V3 public circulation has no safe route')
  }
}

const dedupe = points => points.filter((point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z) > 1e-6)
