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
const fallbackOptions = (member, index) => ({
  gender: /^Female_/.test(member.avatar) ? 'female' : 'male',
  tone: index % 3 === 0 ? 'light' : index % 3 === 1 ? 'mid' : 'dark',
  shirt: member.role === 'forklift' ? 0xd46b32 : member.role === 'lead' ? 0x2f5c73 : 0x263743,
  pants: member.role === 'forklift' ? 0x3a2c25 : 0x1e252c,
  accent: 0xb69a64,
})

function makeLabel(THREE, canvasTex, text) {
  if (typeof canvasTex !== 'function') return null
  const texture = canvasTex(512, 96, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(19,29,35,.86)'; ctx.fillRect(4, 4, width - 8, height - 8)
    ctx.strokeStyle = '#b69a64'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, width - 8, height - 8)
    ctx.fillStyle = '#f4f1eb'; ctx.font = '600 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${text} · ${STAFF_TEXT}`, width / 2, height / 2)
  })
  const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  mesh.scale.set(1.9, .36, 1)
  mesh.name = 'wh-r1-staff-label'; mesh.position.y = 2.15; mesh.userData.dynamic = true; mesh.userData.displayOnly = true
  return mesh
}

export function buildWhR1Staff({ THREE, root, canvasTex, A, createCharacter3D, createCharacter, data = WH_R1_DATA, navigation = null, lite = false } = {}) {
  const group = new THREE.Group(); group.name = 'wh-r1-staff'; group.userData.dynamic = true; group.userData.noMerge = true
  root.add(group)
  if (lite) return { root: group, members: [], avatarNames: () => [], hydrate: () => false, onFrame: () => {}, pickRay: () => null, summary: () => ({ count: 0, loadedReal: 0, roles: [], displayOnly: true, agentIds: [], collision: false, lite: true }), dispose: () => group.removeFromParent(), staffText: STAFF_TEXT, lite: true }
  const nav = navigation || createWhR1Navigation({ data, bounds: WH_R1_SITE, cellSize: .6, radius: .3 })
  const members = []
  const createFallback = (member, index) => {
    if (typeof createCharacter === 'function') {
      const o = fallbackOptions(member, index)
      return createCharacter({ outfit: o.shirt, pants: o.pants, trim: o.accent, skin: member.gender === 'female' ? 0xd9a27f : 0xc98d67, hair: 0x1b1b1f })
    }
    return typeof createCharacter3D === 'function' && A ? createCharacter3D(A, fallbackOptions(member, index)) : null
  }
  const place = (member, index, char) => {
    const requested = toWorld(member.source), nearest = nav.nearestWalkable?.([requested[0], requested[2]], { allowUnknown: true })
    const position = nearest ? [nearest[0], WH_R1_FLOOR_Y, nearest[1]] : requested
    char.group.position.set(...position); char.group.rotation.y = (member.yawDeg || 0) * Math.PI / 180
    char.group.userData = { ...(char.group.userData || {}), dynamic: true, displayOnly: true, warehouseStaffId: member.id, staffRole: member.role, label: STAFF_TEXT }
    char.pose.sit = member.sit ? 1 : 0; char.pose.walk = member.target ? 1 : 0; char.pose.talk = member.role === 'lead' ? 0.7 : 0; char.pose.carry = member.role === 'receiving' ? 1 : 0
    return { requested, nearest, position }
  }
  for (const [index, member] of WH_R1_STAFF_ROSTER.entries()) {
    const char = createFallback(member, index)
    if (!char) continue
    const placement = place(member, index, char); const label = makeLabel(THREE, canvasTex, member.label); if (label) char.group.add(label)
    group.add(char.group)
    const requestedTarget = member.target ? toWorld(member.target) : null
    const targetPoint = requestedTarget && nav.nearestWalkable?.([requestedTarget[0], requestedTarget[2]], { allowUnknown: true })
    const target = targetPoint ? [targetPoint[0], WH_R1_FLOOR_Y, targetPoint[1]] : requestedTarget
    const path = target ? nav.findPath([placement.position[0], placement.position[2]], [target[0], target[2]], { allowUnknown: true }) : []
    members.push({ ...member, char, label, placement, target, path, pathIndex: 0, progress: 0, pause: 0, loaded: false })
  }
  const move = (member, dt) => {
    if (!member.path.length || member.char.pose.sit > .5) return
    const points = member.path
    if (member.pause > 0) { member.pause -= dt; member.char.pose.walk = 0; member.char.pose.talk = member.role === 'lead' ? .7 : 0; return }
    const current = member.char.group.position, next = points[Math.min(member.pathIndex + 1, points.length - 1)]
    if (!next) return
    const dx = next[0] - current.x, dz = next[1] - current.z, distance = Math.hypot(dx, dz)
    if (distance <= .04) {
      member.pathIndex++
      if (member.pathIndex >= points.length - 1) { member.pause = 2.5; member.path = [...points].reverse(); member.pathIndex = 0 }
      return
    }
    const step = Math.min(distance, dt * .7); current.x += dx / distance * step; current.z += dz / distance * step; member.char.pose.phase += step; member.char.group.rotation.y = Math.atan2(dx, dz); member.char.pose.walk = 1; member.char.pose.talk = 0
  }
  const onFrame = (dt) => { for (const member of members) { move(member, dt); member.char.solve?.(Math.min(.1, Math.max(0, dt))) } }
  const hydrate = (people, createPerson) => {
    if (typeof createPerson !== 'function' || !people) return false
    for (const member of members) {
      const next = people.avatars?.[member.avatar] ? createPerson(people, member.avatar) : null
      if (!next) continue
      const old = member.char, placement = member.placement
      next.group.position.copy(old.group.position); next.group.rotation.copy(old.group.rotation); next.pose.sit = member.sit ? 1 : 0; next.pose.walk = member.target ? 1 : 0; next.pose.talk = member.role === 'lead' ? .7 : 0; next.pose.carry = member.role === 'receiving' ? 1 : 0
      next.group.userData = { ...(next.group.userData || {}), dynamic: true, displayOnly: true, warehouseStaffId: member.id, staffRole: member.role, label: STAFF_TEXT }
      if (member.label) next.group.add(member.label)
      group.add(next.group); old.parent?.remove(old); member.char = next; member.loaded = true; member.placement = placement
    }
    return true
  }
  const pickRay = ray => {
    const hit = ray.intersectObjects(members.map(m => m.char.group), true)[0]
    if (!hit) return null
    let owner = hit.object
    while (owner && !owner.userData?.warehouseStaffId) owner = owner.parent
    const member = members.find(row => row.id === owner?.userData?.warehouseStaffId)
    return member ? { id: member.id, category: `${member.role} · ${STAFF_TEXT}`, displayOnly: true, staff: true, label: STAFF_TEXT, status: '仅供参观' } : null
  }
  const summary = () => ({ count: members.length, loadedReal: members.filter(m => m.loaded).length, roles: members.map(m => m.role), displayOnly: true, agentIds: [], collision: false, lite: !!lite })
  const dispose = () => { for (const member of members) member.char.group.traverse?.(o => { if (o.isMesh) { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.()); else o.material?.dispose?.() } }); group.parent?.remove(group) }
  return { root: group, members, avatarNames: () => WH_R1_STAFF_ROSTER.map(member => member.avatar), navigation: nav, hydrate, onFrame, pickRay, summary, dispose, staffText: STAFF_TEXT, lite: !!lite }
}
