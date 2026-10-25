// 董事会批准的四席样板；只由对齐版 officeSample=1 解析生成这些唯一坐标。
export const FACING_SEATS = Object.freeze({
  QAAutomation: Object.freeze(['west-open', -14.3, -.4, Math.PI]),
  Reviewer1: Object.freeze(['west-open', -12.7, -.4, Math.PI]),
  Reviewer2: Object.freeze(['west-open', -14.3, .4, 0]),
  SecurityReviewer: Object.freeze(['west-open', -12.7, .4, 0]),
})
export const FACING_ISLAND_BOUNDS = Object.freeze({ x0: -15.55, x1: -11.45, z0: -1.75, z1: 1.75 })
export const facingSample = layout => layout?.variant === 'align' && layout.furnitureSample === true

export function facingHome([region, x, z]) {
  const seat = Object.values(FACING_SEATS).find(s => s[0] === region && s[1] === x && s[2] === z)
  return seat ? { x, z: z + (seat[3] ? -1 : 1), yaw: seat[3] } : null
}

export function facingAccess(layout, point) {
  if (!facingSample(layout)) return null
  const home = Object.values(FACING_SEATS).map(facingHome).find(h => Math.abs(h.x - point.x) < 1e-6 && Math.abs(h.z - point.z) < 1e-6)
  return home ? { x: home.x, z: home.z < 0 ? -2.3 : 2.3 } : null
}

export const posedPoint = (x, z, yaw, dx, dz) => ({ x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz })

export function marketSamplePlan(layout) {
  const room = layout.regions.find(r => r.id === 'market')
  if (!room || !facingSample(layout)) return null
  const x = (room.x0 + room.x1) / 2, z = (room.z0 + room.z1) / 2
  return { room: room.id, table: { id: 'market-shared-table', x, z, w: 1.2, d: 2.8, height: .8, thickness: .10 },
    visitors: [-1, 0, 1].map((dz, i) => ({ id: `market-visitor-${i + 1}`, x: x + 1.1, z: z + dz, yaw: Math.PI / 2, w: .52, d: .54, height: .98, interactive: false })) }
}

export function marketSamplePose(layout, index) {
  const plan = layout.marketSample === true && marketSamplePlan(layout)
  if (!plan) return null
  const { x, z } = plan.table
  return { home: { x: x - 1.1, z: z + index - 1 }, desk: { x: x - .3, z: z + index - 1 }, yaw: -Math.PI / 2 }
}
