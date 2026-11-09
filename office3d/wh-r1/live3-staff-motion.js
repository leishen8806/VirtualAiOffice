import { WH_R1_FLOOR_Y, whToWorld } from '../wh-r1-layout.js'
import { WH_R1_DATA } from './data.js'
import { LIVE3_STATIONS, stationPoint } from './live3-stations.js'

const SPEED_M_S = 1.2
const exceptionPallet = WH_R1_DATA.elements.find(row => row.id === 'WH-02-PAL-001')
const registered = row => whToWorld(row.xM, row.yM)
const stationSide = station => stationPoint(station, 0, 1.45)

export function bindLive3Staff(staff) {
  if (!staff?.members?.length || !staff.navigation) return null
  const nav = staff.navigation, actors = new Map()
  const get = id => staff.members.find(member => member.id === 'wh-staff-' + id)
  const point = location => nav.nearestWalkable([location.x, location.z])
  const scan = stationSide(LIVE3_STATIONS[0]), scale = stationSide(LIVE3_STATIONS[1])
  const handoff = stationSide(LIVE3_STATIONS[2]), exceptionDrop = registered(exceptionPallet)
  const carrier = get('receiving-1')
  const targets = new Map([
    [get('receiving-2'), () => scan],
    [carrier, () => scale],
    [get('picking-1'), (_, slot) => slot],
    [get('picking-2'), (_, slot) => slot],
  ])
  for (const [member] of targets) if (member) { member.path = []; actors.set(member, { target: null, path: [], index: 0 }) }
  const moveTo = (member, target, dt) => {
    const control = actors.get(member), current = member.char.group.position
    if (control.target !== target) {
      const goal = point(target)
      control.path = goal ? nav.findPath([current.x, current.z], goal) : []
      control.target = target; control.index = 0
    }
    const next = control.path[control.index]
    if (!next) return { walking: false, arrived: control.path.length > 0 }
    const dx = next[0] - current.x, dz = next[1] - current.z, distance = Math.hypot(dx, dz)
    const step = Math.min(distance, dt * SPEED_M_S)
    if (distance > 1e-8) {
      current.x += dx / distance * step; current.z += dz / distance * step
      member.char.group.rotation.y = Math.atan2(dx, dz)
    }
    if (distance - step < 1e-6) control.index++
    member.placeholder.group.position.set(current.x, WH_R1_FLOOR_Y, current.z)
    member.placeholder.group.rotation.y = member.char.group.rotation.y
    member.state.phase += step
    return { walking: step > 0, arrived: control.index === control.path.length }
  }
  const handled = new Set()
  let job = null
  return {
    update(state, dt, slotById) {
      const moving = state.tasks.filter(task => task.status === 'moving')
      if (!job && carrier) {
        const item = state.items.find(item => item.stage === 'exception' && !handled.has(item.itemId))
        if (item) job = { item, carrying: false }
      }
      for (const member of staff.members) {
        const stage = member === get('picking-2') ? 'putaway' : member === get('receiving-2') || member === carrier ? 'quality' : ({ receiving: 'arrival', picking: 'picking', packing: 'packing', shipping: 'staging' })[member.role]
        const task = moving.find(row => row.stage === stage)
        const slot = task && slotById.get(task.slotId)
        const control = actors.get(member)
        const target = targets.get(member)?.(task, slot && (control?.slotId === slot.id ? control.slotPoint : registered(slot)))
        if (slot && control && target && control.slotId !== slot.id) { control.slotId = slot.id; control.slotPoint = target }
        const desired = member === carrier && job ? (job.carrying ? exceptionDrop : handoff) : target || control?.target
        const movement = desired && control ? moveTo(member, desired, dt) : { walking: false, arrived: false }
        if (member === carrier && job && movement.arrived) {
          if (job.carrying) { handled.add(job.item.itemId); job = null }
          else job.carrying = true
        }
        const working = Boolean(task && !movement.walking)
        if (control) member.state.walk = Number(movement.walking)
        member.state.talk = working ? .6 : 0
        member.state.carry = Number(member === carrier && job?.carrying)
        Object.assign(member.char.pose, member.state)
        member.char.group.userData.live2Stage = task?.stage || 'idle'
        member.char.group.userData.live3Action = member === carrier && job?.carrying ? 'carry-exception' : movement.walking ? 'walk' : working ? stage : 'idle'
      }
    },
    exceptionVisuals() {
      if (!job || !carrier) return []
      if (!job.carrying) {
        const p = stationPoint(LIVE3_STATIONS[2], 0, .52)
        return [{ task: job.item, position: { ...p, y: .93 }, action: 'exception-handoff' }]
      }
      const model = carrier.char.parts?.model
      let hand = null
      model?.traverse(bone => { if (bone.isBone && /Bip01_R_Hand$/.test(bone.name)) hand = bone })
      const origin = carrier.char.group.position
      const yaw = carrier.char.group.rotation.y
      const position = { x: origin.x + Math.sin(yaw) * .36, z: origin.z + Math.cos(yaw) * .36, y: 1 }
      if (hand) {
        const p = hand.getWorldPosition(origin.clone())
        Object.assign(position, { x: p.x, y: p.y - WH_R1_FLOOR_Y, z: p.z })
      }
      return [{ task: job.item, position, action: 'carry-exception' }]
    },
  }
}
