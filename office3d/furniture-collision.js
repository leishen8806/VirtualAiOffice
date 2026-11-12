import * as THREE from './vendor/three/three.module.js'

// 人物是直立胶囊；家具保持静态，用模型三角面做窄相检测。
export function createFurnitureCollision() {
  const bodies = []
  const navigationOrigins = new WeakMap()
  const navigationData = Symbol('R1 capsule coefficients')
  const point = new THREE.Vector3(), closest = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), axis = new THREE.Vector3()
  const edge = new THREE.Vector3(), delta = new THREE.Vector3(), ray = new THREE.Ray()
  const low = 0.24, high = 1.48
  const stats = { checks: 0, contacts: 0, triangles: 0 }

  function add(group, kind) {
    remove(group)
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

  function remove(group) {
    const index = bodies.findIndex(body => body.group === group)
    if (index < 0) return false
    stats.triangles -= bodies[index].triangles.length
    bodies.splice(index, 1)
    return true
  }

  // 竖直胶囊轴与三角面相交，或轴与任意边/顶点的最近距离小于半径。
  function touches(tri, radius = 0.22) {
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

  function hit(x, z, ignore, radius = 0.22, candidates = bodies) {
    stats.checks++
    a.set(x, low, z); b.set(x, high, z)
    for (const body of candidates) {
      if (body.group === ignore || ignore?.has?.(body.group)) continue
      const box = body.box
      if (x < box.min.x - radius || x > box.max.x + radius || z < box.min.z - radius || z > box.max.z + radius || box.max.y < low - radius || box.min.y > high + radius) continue
      for (const tri of body.triangles) if (touches(tri, radius)) { stats.contacts++; return body }
    }
    return null
  }

  function navigationTriangle(tri) {
    if (tri[navigationData]) return tri[navigationData]
    const { a, b, c } = tri, ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, uu = ux * ux + uy * uy + uz * uz, uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz
    const row = { a, ux, uy, uz, vx, vy, vz, nx, ny, nz, n2: nx * nx + ny * ny + nz * nz, uu, uv, vv, determinant: uu * vv - uv * uv,
      x0: Math.min(a.x, b.x, c.x), x1: Math.max(a.x, b.x, c.x), y0: Math.min(a.y, b.y, c.y), y1: Math.max(a.y, b.y, c.y), z0: Math.min(a.z, b.z, c.z), z1: Math.max(a.z, b.z, c.z),
      edges: [[a, b], [b, c], [c, a]].map(([p, q]) => { const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z; return { x: p.x, y: p.y, z: p.z, dx, dy, dz, horizontal: dx * dx + dz * dz, length2: dx * dx + dy * dy + dz * dz } }) }
    tri[navigationData] = row; return row
  }
  function insideTriangle(t, x, y, z) {
    const dx = x - t.a.x, dy = y - t.a.y, dz = z - t.a.z, u = dx * t.ux + dy * t.uy + dz * t.uz, v = dx * t.vx + dy * t.vy + dz * t.vz
    const s = (t.vv * u - t.uv * v) / t.determinant, r = (t.uu * v - t.uv * u) / t.determinant
    return s >= 0 && r >= 0 && s + r <= 1
  }
  function edgeDistance(e, t, x, z) {
    t = Math.max(0, Math.min(1, t))
    const dx = e.x + e.dx * t - x, dz = e.z + e.dz * t - z, y = e.y + e.dy * t, dy = y - Math.max(low, Math.min(high, y))
    return dx * dx + dy * dy + dz * dz
  }
  function navigationTouches(triangle, x, z, radius2) {
    const t = navigationTriangle(triangle), dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1), dy = Math.max(t.y0 - high, 0, low - t.y1)
    if (dx * dx + dy * dy + dz * dz >= radius2) return false
    if (t.n2 > 0) {
      if (Math.abs(t.ny) > 1e-12) {
        const y = t.a.y - (t.nx * (x - t.a.x) + t.nz * (z - t.a.z)) / t.ny
        if (y >= low && y <= high && insideTriangle(t, x, y, z)) return true
      }
      for (const y of [low, high]) {
        const d = ((x - t.a.x) * t.nx + (y - t.a.y) * t.ny + (z - t.a.z) * t.nz) / t.n2
        if (d * d * t.n2 < radius2 && insideTriangle(t, x - d * t.nx, y - d * t.ny, z - d * t.nz)) return true
      }
    }
    for (const e of t.edges) {
      if (edgeDistance(e, 0, x, z) < radius2 || edgeDistance(e, 1, x, z) < radius2) return true
      const dot = (x - e.x) * e.dx + (z - e.z) * e.dz
      if (e.horizontal > 1e-12 && edgeDistance(e, dot / e.horizontal, x, z) < radius2) return true
      if (Math.abs(e.dy) > 1e-12 && (edgeDistance(e, (low - e.y) / e.dy, x, z) < radius2 || edgeDistance(e, (high - e.y) / e.dy, x, z) < radius2)) return true
      if (edgeDistance(e, (dot + (low - e.y) * e.dy) / Math.max(1e-12, e.length2), x, z) < radius2 || edgeDistance(e, (dot + (high - e.y) * e.dy) / Math.max(1e-12, e.length2), x, z) < radius2) return true
    }
    return false
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
    return body.triangles.some(tri => touches(tri))
  }
  return { add, remove, hit, move, route, seatBody, overlaps,
    // R1 navigation indexes the same registered triangles; legacy callers retain radius 0.22.
    navigationBodies: () => bodies.slice(),
    translateNavigationBody(group, dx, dz) {
      const body = bodies.find(b => b.group === group)
      if (!body || !Number.isFinite(dx) || !Number.isFinite(dz)) throw new Error('Invalid moving collision body')
      for (const triangle of body.triangles) { triangle[navigationData] = undefined; for (const p of [triangle.a, triangle.b, triangle.c]) { p.x += dx; p.z += dz } }
      body.box.min.x += dx; body.box.max.x += dx; body.box.min.z += dz; body.box.max.z += dz
    },
    poseNavigationBody(group, origin, dx, dz, yaw) {
      const body = bodies.find(b => b.group === group)
      if (!body || ![origin.x, origin.z, dx, dz, yaw].every(Number.isFinite)) throw new Error('Invalid collision pose')
      if (!navigationOrigins.has(group)) navigationOrigins.set(group, body.triangles.map(t => t.clone()))
      const source = navigationOrigins.get(group), co = Math.cos(yaw), si = Math.sin(yaw)
      body.box.makeEmpty()
      body.triangles.forEach((triangle, i) => { triangle[navigationData] = undefined; for (const key of ['a', 'b', 'c']) {
        const p = source[i][key], x = p.x - origin.x, z = p.z - origin.z
        triangle[key].set(origin.x + co * x + si * z + dx, p.y, origin.z - si * x + co * z + dz); body.box.expandByPoint(triangle[key])
      } })
    },
    navigationHit(x, z, radius, ignore, candidates) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) throw new Error('Invalid navigation capsule')
      stats.checks++
      for (const body of candidates || bodies) {
        if (body.group === ignore || ignore?.has?.(body.group)) continue
        const box = body.box
        if (x < box.min.x - radius || x > box.max.x + radius || z < box.min.z - radius || z > box.max.z + radius || box.max.y < low - radius || box.min.y > high + radius) continue
        for (const tri of body.triangles) if (navigationTouches(tri, x, z, radius * radius)) { stats.contacts++; return body }
      }
      return null
    }, stats: () => ({ ...stats, bodies: bodies.length }) }
}
