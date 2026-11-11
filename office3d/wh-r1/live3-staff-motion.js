import { WH_R1_FLOOR_Y, whToWorld, runtimeYawFromFacing } from '../wh-r1-layout.js'
import { WH_R1_CONVEYOR_PATH } from '../dr-wh-r1-workflow.js'
import { WH_R1_DATA } from './data.js'
import { live3ConveyorPose, live3DemonstrationSlot } from './live3-stage-a.js'
import { LIVE3_STATIONS, stationPoint } from './live3-stations.js'

const SPEED_M_S = 1.2
const register = id => WH_R1_DATA.elements.find(row => row.id === id)
const world = row => whToWorld(row.xM, row.yM)
const stationSide = station => stationPoint(station, 0, .98)
const shipment = register('WH-06-PAL-001')
const pallet = { ...world(shipment), y: shipment.zM + shipment.heightM }
const pickup = { x: pallet.x - 3.4, z: pallet.z + .6 }
const drop = { x: pallet.x - 1.2, z: pallet.z + .18 }
const exceptionDrop = world(register('WH-02-PAL-001'))
const approach = { x: WH_R1_CONVEYOR_PATH[0].x + 2.5, z: WH_R1_CONVEYOR_PATH[0].z - 1.1 }
const rackDemo = world(register('WH-03-RK-01-W-B01-L01-P02'))
const rackPatrol = [rackDemo, world(register('WH-03-RK-01-W-B01-L01-P01'))].map(p => ({ x: p.x - 1.55, z: p.z }))

export function live3BenchBox(member) {
  const table = register(member.workbench), p = world(table)
  return { ...p, x: p.x - table.lengthM / 2 + .13, y: table.zM + table.heightM }
}

export function live3PalletBox(index) {
  return {
    x: pallet.x + (index % 2 - .5) * .24,
    z: pallet.z + (Math.floor(index / 2) % 2 - .5) * .24,
    y: pallet.y + Math.floor(index / 4) * .18,
  }
}

function steerHand(member, target, side) {
  const model = member.char.parts?.model
  if (!model || !target) return null
  const cache = member.handRig ??= new WeakMap()
  let hands = cache.get(model)
  if (!hands) {
    hands = Object.fromEntries(['L', 'R'].map(key => [key, ['UpperArm', 'Forearm', 'Hand'].map(name => model.getObjectByName('Bip01_' + key + '_' + name))]))
    cache.set(model, hands)
  }
  const [upper, elbow, hand] = hands[side]
  if (!upper || !elbow || !hand) return null
  const pivot = member.char.group.position.clone(), tip = pivot.clone(), wanted = pivot.clone()
  wanted.set(target.x, target.y + WH_R1_FLOOR_Y, target.z)
  const parent = upper.quaternion.clone(), turn = parent.clone()
  // A bounded reach from the authored standing/walking pose. Keep the wrist
  // on the equipment side of the body without moving the planted feet.
  for (let i = 0; i < 3; i++) {
    for (const bone of [elbow, upper]) {
      bone.getWorldPosition(pivot); hand.getWorldPosition(tip)
      const from = tip.clone().sub(pivot).normalize(), to = wanted.clone().sub(pivot).normalize()
      turn.setFromUnitVectors(from, to)
      const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)))
      if (angle > .64) turn.identity().slerp(turn.clone().setFromUnitVectors(from, to), .64 / angle)
      bone.parent.getWorldQuaternion(parent)
      bone.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent))
      bone.updateWorldMatrix(false, true)
    }
  }
  return hand.getWorldPosition(tip)
}

export function bindLive3Staff(staff) {
  if (!staff?.members?.length || !staff.navigation) return null
  const nav = staff.navigation
  const get = id => staff.members.find(member => member.id === 'wh-staff-' + id)
  const scanner = get('receiving-2'), inspector = get('receiving-1')
  const receiver = get('lead-1'), shipper = get('shipping-1'), picker = get('picking-1'), stocker = get('picking-2')
  const packers = [get('packing-1'), get('packing-2')]
  const benchBoxes = packers.map(member => live3BenchBox(member))
  const scanSide = stationSide(LIVE3_STATIONS[0]), scaleSide = stationSide(LIVE3_STATIONS[1])
  const handoff = stationSide(LIVE3_STATIONS[2])
  const positions = new Map([[scanner, scanSide], [inspector, scaleSide], [receiver, approach], [shipper, pickup], [picker, rackPatrol[0]]])
  // Initialise the demonstration operators at their own registered equipment
  // before their first frame, then keep every subsequent move on the grid.
  for (const [member, location] of positions) {
    if (!member) continue
    const point = nav.nearestWalkable([location.x, location.z])
    if (!point) continue
    member.char.group.position.set(point[0], WH_R1_FLOOR_Y, point[1])
    member.placeholder.group.position.copy(member.char.group.position)
  }
  const controls = new Map()
  for (const member of staff.members) {
    member.path = []
    member.state.walk = 0
    controls.set(member, { target: null, path: [], index: 0, reach: null, hand: null })
    member.afterSolve = () => {
      const control = controls.get(member)
      control.hand = steerHand(member, control.reach, 'R')
      if (control.reach && member === shipper) steerHand(member, { ...control.reach, x: control.reach.x - .12 }, 'L')
    }
  }

  const moveTo = (member, target, dt) => {
    const control = controls.get(member), current = member.char.group.position
    if (control.target !== target) {
      const goal = nav.nearestWalkable([target.x, target.z])
      control.path = goal ? nav.findPath([current.x, current.z], goal) : []
      control.target = target; control.index = 0
    }
    let travelled = 0, remaining = dt * SPEED_M_S
    while (remaining > 0 && control.index < control.path.length) {
      const next = control.path[control.index], dx = next[0] - current.x, dz = next[1] - current.z
      const distance = Math.hypot(dx, dz), step = Math.min(distance, remaining)
      if (distance > 1e-8) {
        current.x += dx / distance * step; current.z += dz / distance * step
        member.char.group.rotation.y = runtimeYawFromFacing(dx, dz)
      }
      travelled += step; remaining -= step
      if (distance - step > 1e-6) break
      control.index++
    }
    member.placeholder.group.position.set(current.x, WH_R1_FLOOR_Y, current.z)
    member.placeholder.group.rotation.y = member.char.group.rotation.y
    // createPerson's walk solver converts phase back to metres with this scale.
    member.state.phase += travelled * 4.6
    return { walking: travelled > 0, arrived: control.path.length > 0 && control.index === control.path.length }
  }
  const handled = new Set()
  let exception = null, shipping = null
  const handBox = (member, task, action) => {
    const hand = controls.get(member).hand
    if (!hand || !member.char.isModel) return null
    const yaw = member.char.group.rotation.y
    return { task, carrierId: member.id, position: {
      x: hand.x - Math.sin(yaw) * .12,
      y: hand.y - WH_R1_FLOOR_Y - .035,
      z: hand.z - Math.cos(yaw) * .12,
      action,
    } }
  }
  return {
    update(state, dt, slotById, rackCargo) {
      const moving = state.tasks.filter(task => task.status === 'moving')
      const belt = moving.filter(task => task.stage === 'quality').map(task => ({ task, position: live3ConveyorPose(task, state.nowMs) }))
      if (!exception && inspector) {
        const item = state.items.find(item => item.stage === 'exception' && !handled.has(item.itemId))
        if (item) exception = { item, carrying: false }
      }
      const shippingControl = controls.get(shipper)
      if (!shipping && shippingControl?.target === pickup && shippingControl.index === shippingControl.path.length && shippingControl.index > 0) {
        const item = moving.find(task => task.stage === 'staging' && task.completeAt - state.nowMs > 5500)
        if (item) shipping = { item, placingAt: null }
      }
      for (const member of staff.members) {
        const control = controls.get(member)
        let target = positions.get(member), cargo = null, action = null
        if (member === scanner || member === inspector) {
          const station = LIVE3_STATIONS[member === scanner ? 0 : 1]
          const phase = member === scanner ? 'scan' : 'weigh'
          const row = belt.find(box => box.position.action === phase)
          if (row) { cargo = row.position; action = phase }
          else if (belt.length) { cargo = { ...stationPoint(station), y: .93 }; action = 'quality' }
        } else if (member === receiver) {
          const row = belt.find(box => Math.abs(box.position.x - approach.x) < 5)
          if (row) { cargo = row.position; action = 'arrival' }
        } else if (member === picker || member === stocker) {
          const stage = member === picker ? 'retrieve' : 'putaway'
          const current = member.char.group.position
          const row = rackCargo.filter(box => box.task.stage === stage && live3DemonstrationSlot(box.task.slotId) &&
            (member !== picker || box.task.slotId.includes('-B01-'))).sort((a,b) =>
            Math.hypot(current.x - a.position.x, current.z - a.position.z) - Math.hypot(current.x - b.position.x, current.z - b.position.z))[0]
          const slot = row && slotById.get(row.task.slotId)
          if (slot && control.slotId !== slot.id && (control.target === null || control.index === control.path.length)) {
            const location = world(slot)
            control.slotId = slot.id
            control.slotPoint = { x: location.x - 1.55, z: location.z }
          }
          if (slot) target = control.slotPoint || target
          else if (member === picker) {
            if (control.target !== rackPatrol[0] && control.target !== rackPatrol[1]) {
              target = Math.abs(current.z - rackPatrol[0].z) < Math.abs(current.z - rackPatrol[1].z) ? rackPatrol[0] : rackPatrol[1]
            } else target = control.index === control.path.length ? rackPatrol[Number(control.target === rackPatrol[0])] : control.target
          }
          if (row && Math.hypot(current.x - row.position.x, current.z - row.position.z) < 2) { cargo = row.position; action = stage }
        } else if (packers.includes(member)) {
          const index = packers.indexOf(member)
          if (moving.some(task => task.stage === 'packing' && task.workerIndex === index)) {
            cargo = benchBoxes[index]; action = 'packing'
          }
        } else if (member === shipper && shipping) {
          target = drop
          cargo = live3PalletBox(0); action = 'stack'
        }
        if (member === inspector && exception) target = exception.carrying ? exceptionDrop : handoff
        const movement = target ? moveTo(member, target, dt) : { walking: false, arrived: true }
        if (member === inspector && exception && movement.arrived) {
          if (exception.carrying) { handled.add(exception.item.itemId); exception = null }
          else exception.carrying = true
        }
        if (member === shipper && shipping && movement.arrived) {
          shipping.placingAt ??= state.nowMs
          if (state.nowMs - shipping.placingAt >= 850) shipping = null
        }
        const carrying = member === shipper && shipping || member === inspector && exception?.carrying
        const current = member.char.group.position
        if (!movement.walking && cargo) {
          member.char.group.rotation.y = runtimeYawFromFacing(cargo.x - current.x, cargo.z - current.z)
          member.placeholder.group.rotation.y = member.char.group.rotation.y
        }
        const yaw = member.char.group.rotation.y
        const lift = .05 * Math.sin(state.nowMs / 115)
        control.reach = carrying && (movement.walking || !movement.arrived)
          ? { x: current.x - Math.sin(yaw) * .46, z: current.z - Math.cos(yaw) * .46, y: 1.03 + lift }
          : cargo && movement.arrived ? { ...cargo, y: cargo.y + .14 + lift } : null
        member.state.walk = Number(movement.walking)
        member.state.talk = 0
        member.state.carry = 0
        Object.assign(member.char.pose, member.state)
        member.char.group.userData.live3Action = carrying && movement.walking ? 'carry' : movement.walking ? 'walk' : control.reach && action ? action : 'idle'
      }
    },
    cargo(state) {
      const rows = state.tasks.filter(task => task.status === 'moving' && task.stage === 'packing')
        .map(task => ({ task, position: { ...benchBoxes[task.workerIndex], action: 'packing' } }))
      if (shipping) {
        const row = handBox(shipper, shipping.item, shipping.placingAt === null ? 'carry' : 'stack')
        rows.push(row || { task: shipping.item, position: { ...pickup, y: .05, action: 'staging' } })
      }
      if (exception) {
        const row = exception.carrying && handBox(inspector, exception.item, 'carry-exception')
        rows.push(row || { task: exception.item, position: { ...stationPoint(LIVE3_STATIONS[2], 0, .52), y: .93, action: 'exception-handoff' } })
      }
      return rows
    },
  }
}
