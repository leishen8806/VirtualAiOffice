import { R1_PLANT_POSITION_OVERRIDES } from '../../office-r1-layout.js'
import assert from 'node:assert/strict'

export function plantFootprintSamples(row, step = .05) {
  if (Number.isFinite(row.r)) return [{ x: row.x, z: row.z, r: row.r }]
  assert.ok(Number.isFinite(row.length) && row.length > 0, row.id + ' length')
  const n = Math.ceil(row.length / step), width = row.wall ? .3 : row.width
  assert.ok(Number.isFinite(width) && width > 0, row.id + ' width')
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = (i / n - .5) * row.length
    if (row.shape === 'arc') { const a = row.startDeg * Math.PI / 180 + (u + row.length / 2) / row.radius; return { x: row.x + row.radius * Math.cos(a), z: row.z + row.radius * Math.sin(a), r: width / 2 } }
    const a = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180
    return { x: row.x + u * Math.cos(a), z: row.z + u * Math.sin(a), r: width / 2 }
  })
}

export function insidePlantEnvelope(row, x, z, tolerance = 1e-5) {
  if (Number.isFinite(row.r)) return Math.hypot(x - row.x, z - row.z) <= row.r + tolerance
  if (row.shape === 'arc') {
    const radius = Math.hypot(x - row.x, z - row.z), start = row.startDeg * Math.PI / 180
    let angle = Math.atan2(z - row.z, x - row.x); while (angle < start - tolerance) angle += Math.PI * 2
    return Math.abs(radius - row.radius) <= row.width / 2 + tolerance && angle <= start + row.length / row.radius + tolerance
  }
  const a = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180, dx = x - row.x, dz = z - row.z
  return Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= row.length / 2 + tolerance && Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) <= (row.wall ? .3 : row.width) / 2 + tolerance
}

// Earlier-card invariants still compare every field, after the explicitly approved R3 translation.
export function withApprovedPlantMove(row) {
  const p=R1_PLANT_POSITION_OVERRIDES.find(p=>p.id===row.id||p.id===row.parentId)
  return p?{...row,xM:Number((row.xM+p.to.xM-p.from.xM).toFixed(6)),yM:Number((row.yM+p.to.yM-p.from.yM).toFixed(6))}:row
}
