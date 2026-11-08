export function plantFootprintSamples(row, step = .05) {
  if (Number.isFinite(row.r)) return [{ x: row.x, z: row.z, r: row.r }]
  if (!Number.isFinite(row.length) || row.length <= 0) throw new Error(`${row.id} length`)
  const width = row.wall ? .3 : row.width
  if (!Number.isFinite(width) || width <= 0) throw new Error(`${row.id} width`)
  const n = Math.ceil(row.length / step)
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = (i / n - .5) * row.length
    if (row.shape === 'arc') {
      const a = row.startDeg * Math.PI / 180 + (u + row.length / 2) / row.radius
      return { x: row.x + row.radius * Math.cos(a), z: row.z + row.radius * Math.sin(a), r: width / 2 }
    }
    const a = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180
    return { x: row.x + u * Math.cos(a), z: row.z + u * Math.sin(a), r: width / 2 }
  })
}

export function insidePlantEnvelope(row, x, z, tolerance = 1e-5) {
  if (Number.isFinite(row.r)) return Math.hypot(x - row.x, z - row.z) <= row.r + tolerance
  if (row.shape === 'arc') {
    const radius = Math.hypot(x - row.x, z - row.z), start = row.startDeg * Math.PI / 180
    let angle = Math.atan2(z - row.z, x - row.x)
    while (angle < start - tolerance) angle += Math.PI * 2
    return Math.abs(radius - row.radius) <= row.width / 2 + tolerance && angle <= start + row.length / row.radius + tolerance
  }
  const a = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180, dx = x - row.x, dz = z - row.z
  return Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= row.length / 2 + tolerance && Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) <= (row.wall ? .3 : row.width) / 2 + tolerance
}
