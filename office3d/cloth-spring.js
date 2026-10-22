// 小幅衣片二次运动：固定步长、阻尼弹簧、相邻点约束和位移上限。
// shortcut: 贴着原蒙皮解算，不包含布料自碰撞；大幅裙摆/披风需独立衣片资产。
export function createClothSpring(weights, edges, limit = 0.6) {
  const offset = new Float32Array(weights.length * 3)
  const velocity = new Float32Array(offset.length)
  let accumulator = 0
  function update(dt, force) {
    accumulator += Math.max(0, Math.min(0.1, dt))
    const h = 1 / 120
    while (accumulator >= h) {
      accumulator -= h
      for (let i = 0; i < weights.length; i++) for (let c = 0; c < 3; c++) {
        const k = i * 3 + c
        velocity[k] += ((force[c] * weights[i] - offset[k] * 95) - velocity[k] * 14) * h
        offset[k] += velocity[k] * h
      }
      // 限制相邻顶点相对位移，防止接缝裂开和局部尖刺。
      for (const [a, b] of edges) for (let c = 0; c < 3; c++) {
        const ia = a * 3 + c, ib = b * 3 + c
        const d = (offset[ib] - offset[ia]) * 0.12
        offset[ia] += d * weights[a]; offset[ib] -= d * weights[b]
      }
      for (let i = 0; i < weights.length; i++) {
        const k = i * 3, length = Math.hypot(offset[k], offset[k + 1], offset[k + 2])
        const max = limit * weights[i]
        if (length > max) for (let c = 0; c < 3; c++) { offset[k + c] *= max / length; velocity[k + c] *= 0.5 }
      }
    }
    return offset
  }
  return { update, offset, velocity }
}
