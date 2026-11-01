import { WH_R1_DATA } from './wh-r1/data.js'

export const WH_R1_FLOOR_Y = -.59
export const WH_R1_WORLD_OFFSET = Object.freeze({ x: -64, z: 0 })
export const WH_R1_WORLD_ORIGIN = Object.freeze({ x: -168 + WH_R1_WORLD_OFFSET.x, z: 30 + WH_R1_WORLD_OFFSET.z })
export const WH_R1_SITE_SOURCE_BBOX = Object.freeze([-6, -12, 160, 104])
export const WH_R1_BUILDING_SOURCE_BBOX = Object.freeze([0, 0, 88, 48])

const coordinate = value => Number(value.toFixed(6))
export const whToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM + WH_R1_WORLD_ORIGIN.x), z: coordinate(WH_R1_WORLD_ORIGIN.z - yM) })
export const whElementWorld = row => Object.freeze({ ...whToWorld(row.xM, row.yM), y: row.zM })
// Input bbox is [x0, y0, x1, y1]; output is [world_x0, world_x1, world_z0, world_z1].
export const whZoneToWorld = ([x0, y0, x1, y1]) => Object.freeze([coordinate(x0 + WH_R1_WORLD_ORIGIN.x), coordinate(x1 + WH_R1_WORLD_ORIGIN.x), coordinate(WH_R1_WORLD_ORIGIN.z - y1), coordinate(WH_R1_WORLD_ORIGIN.z - y0)])
export const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }
export const createWhR1Layout = () => Object.freeze({ data: WH_R1_DATA, elements: WH_R1_DATA.elements, routes: WH_R1_DATA.routes })
