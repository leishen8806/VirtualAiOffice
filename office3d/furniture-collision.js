import * as THREE from './vendor/three/three.module.js'

// 人物是直立胶囊；家具保持静态，用模型三角面做窄相检测。
export function createFurnitureCollision() {
  const bodies = []
  const point = new THREE.Vector3(), closest = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), axis = new THREE.Vector3()
  const edge = new THREE.Vector3(), delta = new THREE.Vector3(), ray = new THREE.Ray()
  const radius = 0.22, low = 0.24, high = 1.48
  const stats = { checks: 0, contacts: 0, triangles: 0 }

  function add(group, kind) {
    group.updateWorldMatrix(true, true)
    const triangles = []
    group.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
      const g = mesh.geometry, p = g.attributes.position, index = g.index
      for (let i = 0; i < (index ? index.count : p.count); i += 3) {
        const tri = new THREE.Triangle()
        for (const [j, v] of [tri.a, tri.b, tri.c].entries()) v.fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld)
        if (Math.max(tri.a.y, tri.b.y, tri.c.y) < 0.02) continue
        triangles.push(tri)
      }
    })
    const box = new THREE.Box3().setFromObject(group)
    bodies.push({ group, kind, triangles, box })
    stats.triangles += triangles.length
    return group
  }

  // 竖直胶囊轴与三角面相交，或轴与任意边/顶点的最近距离小于半径。
  function touches(tri) {
    ray.set(a, axis.set(0, 1, 0))
    if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, point) && point.y <= b.y && point.y >= a.y) return true
    for (const end of [a, b]) {
      tri.closestPointToPoint(end, closest)
      if (closest.distanceToSquared(end) < radius * radius) return true
    }
    const vertices = [tri.a, tri.b, tri.c]
    for (let i = 0; i < 3; i++) {
      const p = vertices[i], q = vertices[(i + 1) % 3]
      edge.subVectors(q, p)
      // 与竖直线段的距离是分段二次函数；检查内部极值和端点高度截点。
      const horizontal = edge.x * edge.x + edge.z * edge.z
      const ts = [0, 1]
      if (horizontal > 1e-12) ts.push(((a.x - p.x) * edge.x + (a.z - p.z) * edge.z) / horizontal)
      if (Math.abs(edge.y) > 1e-12) ts.push((a.y - p.y) / edge.y, (b.y - p.y) / edge.y)
      for (const end of [a, b]) ts.push(delta.subVectors(end, p).dot(edge) / Math.max(1e-12, edge.lengthSq()))
      for (const t of ts) {
        point.copy(p).addScaledVector(edge, Math.max(0, Math.min(1, t)))
        closest.set(a.x, Math.max(a.y, Math.min(b.y, point.y)), a.z)
        if (point.distanceToSquared(closest) < radius * radius) return true
      }
    }
    return false
  }

  function hit(x, z, ignore) {
    stats.checks++
    a.set(x, low, z); b.set(x, high, z)
    for (const body of bodies) {
      if (body.group === ignore || ignore?.has?.(body.group)) continue
      const box = body.box
      if (x < box.min.x - radius || x > box.max.x + radius || z < box.min.z - radius || z > box.max.z + radius || box.max.y < low - radius || box.min.y > high + radius) continue
      for (const tri of body.triangles) if (touches(tri)) { stats.contacts++; return body }
    }
    return null
  }

  function move(position, dx, dz, ignore) {
    const startX = position.x, startZ = position.z
    // 小步扫掠防止低帧率时越过薄桌腿；每小步重新检查两个滑动方向。
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.04))
    for (let i = 0; i < steps; i++) {
      const x = position.x + dx / steps, z = position.z + dz / steps
      if (!hit(x, z, ignore)) { position.x = x; position.z = z }
      else if (!hit(x, position.z, ignore)) position.x = x
      else if (!hit(position.x, z, ignore)) position.z = z
    }
    return Math.hypot(position.x - startX, position.z - startZ)
  }

  function clearLine(a, b, ignore) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08))
    for (let i = 1; i <= n; i++) if (hit(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, ignore)) return false
    return true
  }

  function route(start, end, ignore) {
    if (hit(end.x, end.z, ignore)) return null
    if (clearLine(start, end, ignore)) return [end]
    const spacing = 0.35, margin = 4
    const minX = Math.min(start.x, end.x) - margin, maxX = Math.max(start.x, end.x) + margin
    const minZ = Math.min(start.z, end.z) - margin, maxZ = Math.max(start.z, end.z) + margin
    const key = (x, z) => `${x},${z}`
    const heuristic = (p) => Math.hypot(p.x - end.x, p.z - end.z)
    const first = { x: start.x, z: start.z, ix: 0, iz: 0, cost: 0, previous: null }
    const open = [first], best = new Map([[key(0, 0), 0]])
    for (let count = 0; open.length && count < 12000; count++) {
      let index = 0
      for (let i = 1; i < open.length; i++) if (open[i].cost + heuristic(open[i]) < open[index].cost + heuristic(open[index])) index = i
      const current = open.splice(index, 1)[0]
      if (heuristic(current) < spacing * 1.5 && clearLine(current, end, ignore)) {
        const path = [end]
        for (let p = current; p.previous; p = p.previous) path.unshift({ x: p.x, z: p.z })
        const simple = []; let anchor = start
        for (let i = 0; i < path.length;) {
          let j = path.length - 1
          while (j > i && !clearLine(anchor, path[j], ignore)) j--
          simple.push(path[j]); anchor = path[j]; i = j + 1
        }
        return simple
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ix = current.ix + dx, iz = current.iz + dz
        const x = start.x + ix * spacing, z = start.z + iz * spacing
        const cost = current.cost + Math.hypot(dx, dz) * spacing, k = key(ix, iz)
        if (x < minX || x > maxX || z < minZ || z > maxZ || cost >= (best.get(k) ?? Infinity)) continue
        const next = { x, z, ix, iz, cost, previous: current }
        if (!clearLine(current, next, ignore)) continue
        best.set(k, cost); open.push(next)
      }
    }
    return null
  }
  function seatBody(seat) {
    return bodies.find(b => /chair|sofa/i.test(b.kind) && b.box.containsPoint(point.set(seat.x, (b.box.min.y + b.box.max.y) / 2, seat.z)))?.group
  }
  function overlaps(group, x, z) {
    const body = bodies.find(b => b.group === group)
    if (!body) return false
    a.set(x, low, z); b.set(x, high, z)
    return body.triangles.some(touches)
  }
  return { add, hit, move, route, seatBody, overlaps, stats: () => ({ ...stats, bodies: bodies.length }) }
}
