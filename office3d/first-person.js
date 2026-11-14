export const FIRST_PERSON_EYE_HEIGHT = 1.6

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function createFirstPerson({ bounds, collision, radius = .28 } = {}) {
  if (!bounds || !collision?.navigationHit) throw new Error('first-person requires bounds and collision')
  const state = { active: false, x: 0, z: 0, yaw: 0, pitch: 0, restore: null }
  const inside = (x, z) => x >= bounds.x0 + radius && x <= bounds.x1 - radius && z >= bounds.z0 + radius && z <= bounds.z1 - radius
  const blocked = (x, z) => !inside(x, z) || collision.navigationHit(x, z, radius)
  const tryMove = (dx, dz) => {
    const x = state.x + dx, z = state.z + dz
    if (!blocked(x, z)) { state.x = x; state.z = z; return true }
    if (!blocked(x, state.z)) { state.x = x; return true }
    if (!blocked(state.x, z)) { state.z = z; return true }
    return false
  }
  return {
    state,
    enter({ x, z, yaw = 0, pitch = 0, restore } = {}) {
      state.active = true; state.x = clamp(x, bounds.x0 + radius, bounds.x1 - radius); state.z = clamp(z, bounds.z0 + radius, bounds.z1 - radius); state.yaw = yaw; state.pitch = clamp(pitch, -.8, .8); state.restore = restore || null
    },
    exit() { const restore = state.restore; state.active = false; state.restore = null; return restore },
    turn(dx, dy) { state.yaw -= dx * .004; state.pitch = clamp(state.pitch - dy * .004, -.8, .8) },
    move({ forward = 0, right = 0, fast = false } = {}, dt = 0) {
      if (!state.active || (!forward && !right)) return false
      const size = (fast ? 5 : 2.6) * Math.max(0, Math.min(.1, dt))
      const length = Math.hypot(forward, right) || 1
      const f = forward / length * size, r = right / length * size, sin = Math.sin(state.yaw), cos = Math.cos(state.yaw)
      return tryMove(sin * f + cos * r, cos * f - sin * r)
    },
  }
}
