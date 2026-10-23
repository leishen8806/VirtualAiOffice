// 纯函数：只决定视觉代理，不改碰撞墙和寻路边界。
export function resolveWallOcclusion({ elevation, cameraPosition, target, wallNormal, thresholds }) {
  const full = { height: thresholds.standard, glassOpacity: 1, lowered: false }
  if (!Number.isFinite(elevation) || elevation >= thresholds.triggerElevation) return full
  const dx = Number(cameraPosition?.x) - Number(target?.x)
  const dz = Number(cameraPosition?.z) - Number(target?.z)
  const length = Math.hypot(dx, dz)
  if (!length) return full
  const facing = (dx / length) * wallNormal.x + (dz / length) * wallNormal.z
  return facing > 0.2
    ? { height: thresholds.loweredHeight, glassOpacity: thresholds.glassOpacity, lowered: true }
    : full
}
