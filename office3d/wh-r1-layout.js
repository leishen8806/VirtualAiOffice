import { WH_R1_DATA } from './wh-r1/data.js'

const coordinate = value => Number(value.toFixed(6))
export const whToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM - 168), z: coordinate(30 - yM) })
export const whElementWorld = row => Object.freeze({ ...whToWorld(row.xM, row.yM), y: row.zM })
// Input bbox is [x0, y0, x1, y1]; output is [world_x0, world_x1, world_z0, world_z1].
export const whZoneToWorld = ([x0, y0, x1, y1]) => Object.freeze([coordinate(x0 - 168), coordinate(x1 - 168), coordinate(30 - y1), coordinate(30 - y0)])
export const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }
export const createWhR1Layout = () => Object.freeze({ data: WH_R1_DATA, elements: WH_R1_DATA.elements, routes: WH_R1_DATA.routes })
