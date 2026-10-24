const TAU = Math.PI * 2
// people.js + sit_chair_idle_relaxed_01 全循环实测（人物原点朝 +z）：
// male hipY/kneeZ/footZ = .57691/.32253/.59118m；female = .58626/.33929/.40283m。
// seatTop 取双体型髋高中值约 .5816m 减 .08m 软垫压缩；前沿 .24m 落在膝关节之后。
export const LOUNGE_SIT = Object.freeze({
  seatTop: .5,
  seatDepth: .48,
  legRoom: .34,
  hipForward: .03,
  hipLift: 0,
})
export function barSpec(layout = {}) {
  const bar = layout.bar || layout
  const radius = bar.radius ?? 3.5
  return { center: { x: bar.center?.x ?? 2, z: bar.center?.z ?? -1 }, radius,
    innerRadius: 2.1, gapWidth: bar.gaps?.[0]?.width ?? 1.5, ring: { r0: 6, r1: 8 },
    ...(layout.island?.barOuter != null && layout.island.barOuter !== radius ? { counterRadius: layout.island.barOuter, collisionRadius: radius } : {}) }
}
export function barGaps(layout) {
  const { center, radius, gapWidth } = barSpec(layout)
  return ['east', 'west'].map(side => ({ side, width: gapWidth, x: center.x + (side === 'east' ? 1 : -1) * radius,
    z0: center.z - gapWidth / 2, z1: center.z + gapWidth / 2 }))
}
export function barArcs(layout) {
  const { innerRadius, gapWidth } = barSpec(layout)
  const angle = Math.asin(gapWidth / (2 * innerRadius))
  return [{ start: angle, end: Math.PI - angle }, { start: Math.PI + angle, end: TAU - angle }]
}
export function barSeats(layout, low = false) {
  const { center, radius } = barSpec(layout), count = low ? 3 : 5
  const separate = barSpec(layout).counterRadius != null
  if (separate && layout.bar?.seats) return layout.bar.seats.map(seat => {
    const angle = seat.angle ?? Math.atan2(seat.z - center.z, seat.x - center.x)
    return { ...seat, angle, yaw: seat.yaw ?? -angle - Math.PI / 2 }
  })
  return [0, Math.PI].flatMap(offset => Array.from({ length: count }, (_, i) => {
    const angle = offset + Math.PI * (.15 + .7 * i / (count - 1)), r = separate ? layout.island.stoolRadius ?? layout.island.barOuter + .9 : radius + .9
    return { id: `bar-seat-${offset ? 'south' : 'north'}-${i + 1}`, x: center.x + Math.cos(angle) * r,
      z: center.z + Math.sin(angle) * r, yaw: -angle - Math.PI / 2, angle }
  }))
}
export function barColliders(layout) {
  const { center, radius, innerRadius, gapWidth } = barSpec(layout)
  // ALIGN r=6: <=π/32 angular steps keep AABB corners below 6.3m; stable V3 retains its exact boxes.
  const segments = layout?.variant === 'align' ? 32 : 6
  return barArcs(layout).flatMap((arc, side) => Array.from({ length: segments }, (_, index) => {
    const a = arc.start + (arc.end - arc.start) * index / segments
    const b = arc.start + (arc.end - arc.start) * (index + 1) / segments
    const angles = [a, b, ...[Math.PI / 2, Math.PI * 1.5].filter(v => v > a && v < b)]
    const points = angles.flatMap(angle => [innerRadius, radius].map(r => ({ x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r })))
    return { id: `office2-bar-collision-${side}-${index}`, x0: Math.min(...points.map(p => p.x)),
      x1: Math.max(...points.map(p => p.x)), z0: Math.max(side ? -Infinity : center.z + gapWidth / 2, Math.min(...points.map(p => p.z))),
      z1: Math.min(side ? center.z - gapWidth / 2 : Infinity, Math.max(...points.map(p => p.z))) }
  }))
}
export function barLounges(layout) {
  const { center, counterRadius } = barSpec(layout)
  const r = counterRadius == null ? 5.25 : layout.island.sofaOuter ?? 5.25, appR = counterRadius == null ? 4.7 : r - .55
  return ['east', 'west'].flatMap(side => [-20, 0, 20].map((degree, index) => {
    const angle = (degree + (side === 'west' ? 180 : 0)) * Math.PI / 180
    return { id: `lounge-${side}-${index + 1}`, side, x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r,
      yaw: Math.PI / 2 - angle, appX: center.x + Math.cos(angle) * appR, appZ: center.z + Math.sin(angle) * appR, angle,
      sitOffset: { forward: LOUNGE_SIT.hipForward, lift: LOUNGE_SIT.hipLift } }
  }))
}
export function validateBarGeometry(layout) {
  const spec = barSpec(layout)
  const errors = []
  if (spec.gapWidth < 1.2 || spec.gapWidth >= spec.innerRadius * 2) errors.push('GAP_WIDTH')
  if (spec.center.x !== 2 || spec.center.z !== -1 || spec.radius !== 3.5) errors.push('BAR_CONTRACT')
  return { ok: errors.length === 0, errors }
}

export function validateIslandRings(layout = {}) {
  if (!layout || typeof layout !== 'object' || (layout.bar?.seats != null && (!Array.isArray(layout.bar.seats) || layout.bar.seats.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z))))) return { ok: false, errors: ['INVALID_RING'], sofaOuterEdge: null }
  const spec = barSpec(layout), counter = spec.counterRadius ?? spec.radius
  const sofa = spec.counterRadius == null ? 5.25 : layout.island.sofaOuter ?? 5.25
  // 对应样板弧形靠背最外角：半宽 .675、靠背后沿 .27；不是只检查座位中心。
  const sofaOuterEdge = sofa >= .675 ? Math.hypot(2 * sofa - Math.sqrt(sofa * sofa - .675 ** 2) + .27, .675) : null
  const radii = barSeats(layout).map(p => Math.hypot(p.x - spec.center.x, p.z - spec.center.z))
  const errors = []
  if (!Number.isFinite(sofaOuterEdge) || !Number.isFinite(spec.radius) || !Number.isFinite(counter) || radii.some(r => !Number.isFinite(r))) errors.push('INVALID_RING')
  if (sofaOuterEdge > spec.radius) errors.push('SOFA_BEYOND_COLLISION')
  // 董事会裁决：坐垫到台面边缘净距 .30m；不是通道宽度。坐垫半径 .28，台面外挑 .045。
  if (radii.some(r => r - .28 - (counter + .045) < .30 - 1e-9)) errors.push('STOOL_COUNTER_CLEARANCE')
  if (radii.some(r => r + .28 >= sofa - LOUNGE_SIT.seatDepth / 2)) errors.push('SEAT_RINGS_INTERSECT')
  if (!Number.isFinite(spec.gapWidth) || spec.gapWidth < 1.5 || spec.gapWidth >= spec.innerRadius * 2) errors.push('GAP_WIDTH')
  return { ok: errors.length === 0, errors, sofaOuterEdge }
}
