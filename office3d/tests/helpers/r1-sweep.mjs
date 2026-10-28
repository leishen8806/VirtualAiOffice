// Test/proof helper: a conservative intersection box may be exempt only when fully inside one actual own-frame solid.
export const insideOwnFrame = (intersection, ownFrames) => !intersection.isEmpty() && ownFrames.some(frame => frame.clone().expandByScalar(1e-6).containsBox(intersection))

export function triangleBoxDistance(THREE, triangle, box) {
  if (box.intersectsTriangle(triangle)) return 0
  const corners = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))
  const closest = new THREE.Vector3(), vertices = [triangle.a, triangle.b, triangle.c]
  let squared = Math.min(...vertices.map(v => box.distanceToPoint(v) ** 2))
  for (const p of corners) squared = Math.min(squared, triangle.closestPointToPoint(p, closest).distanceToSquared(p))
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) for (let j = 0; j < 3; j++) {
    const p = corners[i], q = vertices[j], d = corners[i | bit].clone().sub(p), e = vertices[(j + 1) % 3].clone().sub(q), r = p.clone().sub(q)
    const a = d.dot(d), b = d.dot(e), c = e.dot(e), f = e.dot(r), g = d.dot(r), den = a * c - b * b
    let s = den > 1e-20 ? Math.max(0, Math.min(1, (b * f - c * g) / den)) : 0
    let t = c > 1e-20 ? (b * s + f) / c : 0
    if (t < 0) { t = 0; s = a > 1e-20 ? Math.max(0, Math.min(1, -g / a)) : 0 }
    else if (t > 1) { t = 1; s = a > 1e-20 ? Math.max(0, Math.min(1, (b - g) / a)) : 0 }
    squared = Math.min(squared, p.clone().addScaledVector(d, s).distanceToSquared(q.clone().addScaledVector(e, t)))
  }
  return Math.sqrt(squared)
}
