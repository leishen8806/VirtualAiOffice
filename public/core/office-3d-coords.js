/* P5-1: 3D 座位坐标换算（纯函数，无副作用）。
 *
 * 3D 座位位置由 2D 办公室的 ZONE_POSITIONS（cx, cy, angle）换算得到，
 * 保证 3D 与 2.5D 回退时角色不换位置。规则（已冻结）：
 *   - 地面原点取中心；1 个 2D 逻辑单位 = 0.02 米
 *   - x = cx * 0.02 - 16
 *   - z = cy * 0.02 - 9
 *   - yaw(度) = 2D 里的 angle，原样透传
 *
 * 只读计算，不读取 document/window，不产生任何副作用。
 * 导出 VAOOffice3DCoords。
 */
;(function () {
  'use strict'

  const SCALE = 0.02
  const ORIGIN_X = 16
  const ORIGIN_Z = 9

  /** 把 2D 逻辑坐标换算为 3D 世界 (x, z)，单位米，四舍五入到 4 位小数。 */
  function toWorld(cx, cy) {
    const x = Math.round((cx * SCALE - ORIGIN_X) * 1e4) / 1e4
    const z = Math.round((cy * SCALE - ORIGIN_Z) * 1e4) / 1e4
    return { x, z }
  }

  /** 把单个座位换算为 3D 世界坐标，seat 形如 { cx, cy, angle }。 */
  function seatToWorld(seat) {
    const { x, z } = toWorld(seat.cx, seat.cy)
    return { x, z, yaw: seat.angle }
  }

  const api = Object.freeze({
    SCALE,
    ORIGIN_X,
    ORIGIN_Z,
    toWorld,
    seatToWorld,
  })

  globalThis.VAOOffice3DCoords = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()