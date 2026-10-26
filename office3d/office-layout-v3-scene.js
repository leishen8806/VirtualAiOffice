import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { resolveWallOcclusion } from './office-v3-occlusion.js'
import { officePlan1InnerWalls } from './office-plan1-layout.js'

const boxMatrix = (THREE, matrix, x0, x1, y, h, z0, z1) => matrix.makeScale(x1 - x0, h, z1 - z0).setPosition((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2)
const sideNormal = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 }, east: { x: 1, z: 0 } }
const line = (a, b, side = 'curve', kind = 'solid', room = null) => ({ a, b, side, kind, room, normal: { x: b.z - a.z, z: a.x - b.x } })
const arcLines = (arc, count = 12) => Array.from({ length: count }, (_, i) => {
  const angle = degree => degree * Math.PI / 180, a = angle(arc.startDeg + (arc.endDeg - arc.startDeg) * i / count), b = angle(arc.startDeg + (arc.endDeg - arc.startDeg) * (i + 1) / count)
  return line({ x: arc.center.x + Math.cos(a) * arc.radius, z: arc.center.z + Math.sin(a) * arc.radius }, { x: arc.center.x + Math.cos(b) * arc.radius, z: arc.center.z + Math.sin(b) * arc.radius })
})
const wallSegments = (layout) => {
  if (layout.plan1Phase === 'L1') return [
    line({x:layout.envelope.x0,z:layout.envelope.z0},{x:layout.envelope.x1,z:layout.envelope.z0},'north'),
    line({x:layout.envelope.x0,z:layout.envelope.z0},{x:layout.envelope.x0,z:15},'west'),
    line({x:layout.envelope.x1,z:15},{x:layout.envelope.x1,z:layout.envelope.z0},'east'),
    ...arcLines(layout.entrance.leftArc),
    line({x:-4,z:18},{x:-1,z:18},'south'), line({x:5,z:18},{x:8,z:18},'south'),
    ...arcLines(layout.entrance.rightArc),
  ]
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
const roomSegments = layout => layout.regions.filter(room => layout.variant !== 'align' || room.walled === true).flatMap(room => {
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
    inner: layout.plan1Phase === 'L1' ? officePlan1InnerWalls(layout) : roomSegments(layout),
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
const segmentMatrix = (THREE, segment, y, h, thickness = .18) => {
  if (!segment.a) return boxMatrix(THREE,new THREE.Matrix4(),segment.side==='west'||segment.side==='east'?segment.fixed0:segment.lo,segment.side==='west'||segment.side==='east'?segment.fixed1:segment.hi,y,h,segment.side==='west'||segment.side==='east'?segment.lo:segment.fixed0,segment.side==='west'||segment.side==='east'?segment.hi:segment.fixed1)
  const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,length=Math.hypot(dx,dz),position=new THREE.Vector3((segment.a.x+segment.b.x)/2,y+h/2,(segment.a.z+segment.b.z)/2),quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(dz,dx))
  return new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(length,h,thickness))
}

export function buildOfficeShellV3({ THREE, root, layout, collision, low = false }) {
  const spec = buildOfficeShellV3Spec(layout), h = spec.wallHeight.standard
  const warm = new THREE.MeshStandardMaterial({ color: THEME.exteriorWall, emissive: THEME.exteriorWall, emissiveIntensity: .28, roughness: THEME.wallRoughness, vertexColors: true, toneMapped: false })
  const inner = new THREE.MeshStandardMaterial({ color: THEME.interiorWall, roughness: THEME.wallRoughness })
  const glass = new THREE.MeshPhysicalMaterial({ color: THEME.glass, transparent: true, opacity: THEME.glassOpacity, roughness: THEME.glassRoughness, depthWrite: false })
  const proxies = []
  let disposed = false
  const floorEntries = [matrixEntry(THREE, spec.site.x0, spec.site.x1, 0, .08, spec.site.z0, spec.site.z1)]
  const floorColors = [new THREE.Color(THEME.exteriorWall)]
  const buffer = spec.greenBuffer
  const bw = buffer.width
  const greenEntries = []
  const addGreen = (x, z) => greenEntries.push({ matrix: new THREE.Matrix4().makeScale(.95, .8, .95).setPosition(x, .42, z) })
  for (let x = buffer.x0 + 1.2; x < buffer.x1; x += 3.2) {
    addGreen(x, buffer.z0 + bw / 2)
    if (x < 0 || x > 4) addGreen(x, buffer.z1 - bw / 2)
  }
  for (let z = buffer.z0 + bw + 1.2; z < buffer.z1 - bw; z += 3.2) {
    addGreen(buffer.x0 + bw / 2, z); addGreen(buffer.x1 - bw / 2, z)
  }
  const lowerEntries = [], lowerColors = [], glassEntries = []
  const wallState = []
  for (const segment of spec.outer) {
    const matrix = segmentMatrix(THREE,segment,0,3.5)
    lowerEntries.push({ matrix }); lowerColors.push(new THREE.Color(THEME.exteriorWall)); wallState.push({ matrix, segment, side: segment.side, base: 3.5, index: lowerEntries.length - 1 })
  }
  for (const segment of spec.inner) {
    if(segment.a){const solidHeight=segment.kind==='solid'?2.2:.9;if(solidHeight) {lowerEntries.push({matrix:segmentMatrix(THREE,segment,0,solidHeight,.14)});lowerColors.push(new THREE.Color(THEME.interiorWall))}if(!low&&segment.kind==='glass')glassEntries.push({matrix:segmentMatrix(THREE,segment,solidHeight,2.2-solidHeight,.14)});continue}
    const vertical = segment.side === 'west' || segment.side === 'east',x0=vertical?(segment.side==='west'?segment.room.x0:segment.room.x1-.14):segment.lo,x1=vertical?(segment.side==='west'?segment.room.x0+.14:segment.room.x1):segment.hi,z0=vertical?segment.lo:(segment.side==='north'?segment.room.z0:segment.room.z1-.14),z1=vertical?segment.hi:(segment.side==='north'?segment.room.z0+.14:segment.room.z1),solidHeight=['board','review','plan'].includes(segment.room.id)?.9:0
    if(solidHeight){lowerEntries.push(matrixEntry(THREE,x0,x1,0,solidHeight,z0,z1));lowerColors.push(new THREE.Color(THEME.interiorWall))}if(!low)glassEntries.push(matrixEntry(THREE,x0,x1,solidHeight,2.2-solidHeight,z0,z1))
  }
  const floorMaterial = new THREE.MeshBasicMaterial({ color: THEME.exteriorWall })
  const greenMaterial = new THREE.MeshStandardMaterial({ color: '#91b87b', roughness: .9 })
  const ground = addInstances(THREE, root, 'office3-ground', floorMaterial, floorEntries)
  ground.receiveShadow = false
  const greenGeometry = new THREE.IcosahedronGeometry(.72, low ? 0 : 1)
  const green = addInstances(THREE, root, 'office3-green-buffer', greenMaterial, greenEntries, [], greenGeometry)
  const walls = addInstances(THREE, root, 'office3-structure', warm, lowerEntries, lowerColors)
  walls.castShadow = false; walls.receiveShadow = false
  const innerGlass = addInstances(THREE, root, 'office3-inner-glass', glass, glassEntries)
  const collisionEntries = []
  for (const segment of spec.inner) {
    if(segment.a){collisionEntries.push({matrix:segmentMatrix(THREE,segment,0,2.2,.14)});continue}
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
    proxy.visible = false; proxies.push(proxy); entry.matrix.decompose(proxy.position,proxy.quaternion,proxy.scale); root.add(proxy); collision?.add(proxy, 'office3-wall')
  }
  const windowEntries = low ? [] : spec.outer.map(segment => ({matrix:segmentMatrix(THREE,segment,3.5,1)}))
  const windows = addInstances(THREE, root, 'office3-window-band', glass, windowEntries)
  const update = (dt, { camera } = {}) => {
    if (!walls || !camera || !wallState.length) return
    const elevation = Math.atan2(camera.position.y - 0.1, Math.hypot(camera.position.x - layout.axis.x, camera.position.z - layout.axis.z)) * 180 / Math.PI
    const target = { x: layout.axis.x, z: (layout.envelope.z0 + layout.envelope.z1) / 2 }
    for (const state of wallState) {
      const normal=sideNormal[state.side]||state.segment.normal,next = resolveWallOcclusion({ elevation, cameraPosition: camera.position, target, wallNormal: normal, thresholds: { ...layout.wallHeight.occlusion, standard: state.base } })
      state.height += (next.height - state.height) * Math.min(1, Math.max(0, dt || 0) * 1000 / layout.wallHeight.occlusion.transitionMs)
      const segment = state.segment
      const matrix = segmentMatrix(THREE,segment,0,state.height)
      walls.setMatrixAt(state.index, matrix)
      if (windows) { const wMatrix=segmentMatrix(THREE,segment,state.height,Math.max(0,state.height===state.base?1:.08)); windows.setMatrixAt(state.index,wMatrix) }
    }
    walls.instanceMatrix.needsUpdate = true; if (windows) windows.instanceMatrix.needsUpdate = true
  }
  // 初始外墙完整高度；只有相机低于阈值时按帧改变视觉代理。
  wallState.forEach(state => { state.height = state.base })
  return { root, spec, ground, green, walls, innerGlass, windows, onFrame: update, dispose() {
    if (disposed) return
    disposed = true
    for (const proxy of proxies) { collision?.remove?.(proxy); proxy.geometry.dispose(); proxy.removeFromParent() }
    for (const material of [warm, floorMaterial, greenMaterial, inner, glass]) material.dispose()
    for (const mesh of [ground, green, walls, innerGlass, windows]) { mesh?.geometry.dispose(); mesh?.removeFromParent() }
  } }
}
