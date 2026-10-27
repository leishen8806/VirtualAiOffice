import { C01_DELTA, R1_DATA } from './office-r1/data.js'

export const DEFAULT_CANDIDATE_C01 = true
const coordinate = value => Number(value.toFixed(6))
export const r1ToWorld = (xM, yM) => Object.freeze({ x: coordinate(xM - 26), z: coordinate(18 - yM) })
export const r1ElementWorld = row => Object.freeze({ ...r1ToWorld(row.xM, row.yM), y: row.zM })
export const runtimeYawFromFacing = (fx, fz) => { const yaw = Math.atan2(-fx, -fz); return Object.is(yaw, -0) ? 0 : yaw }
export function createR1Layout({ candidateC01 = DEFAULT_CANDIDATE_C01 } = {}) {
  const replacements = candidateC01 ? new Map(C01_DELTA.elements.map(item => [item.id, item.candidate])) : new Map()
  return Object.freeze({ candidateC01, data: R1_DATA, elements: Object.freeze(R1_DATA.elements.map(item => replacements.get(item.id) || item)), workstations: Object.freeze(candidateC01 ? C01_DELTA.workstations.reduce((rows, delta) => rows.map(row => row.business_id === delta.businessId ? delta.candidate : row), R1_DATA.workstations) : R1_DATA.workstations), controls: Object.freeze(candidateC01 ? { ...R1_DATA.controls, ...C01_DELTA.controls } : R1_DATA.controls), routes: R1_DATA.routes })
}
