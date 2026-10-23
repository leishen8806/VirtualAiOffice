import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { resolveWallOcclusion } from './office-v3-occlusion.js'

const boxMatrix = (THREE, matrix, x0, x1, y, h, z0, z1) => matrix.makeScale(x1 - x0, h, z1 - z0).setPosition((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2)
const sideNormal = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 }, east: { x: 1, z: 0 } }
const wallSegments = (layout) => {
  const e = layout.envelope, doors = layout.doors
  const sides = [
    ['north', e.x0, e.x1, e.z0, e.z0 + .18, doors.north],
    ['south', e.x0, e.x1, e.z1 - .18, e.z1, doors.south],
    ['west', e.z0, e.z1, e.x0, e.x0 + .18, null],
    ['east', e.z0, e.z1, e.x1 - .18, e.x1, null],
  ]
  const parts = []
  for (const [side, lo, hi, fixed0, fixed1, door] of sides) {
    const holes = door ? [{ lo: door.x0, hi: door.x1 }] : []
    let cursor = lo
    for (const hole of holes) { if (hole.lo > cursor) parts.push({ side, lo: cursor, hi: hole.lo, fixed0, fixed1 }); cursor = hole.hi }
    if (cursor < hi) parts.push({ side, lo: cursor, hi, fixed0, fixed1 })
  }
  return parts
}
const roomSegments = layout => layout.regions.flatMap(room => {
  const result = []
  for (const side of ['north', 'south', 'west', 'east']) {
    const vertical = side === 'west' || side === 'east'
    const lo = vertical ? room.z0 : room.x0, hi = vertical ? room.z1 : room.x1
    const holes = (room.doors || []).filter(door => door.side === side).map(door => ({ lo: door.at - door.width / 2, hi: door.at + door.width / 2 }))
    let cursor = lo
    for (const hole of holes) { if (hole.lo > cursor) result.push({ side, lo: cursor, hi: hole.lo, room }); cursor = hole.hi }
    if (cursor < hi) result.push({ side, lo: cursor, hi, room })
  }
  return result
})

export function buildOfficeShellV3Spec(layout) {
  return Object.freeze({
    envelope: layout.envelope,
    site: layout.site,
    wallHeight: layout.wallHeight,
    outer: wallSegments(layout),
    inner: roomSegments(layout),
    greenBuffer: layout.greenBuffer,
    cameraDefaults: layout.cameraDefaults,
  })
}

function addInstances(THREE, root, name, material, entries, colors = [], geometry = null) {
  if (!entries.length) return null
  const mesh = new THREE.InstancedMesh(geometry || new THREE.BoxGeometry(1, 1, 1), material, entries.length)
  const matrix = new THREE.Matrix4()
  entries.forEach((entry, index) => {
    matrix.copy(entry.matrix); mesh.setMatrixAt(index, matrix)
    if (colors[index]) mesh.setColorAt(index, colors[index])
  })
  mesh.instanceMatrix.needsUpdate = true; mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh)
  return mesh
}

const matrixEntry = (THREE, x0, x1, y, h, z0, z1) => ({ matrix: boxMatrix(THREE, new THREE.Matrix4(), x0, x1, y, h, z0, z1) })

export function buildOfficeShellV3({ THREE, root, layout, collision, low = false }) {
  const spec = buildOfficeShellV3Spec(layout), h = spec.wallHeight.standard
  const warm = new THREE.MeshStandardMaterial({ color: THEME.exteriorWall, roughness: THEME.wallRoughness, vertexColors: true })
  const inner = new THREE.MeshStandardMaterial({ color: THEME.interiorWall, roughness: THEME.wallRoughness })
  const glass = new THREE.MeshPhysicalMaterial({ color: THEME.glass, transparent: true, opacity: THEME.glassOpacity, roughness: THEME.glassRoughness, depthWrite: false })
  const proxies = []
  const floorEntries = [matrixEntry(THREE, spec.site.x0, spec.site.x1, 0, .08, spec.site.z0, spec.site.z1)]
  const floorColors = [new THREE.Color(THEME.exteriorWall)]
  const buffer = spec.greenBuffer
  const bw = buffer.width
  for (const [x0, x1, z0, z1] of [
    [buffer.x0, buffer.x1, buffer.z0, buffer.z0 + bw],
    [buffer.x0, buffer.x1, buffer.z1 - bw, buffer.z1],
    [buffer.x0, 0, buffer.z0 + bw, buffer.z1 - bw],
    [4, buffer.x1, buffer.z0 + bw, buffer.z1 - bw],
  ]) { floorEntries.push(matrixEntry(THREE, x0, x1, 0, .05, z0, z1)); floorColors.push(new THREE.Color(THEME.exteriorWall)) }
  for (const [x, z] of [[buffer.x0 + 1, buffer.z0 + 1], [buffer.x0 + 4, buffer.z0 + 1], [buffer.x1 - 1, buffer.z0 + 1], [buffer.x1 - 4, buffer.z0 + 1], [buffer.x0 + 1, buffer.z1 - 1], [buffer.x1 - 1, buffer.z1 - 1]]) {
    floorEntries.push({ matrix: new THREE.Matrix4().makeScale(1.4, 1.4, 1.4).setPosition(x, .35, z) })
    floorColors.push(new THREE.Color('#91b87b'))
  }
  const lowerEntries = [], lowerColors = [], glassEntries = []
  const wallState = []
  for (const segment of spec.outer) {
    const matrix = boxMatrix(THREE, new THREE.Matrix4(), segment.side === 'west' || segment.side === 'east' ? segment.fixed0 : segment.lo, segment.side === 'west' || segment.side === 'east' ? segment.fixed1 : segment.hi, 0, 3.5, segment.side === 'west' || segment.side === 'east' ? segment.lo : segment.fixed0, segment.side === 'west' || segment.side === 'east' ? segment.hi : segment.fixed1)
    lowerEntries.push({ matrix }); lowerColors.push(new THREE.Color(THEME.exteriorWall)); wallState.push({ matrix, side: segment.side, base: 3.5, index: lowerEntries.length - 1 })
  }
  for (const segment of spec.inner) {
    const vertical = segment.side === 'west' || segment.side === 'east'
    const x0 = vertical ? (segment.side === 'west' ? segment.room.x0 : segment.room.x1 - .14) : segment.lo
    const x1 = vertical ? (segment.side === 'west' ? segment.room.x0 + .14 : segment.room.x1) : segment.hi
    const z0 = vertical ? segment.lo : (segment.side === 'north' ? segment.room.z0 : segment.room.z1 - .14)
    const z1 = vertical ? segment.hi : (segment.side === 'north' ? segment.room.z0 + .14 : segment.room.z1)
    const solidHeight = ['board', 'review', 'plan'].includes(segment.room.id) ? .9 : 0
    if (solidHeight) { lowerEntries.push(matrixEntry(THREE, x0, x1, 0, solidHeight, z0, z1)); lowerColors.push(new THREE.Color(THEME.interiorWall)) }
    if (!low) glassEntries.push(matrixEntry(THREE, x0, x1, solidHeight, 2.2 - solidHeight, z0, z1))
  }
  const floorMaterial = new THREE.MeshBasicMaterial({ color: THEME.exteriorWall })
  const ground = addInstances(THREE, root, 'office3-ground', floorMaterial, floorEntries)
  ground.receiveShadow = false
  const walls = addInstances(THREE, root, 'office3-structure', warm, lowerEntries, lowerColors)
  const innerGlass = addInstances(THREE, root, 'office3-inner-glass', glass, glassEntries)
  const collisionEntries = []
  for (const segment of spec.inner) {
    const vertical = segment.side === 'west' || segment.side === 'east'
    collisionEntries.push(matrixEntry(THREE,
      vertical ? (segment.side === 'west' ? segment.room.x0 : segment.room.x1 - .14) : segment.lo,
      vertical ? (segment.side === 'west' ? segment.room.x0 + .14 : segment.room.x1) : segment.hi,
      0, 2.2,
      vertical ? segment.lo : (segment.side === 'north' ? segment.room.z0 : segment.room.z1 - .14),
      vertical ? segment.hi : (segment.side === 'north' ? segment.room.z0 + .14 : segment.room.z1)))
  }
  for (const entry of collisionEntries) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), inner)
    proxy.visible = false; proxies.push(proxy); proxy.position.setFromMatrixPosition(entry.matrix); proxy.scale.setFromMatrixScale(entry.matrix); root.add(proxy); collision?.add(proxy, 'office3-wall')
  }
  const windowEntries = low ? [] : spec.outer.map(segment => {
    const vertical = segment.side === 'west' || segment.side === 'east'
    return { matrix: boxMatrix(THREE, new THREE.Matrix4(), vertical ? segment.fixed0 : segment.lo, vertical ? segment.fixed1 : segment.hi, 3.5, 1, vertical ? segment.lo : segment.fixed0, vertical ? segment.hi : segment.fixed1) }
  })
  const windows = addInstances(THREE, root, 'office3-window-band', glass, windowEntries)
  const update = (dt, { camera } = {}) => {
    if (!walls || !camera || !wallState.length) return
    const elevation = Math.atan2(camera.position.y - 0.1, Math.hypot(camera.position.x - layout.axis.x, camera.position.z - layout.axis.z)) * 180 / Math.PI
    const target = { x: layout.axis.x, z: (layout.envelope.z0 + layout.envelope.z1) / 2 }
    for (const state of wallState) {
      const next = resolveWallOcclusion({ elevation, cameraPosition: camera.position, target, wallNormal: sideNormal[state.side], thresholds: { ...layout.wallHeight.occlusion, standard: state.base } })
      state.height += (next.height - state.height) * Math.min(1, Math.max(0, dt || 0) * 1000 / layout.wallHeight.occlusion.transitionMs)
      const segment = spec.outer[state.index]
      const vertical = segment.side === 'west' || segment.side === 'east'
      const matrix = boxMatrix(THREE, new THREE.Matrix4(), vertical ? segment.fixed0 : segment.lo, vertical ? segment.fixed1 : segment.hi, 0, state.height, vertical ? segment.lo : segment.fixed0, vertical ? segment.hi : segment.fixed1)
      walls.setMatrixAt(state.index, matrix)
      if (windows) { const wMatrix = boxMatrix(THREE, new THREE.Matrix4(), vertical ? segment.fixed0 : segment.lo, vertical ? segment.fixed1 : segment.hi, state.height, Math.max(0, state.height === state.base ? 1 : .08), vertical ? segment.lo : segment.fixed0, vertical ? segment.hi : segment.fixed1); windows.setMatrixAt(state.index, wMatrix) }
    }
    walls.instanceMatrix.needsUpdate = true; if (windows) windows.instanceMatrix.needsUpdate = true
  }
  // 初始外墙完整高度；只有相机低于阈值时按帧改变视觉代理。
  wallState.forEach(state => { state.height = state.base })
  return { root, spec, ground, walls, innerGlass, windows, onFrame: update, dispose() { for (const material of [warm, floorMaterial, inner, glass]) material.dispose(); for (const mesh of [ground, walls, innerGlass, windows]) { mesh?.geometry.dispose(); mesh?.removeFromParent() } for (const proxy of proxies) { proxy.geometry.dispose(); proxy.removeFromParent() } } }
}
