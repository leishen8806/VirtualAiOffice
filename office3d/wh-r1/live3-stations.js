import { WH_R1_CONVEYOR_PATH, WH_R1_WORKFLOW } from '../dr-wh-r1-workflow.js'
import { whToWorld } from '../wh-r1-layout.js'

const belt = WH_R1_WORKFLOW.find(row => row.id === 'WH-04-CV-001')
const startX = belt.xM - belt.lengthM / 2
const station = (id, fraction, parts) => Object.freeze({
  id, beltId: belt.id, xM: startX + belt.lengthM * fraction, yM: belt.yM,
  beltDistanceM: belt.lengthM * fraction,
  parts: Object.freeze(parts.map(Object.freeze)),
})

// Offsets are local to the registered straight belt. The scale touches the
// roller surface; the other structural pieces stay outside the belt rails.
export const LIVE3_STATIONS = Object.freeze([
  station('WH-DEMO-SCAN-001', .55, [
    { dx: 0, dy: -.49, zM: 0, l: .12, w: .12, h: 2.1, color: 0x51859b },
    { dx: 0, dy: .49, zM: 0, l: .12, w: .12, h: 2.1, color: 0x51859b },
    { dx: 0, dy: 0, zM: 2.1, l: .16, w: 1.10, h: .14, color: 0x51859b },
    { dx: .06, dy: .49, zM: 1.52, l: .08, w: .24, h: .18, color: 0x18323b },
  ]),
  station('WH-DEMO-SCALE-001', .67, [
    { dx: 0, dy: 0, zM: belt.heightM, l: .55, w: .59, h: .03, color: 0xa8bfc8 },
  ]),
  station('WH-DEMO-EXC-001', .79, [
    { dx: 0, dy: .52, zM: 0, l: .44, w: .20, h: .87, color: 0xa95641 },
    { dx: 0, dy: .52, zM: .87, l: .44, w: .20, h: .06, color: 0xcc7656 },
  ]),
])

const segments = WH_R1_CONVEYOR_PATH.slice(1).map((end, i) => {
  const start = WH_R1_CONVEYOR_PATH[i]
  return { start, end, length: Math.hypot(end.x - start.x, end.z - start.z) }
})
export const LIVE3_BELT_LENGTH = segments.reduce((sum, part) => sum + part.length, 0)
export const LIVE3_BELT_TOP = belt.zM + belt.heightM
export function live3BeltPoint(distance, height = LIVE3_BELT_TOP) {
  let remaining = Math.max(0, Math.min(LIVE3_BELT_LENGTH, distance))
  for (const { start, end, length } of segments) {
    if (remaining <= length) {
      const t = remaining / length
      return { x: start.x + (end.x - start.x) * t, y: height, z: start.z + (end.z - start.z) * t }
    }
    remaining -= length
  }
  return { ...segments.at(-1).end, y: height }
}

export const stationPoint = (station, dx = 0, dy = 0) => whToWorld(station.xM + dx, station.yM + dy)
export function buildLive3Stations({ THREE, group }) {
  const parts = LIVE3_STATIONS.flatMap(station => station.parts.map(part => ({ station, part })))
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ roughness: .78 })
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length)
  const dummy = new THREE.Object3D()
  parts.forEach(({ station, part }, index) => {
    const point = stationPoint(station, part.dx, part.dy)
    dummy.position.set(point.x, part.zM + part.h / 2, point.z)
    dummy.scale.set(part.l, part.h, part.w)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, new THREE.Color(part.color))
  })
  mesh.name = 'wh-r1-live3-demo-stations'
  mesh.userData = { noMerge: true, instanceToRegisterId: parts.map(({ station }) => station.id) }
  group.add(mesh)
  return { mesh, dispose() { geometry.dispose(); material.dispose(); mesh.dispose() } }
}
