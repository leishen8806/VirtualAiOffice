// 模拟路线，非实测；换真实数据时替换本文件。
const point = (xM, yM) => Object.freeze({ xM, yM })
const route = (id, vehicleType, points, backingIndex) => Object.freeze({ id, vehicleType, laneWidthM: 8, turningRadiusM: vehicleType === 'semitrailer' ? 12 : 6, points: Object.freeze(points.map(([xM, yM]) => point(xM, yM))), backingIndex })
export const WH_R1_LIVE3_ROUTES = Object.freeze({
  inbound: Object.freeze([
    route('WH-R1-INBOUND-01', 'semitrailer', [[158.5, 14.5], [145, 14.5], [138, 28], [138, 58], [42, 64], [26.525, 64], [26.525, 56.8]], 5),
    route('WH-R1-INBOUND-02', 'semitrailer', [[158.5, 14.5], [145, 14.5], [138, 28], [138, 58], [42, 64], [20.675, 64], [20.675, 56.8]], 5),
    route('WH-R1-INBOUND-03', 'semitrailer', [[158.5, 14.5], [145, 14.5], [138, 28], [138, 58], [42, 64], [14.825, 64], [14.825, 56.8]], 5),
    route('WH-R1-INBOUND-04', 'semitrailer', [[158.5, 14.5], [145, 14.5], [138, 28], [138, 58], [42, 64], [8.975, 64], [8.975, 56.8]], 5),
  ]),
  outbound: Object.freeze([
    route('WH-R1-OUTBOUND-01', 'delivery-train', [[120.8, 16], [130, 16], [145, 14.5], [158.5, 14.5]], -1),
    route('WH-R1-OUTBOUND-02', 'delivery-train', [[120.8, 23], [130, 23], [145, 14.5], [158.5, 14.5]], -1),
    route('WH-R1-OUTBOUND-03', 'delivery-tricycle', [[120.8, 30], [130, 30], [145, 14.5], [158.5, 14.5]], -1),
    route('WH-R1-OUTBOUND-04', 'delivery-tricycle', [[120.8, 37], [130, 37], [145, 14.5], [158.5, 14.5]], -1),
  ]),
})
export const WH_R1_LIVE3_ROUTE_NOTES = Object.freeze({ gate: 'WH-14-GT-001 · [158.5,14.5]', inbound: '大门 → 东侧入口通道 → 南侧回转空场 → WH-01 收货车位；半挂车末段倒车入位。', outbound: 'WH-06 出货位 → 东侧回转段 → 大门；配送车头向前出场。', clearance: '8 m 车道；半挂车 12 m、配送车 6 m 常见最小转弯半径；已按登记建筑、围墙、车位车辆和绿化避让设计，非实测。' })
const worldPoint = ({ xM, yM }) => ({ x: xM - 232, z: 30 - yM })
export function routeForVehicle(row) {
  const fleet = row.displayVehicleType === 'semitrailer' ? WH_R1_LIVE3_ROUTES.inbound : WH_R1_LIVE3_ROUTES.outbound
  const index = fleet.findIndex(item => { const p = row.displayVehicleType === 'semitrailer' ? item.points.at(-1) : item.points[0]; return p.xM === row.xM && p.yM === row.yM })
  const source = fleet[index >= 0 ? index : 0]
  return { ...source, points: source.points.map(worldPoint) }
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export function poseOnRoute(route, progress, reverse = false) {
  const lengths = route.slice(1).map((b, i) => distance(route[i], b)), total = lengths.reduce((sum, value) => sum + value, 0)
  let left = Math.max(0, Math.min(1, progress)) * total
  for (let i = 0; i < lengths.length; i++) { if (left <= lengths[i]) { const a = route[i], b = route[i + 1], ratio = lengths[i] ? left / lengths[i] : 0; return { x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio, yaw: Math.atan2(b.z - a.z, b.x - a.x) + (reverse ? Math.PI : 0) } } left -= lengths[i] }
  const a = route.at(-2), b = route.at(-1)
  return { x: b.x, z: b.z, yaw: Math.atan2(b.z - a.z, b.x - a.x) + (reverse ? Math.PI : 0) }
}
