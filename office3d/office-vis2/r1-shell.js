import { buildR1Site, r1World } from './r1-site.js'
import { buildR1Zones } from './r1-zones.js'

const frontIds = new Set(['00-W-005', '00-W-006', '00-W-007', '00-W-008', '00-W-009', '00-W-010'])
const localPoint = ([x, y]) => r1World([x, y])
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const r1Glazing = Object.freeze({ interiorOpacity: .2, exteriorOpacity: .5, exteriorRoughness: .65, interiorBand: .3, exteriorBand: .8, frameWidth: .04, maxFrameSpacing: 1.5 })

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

function joinedSurfaces(THREE, parts) {
  const vertices = [], normals = [], ranges = []
  for (const { id, geometry } of parts) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry, start = vertices.length / 3
    vertices.push(...source.attributes.position.array); normals.push(...source.attributes.normal.array)
    ranges.push({ id, start, count: source.attributes.position.count }); if (source !== geometry) source.dispose(); geometry.dispose()
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return { geometry, ranges }
}

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
  return { paths, geometry: thickPathsGeometry(THREE, paths, .2, point => r1FrontHeight(point[0], walls)), ids: [...frontIds] }
}


export const r1FenceSpec = Object.freeze({ baseHeight: .3, thickness: .2, barWidth: .025, barSpacing: .125, railHeight: .05, railDepth: .03, bottomRail: .4, topInset: .05, maxRailGap: 1.5, postWidth: .1, maxPostGap: 3 })

function buildFrontFence(THREE, shell, front, faces, walls, opaque) {
  const spec = r1FenceSpec, metal = new THREE.MeshStandardMaterial({ color: '#2E2F31', metalness: .6, roughness: .45 })
  const base = new THREE.Mesh(thickPathsGeometry(THREE, front.paths, spec.thickness, () => spec.baseHeight), opaque)
  base.name = 'r1-fence-base'
  const entries = { bars: [], rails: [], posts: [] }, height = x => r1FrontHeight(x + 26, walls)
  for (const path of front.paths) {
    const nodes = path.points.map(localPoint), segments = []; let length = 0
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i], span = Math.hypot(b.x - a.x, b.z - a.z)
      segments.push({ a, b, start: length, span, dx: (b.x - a.x) / span, dz: (b.z - a.z) / span }); length += span
    }
    const at = distance => {
      const segment = segments.find(s => distance <= s.start + s.span + 1e-9) || segments.at(-1)
      return { ...segment, x: segment.a.x + segment.dx * (distance - segment.start), z: segment.a.z + segment.dz * (distance - segment.start) }
    }
    const upright = (distance, width, kind) => {
      const p = at(distance), top = height(p.x), h = top - spec.baseHeight, matrix = new THREE.Matrix4()
      matrix.set(p.dx * width, 0, -p.dz * width, p.x, 0, h, 0, spec.baseHeight, p.dz * width, 0, p.dx * width, p.z, 0, 0, 0, 1)
      const tilt = [[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z]) => (height(p.x + width / 2 * (p.dx * x - p.dz * z)) - top) / h)
      entries[kind].push({ matrix, tilt, distance, path: front.paths.indexOf(path) })
    }
    // Endpoint posts finish at the original end planes, never protruding into the doorway.
    const postCount = Math.ceil((length - spec.postWidth) / spec.maxPostGap)
    for (let i = 0; i <= postCount; i++) upright(spec.postWidth / 2 + i * (length - spec.postWidth) / postCount, spec.postWidth, 'posts')
    const barCount = Math.ceil((length - spec.barWidth) / spec.barSpacing)
    for (let i = 0; i <= barCount; i++) upright(spec.barWidth / 2 + i * (length - spec.barWidth) / barCount, spec.barWidth, 'bars')
    const railGaps = Math.ceil((4.5 - spec.topInset - spec.bottomRail) / spec.maxRailGap)
    for (const p of segments) for (let level = 0; level <= railGaps; level++) {
      const y = x => spec.bottomRail + level / railGaps * (height(x) - spec.topInset - spec.bottomRail)
      const ya = y(p.a.x), yb = y(p.b.x), matrix = new THREE.Matrix4()
      matrix.set(p.dx * p.span, 0, -p.dz * spec.railDepth, (p.a.x + p.b.x) / 2,
        yb - ya, spec.railHeight, 0, (ya + yb) / 2 - spec.railHeight / 2,
        p.dz * p.span, 0, p.dx * spec.railDepth, (p.a.z + p.b.z) / 2, 0, 0, 0, 1)
      entries.rails.push({ matrix, tilt: [0,0,0,0], level, path: front.paths.indexOf(path) })
    }
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), position = geometry.attributes.position
  // Four top-corner morphs keep flat feet and profile-cut tops in a single instanced batch.
  geometry.morphTargetsRelative = true
  geometry.morphAttributes.position = [[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z]) => {
    const values = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i++) if (position.getY(i) > .5 && Math.sign(position.getX(i)) === x && Math.sign(position.getZ(i)) === z) values[i * 3 + 1] = 1
    return new THREE.Float32BufferAttribute(values, 3)
  })
  const meshes = [base]
  for (const [kind, rows] of Object.entries(entries)) {
    const mesh = new THREE.InstancedMesh(geometry, metal, rows.length)
    mesh.name = 'r1-fence-' + kind
    rows.forEach((row, index) => { mesh.setMatrixAt(index, row.matrix); mesh.setMorphAt(index, { morphTargetInfluences: row.tilt }) })
    mesh.instanceMatrix.needsUpdate = true; mesh.morphTexture.needsUpdate = true
    mesh.userData.parts = rows.map(({ matrix, ...row }) => row)
    meshes.push(mesh)
  }
  for (const mesh of meshes) { Object.assign(mesh.userData, { dynamic: true, wallIds: front.ids, faceIds: faces }); shell.add(mesh) }
  return { dispose() { base.geometry.dispose(); geometry.dispose(); metal.dispose(); meshes.slice(1).forEach(m => m.dispose()) } }
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
  const innerGlassMaterial = new THREE.MeshPhysicalMaterial({ color: '#DDE8EA', transparent: true, opacity: r1Glazing.interiorOpacity, roughness: .12, depthWrite: false })
  const outerGlassMaterial = new THREE.MeshPhysicalMaterial({ color: '#9AAEB7', transparent: true, opacity: r1Glazing.exteriorOpacity, roughness: r1Glazing.exteriorRoughness, depthWrite: false })
  const bandMaterial = new THREE.MeshStandardMaterial({ color: '#EAE8E0', roughness: .8 })
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
  const partitions = innerSolid.filter(entry => entry.id !== '00-W-036'), tops = [], partitionFrames = []
  const layer = (entry, base, height) => { const [a, b] = entry.points.map(localPoint); return { ...entry, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, height, entry.thickness).premultiply(new THREE.Matrix4().makeTranslation(0, base, 0)) } }
  for (const entry of [...outerGlass, ...partitions]) {
    const height = entry.exterior ? r1Glazing.exteriorBand : r1Glazing.interiorBand
    tops.push({ id: entry.id, geometry: new THREE.BoxGeometry(1, 1, 1).applyMatrix4(layer(entry, entry.height - height, height).matrix) })
  }
  for (const entry of partitions) {
    const [a, b] = entry.points.map(localPoint), length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, count = Math.ceil(length / r1Glazing.maxFrameSpacing), width = r1Glazing.frameWidth
    for (let index = 0; index <= count; index++) {
      // Clip endpoint uprights at the wall-end plane; no new solid projects beyond the original wall.
      const lo = Math.max(0, index / count * length - width / 2), hi = Math.min(length, index / count * length + width / 2)
      partitionFrames.push({ id: entry.id, faceIds: entry.faceIds, matrix: boxInstance(THREE, a.x + dx * lo, a.x + dx * hi, a.z + dz * lo, a.z + dz * hi, entry.height - r1Glazing.interiorBand, width) })
    }
    partitionFrames.push({ id: entry.id, faceIds: entry.faceIds, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, width, width) })
  }
  const walls = [
    addInstanced(THREE, shell, 'r1-exterior-glass', outerGlass.map(entry => layer(entry, 0, entry.height - r1Glazing.exteriorBand)), outerGlassMaterial),
    addInstanced(THREE, shell, 'r1-exterior-frames', exteriorFrames, frame),
    addInstanced(THREE, shell, 'r1-interior-walls', innerSolid.filter(entry => entry.id === '00-W-036'), opaque),
    addInstanced(THREE, shell, 'r1-interior-glass', partitions.map(entry => layer(entry, 0, entry.height - r1Glazing.interiorBand)), innerGlassMaterial),
    addInstanced(THREE, shell, 'r1-low-glass', lowGlass, glass),
  ].filter(Boolean)
  const front = frontGeometry(THREE, plan.front)
  const frontWall = new THREE.Mesh(front.geometry, opaque)
  frontWall.name = 'r1-collision-front'; frontWall.visible = false; frontWall.userData.dynamic = true; frontWall.userData.wallIds = front.ids; frontWall.userData.faceIds = plan.front.flatMap(wall => plan.faces[wall.id].map(face => face.id)); shell.add(frontWall)
  const fence = buildFrontFence(THREE, shell, front, frontWall.userData.faceIds, plan.front, opaque)
  const cornerPaths = [
    { points: curvePoints(r1CornerSpec.southeast.center, r1CornerSpec.southeast.from, r1CornerSpec.southeast.to) },
    { points: curvePoints(r1CornerSpec.southwest.center, r1CornerSpec.southwest.from, r1CornerSpec.southwest.to) },
  ]
  const cornerGeometry = thickPathsGeometry(THREE, cornerPaths, .1, () => 2.7 - r1Glazing.interiorBand)
  const cornerWall = new THREE.Mesh(cornerGeometry, innerGlassMaterial)
  cornerWall.name = 'r1-corner-walls'; cornerWall.userData.dynamic = true; cornerWall.userData.wallIds = ['00-W-021', '00-W-016']; cornerWall.userData.faceIds = [...plan.faces['00-W-021'], ...plan.faces['00-W-016']].map(face => face.id); shell.add(cornerWall)
  cornerPaths.forEach((path, index) => {
    const id = cornerWall.userData.wallIds[index], faceIds = plan.faces[id].map(face => face.id)
    tops.push({ id, geometry: thickPathsGeometry(THREE, [path], .1, () => r1Glazing.interiorBand).translate(0, 2.7 - r1Glazing.interiorBand, 0) })
    const points = path.points.map(localPoint), width = r1Glazing.frameWidth
    for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; partitionFrames.push({ id, faceIds, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, width, width) }) }
    for (const i of [0, 6, 12]) {
      const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(12, i + 1)], length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, lo = i === 0 ? 0 : -width / 2, hi = i === 12 ? 0 : width / 2
      partitionFrames.push({ id, faceIds, matrix: boxInstance(THREE, p.x + lo * dx, p.x + hi * dx, p.z + lo * dz, p.z + hi * dz, 2.7 - r1Glazing.interiorBand, width) })
    }
  })
  const bands = joinedSurfaces(THREE, tops), topBands = new THREE.Mesh(bands.geometry, bandMaterial)
  topBands.name = 'r1-top-bands'; topBands.userData = { dynamic: true, wallIds: tops.map(row => row.id), faceIds: tops.flatMap(row => plan.faces[row.id].map(face => face.id)), ranges: bands.ranges }; shell.add(topBands)
  const innerFrames = addInstanced(THREE, shell, 'r1-interior-frames', partitionFrames, frame)
  addInstanced(THREE, shell, 'r1-door-frames', layout.r1.data.doors.flatMap(door => doorFrameEntries(THREE, door)), frame)
  const site = buildR1Site({ THREE, root: shell, layout })
  const zones = buildR1Zones({ THREE, root: shell, layout })
  const collisions = []
  for (const entry of [...outerGlass, ...innerSolid, ...lowGlass]) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), opaque)
    proxy.name = `r1-collision-${entry.id}`; proxy.visible = false; proxy.userData.dynamic = true; entry.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale)
    shell.add(proxy); collision?.add?.(proxy, 'r1-wall'); collisions.push(proxy)
  }
  const cornerProxy = new THREE.Mesh(thickPathsGeometry(THREE, cornerPaths, .1), opaque)
  cornerProxy.name = 'r1-collision-corners'; cornerProxy.visible = false; cornerProxy.userData = { dynamic: true, wallIds: cornerWall.userData.wallIds, faceIds: cornerWall.userData.faceIds }; shell.add(cornerProxy)
  for (const collider of [frontWall, cornerProxy]) { collision?.add?.(collider, 'r1-wall'); collisions.push(collider) }
  root.add(shell)
  const allWallIds = [...new Set([...plan.straight.map(entry => entry.id), ...front.ids, '00-W-021', '00-W-016'])]
  return {
    root: shell,
    ground: site.floor,
    walls: { userData: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id) } },
    wallLedger: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id), doorIds: layout.r1.data.doors.map(door => door.id) },
    onFrame() {},
    dispose() { collisions.forEach(proxy => { collision?.remove?.(proxy); if (proxy.name.startsWith('r1-collision-')) proxy.removeFromParent() }); site.dispose(); zones.dispose(); fence.dispose(); front.geometry.dispose(); cornerGeometry.dispose(); cornerProxy.geometry.dispose(); bands.geometry.dispose(); innerFrames.geometry.dispose(); innerGlassMaterial.dispose(); outerGlassMaterial.dispose(); bandMaterial.dispose(); opaque.dispose(); glass.dispose(); frame.dispose(); shell.removeFromParent() },
  }
}
