// 人物使用保守的水平圆柱净距；不把它当作衣料/四肢的完整网格碰撞。
export const PERSON_GAP = 0.52

export function createPedestrianTraffic({ views, board, furnitureCollision }) {
  const blockers = new WeakMap()
  function blocked(view, start, end) {
    const dx = end.x - start.x, dz = end.z - start.z, length2 = dx * dx + dz * dz
    for (const other of [...views.values(), ...Object.values(board)]) {
      if (other === view || other.away || !other.char) continue
      const p = other.char.group.position
      const t = length2 ? Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.z - start.z) * dz) / length2)) : 0
      const distance = Math.hypot(start.x + dx * t - p.x, start.z + dz * t - p.z)
      const initial = Math.hypot(start.x - p.x, start.z - p.z)
      // 既有重叠只能离开，不能因“已经重叠”被永久锁死。
      if (distance < PERSON_GAP - 1e-6 && (initial >= PERSON_GAP - 1e-6 || Math.hypot(end.x - p.x, end.z - p.z) <= initial + 1e-6)) return other
    }
    return null
  }
  function move(view, dx, dz, ignore) {
    const position = view.char.group.position, start = { x: position.x, z: position.z }
    let encountered = null
    const attempt = (x, z) => {
      const next = { ...start }
      if (furnitureCollision) furnitureCollision.move(next, x, z, ignore)
      else { next.x += x; next.z += z }
      if (blocked(view, start, next)) return false
      position.x = next.x; position.z = next.z
      return Math.hypot(next.x - start.x, next.z - start.z) > 1e-6
    }
    if (!attempt(dx, dz)) {
      const other = blocked(view, start, { x: start.x + dx, z: start.z + dz })
      encountered = other
      blockers.set(view, other || null)
      // 绕开静止的人；会车双方各向自己的右侧挪步，不能向左随机摆动。
      if (other) {
        attempt((dx - dz) / Math.SQRT2, (dz + dx) / Math.SQRT2) || attempt(-dz, dx)
      }
    }
    const moved = Math.hypot(position.x - start.x, position.z - start.z)
    if (moved > 1e-6 && !encountered) blockers.set(view, null)
    return moved
  }
  return { move, blocker: view => blockers.get(view) || null }
}
