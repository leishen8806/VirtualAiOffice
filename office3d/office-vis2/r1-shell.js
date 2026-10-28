import { buildR1Site, r1World } from './r1-site.js'
import { buildR1Zones } from './r1-zones.js'

const frontIds = new Set(['00-W-005', '00-W-006', '00-W-007', '00-W-008', '00-W-009', '00-W-010'])
const localPoint = ([x, y]) => r1World([x, y])
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const r1CornerSpec = Object.freeze({
  southeast: Object.freeze({ center: [24.3, 32.5], radius: 1.5, from: [24.3, 31], to: [25.8, 32.5] }),
  southwest: Object.freeze({ center: [31.7, 32.5], radius: 1.5, from: [30.2, 32.5], to: [31.7, 31] }),
})

const leftFront = points => points.filter(([x]) => x <= 21)
const frontLength = points => points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0)

// The profile follows accumulated front-arc length, not the local x coordinate.
export function r1FrontHeight(localX, walls) {
  if (localX >= 21 && localX <= 35) return 1.2
  const left = leftFront(walls.filter(wall => ['00-W-005', '00-W-006'].includes(wall.id)).flatMap(wall => wall.geometry.points.slice(wall.id === '00-W-005' ? 0 : 1)))
  const length = frontLength(left)
  const mirroredX = localX > 35 ? 56 - localX : localX
  let walked = 0
  for (let i = 1; i < left.length; i++) {
    const [a, b] = [left[i - 1], left[i]]
    if (mirroredX <= b[0] + 1e-9) {
      walked += distance(a, [mirroredX, a[1] + (b[1] - a[1]) * (mirroredX - a[0]) / (b[0] - a[0])])
      return 4.5 - 3.3 * walked / length
    }
    walked += distance(a, b)
  }
  return 1.2
}

const boxInstance = (THREE, x0, x1, z0, z1, height, thickness, vertical = false) => {
  const matrix = new THREE.Matrix4()
  const w = vertical ? thickness : Math.hypot(x1 - x0, z1 - z0)
  const d = vertical ? Math.hypot(x1 - x0, z1 - z0) : thickness
  const angle = Math.atan2(z1 - z0, x1 - x0)
  matrix.compose(new THREE.Vector3((x0 + x1) / 2, height / 2, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle), new THREE.Vector3(w, height, d))
  return matrix
}

const addInstanced = (THREE, root, name, entries, material) => {
  if (!entries.length) return null
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length)
  entries.forEach((entry, index) => mesh.setMatrixAt(index, entry.matrix))
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = name
  mesh.userData.dynamic = true
  mesh.userData.wallIds = entries.map(entry => entry.id)
  mesh.userData.faceIds = entries.flatMap(entry => entry.faceIds)
  root.add(mesh)
  return mesh
}

const groupFaces = faces => faces.reduce((groups, face) => {
  ;(groups[face.wallId] ||= []).push(face)
  return groups
}, {})

function thickPathsGeometry(THREE, paths, thickness, heightAt = () => 2.7) {
  const positions = [], indices = []
  const add = (a, b, c, d) => indices.push(a, b, c, a, c, d)
  for (const path of paths) {
    if (path.points.length < 2) continue
    const nodes = path.points.map(localPoint)
    const offsets = nodes.map((point, index) => {
      const before = nodes[Math.max(0, index - 1)], after = nodes[Math.min(nodes.length - 1, index + 1)]
      const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1
      return { x: -dz / length * thickness / 2, z: dx / length * thickness / 2 }
    })
    const base = positions.length / 3
    nodes.forEach((point, index) => {
      const { x, z } = offsets[index], [localX, localY] = path.points[index]
      const outerHeight = heightAt([localX + x, localY]), innerHeight = heightAt([localX - x, localY])
      positions.push(point.x + x, 0, point.z + z, point.x - x, 0, point.z - z, point.x + x, outerHeight, point.z + z, point.x - x, innerHeight, point.z - z)
    })
    for (let index = 0; index < nodes.length - 1; index++) {
      const a = base + index * 4, b = a + 4
      add(a, b, b + 2, a + 2) // outer
      add(a + 1, a + 3, b + 3, b + 1) // inner
      add(a + 2, b + 2, b + 3, a + 3) // top
      add(a, a + 1, b + 1, b) // bottom
    }
    const first = base, last = base + (nodes.length - 1) * 4
    add(first, first + 2, first + 3, first + 1)
    add(last, last + 1, last + 3, last + 2)
  }
  const geometry = new THREE.BufferGeometry()
  const normals = []
  for (let index = 0; index < positions.length; index += 12) {
    const a = new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2])
    const b = new THREE.Vector3(positions[index + 3], positions[index + 4], positions[index + 5])
    const c = new THREE.Vector3(positions[index + 6], positions[index + 7], positions[index + 8])
    const normal = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize()
    for (let vertex = 0; vertex < 4; vertex++) normals.push(normal.x, normal.y, normal.z)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  return geometry
}

function frontGeometry(THREE, walls) {
  const byId = Object.fromEntries(walls.filter(wall => frontIds.has(wall.id)).map(wall => [wall.id, wall]))
  const join = ids => ids.flatMap((id, index) => byId[id].geometry.points.slice(index ? 1 : 0))
  const paths = [{ points: join(['00-W-005', '00-W-006', '00-W-009']) }, { points: join(['00-W-010', '00-W-007', '00-W-008']) }]
  return { geometry: thickPathsGeometry(THREE, paths, .2, point => r1FrontHeight(point[0], walls)), ids: [...frontIds] }
}

export function r1WallPlan(layout) {
  const walls = layout.r1.data.walls
  const faceIds = groupFaces(layout.r1.data.wallFaces)
  const straight = []
  for (const wall of walls) {
    if (frontIds.has(wall.id)) continue
    let points = wall.geometry.points
    if (wall.id === '00-W-021') points = [[15.6, 31], [24.3, 31]]
    if (wall.id === '00-W-016') points = [[30.2, 32.5], [30.2, 43]]
    straight.push({ id: wall.id, exterior: wall.geometry.exterior, height: wall.geometry.height, thickness: wall.geometry.thickness, points, faceIds: (faceIds[wall.id] || []).map(face => face.id) })
  }
  return { straight, front: walls.filter(wall => frontIds.has(wall.id)), faces: faceIds }
}

const curvePoints = (center, start, end, count = 12) => {
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]), a1 = Math.atan2(end[1] - center[1], end[0] - center[0])
  let delta = a1 - a0
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = a0 + delta * index / count
    return [center[0] + 1.5 * Math.cos(angle), center[1] + 1.5 * Math.sin(angle)]
  })
}

const doorAxis = door => door.facingLocal[0] ? 'vertical' : 'horizontal'
const doorFrameEntries = (THREE, door) => {
  const { x, z } = localPoint([door.xM, door.yM]), span = door.lengthM, height = door.heightM, vertical = doorAxis(door) === 'vertical'
  const box = (w, h, d, px, py, pz) => ({ id: door.id, faceIds: [], matrix: new THREE.Matrix4().makeScale(w, h, d).setPosition(px, py, pz) })
  return vertical
    ? [box(.1, height, .1, x, height / 2, z - span / 2), box(.1, height, .1, x, height / 2, z + span / 2), box(.1, .1, span, x, height - .05, z)]
    : [box(.1, height, .1, x - span / 2, height / 2, z), box(.1, height, .1, x + span / 2, height / 2, z), box(span, .1, .1, x, height - .05, z)]
}

export function buildR1Shell({ THREE, root, layout, collision }) {
  const shell = new THREE.Group()
  shell.name = 'r1-shell-root'
  // mergeStatic honours dynamic ancestors; this retains the wall/face ledger after the app-wide merge.
  shell.userData.dynamic = true
  const opaque = new THREE.MeshStandardMaterial({ color: '#DED4C5', roughness: .78 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#DDE8EA', transparent: true, opacity: .24, roughness: .12, depthWrite: false })
  const frame = new THREE.MeshStandardMaterial({ color: '#705735', roughness: .45, metalness: .55 })
  const plan = r1WallPlan(layout), outerGlass = [], innerSolid = [], lowGlass = []
  for (const entry of plan.straight) {
    const [start, end] = entry.points.map(localPoint)
    const item = { ...entry, matrix: boxInstance(THREE, start.x, end.x, start.z, end.z, entry.height, entry.thickness) }
    if (entry.exterior) outerGlass.push(item)
    else if (entry.height === 1.2) lowGlass.push(item)
    else innerSolid.push(item)
  }
  const exteriorFrames = outerGlass.flatMap(entry => {
    const [start, end] = entry.points.map(localPoint), height = entry.height
    const upright = (point, index) => ({ id: `${entry.id}-frame-${index}`, faceIds: entry.faceIds, matrix: new THREE.Matrix4().makeScale(.05, height, .05).setPosition(point.x, height / 2, point.z) })
    return [upright(start, 0), upright(end, 1),
      { id: `${entry.id}-frame-base`, faceIds: entry.faceIds, matrix: boxInstance(THREE, start.x, end.x, start.z, end.z, .05, .05) },
      { id: `${entry.id}-frame-top`, faceIds: entry.faceIds, matrix: new THREE.Matrix4().copy(boxInstance(THREE, start.x, end.x, start.z, end.z, .05, .05)).premultiply(new THREE.Matrix4().makeTranslation(0, height - .05, 0)) }]
  })
  const walls = [
    addInstanced(THREE, shell, 'r1-exterior-glass', outerGlass, glass),
    addInstanced(THREE, shell, 'r1-exterior-frames', exteriorFrames, frame),
    addInstanced(THREE, shell, 'r1-interior-walls', innerSolid, opaque),
    addInstanced(THREE, shell, 'r1-low-glass', lowGlass, glass),
  ].filter(Boolean)
  const front = frontGeometry(THREE, plan.front)
  const frontWall = new THREE.Mesh(front.geometry, opaque)
  frontWall.name = 'r1-front-slope-wall'; frontWall.userData.dynamic = true; frontWall.userData.wallIds = front.ids; frontWall.userData.faceIds = plan.front.flatMap(wall => plan.faces[wall.id].map(face => face.id)); shell.add(frontWall)
  const cornerGeometry = thickPathsGeometry(THREE, [
    { points: curvePoints(r1CornerSpec.southeast.center, r1CornerSpec.southeast.from, r1CornerSpec.southeast.to) },
    { points: curvePoints(r1CornerSpec.southwest.center, r1CornerSpec.southwest.from, r1CornerSpec.southwest.to) },
  ], .1)
  const cornerWall = new THREE.Mesh(cornerGeometry, opaque)
  cornerWall.name = 'r1-corner-walls'; cornerWall.userData.dynamic = true; cornerWall.userData.wallIds = ['00-W-021', '00-W-016']; cornerWall.userData.faceIds = [...plan.faces['00-W-021'], ...plan.faces['00-W-016']].map(face => face.id); shell.add(cornerWall)
  addInstanced(THREE, shell, 'r1-door-frames', layout.r1.data.doors.flatMap(door => doorFrameEntries(THREE, door)), frame)
  const site = buildR1Site({ THREE, root: shell, layout })
  const zones = buildR1Zones({ THREE, root: shell, layout })
  const collisions = []
  for (const entry of [...outerGlass, ...innerSolid, ...lowGlass]) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), opaque)
    proxy.name = `r1-collision-${entry.id}`; proxy.visible = false; proxy.userData.dynamic = true; entry.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale)
    shell.add(proxy); collision?.add?.(proxy, 'r1-wall'); collisions.push(proxy)
  }
  for (const collider of [frontWall, cornerWall]) { collision?.add?.(collider, 'r1-wall'); collisions.push(collider) }
  root.add(shell)
  const allWallIds = [...new Set([...plan.straight.map(entry => entry.id), ...front.ids, '00-W-021', '00-W-016'])]
  return {
    root: shell,
    ground: site.floor,
    walls: { userData: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id) } },
    wallLedger: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id), doorIds: layout.r1.data.doors.map(door => door.id) },
    onFrame() {},
    dispose() { collisions.forEach(proxy => { collision?.remove?.(proxy); if (proxy.name.startsWith('r1-collision-')) proxy.removeFromParent() }); site.dispose(); zones.dispose(); front.geometry.dispose(); cornerGeometry.dispose(); opaque.dispose(); glass.dispose(); frame.dispose(); shell.removeFromParent() },
  }
}
