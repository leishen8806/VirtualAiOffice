import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_SITE } from './dr-wh-r1-zones.js'
import { WH_R1_FLOOR_Y, whToWorld } from './wh-r1-layout.js'
import { createWhR1Navigation } from './dr-wh-r1-validation.js'

// 展示人员不进入 Paperclip、任务面板或碰撞表；路径只复用 I8 的网格。
export const WH_R1_STAFF_ROSTER = Object.freeze([
  { id: 'wh-staff-receiving-1', role: 'receiving', label: '收货员', avatar: 'Male_Adult_03', source: [8, 39], yawDeg: 90 },
  { id: 'wh-staff-receiving-2', role: 'receiving', label: '验收员', avatar: 'Female_Adult_04', source: [20, 39], yawDeg: 90 },
  { id: 'wh-staff-picking-1', role: 'picking', label: '拣货员', avatar: 'Male_Adult_05', source: [56, 38], target: [69, 38], yawDeg: 180 },
  { id: 'wh-staff-picking-2', role: 'picking', label: '上架员', avatar: 'Female_Adult_05', source: [72, 35], target: [58, 35], yawDeg: 180 },
  { id: 'wh-staff-packing-1', role: 'packing', label: '打包员', avatar: 'Male_Adult_06', source: [50.7, 20.3], yawDeg: -90, workbench: 'WH-05-TB-001' },
  { id: 'wh-staff-packing-2', role: 'packing', label: '复核员', avatar: 'Female_Adult_06', source: [50.7, 25.1], yawDeg: -90, workbench: 'WH-05-TB-003' },
  { id: 'wh-staff-shipping-1', role: 'shipping', label: '发货员', avatar: 'Male_Adult_08', source: [81, 18], yawDeg: 180 },
  { id: 'wh-staff-forklift-1', role: 'forklift', label: '叉车司机', avatar: 'Male_Adult_09', source: [81, 15], sit: true, yawDeg: 180 },
  { id: 'wh-staff-lead-1', role: 'lead', label: '班组长', avatar: 'Female_Adult_08', source: [8, 27], target: [12, 26], yawDeg: 0 },
])

const STAFF_TEXT = '演示人物'
const toWorld = ([xM, yM]) => { const p = whToWorld(xM, yM); return [p.x, WH_R1_FLOOR_Y, p.z] }

function makePlaceholderGeometry(THREE, seated = false) {
  const positions = [], normals = [], colors = []
  const add = (source, x, y, z, sx = 1, sy = 1, sz = 1, color = 0xffffff, rotZ = 0) => {
    const geometry = source.index ? source.toNonIndexed() : source.clone()
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotZ), new THREE.Vector3(sx, sy, sz))
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), c = new THREE.Color(color)
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix)
      const normal = new THREE.Vector3().fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix).normalize()
      positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z); colors.push(c.r, c.g, c.b)
    }
    geometry.dispose()
  }
  const box = (w, h, d, x, y, z, color, rotZ = 0) => add(new THREE.BoxGeometry(w, h, d), x, y, z, 1, 1, 1, color, rotZ)
  const skin = 0xd3a080, shirt = 0xf2f0e9, pants = 0x3e4a54, hair = 0x273039, shoe = 0x202326, accent = 0xd18b35
  if (!seated) {
    box(.38, .58, .24, 0, 1.04, 0, shirt)
    box(.44, .12, .26, 0, 1.35, 0, accent)
    box(.10, .52, .10, -.25, 1.05, 0, shirt, -.10); box(.10, .52, .10, .25, 1.05, 0, shirt, .10)
    box(.13, .70, .14, -.10, .37, 0, pants); box(.13, .70, .14, .10, .37, 0, pants)
    box(.16, .08, .25, -.10, .035, -.035, shoe); box(.16, .08, .25, .10, .035, -.035, shoe)
    add(new THREE.SphereGeometry(.14, 6, 4), 0, 1.57, 0, 1, 1, 1, skin)
    box(.22, .07, .22, 0, 1.72, 0, hair)
  } else {
    box(.36, .48, .24, 0, .91, 0, shirt)
    box(.42, .11, .25, 0, 1.17, 0, accent)
    box(.10, .46, .10, -.24, .91, 0, shirt, -.15); box(.10, .46, .10, .24, .91, 0, shirt, .15)
    box(.14, .18, .14, -.10, .60, .14, pants, -.15); box(.14, .18, .14, .10, .60, .14, pants, .15)
    box(.13, .42, .14, -.18, .38, .30, pants, -.35); box(.13, .42, .14, .18, .38, .30, pants, .35)
    box(.16, .08, .25, -.18, .16, .43, shoe); box(.16, .08, .25, .18, .16, .43, shoe)
    add(new THREE.SphereGeometry(.14, 6, 4), 0, 1.38, 0, 1, 1, 1, skin)
    box(.22, .07, .22, 0, 1.53, 0, hair)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function makePlaceholderMeshes(THREE, group, members) {
  // Two shared, vertex-coloured instanced meshes: one standing and one seated draw call.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 })
  const standing = new THREE.InstancedMesh(makePlaceholderGeometry(THREE, false), material, members.length)
  const seated = new THREE.InstancedMesh(makePlaceholderGeometry(THREE, true), material.clone(), members.length)
  standing.name = 'wh-r1-staff-placeholder-standing'; seated.name = 'wh-r1-staff-placeholder-seated'
  standing.userData.dynamic = seated.userData.dynamic = true
  standing.userData.whR1StaffPlaceholder = seated.userData.whR1StaffPlaceholder = true
  standing.castShadow = seated.castShadow = false; standing.receiveShadow = seated.receiveShadow = false
  const roleColor = { receiving: 0xffa63a, picking: 0x5f88b0, packing: 0x7b8792, shipping: 0xffa63a, forklift: 0xd6b24c, lead: 0xe3e7eb }
  for (const [index, member] of members.entries()) {
    const color = new THREE.Color(roleColor[member.role] || 0xffffff)
    standing.setColorAt(index, color); seated.setColorAt(index, color)
  }
  standing.instanceColor.needsUpdate = true; seated.instanceColor.needsUpdate = true
  group.add(standing, seated)
  return { standing, seated, dummy: new THREE.Object3D(), triangles: Math.round(standing.geometry.getAttribute('position').count / 3 + seated.geometry.getAttribute('position').count / 3) }
}

export function buildWhR1Staff({ THREE, root, A, createCharacter3D, createCharacter, data = WH_R1_DATA, navigation = null, lite = false } = {}) {
  const group = new THREE.Group(); group.name = 'wh-r1-staff'; group.userData.dynamic = true; group.userData.noMerge = true
  root.add(group)
  if (lite) return { root: group, members: [], avatarNames: () => [], hydrate: () => false, configureRealistic: () => {}, cameraIntent: () => {}, onFrame: () => {}, pickRay: () => null, summary: () => ({ count: 0, loadedReal: 0, placeholderCalls: 0, roles: [], displayOnly: true, agentIds: [], collision: false, lite: true }), dispose: () => group.removeFromParent(), staffText: STAFF_TEXT, lite: true }
  const nav = navigation || createWhR1Navigation({ data, bounds: WH_R1_SITE, cellSize: .6, radius: .3 })
  const members = []
  const placeholders = makePlaceholderMeshes(THREE, group, WH_R1_STAFF_ROSTER)
  const placeholderChar = (member, index) => {
    const placeholder = new THREE.Group()
    placeholder.userData = { dynamic: true, displayOnly: true, warehouseStaffId: member.id, staffRole: member.role, label: STAFF_TEXT }
    return { group: placeholder, pose: { sit: member.sit ? 1 : 0, walk: member.target ? 1 : 0, phase: 0, talk: member.role === 'lead' ? .7 : 0, carry: member.role === 'receiving' ? 1 : 0 }, solve() {}, isPlaceholder: true, placeholderIndex: index }
  }
  const place = (member, char) => {
    const requested = toWorld(member.source), nearest = nav.nearestWalkable?.([requested[0], requested[2]], { allowUnknown: true })
    const position = nearest ? [nearest[0], WH_R1_FLOOR_Y, nearest[1]] : requested
    char.group.position.set(...position); char.group.rotation.y = (member.yawDeg || 0) * Math.PI / 180
    return { requested, nearest, position }
  }
  for (const [index, member] of WH_R1_STAFF_ROSTER.entries()) {
    const char = placeholderChar(member, index), placement = place(member, char)
    const requestedTarget = member.target ? toWorld(member.target) : null
    const targetPoint = requestedTarget && nav.nearestWalkable?.([requestedTarget[0], requestedTarget[2]], { allowUnknown: true })
    const target = targetPoint ? [targetPoint[0], WH_R1_FLOOR_Y, targetPoint[1]] : requestedTarget
    const path = target ? nav.findPath([placement.position[0], placement.position[2]], [target[0], target[2]], { allowUnknown: true }) : []
    members.push({ ...member, char, placeholder: char, label: null, placement, target, path, pathIndex: 0, pause: 0, state: { sit: member.sit ? 1 : 0, walk: member.target ? 1 : 0, phase: 0, talk: member.role === 'lead' ? .7 : 0, carry: member.role === 'receiving' ? 1 : 0 }, loaded: false, pending: false, people: null, realChar: null })
  }
  const syncPose = member => { if (member.char?.pose) Object.assign(member.char.pose, member.state) }
  const syncPlaceholders = () => {
    const { standing, seated, dummy } = placeholders
    for (const member of members) {
      const index = member.placeholder.placeholderIndex, p = member.placeholder.group.position, hidden = false
      dummy.position.set(p.x, p.y + (member.state.walk ? Math.sin(member.state.phase * 8) * .018 : Math.sin(member.state.phase * 2) * .006), p.z)
      dummy.rotation.y = member.placeholder.group.rotation.y
      const active = member.state.sit ? seated : standing
      dummy.scale.setScalar(hidden ? 0 : 1); dummy.updateMatrix(); active.setMatrixAt(index, dummy.matrix)
      dummy.scale.setScalar(0); dummy.updateMatrix(); (active === seated ? standing : seated).setMatrixAt(index, dummy.matrix)
    }
    standing.instanceMatrix.needsUpdate = true; seated.instanceMatrix.needsUpdate = true
  }
  const applyPlacement = (member, char) => {
    char.group.position.copy(member.placeholder.group.position); char.group.rotation.copy(member.placeholder.group.rotation)
    char.group.userData = { ...(char.group.userData || {}), dynamic: true, displayOnly: true, warehouseStaffId: member.id, staffRole: member.role, label: STAFF_TEXT }; syncPose(member)
  }
  const switchToReal = (member, people, createPerson) => {
    if (!people || typeof createPerson !== 'function') return false
    const next = member.realChar || (people.avatars?.[member.avatar] ? createPerson(people, member.avatar) : null); if (!next) return false
    member.people = people; member.realChar = next; applyPlacement(member, next); group.add(next.group); member.char = next; member.loaded = true; syncPlaceholders(); return true
  }
  const switchToPlaceholder = member => {
    if (!member.loaded) return
    member.placeholder.group.position.copy(member.char.group.position); member.placeholder.group.rotation.copy(member.char.group.rotation); member.char.group.removeFromParent(); member.char = member.placeholder; member.loaded = false; syncPlaceholders()
  }
  const move = (member, dt) => {
    if (!member.path.length || member.state.sit) return
    const points = member.path
    if (member.pause > 0) { member.pause -= dt; member.state.walk = 0; member.state.talk = member.role === 'lead' ? .7 : 0; syncPose(member); return }
    const current = member.char.group.position, next = points[Math.min(member.pathIndex + 1, points.length - 1)]; if (!next) return
    const dx = next[0] - current.x, dz = next[1] - current.z, distance = Math.hypot(dx, dz)
    if (distance <= .04) { member.pathIndex++; if (member.pathIndex >= points.length - 1) { member.pause = 2.5; member.path = [...points].reverse(); member.pathIndex = 0 }; return }
    const step = Math.min(distance, dt * .7); current.x += dx / distance * step; current.z += dz / distance * step; member.state.phase += step; member.char.group.rotation.y = Math.atan2(dx, dz); member.state.walk = 1; member.state.talk = 0; syncPose(member); member.placeholder.group.position.copy(member.char.group.position); member.placeholder.group.rotation.copy(member.char.group.rotation)
  }
  let realistic = null, hydrationAt = 0, armed = false, realOnly = false, disposed = false
  const updateHydration = camera => {
    if (!armed || !realistic || !camera || realistic.maxReal <= 0) return
    const now = globalThis.performance?.now?.() || Date.now(); if (now - hydrationAt < 180) return; hydrationAt = now
    const direction = realOnly && camera.getWorldDirection(new THREE.Vector3())
    const rows = members.map(member => {
      const position = member.placeholder.group.position, distance = camera.position.distanceTo(position)
      const alignment = direction ? direction.dot(position.clone().sub(camera.position)) / Math.max(distance, .01) : 1
      return { member, distance, score: distance + (1 - alignment) * 190 }
    }).sort((a, b) => a.score - b.score)
    for (const row of rows) row.member.want = false
    const keep = rows.filter(row => row.member.loaded && row.distance < (realOnly ? 34 : 28)).slice(0, realistic.maxReal)
    for (const row of rows) if (!keep.includes(row) && row.member.loaded) switchToPlaceholder(row.member)
    const wanted = [...keep, ...rows.filter(row => !row.member.loaded && row.distance < (realOnly ? 30 : 20))].sort((a, b) => a.score - b.score).slice(0, realistic.maxReal)
    if (realOnly) for (const row of keep) if (!wanted.includes(row)) switchToPlaceholder(row.member)
    for (const { member } of wanted) {
      member.want = true
      if (member.loaded || member.pending || typeof realistic.load !== 'function') continue
      if (member.realChar) { switchToReal(member, member.people, realistic.createPerson); continue }
      member.pending = true
      Promise.resolve(realistic.load(member.avatar)).then(people => { member.pending = false; if (!disposed && member.want) switchToReal(member, people, realistic.createPerson) }).catch(() => { member.pending = false })
    }
  }
  const requireRealistic = () => { realOnly = true; placeholders.standing.visible = placeholders.seated.visible = false }
  const configureRealistic = ({ tier = 'high', load, createPerson } = {}) => {
    realistic = { maxReal: tier === 'low' && !realOnly ? 2 : 4, load, createPerson }
    armed = realOnly; hydrationAt = 0; syncPlaceholders()
  }
  const cameraIntent = () => { armed = true }
  const onFrame = (dt, context = {}) => {
    updateHydration(context.camera)
    for (const member of members) {
      move(member, dt)
      member.char.solve?.(Math.min(.1, Math.max(0, dt)))
      member.afterSolve?.()
    }
    if (!realOnly) syncPlaceholders()
    result.afterSolve?.()
  }
  const hydrate = (people, createPerson) => { if (typeof createPerson !== 'function' || !people) return false; for (const member of members) switchToReal(member, people, createPerson); return true }
  const pickRay = ray => {
    const candidates = members.filter(m => m.loaded).map(m => m.char.group)
    if (!realOnly) candidates.unshift(placeholders.standing, placeholders.seated)
    const hits = ray.intersectObjects(candidates, true), hit = hits[0]; if (!hit) return null
    let member
    if (hit.object.userData.whR1StaffPlaceholder && Number.isInteger(hit.instanceId)) member = members[hit.instanceId]
    else { let owner = hit.object; while (owner && !owner.userData?.warehouseStaffId) owner = owner.parent; member = members.find(row => row.id === owner?.userData?.warehouseStaffId) }
    return member ? { id: member.id, category: `${member.role} · ${STAFF_TEXT}`, displayOnly: true, staff: true, label: STAFF_TEXT, status: '仅供参观' } : null
  }
  const summary = () => ({ count: members.length, loadedReal: members.filter(m => m.loaded).length, placeholderCalls: realOnly ? 0 : 2, placeholderTriangles: realOnly ? 0 : placeholders.triangles, roles: members.map(m => m.role), displayOnly: true, agentIds: [], collision: false, lite: !!lite })
  const dispose = () => { disposed = true; placeholders.standing.geometry.dispose(); placeholders.standing.material.dispose(); placeholders.seated.geometry.dispose(); placeholders.seated.material.dispose(); group.parent?.remove(group) }
  syncPlaceholders()
  const result = { root: group, members, avatarNames: () => WH_R1_STAFF_ROSTER.map(member => member.avatar), navigation: nav, hydrate, requireRealistic, configureRealistic, cameraIntent, onFrame, pickRay, summary, dispose, staffText: STAFF_TEXT, lite: !!lite }
  return result
}
