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
  { id: 'wh-staff-packing-1', role: 'packing', label: '打包员', avatar: 'Male_Adult_06', source: [52, 21], sit: true, yawDeg: 0 },
  { id: 'wh-staff-packing-2', role: 'packing', label: '复核员', avatar: 'Female_Adult_06', source: [59, 21], sit: true, yawDeg: 0 },
  { id: 'wh-staff-shipping-1', role: 'shipping', label: '发货员', avatar: 'Male_Adult_08', source: [81, 18], yawDeg: 180 },
  { id: 'wh-staff-forklift-1', role: 'forklift', label: '叉车司机', avatar: 'Male_Adult_09', source: [81, 15], sit: true, yawDeg: 180 },
  { id: 'wh-staff-lead-1', role: 'lead', label: '班组长', avatar: 'Female_Adult_08', source: [8, 27], target: [12, 26], yawDeg: 0 },
])

const STAFF_TEXT = '演示人物'
const toWorld = ([xM, yM]) => { const p = whToWorld(xM, yM); return [p.x, WH_R1_FLOOR_Y, p.z] }

function makePlaceholderMeshes(THREE, group, members) {
  // 两个共享材质的实例网格：默认入口只保留 2 个 draw call。
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.16, .46, 3, 6), new THREE.MeshStandardMaterial({ color: 0x536673, roughness: .86 }), members.length)
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc7936e, roughness: .9 }), members.length)
  body.name = 'wh-r1-staff-placeholder-body'; head.name = 'wh-r1-staff-placeholder-head'
  body.userData.dynamic = head.userData.dynamic = true
  body.userData.whR1StaffPlaceholder = head.userData.whR1StaffPlaceholder = true
  body.castShadow = head.castShadow = false; body.receiveShadow = head.receiveShadow = false
  group.add(body, head)
  return { body, head, dummy: new THREE.Object3D() }
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
    const { body, head, dummy } = placeholders
    for (const member of members) {
      const index = member.placeholder.placeholderIndex, p = member.placeholder.group.position, hidden = member.loaded
      dummy.position.set(p.x, p.y + (member.state.sit ? .46 : .72), p.z); dummy.rotation.y = member.placeholder.group.rotation.y; dummy.scale.setScalar(hidden ? 0 : 1); dummy.updateMatrix(); body.setMatrixAt(index, dummy.matrix)
      dummy.position.set(p.x, p.y + (member.state.sit ? .98 : 1.42), p.z); dummy.scale.setScalar(hidden ? 0 : 1); dummy.updateMatrix(); head.setMatrixAt(index, dummy.matrix)
    }
    body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true
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
  let realistic = null, hydrationAt = 0, armed = false
  const updateHydration = camera => {
    if (!armed || !realistic || !camera || realistic.maxReal <= 0) return
    const now = globalThis.performance?.now?.() || Date.now(); if (now - hydrationAt < 180) return; hydrationAt = now
    const rows = members.map(member => ({ member, distance: camera.position.distanceTo(member.placeholder.group.position) })).sort((a, b) => a.distance - b.distance)
    for (const row of rows) row.member.want = false
    const keep = rows.filter(row => row.member.loaded && row.distance < 28).slice(0, realistic.maxReal)
    for (const row of rows) if (!keep.includes(row) && row.member.loaded) switchToPlaceholder(row.member)
    const wanted = [...keep, ...rows.filter(row => !row.member.loaded && row.distance < 20)].sort((a, b) => a.distance - b.distance).slice(0, realistic.maxReal)
    for (const { member } of wanted) {
      if (member.loaded || member.pending || typeof realistic.load !== 'function') continue
      member.want = true
      member.pending = true
      Promise.resolve(realistic.load(member.avatar)).then(people => { member.pending = false; if (member.want) switchToReal(member, people, realistic.createPerson) }).catch(() => { member.pending = false })
    }
  }
  const configureRealistic = ({ tier = 'high', load, createPerson } = {}) => { realistic = { maxReal: tier === 'high' ? 1 : tier === 'medium' ? 1 : 0, load, createPerson }; armed = false; hydrationAt = 0; syncPlaceholders() }
  const cameraIntent = () => { armed = true }
  const onFrame = (dt, context = {}) => { for (const member of members) { move(member, dt); member.char.solve?.(Math.min(.1, Math.max(0, dt))) }; updateHydration(context.camera); syncPlaceholders() }
  const hydrate = (people, createPerson) => { if (typeof createPerson !== 'function' || !people) return false; for (const member of members) switchToReal(member, people, createPerson); return true }
  const pickRay = ray => {
    const hits = ray.intersectObjects([placeholders.body, placeholders.head, ...members.filter(m => m.loaded).map(m => m.char.group)], true), hit = hits[0]; if (!hit) return null
    let member
    if (hit.object.userData.whR1StaffPlaceholder && Number.isInteger(hit.instanceId)) member = members[hit.instanceId]
    else { let owner = hit.object; while (owner && !owner.userData?.warehouseStaffId) owner = owner.parent; member = members.find(row => row.id === owner?.userData?.warehouseStaffId) }
    return member ? { id: member.id, category: `${member.role} · ${STAFF_TEXT}`, displayOnly: true, staff: true, label: STAFF_TEXT, status: '仅供参观' } : null
  }
  const summary = () => ({ count: members.length, loadedReal: members.filter(m => m.loaded).length, placeholderCalls: 2, roles: members.map(m => m.role), displayOnly: true, agentIds: [], collision: false, lite: !!lite })
  const dispose = () => { placeholders.body.geometry.dispose(); placeholders.body.material.dispose(); placeholders.head.geometry.dispose(); placeholders.head.material.dispose(); group.parent?.remove(group) }
  syncPlaceholders()
  return { root: group, members, avatarNames: () => WH_R1_STAFF_ROSTER.map(member => member.avatar), navigation: nav, hydrate, configureRealistic, cameraIntent, onFrame, pickRay, summary, dispose, staffText: STAFF_TEXT, lite: !!lite }
}
