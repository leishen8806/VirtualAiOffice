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
  const collisionRadius = bar.radius ?? 3.5
  return { center: { x: bar.center?.x ?? 2, z: bar.center?.z ?? -1 }, radius: bar.radius ?? 3.5,
    counterRadius: layout.island?.barOuter ?? collisionRadius, collisionRadius,
    innerRadius: 2.1, gapWidth: bar.gaps?.[0]?.width ?? 1.5, ring: { r0: 6, r1: 8 } }
}
export function barGaps(layout) {
  const { center, collisionRadius: radius, gapWidth } = barSpec(layout)
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
  return [0, Math.PI].flatMap(offset => Array.from({ length: count }, (_, i) => {
    const angle = offset + Math.PI * (.15 + .7 * i / (count - 1)), r = radius + .9
    return { id: `bar-seat-${offset ? 'south' : 'north'}-${i + 1}`, x: center.x + Math.cos(angle) * r,
      z: center.z + Math.sin(angle) * r, yaw: -angle - Math.PI / 2, angle }
  }))
}
export function barColliders(layout) {
  const { center, collisionRadius: radius, innerRadius, gapWidth } = barSpec(layout)
  return barArcs(layout).flatMap((arc, side) => Array.from({ length: 6 }, (_, index) => {
    const a = arc.start + (arc.end - arc.start) * index / 6
    const b = arc.start + (arc.end - arc.start) * (index + 1) / 6
    const angles = [a, b, ...[Math.PI / 2, Math.PI * 1.5].filter(v => v > a && v < b)]
    const points = angles.flatMap(angle => [innerRadius, radius].map(r => ({ x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r })))
    return { id: `office2-bar-collision-${side}-${index}`, x0: Math.min(...points.map(p => p.x)),
      x1: Math.max(...points.map(p => p.x)), z0: Math.max(side ? -Infinity : center.z + gapWidth / 2, Math.min(...points.map(p => p.z))),
      z1: Math.min(side ? center.z - gapWidth / 2 : Infinity, Math.max(...points.map(p => p.z))) }
  }))
}
export function barLounges(layout) {
  const { center } = barSpec(layout)
  return ['east', 'west'].flatMap(side => [-20, 0, 20].map((degree, index) => {
    const angle = (degree + (side === 'west' ? 180 : 0)) * Math.PI / 180
    return { id: `lounge-${side}-${index + 1}`, side, x: center.x + Math.cos(angle) * 5.25, z: center.z + Math.sin(angle) * 5.25,
      yaw: Math.PI / 2 - angle, appX: center.x + Math.cos(angle) * 4.7, appZ: center.z + Math.sin(angle) * 4.7, angle,
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
